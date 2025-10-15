import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { WalletType } from '@prisma/client';

export type PortalCustomerDto = {
  id: string;
  phone?: string | null;
  email?: string | null;
  name?: string | null;
  birthday?: string | null;
  gender?: string | null;
  tags?: string[];
  balance?: number;
};

export type ListCustomersQuery = {
  search?: string;
  limit?: number;
  offset?: number;
};

@Injectable()
export class PortalCustomersService {
  constructor(private prisma: PrismaService) {}

  private toDto(c: any, balance?: number): PortalCustomerDto {
    return {
      id: c.id,
      phone: c.phone ?? null,
      email: c.email ?? null,
      name: c.name ?? null,
      birthday: c.birthday ? new Date(c.birthday).toISOString() : null,
      gender: c.gender ?? null,
      tags: Array.isArray(c.tags) ? c.tags : [],
      balance:
        typeof balance === 'number'
          ? balance
          : ((Array.isArray(c.wallets) && c.wallets[0]?.balance) ?? 0),
    };
  }

  async list(merchantId: string, query: ListCustomersQuery) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);
    const whereSearch = query.search?.trim()
      ? {
          OR: [
            {
              phone: {
                contains: query.search.trim(),
                mode: 'insensitive' as const,
              },
            },
            {
              email: {
                contains: query.search.trim(),
                mode: 'insensitive' as const,
              },
            },
            {
              name: {
                contains: query.search.trim(),
                mode: 'insensitive' as const,
              },
            },
          ],
        }
      : {};

    const items = await this.prisma.customer.findMany({
      where: {
        ...whereSearch,
        OR: [
          { wallets: { some: { merchantId, type: WalletType.POINTS } } },
          { transactions: { some: { merchantId } } },
          { Receipt: { some: { merchantId } } },
        ],
      },
      include: {
        wallets: {
          where: { merchantId, type: WalletType.POINTS },
          select: { balance: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return items.map((c) => this.toDto(c));
  }

  private async canAccess(merchantId: string, customerId: string) {
    const [wallet, txn, receipt] = await Promise.all([
      this.prisma.wallet.findFirst({
        where: { merchantId, customerId, type: WalletType.POINTS },
      }),
      this.prisma.transaction.findFirst({ where: { merchantId, customerId } }),
      this.prisma.receipt.findFirst({ where: { merchantId, customerId } }),
    ]);
    return !!(wallet || txn || receipt);
  }

  async get(merchantId: string, customerId: string) {
    const c = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        wallets: {
          where: { merchantId, type: WalletType.POINTS },
          select: { balance: true },
        },
      },
    });
    if (!c) throw new NotFoundException('Customer not found');
    // Разрешаем просмотр, если связан с мерчантом
    const allowed = await this.canAccess(merchantId, customerId);
    if (!allowed) {
      // Ленивая привязка: создадим пустой кошелёк, чтобы связать клиента с мерчантом
      await this.prisma.wallet.upsert({
        where: {
          customerId_merchantId_type: {
            customerId: c.id,
            merchantId,
            type: WalletType.POINTS,
          },
        },
        update: {},
        create: {
          customerId: c.id,
          merchantId,
          type: WalletType.POINTS,
          balance: 0,
        },
      });
    }
    const balanceRow = await this.prisma.wallet.findUnique({
      where: {
        customerId_merchantId_type: {
          customerId: c.id,
          merchantId,
          type: WalletType.POINTS,
        },
      },
    });
    return this.toDto(c, balanceRow?.balance ?? 0);
  }

  async create(
    merchantId: string,
    dto: Partial<PortalCustomerDto> & { firstName?: string; lastName?: string },
  ) {
    const phone = dto.phone?.trim() || undefined;
    const email = dto.email?.trim()?.toLowerCase() || undefined;
    const name =
      dto.name?.trim() ||
      [dto.firstName, dto.lastName].filter(Boolean).join(' ').trim() ||
      undefined;

    const prismaAny = this.prisma as any;
    const existsPhone = phone
      ? await prismaAny?.merchantCustomer?.findUnique?.({
          where: { merchantId_phone: { merchantId, phone } },
        })
      : null;
    if (existsPhone) throw new BadRequestException('Phone already used');
    const existsEmail = email
      ? await prismaAny?.merchantCustomer?.findUnique?.({
          where: { merchantId_email: { merchantId, email } },
        })
      : null;
    if (existsEmail) throw new BadRequestException('Email already used');

    const customer = await this.prisma.customer.create({
      data: {
        phone: phone ?? null,
        email: email ?? null,
        name: name ?? null,
        birthday: dto.birthday ? new Date(dto.birthday) : null,
        gender: dto.gender ?? null,
        tags: Array.isArray(dto.tags) ? dto.tags : [],
      },
    });

    await this.prisma.wallet.upsert({
      where: {
        customerId_merchantId_type: {
          customerId: customer.id,
          merchantId,
          type: WalletType.POINTS,
        },
      },
      update: {},
      create: {
        customerId: customer.id,
        merchantId,
        type: WalletType.POINTS,
        balance: 0,
      },
    });

    await prismaAny?.merchantCustomer?.upsert?.({
      where: {
        merchantId_customerId: {
          merchantId,
          customerId: customer.id,
        },
      },
      update: {
        phone: phone ?? null,
        email: email ?? null,
        name: name ?? null,
      },
      create: {
        merchantId,
        customerId: customer.id,
        tgId: null,
        phone: phone ?? null,
        email: email ?? null,
        name: name ?? null,
      },
    });

    return this.get(merchantId, customer.id);
  }

  async update(
    merchantId: string,
    customerId: string,
    dto: Partial<PortalCustomerDto> & { firstName?: string; lastName?: string },
  ) {
    const prismaAny = this.prisma as any;
    const c = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!c) throw new NotFoundException('Customer not found');

    const data: any = {};
    if (dto.phone !== undefined) {
      const phone = dto.phone?.trim() || null;
      if (phone) {
        const clash = await prismaAny?.merchantCustomer?.findUnique?.({
          where: { merchantId_phone: { merchantId, phone } },
        });
        if (clash && clash.customerId !== customerId) {
          throw new BadRequestException('Phone already used');
        }
        const mc = await prismaAny?.merchantCustomer?.findUnique?.({
          where: {
            merchantId_customerId: { merchantId, customerId },
          },
          select: { id: true },
        });
        if (mc) {
          await prismaAny?.merchantCustomer?.update?.({
            where: { id: mc.id },
            data: { phone },
          });
        } else {
          await prismaAny?.merchantCustomer?.create?.({
            data: {
              merchantId,
              customerId,
              phone,
            },
          });
        }
      } else {
        await prismaAny?.merchantCustomer?.updateMany?.({
          where: { merchantId, customerId },
          data: { phone: null },
        });
      }
      data.phone = phone;
    }
    if (dto.email !== undefined) {
      const email = dto.email?.trim()?.toLowerCase() || null;
      if (email) {
        const clash = await prismaAny?.merchantCustomer?.findUnique?.({
          where: { merchantId_email: { merchantId, email } },
        });
        if (clash && clash.customerId !== customerId) {
          throw new BadRequestException('Email already used');
        }
        await prismaAny?.merchantCustomer?.upsert?.({
          where: {
            merchantId_customerId: { merchantId, customerId },
          },
          update: { email },
          create: {
            merchantId,
            customerId,
            email,
          },
        });
      } else {
        await prismaAny?.merchantCustomer?.updateMany?.({
          where: { merchantId, customerId },
          data: { email: null },
        });
      }
      data.email = email;
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
      data.name = name;
      await prismaAny?.merchantCustomer?.upsert?.({
        where: {
          merchantId_customerId: { merchantId, customerId },
        },
        update: { name },
        create: {
          merchantId,
          customerId,
          name,
        },
      });
    }
    if (dto.birthday !== undefined)
      data.birthday = dto.birthday ? new Date(dto.birthday) : null;
    if (dto.gender !== undefined) data.gender = dto.gender ?? null;
    if (dto.tags !== undefined)
      data.tags = Array.isArray(dto.tags) ? dto.tags : [];

    await this.prisma.customer.update({ where: { id: customerId }, data });

    await this.prisma.wallet.upsert({
      where: {
        customerId_merchantId_type: {
          customerId,
          merchantId,
          type: WalletType.POINTS,
        },
      },
      update: {},
      create: { customerId, merchantId, type: WalletType.POINTS, balance: 0 },
    });

    return this.get(merchantId, customerId);
  }

  async remove(merchantId: string, customerId: string) {
    // Удаляем привязку к мерчанту (кошелёк), но не удаляем глобальную запись Customer
    const txns = await this.prisma.transaction.count({
      where: { merchantId, customerId },
    });
    const receipts = await this.prisma.receipt.count({
      where: { merchantId, customerId },
    });
    if (txns > 0 || receipts > 0)
      throw new BadRequestException('Cannot delete customer with history');

    try {
      await this.prisma.wallet.delete({
        where: {
          customerId_merchantId_type: {
            customerId,
            merchantId,
            type: WalletType.POINTS,
          },
        },
      });
    } catch {}
    return { ok: true } as const;
  }
}
