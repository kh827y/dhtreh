import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  readTelegramInitDataFromHeader,
  resolveTelegramAuthContext,
} from '../loyalty/telegram-auth.helper';

@Injectable()
export class TelegramMiniappGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (req?.teleauth?.customerId) return true;

    const merchantId = await this.resolveMerchantId(req);
    if (!merchantId) {
      throw new UnauthorizedException('merchantId is required');
    }

    const initData = readTelegramInitDataFromHeader(req);
    if (!initData) {
      throw new UnauthorizedException(
        'Authorization header must include Telegram initData (Authorization: tma <initData>)',
      );
    }

    const ctx = await resolveTelegramAuthContext(
      this.prisma,
      merchantId,
      initData,
    );
    if (!ctx) {
      throw new UnauthorizedException('Invalid Telegram initData');
    }
    req.teleauth = ctx;

    const requestedIds = this.collectCustomerIdentifiers(req);
    if (
      requestedIds.length > 0 &&
      !requestedIds.some(
        (id) => id === ctx.customerId || id === ctx.customerId,
      )
    ) {
      throw new UnauthorizedException('Customer identifier mismatch');
    }
    return true;
  }

  private sanitizeId(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return null;
    return trimmed;
  }

  private async resolveMerchantId(req: any): Promise<string | null> {
    const direct =
      this.sanitizeId(req?.body?.merchantId) ||
      this.sanitizeId(req?.query?.merchantId) ||
      this.sanitizeId(req?.params?.merchantId);
    if (direct) return direct;

    const candidates = this.collectCustomerCandidates(req);
    for (const id of candidates) {
      try {
        const record = await (
          this.prisma as any
        )?.customer?.findUnique?.({
          where: { id },
          select: { merchantId: true },
        });
        if (record?.merchantId) return record.merchantId;
      } catch {}
    }
    return null;
  }

  private collectCustomerCandidates(req: any): string[] {
    const sources = [
      req?.body?.customerId,
      req?.query?.customerId,
      req?.params?.customerId,
      req?.body?.customerId,
      req?.query?.customerId,
      req?.params?.customerId,
    ];
    const set = new Set<string>();
    for (const value of sources) {
      const id = this.sanitizeId(value);
      if (id) set.add(id);
    }
    return Array.from(set);
  }

  private collectCustomerIdentifiers(req: any): string[] {
    const fields = [
      req?.body?.customerId,
      req?.query?.customerId,
      req?.params?.customerId,
      req?.body?.customerId,
      req?.query?.customerId,
      req?.params?.customerId,
    ];
    const ids = new Set<string>();
    for (const value of fields) {
      const id = this.sanitizeId(value);
      if (id) ids.add(id);
    }
    return Array.from(ids);
  }
}
