import { Body, Controller, Get, Headers, Post, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { getJose } from '../loyalty/token.util';
import { ApiBadRequestResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { verifyPassword } from '../password.util';

@ApiTags('portal-auth')
@Controller('portal/auth')
export class PortalAuthController {
  constructor(private prisma: PrismaService) {}

  private sha256(s: string) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
  }
  private async signPortalJwt(merchantId: string, ttlSeconds = 60 * 60) {
    const { SignJWT } = await getJose();
    const secret = process.env.PORTAL_JWT_SECRET || '';
    if (!secret) throw new Error('PORTAL_JWT_SECRET not configured');
    const now = Math.floor(Date.now() / 1000);
    const jwt = await new SignJWT({ sub: merchantId, role: 'MERCHANT' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + ttlSeconds)
      .sign(new TextEncoder().encode(secret));
    return jwt as string;
  }
  private async verifyJwt(token: string) {
    const { jwtVerify } = await getJose();
    const secret = process.env.PORTAL_JWT_SECRET || '';
    if (!secret) throw new Error('PORTAL_JWT_SECRET not configured');
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return payload as any;
  }

  @Post('login')
  @ApiOkResponse({ schema: { type: 'object', properties: { token: { type: 'string' } } } })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiBadRequestResponse({ description: 'Bad request' })
  async login(@Body() body: { email: string; password: string; code?: string }) {
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const code = body?.code != null ? String(body.code) : undefined;
    if (!email || !password) throw new UnauthorizedException('Unauthorized');
    const m = await (this.prisma.merchant as any).findFirst({ where: { portalEmail: email } }) as any;
    if (!m || m.portalLoginEnabled === false) throw new UnauthorizedException('Unauthorized');
    if (!m.portalPasswordHash || !verifyPassword(password, m.portalPasswordHash)) throw new UnauthorizedException('Unauthorized');
    if (m.portalTotpEnabled) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const otplib = (() => { try { return require('otplib'); } catch { return null; } })();
      if (!otplib) throw new BadRequestException('TOTP library missing');
      if (!code) throw new UnauthorizedException('TOTP required');
      const ok = otplib.authenticator.verify({ token: code, secret: m.portalTotpSecret });
      if (!ok) throw new UnauthorizedException('Invalid code');
    }
    await (this.prisma.merchant as any).update({ where: { id: m.id }, data: { portalLastLoginAt: new Date() } });
    const token = await this.signPortalJwt(m.id, 24 * 60 * 60);
    return { token };
  }

  @Get('me')
  @ApiOkResponse({ schema: { type: 'object', properties: { merchantId: { type: 'string' }, role: { type: 'string' } } } })
  @ApiUnauthorizedResponse()
  async me(@Headers('authorization') auth?: string) {
    const m = /^Bearer\s+(.+)$/i.exec(String(auth||''));
    if (!m) throw new UnauthorizedException();
    const payload = await this.verifyJwt(m[1]);
    return { merchantId: payload?.sub || '', role: payload?.role || 'MERCHANT' };
  }
}
