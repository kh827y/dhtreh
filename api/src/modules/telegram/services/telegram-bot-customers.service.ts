import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { normalizePhoneE164 } from '../../../shared/common/phone.util';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';

@Injectable()
export class TelegramBotCustomersService {
  private readonly logger = new Logger(TelegramBotCustomersService.name);

  constructor(private readonly prisma: PrismaService) {}

  normalizePhoneStrict(phone?: string): string {
    if (!phone) throw new Error('phone required');
    const normalized = normalizePhoneE164(phone);
    if (!normalized) throw new Error('invalid phone');
    return normalized;
  }

  private normalizePhoneVariants(phone?: string) {
    const normalized = this.normalizePhoneStrict(phone);
    const digits = normalized.replace(/\D/g, '');
    return { normalized, digits };
  }

  async resolveCustomer(
    merchantId: string,
    opts: { tgId?: string; phone?: string },
  ): Promise<{ customerId: string }> {
    const { tgId, phone } = opts;
    if (!tgId && !phone)
      throw new Error('resolveCustomer requires tgId or phone');

    // Поиск по tgId
    if (tgId) {
      const existing = await this.prisma.customer.findUnique({
        where: { merchantId_tgId: { merchantId, tgId } },
        select: { id: true },
      });
      if (existing) return { customerId: existing.id };
    }

    // Поиск по phone
    if (phone) {
      const { normalized, digits } = this.normalizePhoneVariants(phone);
      let existingByPhone = await this.prisma.customer.findUnique({
        where: { merchantId_phone: { merchantId, phone: normalized } },
        select: { id: true, phone: true },
      });
      if (!existingByPhone && digits) {
        existingByPhone = await this.prisma.customer.findUnique({
          where: { merchantId_phone: { merchantId, phone: digits } },
          select: { id: true, phone: true },
        });
        if (existingByPhone && existingByPhone.phone !== normalized) {
          await this.prisma.customer
            .update({
              where: { id: existingByPhone.id },
              data: { phone: normalized },
            })
            .catch((err) =>
              logIgnoredError(
                err,
                'TelegramBotCustomersService update phone',
                this.logger,
                'debug',
              ),
            );
        }
      }
      if (existingByPhone) return { customerId: existingByPhone.id };
    }

    // Создаём нового Customer (per-merchant)
    const normalizedPhone = phone
      ? this.normalizePhoneVariants(phone).normalized
      : null;
    const created = await this.prisma.customer.create({
      data: {
        merchantId,
        tgId: tgId ?? null,
        phone: normalizedPhone,
      },
      select: { id: true },
    });

    // Создаём запись в CustomerTelegram для обратной связи
    if (tgId) {
      await this.prisma.customerTelegram
        .create({
          data: { merchantId, tgId, customerId: created.id },
        })
        .catch((err) =>
          logIgnoredError(
            err,
            'TelegramBotCustomersService create customer telegram',
            this.logger,
            'debug',
          ),
        );
    }

    return { customerId: created.id };
  }

  async updateCustomer(
    merchantId: string,
    customerId: string,
    data: Partial<{ phone: string; tgId: string | null; name: string | null }>,
  ): Promise<void> {
    const prisma = this.prisma as Partial<PrismaService>;
    if (!prisma.customer?.update) return;
    await prisma.customer.update({ where: { id: customerId }, data });
  }

  async findCustomerByPhone(merchantId: string, phone: string) {
    const { normalized, digits } = this.normalizePhoneVariants(phone);
    let existing = await this.prisma.customer.findUnique({
      where: { merchantId_phone: { merchantId, phone: normalized } },
      select: { id: true, phone: true },
    });
    if (!existing && digits) {
      existing = await this.prisma.customer.findUnique({
        where: { merchantId_phone: { merchantId, phone: digits } },
        select: { id: true, phone: true },
      });
      if (existing && existing.phone !== normalized) {
        await this.prisma.customer
          .update({
            where: { id: existing.id },
            data: { phone: normalized },
          })
          .catch((err) =>
            logIgnoredError(
              err,
              'TelegramBotCustomersService update phone',
              this.logger,
              'debug',
            ),
          );
      }
    }
    return existing;
  }

  async linkTelegramToCustomer(
    tgId: string,
    merchantId: string,
    customerId: string,
    previousCustomerId?: string | null,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findUnique({
        where: { merchantId_tgId: { merchantId, tgId } },
        select: { id: true },
      });
      const clearIds = new Set<string>();
      if (existing?.id && existing.id !== customerId) {
        clearIds.add(existing.id);
      }
      if (previousCustomerId && previousCustomerId !== customerId) {
        clearIds.add(previousCustomerId);
      }
      for (const id of clearIds) {
        await tx.customer.update({
          where: { id },
          data: { tgId: null },
        });
      }

      // Обновляем tgId у целевого Customer
      await tx.customer.update({
        where: { id: customerId },
        data: { tgId },
      });

      // Обновляем/создаём связь в CustomerTelegram
      await tx.customerTelegram.upsert({
        where: { merchantId_tgId: { merchantId, tgId } },
        create: { merchantId, tgId, customerId },
        update: { customerId },
      });
    });
  }
}
