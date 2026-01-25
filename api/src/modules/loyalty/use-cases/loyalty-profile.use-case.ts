import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, WalletType } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import {
  CustomerPhoneStatusDto,
  CustomerProfileDto,
  CustomerProfileSaveDto,
} from '../dto/dto';
import { validateTelegramInitData } from '../utils/telegram.util';
import {
  readErrorCode,
  readErrorMessage,
} from '../controllers/loyalty-controller.utils';
import { LoyaltyControllerSupportService } from '../services/loyalty-controller-support.service';
import { optionalTrimmed, requireTrimmed } from './loyalty-input.util';

@Injectable()
export class LoyaltyProfileUseCase {
  private readonly logger = new Logger(LoyaltyProfileUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: LookupCacheService,
    private readonly support: LoyaltyControllerSupportService,
  ) {}

  async teleauth(body: {
    merchantId?: string;
    initData?: string;
    create?: boolean;
  }) {
    const merchantId = requireTrimmed(body?.merchantId, 'merchantId required');
    const initData = requireTrimmed(body?.initData, 'initData is required');
    const shouldCreate = body?.create !== false;
    const settings = await this.cache.getMerchantSettings(merchantId);
    const token =
      typeof settings?.telegramBotToken === 'string'
        ? settings.telegramBotToken.trim()
        : '';
    if (!token) throw new BadRequestException('Bot token not configured');
    const startParamRequired = Boolean(settings?.telegramStartParamRequired);
    const params = new URLSearchParams(initData);
    const startParam =
      params.get('start_param') || params.get('startapp') || '';
    if (startParamRequired) {
      if (!startParam) {
        throw new BadRequestException('start_param is required');
      }
      const trimmed = startParam.trim();
      const isReferral = /^ref[_-]/i.test(trimmed);
      if (!isReferral && trimmed !== merchantId) {
        throw new BadRequestException('merchantId mismatch with start_param');
      }
    }
    const r = validateTelegramInitData(token, initData || '');
    if (!r.ok || !r.userId) throw new BadRequestException('Invalid initData');
    const tgId = String(r.userId);

    let customer = await this.prisma.customer.findUnique({
      where: { merchantId_tgId: { merchantId, tgId } },
    });

    if (!customer) {
      if (!shouldCreate) {
        return {
          ok: true,
          customerId: null,
          registered: false,
          hasPhone: false,
          onboarded: false,
        };
      }
      customer = await this.prisma.customer.create({
        data: { merchantId, tgId },
      });
      await this.prisma.customerTelegram
        .create({
          data: { merchantId, tgId, customerId: customer.id },
        })
        .catch((err) =>
          logIgnoredError(
            err,
            'LoyaltyProfileUseCase create customer telegram',
            undefined,
            'debug',
          ),
        );
    }

    const flags = await this.support.fetchCustomerProfileFlags(customer.id);
    return { ok: true, customerId: customer.id, registered: true, ...flags };
  }

  async getProfile(merchantId: string, customerId: string) {
    const customer = await this.support.ensureCustomer(merchantId, customerId);
    return this.support.toProfileDto(customer) satisfies CustomerProfileDto;
  }

  async getProfilePhoneStatus(merchantId: string, customerId: string) {
    const customer = await this.support.ensureCustomer(merchantId, customerId);
    const rawPhone = customer?.phone ?? null;
    const hasPhone = typeof rawPhone === 'string' && rawPhone.trim().length > 0;
    return { hasPhone } satisfies CustomerPhoneStatusDto;
  }

  async saveProfile(body: CustomerProfileSaveDto) {
    const merchantId = requireTrimmed(body?.merchantId, 'merchantId required');
    const customerId = requireTrimmed(body?.customerId, 'customerId required');

    const customer = await this.support.ensureCustomer(merchantId, customerId);

    if (typeof body?.name !== 'string' || !body.name.trim()) {
      throw new BadRequestException('name must be provided');
    }
    const name = body.name.trim();
    if (name.length > 120) throw new BadRequestException('name is too long');

    if (body?.gender !== 'male' && body?.gender !== 'female') {
      throw new BadRequestException('gender must be "male" or "female"');
    }
    const gender: 'male' | 'female' = body.gender;

    if (
      typeof body?.birthDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.birthDate)
    ) {
      throw new BadRequestException('birthDate must be in format YYYY-MM-DD');
    }
    const birthDate = body.birthDate;
    const parsed = new Date(`${birthDate}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('birthDate is invalid');
    }

    const phoneRaw = optionalTrimmed(body.phone) ?? '';
    const mustRequirePhone = !customer.phone;
    if (mustRequirePhone && !phoneRaw) {
      throw new BadRequestException(
        'Без номера телефона мы не можем зарегистрировать вас в программе лояльности',
      );
    }
    let phoneNormalized: string | null = null;
    let phoneDigits: string | null = null;
    if (phoneRaw) {
      phoneNormalized = this.support.normalizePhoneStrict(phoneRaw);
      phoneDigits = phoneNormalized.replace(/\D/g, '');
    }

    const completionMark = new Date();
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        let targetCustomer = customer;
        let mergedCustomerId: string | null = null;

        if (phoneNormalized) {
          let existingByPhone = await tx.customer.findUnique({
            where: { merchantId_phone: { merchantId, phone: phoneNormalized } },
          });
          if (!existingByPhone && phoneDigits) {
            existingByPhone = await tx.customer.findUnique({
              where: { merchantId_phone: { merchantId, phone: phoneDigits } },
            });
          }
          if (existingByPhone && existingByPhone.id !== customer.id) {
            const currentTgId =
              typeof customer.tgId === 'string' ? customer.tgId : null;
            const existingTgId =
              typeof existingByPhone.tgId === 'string'
                ? existingByPhone.tgId
                : null;
            if (existingTgId && existingTgId !== currentTgId) {
              throw new BadRequestException('Номер телефона уже используется');
            }
            const earnLot = this.support.getEarnLotDelegate(tx);
            const earnLotsCountPromise = earnLot
              ? earnLot
                  .count({
                    where: { merchantId, customerId: customer.id },
                  })
                  .catch((err) => {
                    logIgnoredError(
                      err,
                      'LoyaltyProfileUseCase earn lots count',
                      this.logger,
                      'debug',
                      { merchantId, customerId: customer.id },
                    );
                    return 0;
                  })
              : Promise.resolve(0);
            const [transactionsCount, earnLotsCount, wallet] =
              await Promise.all([
                tx.transaction
                  .count({ where: { merchantId, customerId: customer.id } })
                  .catch((err) => {
                    logIgnoredError(
                      err,
                      'LoyaltyProfileUseCase transactions count',
                      this.logger,
                      'debug',
                      { merchantId, customerId: customer.id },
                    );
                    return 0;
                  }),
                earnLotsCountPromise,
                tx.wallet
                  .findFirst({
                    where: {
                      merchantId,
                      customerId: customer.id,
                      type: WalletType.POINTS,
                    },
                    select: { balance: true },
                  })
                  .catch((err) => {
                    logIgnoredError(
                      err,
                      'LoyaltyProfileUseCase wallet lookup',
                      this.logger,
                      'debug',
                      { merchantId, customerId: customer.id },
                    );
                    return null;
                  }),
              ]);
            const walletBalance = wallet?.balance ?? 0;
            if (
              transactionsCount > 0 ||
              earnLotsCount > 0 ||
              walletBalance > 0
            ) {
              throw new BadRequestException(
                'Этот профиль уже содержит историю операций. Автоматическое объединение недоступно.',
              );
            }
            mergedCustomerId = existingByPhone.id;
            targetCustomer = existingByPhone;
            if (currentTgId && existingTgId !== currentTgId) {
              await tx.customer.update({
                where: { id: existingByPhone.id },
                data: { tgId: currentTgId },
              });
              await tx.customerTelegram.upsert({
                where: { merchantId_tgId: { merchantId, tgId: currentTgId } },
                update: { customerId: existingByPhone.id },
                create: {
                  merchantId,
                  tgId: currentTgId,
                  customerId: existingByPhone.id,
                },
              });
              await tx.customer.update({
                where: { id: customer.id },
                data: { tgId: null },
              });
            }
          }
        }

        const updates: Prisma.CustomerUpdateInput = {
          profileName: name,
          profileCompletedAt: completionMark,
        };
        if (!targetCustomer.name) {
          updates.name = name;
        }
        const targetGender =
          targetCustomer.gender === 'male' || targetCustomer.gender === 'female'
            ? targetCustomer.gender
            : null;
        if (!targetGender) {
          updates.gender = gender;
          updates.profileGender = gender;
        }
        if (!targetCustomer.birthday) {
          updates.birthday = parsed;
          updates.profileBirthDate = parsed;
        }
        if (phoneNormalized) {
          updates.phone = phoneNormalized;
        }

        const updatedCustomer = await tx.customer.update({
          where: { id: targetCustomer.id },
          data: updates,
        });

        const walletUpsertArgs = {
          where: {
            customerId_merchantId_type: {
              customerId: updatedCustomer.id,
              merchantId,
              type: WalletType.POINTS,
            },
          },
          update: {},
          create: {
            customerId: updatedCustomer.id,
            merchantId,
            type: WalletType.POINTS,
          },
        } satisfies Prisma.WalletUpsertArgs;
        await tx.wallet.upsert(walletUpsertArgs);

        return { updatedCustomer, mergedCustomerId };
      });
      const payload = this.support.toProfileDto(result.updatedCustomer);
      return result.mergedCustomerId
        ? { ...payload, customerId: result.mergedCustomerId }
        : payload;
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      const code = readErrorCode(err);
      const msg = readErrorMessage(err);
      if (code === 'P2002' || /Unique constraint/i.test(msg)) {
        throw new BadRequestException('Номер телефона уже используется');
      }
      throw err;
    }
  }
}
