import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { LoyaltyProgramService } from '../loyalty-program.service';

type PortalRequest = Request & {
  portalMerchantId?: string;
};

@ApiTags('portal-loyalty')
@Controller('portal/loyalty/operations')
@UseGuards(PortalGuard)
@ApiBearerAuth()
export class OperationsLogController {
  constructor(private readonly service: LoyaltyProgramService) {}

  private merchantId(req: PortalRequest) {
    return String(req.portalMerchantId ?? '');
  }

  private parseType(value?: string) {
    if (!value) return undefined;
    const normalized = value.toUpperCase();
    const allowed = new Set(['PROMO_CODE', 'PROMOTION']);
    if (!allowed.has(normalized)) {
      throw new BadRequestException('Некорректный type');
    }
    return normalized as 'PROMO_CODE' | 'PROMOTION';
  }

  private parseLimit(value?: string) {
    if (!value) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException('Некорректный limit');
    }
    return Math.floor(parsed);
  }

  private parseOffset(value?: string) {
    if (!value) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException('Некорректный offset');
    }
    return Math.floor(parsed);
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
  @ApiOperation({ summary: 'Получить лог операций лояльности' })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['PROMO_CODE', 'PROMOTION'],
  })
  @ApiQuery({
    name: 'from',
    type: String,
    required: false,
    description: 'ISO date string',
  })
  @ApiQuery({
    name: 'to',
    type: String,
    required: false,
    description: 'ISO date string',
  })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'offset', type: Number, required: false })
  list(
    @Req() req: PortalRequest,
    @Query()
    query: {
      type?: string;
      from?: string;
      to?: string;
      limit?: string;
      offset?: string;
    },
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
      limit: this.parseLimit(query.limit),
      offset: this.parseOffset(query.offset),
    });
  }
}
