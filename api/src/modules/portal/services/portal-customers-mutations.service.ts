import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WalletType } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { CustomerAudiencesService } from '../../customer-audiences/customer-audiences.service';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import {
  normalizePhoneDigits,
  normalizePhoneE164,
} from '../../../shared/common/phone.util';
import type { PortalCustomerDto } from './portal-customers.types';
import { sanitizeTags } from './portal-customers.utils';
import { ensureWallet } from './portal-customers.wallet.util';
import { PortalCustomersQueryService } from './portal-customers-query.service';

@Injectable()
export class PortalCustomersMutationsService {
  private readonly logger = new Logger(PortalCustomersMutationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audiences: CustomerAudiencesService,
    private readonly queries: PortalCustomersQueryService,
  ) {}

  async create(
    merchantId: string,
    dto: Partial<PortalCustomerDto> & {
      firstName?: string;
      lastName?: string;
    },
  ) {
    const phoneRaw = dto.phone;
    const phoneDigits = normalizePhoneDigits(phoneRaw);
    const phone = normalizePhoneE164(phoneRaw) || undefined;
    if (phoneRaw !== undefined) {
      const trimmed = String(phoneRaw ?? '').trim();
      if (trimmed && !phoneDigits) {
        throw new BadRequestException('Неверный формат телефона');
      }
    }
    const email = dto.email?.trim()?.toLowerCase() || undefined;
    const fullName =
      dto.name?.trim() ||
      [dto.firstName, dto.lastName].filter(Boolean).join(' ').trim() ||
      undefined;

    const prisma = this.prisma as Partial<PrismaService>;
    if (phone) {
      const existingPhone =
        (await prisma.customer?.findUnique?.({
          where: { merchantId_phone: { merchantId, phone } },
          select: { id: true, phone: true },
        })) ??
        (phoneDigits
          ? await prisma.customer?.findUnique?.({
              where: { merchantId_phone: { merchantId, phone: phoneDigits } },
              select: { id: true, phone: true },
            })
          : null);
      if (existingPhone) {
        if (existingPhone.phone && existingPhone.phone !== phone) {
          await prisma.customer
            ?.update?.({
              where: { id: existingPhone.id },
              data: { phone },
            })
            .catch((err) =>
              logIgnoredError(
                err,
                'PortalCustomersMutationsService update phone',
                this.logger,
                'debug',
              ),
            );
        }
        return this.queries.get(merchantId, existingPhone.id);
      }
    }
    if (email) {
      const existingEmail = await prisma.customer?.findUnique?.({
        where: { merchantId_email: { merchantId, email } },
      });
      if (existingEmail) {
        throw new BadRequestException('Email уже используется');
      }
    }

    const isUniqueError = (err: unknown) =>
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002';

    let customer: { id: string };
    try {
      customer = await this.prisma.customer.create({
        data: {
          merchantId,
          phone: phone ?? null,
          email: email ?? null,
          name: fullName ?? null,
          birthday: dto.birthday ? new Date(dto.birthday) : null,
          gender: dto.gender ?? null,
          tags: sanitizeTags(dto.tags),
          comment: dto.comment?.trim?.() || null,
          accrualsBlocked: Boolean(dto.accrualsBlocked),
          redemptionsBlocked: Boolean(dto.redemptionsBlocked),
        },
      });
    } catch (err) {
      if (!isUniqueError(err)) throw err;
      if (phone) {
        const existingPhone = await this.prisma.customer.findUnique({
          where: { merchantId_phone: { merchantId, phone } },
          select: { id: true },
        });
        if (existingPhone) {
          return this.queries.get(merchantId, existingPhone.id);
        }
      }
      if (email) {
        const existingEmail = await this.prisma.customer.findUnique({
          where: { merchantId_email: { merchantId, email } },
          select: { id: true },
        });
        if (existingEmail) {
          throw new BadRequestException('Email уже используется');
        }
      }
      throw err;
    }

    await ensureWallet(this.prisma, merchantId, customer.id);

    const requestedLevelId =
      typeof dto.levelId === 'string' && dto.levelId.trim()
        ? dto.levelId.trim()
        : null;
    const levelExpireDays =
      dto.levelExpireDays != null &&
      Number.isFinite(Number(dto.levelExpireDays))
        ? Math.max(0, Math.floor(Number(dto.levelExpireDays)))
        : undefined;
    if (requestedLevelId) {
      await this.applyTierAssignment(
        merchantId,
        customer.id,
        requestedLevelId,
        levelExpireDays,
      );
    } else {
      const initialTier = await this.prisma.loyaltyTier.findFirst({
        where: { merchantId },
        orderBy: [
          { isInitial: 'desc' },
          { thresholdAmount: 'asc' },
          { createdAt: 'asc' },
        ],
      });
      if (initialTier) {
        await this.applyTierAssignment(merchantId, customer.id, initialTier.id);
      }
    }

    const levelId =
      typeof dto.levelId === 'string' && dto.levelId.trim()
        ? dto.levelId.trim()
        : null;
    if (levelId) {
      await this.applyTierAssignment(
        merchantId,
        customer.id,
        levelId,
        levelExpireDays,
      );
    }

    try {
      await this.audiences.evaluateCustomerSegments(merchantId, customer.id);
    } catch (err) {
      this.logger.warn(
        `Failed to evaluate audiences for new customer ${customer.id}: ${err instanceof Error ? err.message : err}`,
      );
    }

    return this.queries.get(merchantId, customer.id);
  }

  async update(
    merchantId: string,
    customerId: string,
    dto: Partial<PortalCustomerDto> & {
      firstName?: string;
      lastName?: string;
    },
  ) {
    const prisma = this.prisma as Partial<PrismaService>;
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, merchantId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const updateCustomer: Prisma.CustomerUpdateInput = {};

    if (dto.phone !== undefined) {
      const trimmed = String(dto.phone ?? '').trim();
      if (!trimmed) {
        updateCustomer.phone = null;
      } else {
        const phoneDigits = normalizePhoneDigits(trimmed);
        if (!phoneDigits) {
          throw new BadRequestException('Неверный формат телефона');
        }
        const phone = `+${phoneDigits}`;
        const clash = await prisma.customer?.findUnique?.({
          where: { merchantId_phone: { merchantId, phone } },
          select: { id: true },
        });
        if (clash && clash.id !== customerId) {
          throw new BadRequestException('Телефон уже используется');
        }
        updateCustomer.phone = phone;
      }
    }

    if (dto.email !== undefined) {
      const email = dto.email?.trim()?.toLowerCase() || null;
      if (email) {
        const clash = await prisma.customer?.findUnique?.({
          where: { merchantId_email: { merchantId, email } },
        });
        if (clash && clash.id !== customerId) {
          throw new BadRequestException('Email уже используется');
        }
      }
      updateCustomer.email = email;
    }

    if (
      dto.name !== undefined ||
      dto.firstName !== undefined ||
      dto.lastName !== undefined
    ) {
      const name =
        dto.name?.trim() ||
        [dto.firstName, dto.lastName].filter(Boolean).join(' ').trim() ||
        null;
      updateCustomer.name = name;
    }

    if (dto.birthday !== undefined) {
      updateCustomer.birthday = dto.birthday ? new Date(dto.birthday) : null;
    }

    if (dto.gender !== undefined) {
      updateCustomer.gender = dto.gender ?? null;
    }

    if (dto.tags !== undefined) {
      updateCustomer.tags = sanitizeTags(dto.tags);
    }

    if (dto.comment !== undefined) {
      const comment =
        dto.comment != null && dto.comment !== ''
          ? String(dto.comment).trim()
          : null;
      updateCustomer.comment = comment;
    }
    if (dto.accrualsBlocked !== undefined) {
      const blocked = Boolean(dto.accrualsBlocked);
      updateCustomer.accrualsBlocked = blocked;
    }
    if (dto.redemptionsBlocked !== undefined) {
      const blocked = Boolean(dto.redemptionsBlocked);
      updateCustomer.redemptionsBlocked = blocked;
    }

    if (Object.keys(updateCustomer).length > 0) {
      try {
        await this.prisma.customer.update({
          where: { id: customerId },
          data: updateCustomer,
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new BadRequestException(
            'Телефон или email уже используется другим клиентом',
          );
        }
        throw err;
      }
    }

    const levelExpireDays =
      dto.levelExpireDays != null &&
      Number.isFinite(Number(dto.levelExpireDays))
        ? Math.max(0, Math.floor(Number(dto.levelExpireDays)))
        : undefined;
    if (dto.levelId !== undefined || dto.levelExpireDays !== undefined) {
      const sanitized =
        typeof dto.levelId === 'string' && dto.levelId.trim()
          ? dto.levelId.trim()
          : null;
      if (sanitized) {
        const currentAssignment =
          await this.prisma.loyaltyTierAssignment.findFirst({
            where: { merchantId, customerId },
            select: { tierId: true },
          });
        const levelChanged =
          !currentAssignment || currentAssignment.tierId !== sanitized;
        if (levelChanged || dto.levelExpireDays !== undefined) {
          const expiresToApply =
            levelChanged && levelExpireDays === undefined ? 0 : levelExpireDays;
          await this.applyTierAssignment(
            merchantId,
            customerId,
            sanitized,
            expiresToApply,
          );
        }
      }
    }

    try {
      await this.audiences.evaluateCustomerSegments(merchantId, customerId);
    } catch (err) {
      this.logger.warn(
        `Failed to evaluate audiences for customer ${customerId}: ${err instanceof Error ? err.message : err}`,
      );
    }

    await ensureWallet(this.prisma, merchantId, customerId);

    return this.queries.get(merchantId, customerId);
  }

  private async applyTierAssignment(
    merchantId: string,
    customerId: string,
    tierId?: string | null,
    expiresInDays?: number,
  ) {
    if (!tierId) return;
    const tier = await this.prisma.loyaltyTier.findFirst({
      where: { merchantId, id: tierId },
    });
    if (!tier) throw new BadRequestException('Уровень не найден');
    const assignedAt = new Date();
    const expiresAt =
      expiresInDays != null &&
      Number.isFinite(Number(expiresInDays)) &&
      Number(expiresInDays) > 0
        ? new Date(
            assignedAt.getTime() + Number(expiresInDays) * 24 * 60 * 60 * 1000,
          )
        : null;
    await this.prisma.loyaltyTierAssignment.upsert({
      where: { merchantId_customerId: { merchantId, customerId } },
      update: {
        tierId: tier.id,
        assignedAt,
        ...(expiresInDays !== undefined ? { expiresAt } : {}),
        source: 'manual',
      },
      create: {
        merchantId,
        customerId,
        tierId: tier.id,
        assignedAt,
        expiresAt,
        source: 'manual',
      },
    });
  }

  async erasePersonalData(merchantId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, merchantId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const erasedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.segmentCustomer.deleteMany({
        where: { customerId },
      }),
      this.prisma.customerConsent.deleteMany({
        where: { merchantId, customerId },
      }),
      this.prisma.consent.deleteMany({
        where: { merchantId, customerId },
      }),
      this.prisma.customerTelegram.deleteMany({
        where: { merchantId, customerId },
      }),
      this.prisma.pushDevice.deleteMany({
        where: { customerId },
      }),
      this.prisma.customer.update({
        where: { id: customerId },
        data: {
          externalId: null,
          tgId: null,
          phone: null,
          email: null,
          name: null,
          profileName: null,
          birthday: null,
          gender: null,
          city: null,
          tags: [],
          metadata: Prisma.DbNull,
          profileGender: null,
          profileBirthDate: null,
          profileCompletedAt: null,
          comment: null,
          erasedAt,
        },
      }),
    ]);

    return this.queries.get(merchantId, customerId);
  }

  async remove(merchantId: string, customerId: string) {
    const [txns, receipts] = await Promise.all([
      this.prisma.transaction.count({ where: { merchantId, customerId } }),
      this.prisma.receipt.count({ where: { merchantId, customerId } }),
    ]);
    if (txns > 0 || receipts > 0) {
      throw new BadRequestException(
        'Cannot delete customer with operations history',
      );
    }

    await Promise.allSettled([
      this.prisma.wallet.delete({
        where: {
          customerId_merchantId_type: {
            customerId,
            merchantId,
            type: WalletType.POINTS,
          },
        },
      }),
      this.prisma.customer.deleteMany({
        where: { id: customerId, merchantId },
      }),
      this.prisma.customerConsent.deleteMany({
        where: { merchantId, customerId },
      }),
      this.prisma.consent.deleteMany({
        where: { merchantId, customerId },
      }),
      this.prisma.customerTelegram.deleteMany({
        where: { merchantId, customerId },
      }),
      this.prisma.segmentCustomer.deleteMany({
        where: { customerId },
      }),
      this.prisma.pushDevice.deleteMany({
        where: { customerId },
      }),
    ]);
  }
}
