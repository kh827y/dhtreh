import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { signPortalJwt as issuePortalJwt } from '../../portal-auth/portal-jwt.util';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import { secureToken, sha256 } from '../merchants.helpers';

type OtplibModule = {
  authenticator: {
    generateSecret: () => string;
    verify: (opts: { token: string; secret: string }) => boolean;
  };
};

@Injectable()
export class MerchantsPortalAuthService {
  private readonly logger = new Logger(MerchantsPortalAuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  private loadOtplib(): OtplibModule | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional dependency
      const mod = require('otplib') as unknown;
      if (!mod || typeof mod !== 'object') return null;
      const authenticator = (mod as { authenticator?: unknown }).authenticator;
      if (!authenticator || typeof authenticator !== 'object') return null;
      const generateSecret = (authenticator as { generateSecret?: unknown })
        .generateSecret;
      const verify = (authenticator as { verify?: unknown }).verify;
      if (
        typeof generateSecret !== 'function' ||
        typeof verify !== 'function'
      ) {
        return null;
      }
      return {
        authenticator: {
          generateSecret: generateSecret as () => string,
          verify: verify as (opts: {
            token: string;
            secret: string;
          }) => boolean,
        },
      };
    } catch (err) {
      logIgnoredError(
        err,
        'MerchantsPortalAuthService load otplib',
        this.logger,
        'debug',
      );
      return null;
    }
  }

  private async signPortalJwt(
    merchantId: string,
    ttlSeconds = 60 * 60,
    adminImpersonation = false,
  ) {
    return issuePortalJwt({
      merchantId,
      subject: merchantId,
      actor: 'MERCHANT',
      role: 'MERCHANT',
      adminImpersonation,
      ttlSeconds,
    });
  }

  async issueStaffToken(merchantId: string, staffId: string) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    const token = secureToken(48);
    const hash = sha256(token);
    await this.prisma.staff.update({
      where: { id: staffId },
      data: { apiKeyHash: hash },
    });
    return { token };
  }

  async revokeStaffToken(merchantId: string, staffId: string) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    await this.prisma.staff.update({
      where: { id: staffId },
      data: { apiKeyHash: null },
    });
    return { ok: true };
  }

  async rotatePortalKey(merchantId: string) {
    const m = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!m) throw new NotFoundException('Merchant not found');
    const key = secureToken(48);
    const hash = sha256(key);
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { portalKeyHash: hash },
    });
    return { key };
  }

  async setPortalLoginEnabled(merchantId: string, enabled: boolean) {
    const updateData: Prisma.MerchantUpdateInput = {
      portalLoginEnabled: !!enabled,
    };
    if (!enabled) {
      updateData.portalTokensRevokedAt = new Date();
      updateData.portalRefreshTokenHash = null;
    }
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: updateData,
    });
    return { ok: true };
  }

  async initTotp(merchantId: string) {
    const m = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!m) throw new NotFoundException('Merchant not found');
    const otplib = this.loadOtplib();
    if (!otplib) throw new Error('otplib not installed');
    const secret = otplib.authenticator.generateSecret();
    const label = encodeURIComponent(`Loyalty:${m.name || m.id}`);
    const issuer = encodeURIComponent('LoyaltyPortal');
    const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { portalTotpSecret: secret, portalTotpEnabled: false },
    });
    return { secret, otpauth };
  }

  async verifyTotp(merchantId: string, code: string) {
    const m = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!m) throw new NotFoundException('Merchant not found');
    if (!m.portalTotpSecret)
      throw new BadRequestException('TOTP not initialized');
    const otplib = this.loadOtplib();
    if (!otplib) throw new Error('otplib not installed');
    const ok = otplib.authenticator.verify({
      token: String(code || ''),
      secret: m.portalTotpSecret,
    });
    if (!ok) throw new BadRequestException('Invalid TOTP code');
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { portalTotpEnabled: true },
    });
    return { ok: true };
  }

  async disableTotp(merchantId: string) {
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { portalTotpEnabled: false, portalTotpSecret: null },
    });
    return { ok: true };
  }

  async impersonatePortal(merchantId: string, ttlSec = 24 * 60 * 60) {
    // short-lived admin impersonation token
    const token = await this.signPortalJwt(merchantId, ttlSec, true);
    return { token };
  }
}
