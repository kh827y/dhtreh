import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { PrismaService } from '../prisma.service';
import { verifyPortalJwt } from './portal-jwt.util';
import {
  DEFAULT_TIMEZONE_CODE,
  findTimezone,
} from '../timezone/russia-timezones';
import { SubscriptionService } from '../subscription/subscription.service';
import { Reflector } from '@nestjs/core';
import { ALLOW_INACTIVE_SUBSCRIPTION_KEY } from '../guards/subscription.guard';
import { hasPortalPermission } from './portal-permissions.util';

@Injectable()
export class PortalGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const contextType = context.getType<'http' | 'graphql'>();
    const isHttp = contextType === 'http';
    const req: any = isHttp
      ? context.switchToHttp().getRequest()
      : GqlExecutionContext.create(context).getContext()?.req;
    if (!req) return false;
    const allowInactive =
      this.reflector.get<boolean>(
        ALLOW_INACTIVE_SUBSCRIPTION_KEY,
        context.getHandler(),
      ) ||
      this.reflector.get<boolean>(
        ALLOW_INACTIVE_SUBSCRIPTION_KEY,
        context.getClass(),
      );
    const auth = String(req.headers?.authorization || '');
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m) return false;
    try {
      const claims = await verifyPortalJwt(m[1]);
      const merchantId = claims.merchantId || claims.sub;
      if (!merchantId) return false;
      req.portalMerchantId = merchantId;
      req.portalRole =
        claims.role || (claims.actor === 'STAFF' ? 'STAFF' : 'MERCHANT');
      req.portalActor = claims.actor;
      req.portalAdminImpersonation = !!claims.adminImpersonation;
      if (claims.actor === 'STAFF') {
        const staffId = claims.staffId || claims.sub;
        if (!staffId) return false;
        const staff = await this.prisma.staff.findFirst({
          where: { id: staffId, merchantId },
          include: {
            accessGroupMemberships: {
              where: {
                group: { scope: 'PORTAL', archivedAt: null, merchantId },
              },
              include: { group: { include: { permissions: true } } },
            },
          },
        });
        if (!staff) return false;
        if (staff.status !== 'ACTIVE') return false;
        if (!staff.portalAccessEnabled || !staff.canAccessPortal) return false;
        if (!staff.hash) return false;
        req.portalStaffId = staff.id;
        req.portalStaffEmail = staff.email ?? null;
        req.portalStaffRole = staff.role;
        const nameParts = [staff.firstName, staff.lastName].filter(Boolean);
        const fallbackName =
          staff.login || staff.email || staff.phone || staff.id;
        req.portalStaffName =
          nameParts.length > 0 ? nameParts.join(' ') : fallbackName;
        req.portalAccessGroups = staff.accessGroupMemberships.map((member) => ({
          id: member.groupId,
          name: member.group.name,
          scope: member.group.scope,
        }));
        const resources = new Map<string, Set<string>>();
        for (const membership of staff.accessGroupMemberships) {
          for (const permission of membership.group.permissions) {
            const resource = String(permission.resource || '').toLowerCase();
            const action = String(permission.action || '').toLowerCase();
            if (!resource || !action) continue;
            if (!resources.has(resource)) {
              resources.set(resource, new Set<string>());
            }
            resources.get(resource)!.add(action);
          }
        }
        req.portalPermissions = {
          allowAll: false,
          resources,
        };
      } else {
        req.portalPermissions = {
          allowAll: true,
          resources: new Map<string, Set<string>>(),
        };
      }
      const subscriptionState =
        await this.subscriptions.getSubscriptionState(merchantId);
      req.portalSubscription = subscriptionState;
      if (!allowInactive && subscriptionState.status !== 'active') {
        throw new ForbiddenException(
          subscriptionState.problem ||
            'Подписка закончилась, продлите её чтобы продолжить работу',
        );
      }
      const timezoneRow = await this.prisma.merchantSettings.findUnique({
        where: { merchantId },
        select: { timezone: true },
      });
      const timezone = findTimezone(
        timezoneRow?.timezone ?? DEFAULT_TIMEZONE_CODE,
      );
      req.portalTimezone = timezone.code;
      req.portalTimezoneOffsetMinutes = timezone.utcOffsetMinutes;
      req.portalTimezoneIana = timezone.iana;
      this.enforcePortalPermissions(req, isHttp);
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      return false;
    }
  }

  private normalizePath(raw?: string) {
    const base = String(raw || '').split('?')[0] || '';
    if (!base) return '';
    return base.endsWith('/') && base !== '/' ? base.slice(0, -1) : base;
  }

  private resolvePermissionTarget(req: any) {
    const method = String(req?.method || 'GET').toUpperCase();
    const action = method === 'GET' || method === 'HEAD' ? 'read' : 'manage';
    const path = this.normalizePath(req?.originalUrl || req?.url);
    if (!path.startsWith('/portal')) return null;
    if (path === '/portal/me') return null;
    if (path.startsWith('/portal/loyalty/promotions')) return null;
    if (path.startsWith('/portal/loyalty/mechanics')) return null;
    if (path.startsWith('/portal/loyalty/redeem-limits')) return null;
    if (path === '/portal/settings') return null;
    if (path.startsWith('/portal/settings/telegram-notify')) {
      return { resources: ['telegram_notifications'], action };
    }
    if (
      path.startsWith('/portal/settings/name') ||
      path.startsWith('/portal/settings/timezone') ||
      path.startsWith('/portal/settings/support')
    ) {
      return { resources: ['system_settings'], action };
    }
    if (path.startsWith('/portal/catalog/import')) {
      return { resources: ['import'], action };
    }
    if (path.startsWith('/portal/customers/import')) {
      return { resources: ['import'], action };
    }
    if (path.startsWith('/portal/catalog/products')) {
      return { resources: ['products'], action };
    }
    if (path.startsWith('/portal/catalog/categories')) {
      return { resources: ['categories'], action };
    }
    if (path.startsWith('/portal/customer')) {
      return { resources: ['customers'], action };
    }
    if (path.startsWith('/portal/customers')) {
      return { resources: ['customers'], action };
    }
    if (path.startsWith('/portal/audiences')) {
      return { resources: ['audiences'], action };
    }
    if (path.startsWith('/portal/loyalty/operations')) {
      return { resources: ['customers'], action };
    }
    if (path.startsWith('/portal/operations/log')) {
      return { resources: ['customers'], action };
    }
    if (path.startsWith('/portal/transactions')) {
      return { resources: ['customers'], action };
    }
    if (path.startsWith('/portal/receipts')) {
      return { resources: ['customers'], action };
    }
    if (path.startsWith('/portal/loyalty/tiers')) {
      return { resources: ['mechanic_levels'], action };
    }
    if (path.startsWith('/portal/loyalty/ttl')) {
      return { resources: ['mechanic_ttl'], action };
    }
    if (path.startsWith('/portal/promocodes')) {
      return { resources: ['promocodes'], action };
    }
    if (path.startsWith('/portal/notifications/broadcast')) {
      return { resources: ['broadcasts'], action };
    }
    if (path.startsWith('/portal/push-campaigns')) {
      return { resources: ['broadcasts'], action };
    }
    if (path.startsWith('/portal/telegram-campaigns')) {
      return { resources: ['broadcasts'], action };
    }
    if (path.startsWith('/portal/communications')) {
      return { resources: ['broadcasts'], action };
    }
    if (path.startsWith('/portal/staff-motivation')) {
      return { resources: ['staff_motivation'], action };
    }
    if (path.startsWith('/portal/reviews')) {
      return { resources: ['feedback'], action };
    }
    if (path.startsWith('/portal/referrals')) {
      return { resources: ['mechanic_referral'], action };
    }
    if (path.startsWith('/portal/integrations')) {
      return { resources: ['integrations'], action };
    }
    if (path.startsWith('/portal/analytics/rfm/settings')) {
      return { resources: ['rfm_analysis'], action };
    }
    if (path.startsWith('/portal/analytics/rfm')) {
      return { resources: ['rfm_analysis'], action };
    }
    if (path.startsWith('/portal/analytics')) {
      return { resources: ['analytics'], action };
    }
    if (path.startsWith('/portal/outlets')) {
      return { resources: ['outlets'], action };
    }
    if (path.startsWith('/portal/staff')) {
      return { resources: ['staff'], action };
    }
    if (path.startsWith('/portal/access-groups')) {
      return { resources: ['access_groups'], action };
    }
    if (path.startsWith('/portal/cashier')) {
      return { resources: ['cashier_panel'], action };
    }
    return null;
  }

  private enforcePortalPermissions(req: any, isHttp: boolean) {
    if (!isHttp) return;
    if (!req || req.portalActor !== 'STAFF') return;
    const permissions = req.portalPermissions;
    if (!permissions || permissions.allowAll) return;
    const target = this.resolvePermissionTarget(req);
    if (!target) return;
    const { resources, action } = target;
    const allowed = resources.every((resource) =>
      hasPortalPermission(permissions, resource, action),
    );
    if (!allowed) {
      throw new ForbiddenException('Недостаточно прав');
    }
  }
}
