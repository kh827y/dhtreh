import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createHash } from 'crypto';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { verifyPassword } from '../../shared/password.util';
import {
  signPortalJwt,
  verifyPortalJwt,
  signPortalRefreshJwt,
  verifyPortalRefreshJwt,
} from './portal-jwt.util';
import { StaffStatus } from '@prisma/client';

const LOGIN_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_ATTEMPT_LIMIT = 10;

function hashPortalToken(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function isTokenRevoked(
  issuedAtSeconds: number | undefined,
  revokedAt?: Date | null,
) {
  if (!revokedAt) return false;
  if (!issuedAtSeconds) return true;
  return issuedAtSeconds * 1000 < revokedAt.getTime();
}

@ApiTags('portal-auth')
@Controller('portal/auth')
export class PortalAuthController {
  constructor(private prisma: PrismaService) {}

  @Post('login')
  @Throttle({
    default: { limit: LOGIN_ATTEMPT_LIMIT, ttl: LOGIN_ATTEMPT_WINDOW_MS },
  })
  @ApiOkResponse({
    schema: { type: 'object', properties: { token: { type: 'string' } } },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiBadRequestResponse({ description: 'Bad request' })
  async login(
    @Body()
    body: {
      email: string;
      password: string;
      code?: string;
      merchantId?: string;
    },
  ) {
    const email = String(body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(body?.password || '');
    const code = body?.code != null ? String(body.code) : undefined;
    const merchantId =
      typeof body?.merchantId === 'string' && body.merchantId.trim()
        ? body.merchantId.trim()
        : null;
    if (!email || !password) throw new UnauthorizedException('Unauthorized');
    const merchant = await this.prisma.merchant.findFirst({
      where: merchantId
        ? { id: merchantId, portalEmail: email }
        : { portalEmail: email },
    });
    let merchantAuthError: UnauthorizedException | null = null;
    if (merchant && merchant.portalLoginEnabled !== false) {
      const passwordMatches =
        !!merchant.portalPasswordHash &&
        verifyPassword(password, merchant.portalPasswordHash);
      if (passwordMatches) {
        if (merchant.portalTotpEnabled) {
          const otplib = (() => {
            try {
              // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional dependency
              return require('otplib') as unknown;
            } catch {
              return null;
            }
          })();
          const otplibModule = isOtplibModule(otplib) ? otplib : null;
          if (!otplibModule)
            throw new BadRequestException('TOTP library missing');
          if (!code) throw new UnauthorizedException('TOTP required');
          const ok = otplibModule.authenticator.verify({
            token: code,
            secret: merchant.portalTotpSecret,
          });
          if (!ok) throw new UnauthorizedException('Invalid code');
        }
        const token = await signPortalJwt({
          merchantId: merchant.id,
          subject: merchant.id,
          actor: 'MERCHANT',
          role: 'MERCHANT',
          ttlSeconds: 24 * 60 * 60,
        });
        const refreshToken = await signPortalRefreshJwt({
          merchantId: merchant.id,
          subject: merchant.id,
          actor: 'MERCHANT',
          role: 'MERCHANT',
        });
        await this.prisma.merchant.update({
          where: { id: merchant.id },
          data: {
            portalLastLoginAt: new Date(),
            portalRefreshTokenHash: hashPortalToken(refreshToken),
          },
        });
        return { token, refreshToken };
      }
      merchantAuthError = new UnauthorizedException('Unauthorized');
    }

    const staffWhere = {
      email,
      status: StaffStatus.ACTIVE,
      portalAccessEnabled: true,
      canAccessPortal: true,
      ...(merchantId ? { merchantId } : {}),
    };
    const staffMatches = await this.prisma.staff.findMany({
      where: staffWhere,
      take: merchantId ? 1 : 2,
    });
    if (!merchantId && staffMatches.length > 1) {
      throw new BadRequestException(
        'Укажите мерчанта для входа с этим логином',
      );
    }
    const staff = staffMatches[0] ?? null;
    if (!staff) {
      if (merchantAuthError) throw merchantAuthError;
      throw new UnauthorizedException('Unauthorized');
    }
    const staffPasswordOk =
      !!staff.hash && verifyPassword(password, staff.hash);
    if (
      staff.status !== StaffStatus.ACTIVE ||
      !staff.portalAccessEnabled ||
      !staff.canAccessPortal ||
      !staffPasswordOk
    ) {
      if (merchantAuthError) throw merchantAuthError;
      throw new UnauthorizedException('Unauthorized');
    }
    const token = await signPortalJwt({
      merchantId: staff.merchantId,
      subject: staff.id,
      actor: 'STAFF',
      role: staff.role || 'STAFF',
      staffId: staff.id,
      ttlSeconds: 24 * 60 * 60,
    });
    const refreshToken = await signPortalRefreshJwt({
      merchantId: staff.merchantId,
      subject: staff.id,
      actor: 'STAFF',
      role: staff.role || 'STAFF',
      staffId: staff.id,
    });
    await this.prisma.staff.update({
      where: { id: staff.id },
      data: {
        lastPortalLoginAt: new Date(),
        portalRefreshTokenHash: hashPortalToken(refreshToken),
      },
    });
    return { token, refreshToken };
  }

  @Post('refresh')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string' },
        refreshToken: { type: 'string' },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Bad request' })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh' })
  async refresh(@Body() body: { refreshToken?: string }) {
    const refreshToken = String(body?.refreshToken || '');
    if (!refreshToken) throw new BadRequestException('refreshToken required');
    const claims = await verifyPortalRefreshJwt(refreshToken);
    const refreshHash = hashPortalToken(refreshToken);
    if (claims.actor === 'MERCHANT') {
      const merchant = await this.prisma.merchant.findUnique({
        where: { id: claims.merchantId },
        select: {
          id: true,
          portalLoginEnabled: true,
          portalTokensRevokedAt: true,
          portalRefreshTokenHash: true,
        },
      });
      if (!merchant || merchant.portalLoginEnabled === false) {
        throw new UnauthorizedException('Unauthorized');
      }
      if (
        !claims.adminImpersonation &&
        isTokenRevoked(claims.issuedAt, merchant.portalTokensRevokedAt)
      ) {
        throw new UnauthorizedException('Unauthorized');
      }
      if (!merchant.portalRefreshTokenHash) {
        throw new UnauthorizedException('Unauthorized');
      }
      if (merchant.portalRefreshTokenHash !== refreshHash) {
        throw new UnauthorizedException('Unauthorized');
      }
    } else {
      const staffId = claims.staffId || claims.sub;
      if (!staffId) throw new UnauthorizedException('Unauthorized');
      const staff = await this.prisma.staff.findFirst({
        where: {
          id: staffId,
          merchantId: claims.merchantId,
        },
        select: {
          id: true,
          status: true,
          portalAccessEnabled: true,
          canAccessPortal: true,
          portalTokensRevokedAt: true,
          portalRefreshTokenHash: true,
        },
      });
      if (
        !staff ||
        staff.status !== StaffStatus.ACTIVE ||
        !staff.portalAccessEnabled ||
        !staff.canAccessPortal
      ) {
        throw new UnauthorizedException('Unauthorized');
      }
      if (
        !claims.adminImpersonation &&
        isTokenRevoked(claims.issuedAt, staff.portalTokensRevokedAt)
      ) {
        throw new UnauthorizedException('Unauthorized');
      }
      if (!staff.portalRefreshTokenHash) {
        throw new UnauthorizedException('Unauthorized');
      }
      if (staff.portalRefreshTokenHash !== refreshHash) {
        throw new UnauthorizedException('Unauthorized');
      }
      const merchant = await this.prisma.merchant.findUnique({
        where: { id: claims.merchantId },
        select: {
          portalLoginEnabled: true,
          portalTokensRevokedAt: true,
        },
      });
      if (!merchant || merchant.portalLoginEnabled === false) {
        throw new UnauthorizedException('Unauthorized');
      }
      if (
        !claims.adminImpersonation &&
        isTokenRevoked(claims.issuedAt, merchant.portalTokensRevokedAt)
      ) {
        throw new UnauthorizedException('Unauthorized');
      }
    }
    const subject = claims.staffId || claims.sub || claims.merchantId;
    const token = await signPortalJwt({
      merchantId: claims.merchantId,
      subject,
      actor: claims.actor,
      role: claims.role,
      staffId: claims.staffId,
      ttlSeconds: 24 * 60 * 60,
    });
    // rotate refresh token on each refresh
    const nextRefreshToken = await signPortalRefreshJwt({
      merchantId: claims.merchantId,
      subject,
      actor: claims.actor,
      role: claims.role,
      staffId: claims.staffId,
    });
    if (claims.actor === 'MERCHANT') {
      await this.prisma.merchant.update({
        where: { id: claims.merchantId },
        data: { portalRefreshTokenHash: hashPortalToken(nextRefreshToken) },
      });
    } else {
      const staffId = claims.staffId || claims.sub;
      if (staffId) {
        await this.prisma.staff.update({
          where: { id: staffId },
          data: { portalRefreshTokenHash: hashPortalToken(nextRefreshToken) },
        });
      }
    }
    return { token, refreshToken: nextRefreshToken };
  }

  @Get('me')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        merchantId: { type: 'string' },
        role: { type: 'string' },
        actor: { type: 'string' },
        staffId: { type: 'string', nullable: true },
        adminImpersonation: { type: 'boolean' },
      },
    },
  })
  @ApiUnauthorizedResponse()
  async me(@Headers('authorization') auth?: string) {
    const m = /^Bearer\s+(.+)$/i.exec(String(auth || ''));
    if (!m) throw new UnauthorizedException();
    const claims = await verifyPortalJwt(m[1]);
    const actor = claims.actor ?? 'MERCHANT';
    const staffId =
      actor === 'STAFF' ? claims.staffId || claims.sub || null : undefined;
    if (actor === 'MERCHANT') {
      const merchantId = claims.merchantId || claims.sub;
      const merchant = await this.prisma.merchant.findUnique({
        where: { id: merchantId },
        select: { portalLoginEnabled: true, portalTokensRevokedAt: true },
      });
      if (!merchant || merchant.portalLoginEnabled === false) {
        throw new UnauthorizedException();
      }
      if (
        !claims.adminImpersonation &&
        isTokenRevoked(claims.issuedAt, merchant.portalTokensRevokedAt)
      ) {
        throw new UnauthorizedException();
      }
    } else {
      if (!staffId) throw new UnauthorizedException();
      const staff = await this.prisma.staff.findFirst({
        where: { id: staffId, merchantId: claims.merchantId },
        select: {
          status: true,
          portalAccessEnabled: true,
          canAccessPortal: true,
          portalTokensRevokedAt: true,
        },
      });
      if (
        !staff ||
        staff.status !== StaffStatus.ACTIVE ||
        !staff.portalAccessEnabled ||
        !staff.canAccessPortal
      ) {
        throw new UnauthorizedException();
      }
      if (
        !claims.adminImpersonation &&
        isTokenRevoked(claims.issuedAt, staff.portalTokensRevokedAt)
      ) {
        throw new UnauthorizedException();
      }
      const merchant = await this.prisma.merchant.findUnique({
        where: { id: claims.merchantId },
        select: {
          portalLoginEnabled: true,
          portalTokensRevokedAt: true,
        },
      });
      if (!merchant || merchant.portalLoginEnabled === false) {
        throw new UnauthorizedException();
      }
      if (
        !claims.adminImpersonation &&
        isTokenRevoked(claims.issuedAt, merchant.portalTokensRevokedAt)
      ) {
        throw new UnauthorizedException();
      }
    }
    return {
      merchantId: claims.merchantId || claims.sub || '',
      role: claims.role || (actor === 'STAFF' ? 'STAFF' : 'MERCHANT'),
      actor,
      staffId: staffId ?? null,
      adminImpersonation: !!claims.adminImpersonation,
    };
  }
}

function isOtplibModule(value: unknown): value is {
  authenticator: {
    verify: (params: { token: string; secret?: string | null }) => boolean;
  };
} {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const authenticator = record.authenticator;
  if (!authenticator || typeof authenticator !== 'object') return false;
  return typeof (authenticator as { verify?: unknown }).verify === 'function';
}
