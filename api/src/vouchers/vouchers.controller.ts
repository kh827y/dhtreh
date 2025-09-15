import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { VouchersService } from './vouchers.service';
import { AdminGuard } from '../admin.guard';
import { AdminIpGuard } from '../admin-ip.guard';

@ApiTags('vouchers')
@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchers: VouchersService) {}

  @Post('preview')
  @ApiOkResponse({ schema: { type: 'object', properties: {
    canApply: { type: 'boolean' },
    discount: { type: 'number' },
    voucherId: { type: 'string' },
    codeId: { type: 'string' },
    reason: { type: 'string', nullable: true },
  } } })
  @ApiBadRequestResponse({ schema: { type: 'object', properties: { statusCode: { type: 'number' }, message: { type: 'string' } } } })
  async preview(@Body() body: { merchantId: string; code: string; eligibleTotal: number; customerId?: string }) {
    return this.vouchers.preview(body);
  }

  @Post('issue')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' }, voucherId: { type: 'string' } } } })
  @ApiBadRequestResponse({ schema: { type: 'object', properties: { statusCode: { type: 'number' }, message: { type: 'string' } } } })
  async issue(@Body() body: { merchantId: string; name?: string; valueType: 'PERCENTAGE'|'FIXED_AMOUNT'; value: number; code: string; validFrom?: string; validUntil?: string; minPurchaseAmount?: number }) {
    return this.vouchers.issue(body);
  }

  @Post('redeem')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' }, discount: { type: 'number' } } } })
  @ApiBadRequestResponse({ schema: { type: 'object', properties: { statusCode: { type: 'number' }, message: { type: 'string' } } } })
  async redeem(@Body() body: { merchantId: string; code: string; customerId: string; eligibleTotal: number; orderId?: string }) {
    return this.vouchers.redeem(body);
  }

  @Post('status')
  @ApiOkResponse({ schema: { type: 'object', properties: {
    voucherId: { type: 'string' }, codeId: { type: 'string', nullable: true }, code: { type: 'string', nullable: true },
    voucherStatus: { type: 'string' }, voucherActive: { type: 'boolean' }, codeStatus: { type: 'string' },
    codeUsedCount: { type: 'number' }, codeMaxUses: { type: 'number', nullable: true }, validFrom: { type: 'string', nullable: true }, validUntil: { type: 'string', nullable: true }
  } } })
  @ApiBadRequestResponse({ schema: { type: 'object', properties: { statusCode: { type: 'number' }, message: { type: 'string' } } } })
  async status(@Body() body: { merchantId: string; code?: string; voucherId?: string }) {
    return this.vouchers.status(body);
  }

  @Post('deactivate')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  @ApiBadRequestResponse({ schema: { type: 'object', properties: { statusCode: { type: 'number' }, message: { type: 'string' } } } })
  async deactivate(@Body() body: { merchantId: string; code?: string; voucherId?: string }) {
    return this.vouchers.deactivate(body);
  }

  // Admin listing for vouchers (JSON)
  @Get('list')
  @UseGuards(AdminGuard, AdminIpGuard)
  @ApiHeader({ name: 'X-Admin-Key', required: true })
  @ApiOkResponse({ schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, merchantId: { type: 'string' }, name: { type: 'string' }, valueType: { type: 'string' }, value: { type: 'number' }, status: { type: 'string' }, isActive: { type: 'boolean' },
    validFrom: { type: 'string', nullable: true }, validUntil: { type: 'string', nullable: true }, totalUsed: { type: 'number' }, maxTotalUses: { type: 'number', nullable: true },
    codes: { type: 'number' }, activeCodes: { type: 'number' }, usedCodes: { type: 'number' }, codeSamples: { type: 'array', items: { type: 'string' } }
  } } } } } })
  @ApiBadRequestResponse({ schema: { type: 'object', properties: { statusCode: { type: 'number' }, message: { type: 'string' } } } })
  async list(@Query('merchantId') merchantId: string, @Query('status') status?: string, @Query('limit') limitStr?: string) {
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200) : 50;
    return this.vouchers.list({ merchantId, status, limit });
  }

  // CSV export
  @Get('export.csv')
  @UseGuards(AdminGuard, AdminIpGuard)
  @ApiHeader({ name: 'X-Admin-Key', required: true })
  async exportCsv(@Query('merchantId') merchantId: string, @Query('status') status: string | undefined, @Res() res: Response) {
    const csv = await this.vouchers.exportCsv({ merchantId, status });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="vouchers.csv"');
    res.send(csv);
  }
}
