import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { PrismaService } from '../prisma.service';
import { verifyPortalJwt } from './portal-jwt.util';
import {
  DEFAULT_TIMEZONE_CODE,
  findTimezone,
} from '../timezone/russia-timezones';

@Injectable()
export class PortalGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req: any =
      context.getType<'http' | 'graphql'>() === 'http'
        ? context.switchToHttp().getRequest()
        : GqlExecutionContext.create(context).getContext()?.req;
    if (!req) return false;
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
              where: { group: { scope: 'PORTAL', archivedAt: null } },
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
      return true;
    } catch {
      return false;
    }
  }
}
