import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { LoyaltyProgramService } from '../loyalty-program.service';

@Controller('portal/loyalty/operations')
@UseGuards(PortalGuard)
export class OperationsLogController {
  constructor(private readonly service: LoyaltyProgramService) {}

  private merchantId(req: any) {
    return String(req.portalMerchantId);
  }

  private parseType(value?: string) {
    if (!value) return undefined;
    const normalized = value.toUpperCase();
    const allowed = new Set(['MECHANIC', 'PROMO_CODE', 'PROMOTION']);
    if (!allowed.has(normalized)) {
      throw new BadRequestException('Некорректный type');
    }
    return normalized as 'MECHANIC' | 'PROMO_CODE' | 'PROMOTION';
  }

  private parseDate(value: string | undefined, label: string) {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Некорректная дата ${label}`);
    }
    return date;
  }

  @Get()
  list(
    @Req() req: any,
    @Query() query: { type?: string; from?: string; to?: string },
  ) {
    const from = this.parseDate(query.from, 'from');
    const to = this.parseDate(query.to, 'to');
    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException('from не может быть позже to');
    }
    return this.service.operationsLog(this.merchantId(req), {
      type: this.parseType(query.type),
      from,
      to,
    });
  }
}
