import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { verifyPassword } from '../password.util';
import {
  signPortalJwt,
  verifyPortalJwt,
  signPortalRefreshJwt,
  verifyPortalRefreshJwt,
} from './portal-jwt.util';
import { StaffStatus } from '@prisma/client';

@ApiTags('portal-auth')
@Controller('portal/auth')
export class PortalAuthController {
  constructor(private prisma: PrismaService) {}

  @Post('login')
  @ApiOkResponse({
    schema: { type: 'object', properties: { token: { type: 'string' } } },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiBadRequestResponse({ description: 'Bad request' })
  async login(
    @Body() body: { email: string; password: string; code?: string },
  ) {
    const email = String(body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(body?.password || '');
    const code = body?.code != null ? String(body.code) : undefined;
    if (!email || !password) throw new UnauthorizedException('Unauthorized');
    const merchant = await (this.prisma.merchant as any).findFirst({
      where: { portalEmail: email },
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
              return require('otplib');
            } catch {
              return null;
            }
          })();
          if (!otplib) throw new BadRequestException('TOTP library missing');
          if (!code) throw new UnauthorizedException('TOTP required');
          const ok = otplib.authenticator.verify({
            token: code,
            secret: merchant.portalTotpSecret,
          });
          if (!ok) throw new UnauthorizedException('Invalid code');
        }
        await (this.prisma.merchant as any).update({
          where: { id: merchant.id },
          data: { portalLastLoginAt: new Date() },
        });
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
        return { token, refreshToken };
      }
      merchantAuthError = new UnauthorizedException('Unauthorized');
    }

    const staff = await this.prisma.staff.findFirst({
      where: {
        email,
        status: StaffStatus.ACTIVE,
        portalAccessEnabled: true,
        canAccessPortal: true,
      },
    });
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
    await this.prisma.staff.update({
      where: { id: staff.id },
      data: { lastPortalLoginAt: new Date() },
    });
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
    return { token, refreshToken };
  }

  @Post('refresh')
  @ApiOkResponse({
    schema: { type: 'object', properties: { token: { type: 'string' }, refreshToken: { type: 'string' } } },
  })
  @ApiBadRequestResponse({ description: 'Bad request' })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh' })
  async refresh(@Body() body: { refreshToken?: string }) {
    const refreshToken = String(body?.refreshToken || '');
    if (!refreshToken) throw new BadRequestException('refreshToken required');
    const claims = await verifyPortalRefreshJwt(refreshToken);
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
      actor === 'STAFF'
        ? claims.staffId || claims.sub || null
        : undefined;
    return {
      merchantId: claims.merchantId || claims.sub || '',
      role: claims.role || (actor === 'STAFF' ? 'STAFF' : 'MERCHANT'),
      actor,
      staffId: staffId ?? null,
      adminImpersonation: !!claims.adminImpersonation,
    };
  }
}
