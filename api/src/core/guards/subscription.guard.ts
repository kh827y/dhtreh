import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionService } from '../../modules/subscription/subscription.service';
import type { Plan } from '@prisma/client';

type SubscriptionRequest = {
  portalMerchantId?: string;
  cashierSession?: { merchantId?: string | null } | null;
  teleauth?: { merchantId?: string | null } | null;
  body?: Record<string, unknown>;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  subscriptionState?: unknown;
  subscription?: { plan?: Plan | null } | null;
};

export const ALLOW_INACTIVE_SUBSCRIPTION_KEY = 'allowInactiveSubscription';
export const AllowInactiveSubscription = () =>
  SetMetadata(ALLOW_INACTIVE_SUBSCRIPTION_KEY, true);

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private subscriptionService: SubscriptionService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<SubscriptionRequest>();
    if (!req) {
      throw new ForbiddenException('Запрос без контекста запрещён');
    }

    const allowInactive =
      this.reflector.get<boolean>(
        ALLOW_INACTIVE_SUBSCRIPTION_KEY,
        context.getHandler(),
      ) ||
      this.reflector.get<boolean>(
        ALLOW_INACTIVE_SUBSCRIPTION_KEY,
        context.getClass(),
      );
    if (allowInactive) return true;

    let merchantId: string | undefined =
      req.portalMerchantId ||
      req.cashierSession?.merchantId ||
      this.readRequestField(req, 'merchantId') ||
      req.teleauth?.merchantId ||
      undefined;

    if (!merchantId && this.readRequestField(req, 'holdId')) {
      const holdId = this.readRequestField(req, 'holdId');
      try {
        const hold = holdId
          ? await this.prisma.hold.findUnique({
              where: { id: holdId },
            })
          : null;
        merchantId = hold?.merchantId;
      } catch {}
    }
    if (!merchantId && this.readRequestField(req, 'merchantLogin')) {
      const merchantLogin = String(
        this.readRequestField(req, 'merchantLogin') || '',
      )
        .trim()
        .toLowerCase();
      if (merchantLogin) {
        try {
          const merchant = await this.prisma.merchant.findFirst({
            where: { cashierLogin: merchantLogin },
            select: { id: true },
          });
          merchantId = merchant?.id;
        } catch {}
      }
    }

    if (!merchantId) {
      throw new ForbiddenException(
        'Не удалось определить мерчанта для проверки подписки',
      );
    }

    const { subscription, state } =
      await this.subscriptionService.describeSubscription(merchantId);
    req.subscriptionState = state;
    req.subscription = subscription;

    if (state.status !== 'active') {
      throw new ForbiddenException(
        state.problem ||
          'Подписка закончилась, продлите её чтобы продолжить работу',
      );
    }

    if (subscription?.plan) {
      this.subscriptionService.validatePlanLimits(
        merchantId,
        subscription.plan,
      );
    }

    // Ограничиваем только операции, требующие подписки: все, кроме вспомогательных health/ping
    // health/ping проверяются на уровне роутинга и сюда не попадают
    return true;
  }

  private readRequestField(
    req: SubscriptionRequest,
    key: string,
  ): string | undefined {
    const sources = [req.body, req.query, req.params];
    for (const source of sources) {
      const value = source?.[key];
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) return trimmed;
      }
    }
    return undefined;
  }
}
