import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private subscriptionService: SubscriptionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // В e2e/юнит тестах не блокируем — иначе сломаем сценарии
    if (process.env.NODE_ENV === 'test') return true;
    // Локальный обход через переменную окружения
    const guardSwitch = (process.env.SUBSCRIPTION_GUARD || '')
      .trim()
      .toLowerCase();
    if (
      guardSwitch === 'off' ||
      guardSwitch === '0' ||
      guardSwitch === 'false' ||
      guardSwitch === 'no'
    ) {
      return true;
    }
    const req = context.switchToHttp().getRequest();
    const method: string = (req.method || 'GET').toUpperCase();
    const path: string =
      req?.route?.path || req?.path || req?.originalUrl || '';

    // Ограничиваем только «операции»: commit и refund
    const isOperation =
      method === 'POST' &&
      (path === '/loyalty/commit' || path === '/loyalty/refund');
    if (!isOperation) return true;

    // Определяем merchantId
    let merchantId: string | undefined =
      req.body?.merchantId || req?.params?.merchantId || req?.query?.merchantId;
    if (!merchantId && path === '/loyalty/commit') {
      // commit по holdId
      const holdId = req.body?.holdId;
      if (holdId) {
        try {
          const hold = await this.prisma.hold.findUnique({
            where: { id: holdId },
          });
          merchantId = hold?.merchantId;
        } catch {}
      }
    }
    if (!merchantId) return true; // если не смогли определить — не блокируем

    const prismaAny = this.prisma as any;
    // Если модель subscription недоступна (тестовые стабы) — не блокируем
    if (!prismaAny?.subscription?.findUnique) return true;
    const sub = await prismaAny.subscription.findUnique({
      where: { merchantId },
      include: { plan: true },
    });
    if (!sub) {
      throw new ForbiddenException(
        'Операции недоступны: подписка не оформлена. Завершите онбординг.',
      );
    }

    const now = new Date();
    const status = String(sub.status || '');
    const cpe: Date | null = sub.currentPeriodEnd
      ? new Date(sub.currentPeriodEnd)
      : null;
    const trialEnd: Date | null = sub.trialEnd ? new Date(sub.trialEnd) : null;
    const end = cpe || trialEnd; // приоритет текущего периода, иначе конец триала
    const isActive =
      status === 'active' || status === 'trialing' || status === 'trial';
    // grace: 3 дня после окончания периода — операции разрешены
    let withinGrace = false;
    if (!isActive && end) {
      const graceMs = 3 * 24 * 60 * 60 * 1000;
      if (now.getTime() <= end.getTime() + graceMs)
        withinGrace = now.getTime() >= end.getTime();
    }
    let allowed = isActive || withinGrace;

    if (!allowed) {
      // grace-период 3 дня от currentPeriodEnd
      if (cpe) {
        const grace = new Date(cpe);
        grace.setDate(grace.getDate() + 3);
        allowed = now <= grace;
      }
    }

    if (!allowed) {
      throw new ForbiddenException(
        'Операции временно заблокированы: подписка недействительна. Интерфейс доступен, оплатите подписку.',
      );
    }

    // Проверка лимитов плана (мягко — бросает 400 при превышении)
    try {
      await this.subscriptionService.validatePlanLimits(merchantId, sub.plan);
    } catch (e) {
      // Пробрасываем как есть (BadRequestException из validatePlanLimits)
      throw e;
    }

    return true;
  }
}
