import { Body, Controller, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { VouchersService } from './vouchers.service';

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
}
