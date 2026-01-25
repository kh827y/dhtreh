import { BadRequestException, Injectable } from '@nestjs/common';
import { MerchantsService } from '../merchants.service';
import { SubscriptionService } from '../../subscription/subscription.service';

type MerchantListItem = Awaited<
  ReturnType<MerchantsService['listMerchants']>
>[number];

@Injectable()
export class MerchantsAdminUseCase {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly subscriptions: SubscriptionService,
  ) {}

  listMerchants() {
    return this.merchants.listMerchants().then((rows: MerchantListItem[]) =>
      rows.map((row) => ({
        ...row,
        subscription: this.subscriptions.buildStateFromRecord(
          row.subscription ?? null,
        ),
      })),
    );
  }

  createMerchant(body: {
    name: string;
    email?: string;
    password?: string;
    portalEmail?: string;
    portalPassword?: string;
    ownerName?: string;
    maxOutlets?: number | null;
  }) {
    const email = body?.email ?? body?.portalEmail;
    const password = body?.password ?? body?.portalPassword;
    return this.merchants.createMerchant(
      (body?.name || '').trim(),
      String(email || '')
        .trim()
        .toLowerCase(),
      String(password || ''),
      body?.ownerName ? String(body.ownerName).trim() : undefined,
      body?.maxOutlets ?? null,
    );
  }

  updateMerchant(
    id: string,
    body: {
      name?: string;
      email?: string;
      password?: string;
      portalEmail?: string;
      portalPassword?: string;
    },
  ) {
    const email = body?.email ?? body?.portalEmail;
    const password = body?.password ?? body?.portalPassword;
    return this.merchants.updateMerchant(id, {
      name: body?.name,
      email,
      password,
    });
  }

  deleteMerchant(id: string) {
    return this.merchants.deleteMerchant(id);
  }

  grantSubscription(id: string, body: { days?: number; planId?: string }) {
    const days = Number(body?.days);
    if (!Number.isFinite(days) || days <= 0) {
      throw new BadRequestException('days must be > 0');
    }
    return this.subscriptions.grantSubscription(
      id,
      body?.planId || 'plan_full',
      days,
    );
  }

  resetSubscription(id: string) {
    return this.subscriptions.resetSubscription(id);
  }
}
