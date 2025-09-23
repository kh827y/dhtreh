import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, TxnType, WalletType } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';
import { hashPassword } from '../password.util';
import { AntiFraudService } from '../antifraud/antifraud.service';

const PHONE_CLEAN_RE = /\D+/g;

export type PortalCustomerSummary = {
  id: string;
  login: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  visitFrequency: string;
  averageCheck: number;
  birthday: string | null;
  age: number | null;
  gender: string | null;
  daysSinceLastVisit: number | null;
  visitCount: number;
  bonusBalance: number;
  pendingBalance: number;
  level: string | null;
  spendPreviousMonth: number;
  spendCurrentMonth: number;
  spendTotal: number;
  tags: string[];
  registeredAt: string;
  comment: string | null;
  blocked: boolean;
  referrer: string | null;
  group: string | null;
  inviteCode: string | null;
  customerNumber: string | null;
  deviceNumber: string | null;
};

export type PortalCustomerDetails = PortalCustomerSummary & {
  metadata: Record<string, any>;
  bonusPendingLots: Array<{ id: string; accrualDate: string; expiresAt: string | null; amount: number }>;
  transactions: Array<PortalCustomerTransaction>;
  reviews: Array<PortalCustomerReview>;
  invited: Array<{ id: string; name: string | null; login: string | null; joinedAt: string | null; purchases: number | null }>;
};

export type PortalCustomerTransaction = {
  id: string;
  type: string;
  amount: number;
  createdAt: string;
  orderId: string | null;
  outlet: { id: string | null; name: string | null };
  device: { id: string | null; label: string | null };
  comment: string | null;
  metadata: Record<string, any> | null;
};

export type PortalCustomerReview = {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  outlet: string | null;
};

type CustomerMetadata = {
  firstName?: string;
  lastName?: string;
  comment?: string;
  blocked?: boolean;
  group?: string;
  inviteCode?: string;
  customerNumber?: string;
  deviceNumber?: string;
  referrer?: string;
  passwordHash?: string;
};

type CreateCustomerInput = {
  login: string;
  password?: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  birthday?: string | null;
  gender?: string | null;
  tags?: string[];
  comment?: string | null;
  group?: string | null;
  blockAccruals?: boolean;
};

type UpdateCustomerInput = Omit<CreateCustomerInput, 'login'> & { login?: string };

type AccrualInput = {
  amount: number;
  receipt?: string | null;
  manualPoints?: number | null;
  outletId?: string | null;
  deviceId?: string | null;
};

type RedemptionInput = {
  amount: number;
  outletId?: string | null;
  deviceId?: string | null;
};

type ComplimentaryInput = {
  amount: number;
  expiresInDays: number;
  comment?: string | null;
};

export type ImportRow = {
  externalId?: string | null;
  phone: string;
  fio?: string | null;
  birthday?: string | null;
  points: number;
  totalSpent?: number | null;
  transactionDate?: string | null;
  receiptNumber?: string | null;
  stamps?: number | null;
  accrualGroupId?: string | null;
  email?: string | null;
};

type ImportResult = {
  processed: number;
  created: number;
  updated: number;
  errors: Array<{ line: number; column: string; message: string }>;
};

@Injectable()
export class PortalCustomersService {
  private readonly logger = new Logger(PortalCustomersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly antifraud: AntiFraudService,
  ) {}

  private parseMetadata(meta: Prisma.JsonValue | null | undefined): CustomerMetadata {
    if (!meta || typeof meta !== 'object') return {};
    try {
      return JSON.parse(JSON.stringify(meta)) as CustomerMetadata;
    } catch {
      return {};
    }
  }

  private buildMetadata(current: Prisma.JsonValue | null | undefined, updates: CustomerMetadata): Prisma.JsonValue {
    const base = this.parseMetadata(current);
    return { ...base, ...updates } as Prisma.JsonValue;
  }

  private splitName(name?: string | null): { firstName: string | null; lastName: string | null } {
    if (!name) return { firstName: null, lastName: null };
    const parts = name.trim().split(/\s+/g);
    if (!parts.length) return { firstName: null, lastName: null };
    if (parts.length === 1) return { firstName: parts[0], lastName: null };
    return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
  }

  private combineName(firstName?: string | null, lastName?: string | null): string | null {
    const parts = [firstName, lastName].filter((item) => (item ?? '').trim().length > 0);
    if (!parts.length) return null;
    return parts.join(' ');
  }

  private computeAge(birthday?: Date | null): number | null {
    if (!birthday) return null;
    const now = new Date();
    let age = now.getFullYear() - birthday.getFullYear();
    const m = now.getMonth() - birthday.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birthday.getDate())) age--;
    return age >= 0 ? age : null;
  }

  private computeVisitFrequency(stats: { visits: number; firstSeenAt: Date; lastSeenAt: Date }): string {
    if (!stats || !stats.visits) return '—';
    const first = stats.firstSeenAt ?? stats.lastSeenAt ?? new Date();
    const last = stats.lastSeenAt ?? new Date();
    const days = Math.max(1, Math.round((last.getTime() - first.getTime()) / (24 * 60 * 60 * 1000)));
    const perMonth = stats.visits / Math.max(1, days / 30);
    if (perMonth >= 8) return `Еженедельно (${stats.visits} визитов)`;
    if (perMonth >= 4) return `Несколько раз в месяц (${stats.visits})`;
    if (perMonth >= 1) return `Ежемесячно (${stats.visits})`;
    return `${stats.visits} визитов`;
  }

  private daysSince(date?: Date | null): number | null {
    if (!date) return null;
    const diff = Date.now() - date.getTime();
    return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(PHONE_CLEAN_RE, '');
    if (!digits) return phone.trim();
    if (digits.startsWith('8') && digits.length === 11) {
      return `+7${digits.slice(1)}`;
    }
    if (digits.startsWith('7') && digits.length === 11) {
      return `+${digits}`;
    }
    if (digits.length === 10) {
      return `+7${digits}`;
    }
    return `+${digits}`;
  }

  private ensurePositiveInt(value: number | null | undefined, field: string) {
    if (value == null) return;
    if (!Number.isFinite(value) || value <= 0) {
      throw new BadRequestException(`${field} must be a positive number`);
    }
  }

  private async ensureCustomerExists(merchantId: string, customerId: string) {
    const wallet = await this.prisma.wallet.findFirst({ where: { customerId, merchantId, type: WalletType.POINTS } });
    if (!wallet) throw new NotFoundException('Customer not found');
  }

  async listCustomers(merchantId: string, params: {
    page: number;
    pageSize: number;
    login?: string;
    name?: string;
    email?: string;
    tag?: string;
  }): Promise<{ items: PortalCustomerSummary[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(Math.max(params.pageSize || 20, 1), 100);
    const skip = (page - 1) * pageSize;

    const where: Prisma.CustomerWhereInput = {
      wallets: { some: { merchantId, type: WalletType.POINTS } },
    };
    if (params.login) {
      where.phone = { contains: params.login.trim(), mode: 'insensitive' };
    }
    if (params.name) {
      where.name = { contains: params.name.trim(), mode: 'insensitive' };
    }
    if (params.email) {
      where.email = { contains: params.email.trim(), mode: 'insensitive' };
    }
    if (params.tag) {
      where.tags = { has: params.tag.trim() };
    }

    const [total, rows] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          wallets: { where: { merchantId, type: WalletType.POINTS } },
          customerStats: { where: { merchantId }, take: 1 },
          antifraudAlerts: { orderBy: { createdAt: 'desc' }, take: 1 },
          transactions: { where: { merchantId }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
    ]);

    const now = new Date();
    const items: PortalCustomerSummary[] = rows.map((customer) => {
      const metadata = this.parseMetadata(customer.metadata);
      const wallet = customer.wallets?.[0];
      const stats = customer.customerStats?.[0];
      const nameParts = this.splitName(customer.name);
      const birthday = customer.birthday ? customer.birthday.toISOString().slice(0, 10) : null;
      const spendPrevMonth = 0;
      const spendCurrentMonth = 0;
      const spendTotal = stats?.totalSpent ?? 0;
      return {
        id: customer.id,
        login: customer.phone ?? null,
        firstName: metadata.firstName ?? nameParts.firstName,
        lastName: metadata.lastName ?? nameParts.lastName,
        email: customer.email ?? null,
        visitFrequency: stats ? this.computeVisitFrequency({
          visits: stats.visits,
          firstSeenAt: stats.firstSeenAt,
          lastSeenAt: stats.lastSeenAt,
        }) : '—',
        averageCheck: stats?.avgCheck ? Math.round(stats.avgCheck) : 0,
        birthday,
        age: this.computeAge(customer.birthday),
        gender: customer.gender ?? null,
        daysSinceLastVisit: this.daysSince(stats?.lastSeenAt ?? stats?.lastOrderAt ?? null),
        visitCount: stats?.visits ?? 0,
        bonusBalance: wallet?.balance ?? 0,
        pendingBalance: 0,
        level: (customer.transactions?.[0]?.type === TxnType.EARN ? 'Активный' : null) ?? null,
        spendPreviousMonth: spendPrevMonth,
        spendCurrentMonth: spendCurrentMonth,
        spendTotal: spendTotal,
        tags: customer.tags ?? [],
        registeredAt: customer.createdAt.toISOString(),
        comment: metadata.comment ?? null,
        blocked: metadata.blocked ?? false,
        referrer: metadata.referrer ?? null,
        group: metadata.group ?? null,
        inviteCode: metadata.inviteCode ?? null,
        customerNumber: metadata.customerNumber ?? null,
        deviceNumber: metadata.deviceNumber ?? null,
      };
    });

    return { items, total, page, pageSize };
  }

  private async ensureLoginUnique(login: string, customerId?: string) {
    const phone = this.normalizePhone(login);
    const existing = await this.prisma.customer.findFirst({ where: { phone } });
    if (existing && existing.id !== customerId) {
      throw new BadRequestException('Клиент с таким логином уже существует');
    }
    return phone;
  }

  private async ensureEmailUnique(email: string, customerId?: string) {
    if (!email) return null;
    const existing = await this.prisma.customer.findFirst({ where: { email } });
    if (existing && existing.id !== customerId) {
      throw new BadRequestException('Клиент с таким email уже существует');
    }
    return email;
  }

  private async generateInviteCode(
    tx: Prisma.TransactionClient,
    merchantId: string,
    customerId: string,
  ): Promise<string> {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      const existing = await tx.personalReferralCode.findUnique({ where: { code } });
      if (!existing) {
        await tx.personalReferralCode.create({ data: { code, customerId, merchantId } });
        return code;
      }
    }
    return `${customerId.slice(-6).toUpperCase()}`;
  }

  private async nextCustomerNumber(tx: Prisma.TransactionClient, merchantId: string): Promise<string> {
    const count = await tx.wallet.count({ where: { merchantId, type: WalletType.POINTS } });
    return `CL-${String(count + 1).padStart(4, '0')}`;
  }

  async createCustomer(merchantId: string, dto: CreateCustomerInput) {
    if (!dto.login?.trim()) throw new BadRequestException('Логин обязателен');
    const phone = await this.ensureLoginUnique(dto.login.trim());
    if (dto.email) await this.ensureEmailUnique(dto.email.trim());
    const metadataUpdates: CustomerMetadata = {
      firstName: dto.firstName?.trim() || undefined,
      lastName: dto.lastName?.trim() || undefined,
      comment: dto.comment?.trim() || undefined,
      blocked: dto.blockAccruals ?? false,
      group: dto.group?.trim() || undefined,
    };

    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          phone,
          email: dto.email?.trim() || null,
          name: this.combineName(dto.firstName, dto.lastName),
          birthday: dto.birthday ? new Date(dto.birthday) : undefined,
          gender: dto.gender || undefined,
          tags: dto.tags ?? [],
          metadata: metadataUpdates,
        },
      });

      await tx.wallet.create({ data: { customerId: customer.id, merchantId, type: WalletType.POINTS, balance: 0 } });
      await tx.customerStats.upsert({
        where: { merchantId_customerId: { merchantId, customerId: customer.id } },
        update: {},
        create: { merchantId, customerId: customer.id, visits: 0, totalSpent: 0 },
      });

      const inviteCode = await this.generateInviteCode(tx, merchantId, customer.id);
      const customerNumber = await this.nextCustomerNumber(tx, merchantId);
      const updatedMetadata = this.buildMetadata(customer.metadata, {
        ...metadataUpdates,
        inviteCode,
        customerNumber,
        blocked: dto.blockAccruals ?? false,
        ...(dto.password && dto.password.trim() ? { passwordHash: hashPassword(dto.password.trim()) } : {}),
      });

      await tx.customer.update({ where: { id: customer.id }, data: { metadata: updatedMetadata } });

      this.metrics.inc('portal_customers_actions_total', { action: 'create', result: 'ok' });
      this.logger.log(`Customer ${customer.id} created for merchant ${merchantId}`);
      return { id: customer.id };
    });
  }

  async updateCustomer(merchantId: string, customerId: string, dto: UpdateCustomerInput) {
    await this.ensureCustomerExists(merchantId, customerId);
    let phone: string | undefined;
    if (dto.login) {
      phone = await this.ensureLoginUnique(dto.login.trim(), customerId);
    }
    if (dto.email) await this.ensureEmailUnique(dto.email.trim(), customerId);

    const data: Prisma.CustomerUpdateInput = {};
    if (phone) data.phone = phone;
    if (dto.email !== undefined) data.email = dto.email?.trim() || null;
    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      data.name = this.combineName(dto.firstName, dto.lastName);
    }
    if (dto.birthday !== undefined) {
      data.birthday = dto.birthday ? new Date(dto.birthday) : null;
    }
    if (dto.gender !== undefined) data.gender = dto.gender || null;
    if (dto.tags) data.tags = dto.tags;

    const current = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!current) throw new NotFoundException('Customer not found');
    const metadata = this.buildMetadata(current.metadata, {
      firstName: dto.firstName?.trim() || undefined,
      lastName: dto.lastName?.trim() || undefined,
      comment: dto.comment?.trim() || undefined,
      blocked: dto.blockAccruals ?? undefined,
      group: dto.group?.trim() || undefined,
    });
    data.metadata = metadata;

    if (dto.password && dto.password.trim()) {
      (metadata as any).passwordHash = hashPassword(dto.password.trim());
      data.metadata = metadata;
    }

    await this.prisma.customer.update({ where: { id: customerId }, data });
    this.metrics.inc('portal_customers_actions_total', { action: 'update', result: 'ok' });
    return { id: customerId };
  }

  async getCustomer(merchantId: string, customerId: string): Promise<PortalCustomerDetails> {
    await this.ensureCustomerExists(merchantId, customerId);
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        wallets: { where: { merchantId, type: WalletType.POINTS } },
        customerStats: { where: { merchantId }, take: 1 },
        antifraudAlerts: { where: { merchantId }, orderBy: { createdAt: 'desc' }, take: 10 },
        transactions: {
          where: { merchantId },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { outlet: true, device: true },
        },
        reviews: { where: { merchantId }, orderBy: { createdAt: 'desc' }, take: 20 },
        referralsAsReferrer: { include: { referee: true }, orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const metadata = this.parseMetadata(customer.metadata);
    const wallet = customer.wallets?.[0];
    const stats = customer.customerStats?.[0];
    const nameParts = this.splitName(customer.name);
    const birthday = customer.birthday ? customer.birthday.toISOString().slice(0, 10) : null;

    const pending = await this.prisma.hold.aggregate({
      where: { merchantId, customerId, status: 'PENDING', mode: 'EARN' },
      _sum: { earnPoints: true },
    });
    const pendingBalance = pending._sum.earnPoints ?? 0;

    const expiryLots = await this.prisma.earnLot.findMany({
      where: { merchantId, customerId, status: 'ACTIVE' },
      orderBy: { earnedAt: 'desc' },
      take: 50,
    });

    const transactions: PortalCustomerTransaction[] = (customer.transactions || []).map((txn) => ({
      id: txn.id,
      type: txn.type,
      amount: txn.amount,
      createdAt: txn.createdAt.toISOString(),
      orderId: txn.orderId ?? null,
      outlet: { id: txn.outletId ?? null, name: txn.outlet?.name ?? null },
      device: { id: txn.deviceId ?? null, label: txn.device?.label ?? null },
      comment: txn.comment ?? null,
      metadata: txn.metadata ? JSON.parse(JSON.stringify(txn.metadata)) : null,
    }));

    const reviews: PortalCustomerReview[] = (customer.reviews || []).map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt.toISOString(),
      outlet: review.metadata && typeof review.metadata === 'object' && 'outletName' in (review.metadata as any)
        ? String((review.metadata as any).outletName)
        : null,
    }));

    const invited = (customer.referralsAsReferrer || []).map((ref) => ({
      id: ref.refereeId || ref.id,
      name: ref.referee?.name || null,
      login: ref.referee?.phone || null,
      joinedAt: ref.completedAt ? ref.completedAt.toISOString() : null,
      purchases: ref.purchaseAmount ?? null,
    }));

    return {
      id: customer.id,
      login: customer.phone ?? null,
      firstName: metadata.firstName ?? nameParts.firstName,
      lastName: metadata.lastName ?? nameParts.lastName,
      email: customer.email ?? null,
      visitFrequency: stats ? this.computeVisitFrequency({
        visits: stats.visits,
        firstSeenAt: stats.firstSeenAt,
        lastSeenAt: stats.lastSeenAt,
      }) : '—',
      averageCheck: stats?.avgCheck ? Math.round(stats.avgCheck) : 0,
      birthday,
      age: this.computeAge(customer.birthday),
      gender: customer.gender ?? null,
      daysSinceLastVisit: this.daysSince(stats?.lastSeenAt ?? stats?.lastOrderAt ?? null),
      visitCount: stats?.visits ?? 0,
      bonusBalance: wallet?.balance ?? 0,
      pendingBalance,
      level: metadata.group ?? null,
      spendPreviousMonth: 0,
      spendCurrentMonth: 0,
      spendTotal: stats?.totalSpent ?? 0,
      tags: customer.tags ?? [],
      registeredAt: customer.createdAt.toISOString(),
      comment: metadata.comment ?? null,
      blocked: metadata.blocked ?? false,
      referrer: metadata.referrer ?? null,
      group: metadata.group ?? null,
      inviteCode: metadata.inviteCode ?? null,
      customerNumber: metadata.customerNumber ?? null,
      deviceNumber: metadata.deviceNumber ?? null,
      metadata,
      bonusPendingLots: expiryLots.map((lot) => ({
        id: lot.id,
        accrualDate: lot.earnedAt.toISOString(),
        expiresAt: lot.expiresAt ? lot.expiresAt.toISOString() : null,
        amount: lot.points - lot.consumedPoints,
      })),
      transactions,
      reviews,
      invited,
    };
  }

  async accruePoints(merchantId: string, customerId: string, dto: AccrualInput) {
    await this.ensureCustomerExists(merchantId, customerId);
    this.ensurePositiveInt(dto.amount, 'Сумма покупки');
    if (dto.manualPoints) this.ensurePositiveInt(dto.manualPoints, 'Кол-во баллов');

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findFirst({ where: { merchantId, customerId, type: WalletType.POINTS } });
      if (!wallet) throw new NotFoundException('Wallet not found');

      let points = dto.manualPoints ?? null;
      if (!points) {
        const settings = await tx.merchantSettings.findUnique({ where: { merchantId } });
        const earnBps = settings?.earnBps ?? 500;
        points = Math.max(1, Math.round((dto.amount * earnBps) / 10000));
      }

      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: points } } });
      const txn = await tx.transaction.create({
        data: {
          merchantId,
          customerId,
          type: TxnType.EARN,
          amount: points,
          orderId: dto.receipt || null,
          outletId: dto.outletId || null,
          deviceId: dto.deviceId || null,
          comment: dto.manualPoints ? 'Ручное начисление' : 'Автоначисление',
          metadata: { purchaseAmount: dto.amount },
        },
      });

      const stats = await tx.customerStats.findUnique({
        where: { merchantId_customerId: { merchantId, customerId } },
      });
      if (stats) {
        const visits = stats.visits + 1;
        const totalSpent = (stats.totalSpent ?? 0) + dto.amount;
        const avgCheck = visits > 0 ? totalSpent / visits : totalSpent;
        await tx.customerStats.update({
          where: { merchantId_customerId: { merchantId, customerId } },
          data: {
            visits,
            totalSpent,
            avgCheck,
            lastSeenAt: txn.createdAt,
            lastOrderAt: txn.createdAt,
          },
        });
      } else {
        await tx.customerStats.create({
          data: {
            merchantId,
            customerId,
            visits: 1,
            totalSpent: dto.amount,
            avgCheck: dto.amount,
            firstSeenAt: txn.createdAt,
            lastSeenAt: txn.createdAt,
            lastOrderAt: txn.createdAt,
          },
        });
      }

      await this.antifraud.evaluateAccrualLimits(tx, {
        merchantId,
        customerId,
        points,
        occurredAt: txn.createdAt,
        receiptId: txn.orderId ?? undefined,
      });

      this.metrics.inc('portal_customers_actions_total', { action: 'accrue', result: 'ok' });
      return { transactionId: txn.id, balance: wallet.balance + points };
    });
  }

  async redeemPoints(merchantId: string, customerId: string, dto: RedemptionInput) {
    await this.ensureCustomerExists(merchantId, customerId);
    this.ensurePositiveInt(dto.amount, 'Кол-во баллов');

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findFirst({ where: { merchantId, customerId, type: WalletType.POINTS } });
      if (!wallet) throw new NotFoundException('Wallet not found');
      if (wallet.balance < dto.amount) throw new BadRequestException('Недостаточно баллов');

      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: dto.amount } } });
      const txn = await tx.transaction.create({
        data: {
          merchantId,
          customerId,
          type: TxnType.REDEEM,
          amount: -dto.amount,
          outletId: dto.outletId || null,
          deviceId: dto.deviceId || null,
          comment: 'Ручное списание',
        },
      });

      this.metrics.inc('portal_customers_actions_total', { action: 'redeem', result: 'ok' });
      return { transactionId: txn.id, balance: wallet.balance - dto.amount };
    });
  }

  async complimentaryAccrual(merchantId: string, customerId: string, dto: ComplimentaryInput) {
    await this.ensureCustomerExists(merchantId, customerId);
    this.ensurePositiveInt(dto.amount, 'Кол-во баллов');
    if (dto.expiresInDays < 0) throw new BadRequestException('Срок сгорания не может быть отрицательным');

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findFirst({ where: { merchantId, customerId, type: WalletType.POINTS } });
      if (!wallet) throw new NotFoundException('Wallet not found');

      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: dto.amount } } });
      const expiresAt = dto.expiresInDays === 0 ? null : new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000);
      const txn = await tx.transaction.create({
        data: {
          merchantId,
          customerId,
          type: TxnType.EARN,
          amount: dto.amount,
          comment: dto.comment ?? 'Комплиментарные баллы',
          metadata: { complimentary: true, expiresInDays: dto.expiresInDays },
        },
      });

      await tx.earnLot.create({
        data: {
          merchantId,
          customerId,
          points: dto.amount,
          consumedPoints: 0,
          earnedAt: txn.createdAt,
          expiresAt,
          status: 'ACTIVE',
          orderId: txn.id,
        },
      });

      await this.antifraud.evaluateAccrualLimits(tx, {
        merchantId,
        customerId,
        points: dto.amount,
        occurredAt: txn.createdAt,
        receiptId: txn.orderId ?? undefined,
      });

      this.metrics.inc('portal_customers_actions_total', { action: 'complimentary', result: 'ok' });
      return { transactionId: txn.id, balance: wallet.balance + dto.amount };
    });
  }

  async cancelTransaction(merchantId: string, transactionId: string, actor: string) {
    const txn = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!txn || txn.merchantId !== merchantId) throw new NotFoundException('Транзакция не найдена');
    if (txn.metadata && (txn.metadata as any).canceled) throw new BadRequestException('Транзакция уже отменена');

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findFirst({ where: { merchantId, customerId: txn.customerId, type: WalletType.POINTS } });
      if (!wallet) throw new NotFoundException('Wallet not found');

      let delta = 0;
      if (txn.type === TxnType.EARN) delta = -Math.abs(txn.amount);
      else if (txn.type === TxnType.REDEEM) delta = Math.abs(txn.amount);
      else throw new BadRequestException('Можно отменить только начисление или списание');

      if (txn.type === TxnType.EARN && wallet.balance < Math.abs(delta)) {
        throw new BadRequestException('Недостаточно баллов для отмены');
      }

      if (delta !== 0) {
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: delta } } });
      }

      const reversal = await tx.transaction.create({
        data: {
          merchantId,
          customerId: txn.customerId,
          type: TxnType.ADJUST,
          amount: delta,
          comment: `Отмена транзакции ${txn.id}`,
          metadata: { reversalOf: txn.id, canceledBy: actor },
        },
      });

      const currentMeta = txn.metadata ? JSON.parse(JSON.stringify(txn.metadata)) : {};
      await tx.transaction.update({
        where: { id: txn.id },
        data: {
          metadata: {
            ...currentMeta,
            canceled: true,
            canceledBy: actor,
            canceledAt: new Date().toISOString(),
            reversalId: reversal.id,
          },
        },
      });

      this.metrics.inc('portal_customers_actions_total', { action: 'cancel', result: 'ok' });
      return { reversalId: reversal.id, balance: wallet.balance + delta };
    });
  }

  async importCustomers(merchantId: string, rows: ImportRow[]): Promise<ImportResult> {
    let processed = 0;
    let created = 0;
    let updated = 0;
    const errors: ImportResult['errors'] = [];

    for (const row of rows) {
      processed++;
      try {
        const phone = this.normalizePhone(row.phone);
        const existing = await this.prisma.customer.findFirst({ where: { phone } });
        if (!existing) {
          await this.createCustomer(merchantId, {
            login: phone,
            email: row.email || undefined,
            firstName: row.fio || undefined,
            blockAccruals: false,
          });
          created++;
        } else {
          await this.updateCustomer(merchantId, existing.id, {
            login: phone,
            email: row.email || undefined,
          });
          updated++;
        }
      } catch (error: any) {
        errors.push({ line: processed + 1, column: 'B', message: error?.message || 'Ошибка импорта' });
      }
    }

    this.logger.log(`Import customers for merchant ${merchantId}: processed=${processed}, created=${created}, updated=${updated}`);
    this.metrics.inc('portal_customers_import_total', { result: errors.length ? 'warn' : 'ok' });
    return { processed, created, updated, errors };
  }
}
