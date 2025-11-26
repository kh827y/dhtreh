import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';

export const ALLOW_INACTIVE_SUBSCRIPTION_KEY =
  'allowInactiveSubscription';
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
    const req =
      context.getType<'http' | 'graphql'>() === 'http'
        ? context.switchToHttp().getRequest()
        : GqlExecutionContext.create(context).getContext()?.req;
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
      req.body?.merchantId ||
      req?.params?.merchantId ||
      req?.query?.merchantId ||
      req?.teleauth?.merchantId;

    if (!merchantId && req.body?.holdId) {
      const holdId = req.body?.holdId;
      try {
        const hold = await this.prisma.hold.findUnique({
          where: { id: holdId },
        });
        merchantId = hold?.merchantId;
      } catch {}
    }
    if (!merchantId && req.body?.merchantLogin) {
      const merchantLogin = String(req.body.merchantLogin || '').trim();
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
        state.problem || 'Подписка закончилась, продлите её чтобы продолжить работу',
      );
    }

    if (subscription?.plan) {
      await this.subscriptionService.validatePlanLimits(
        merchantId,
        subscription.plan,
      );
    }

    // Ограничиваем только операции, требующие подписки: все, кроме вспомогательных health/ping
    // health/ping проверяются на уровне роутинга и сюда не попадают
    return true;
  }
}
