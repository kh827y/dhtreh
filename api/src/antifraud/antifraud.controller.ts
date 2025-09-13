import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import type { TransactionContext } from './antifraud.service';
import { AntiFraudService } from './antifraud.service';
import { ApiKeyGuard } from '../guards/api-key.guard';

@ApiTags('Antifraud')
@Controller('antifraud')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class AntifraudController {
  constructor(private readonly antifraudService: AntiFraudService) {}

  /**
   * Check fraud risk for a transaction
   */
  @Post('check')
  @ApiOperation({ summary: 'Check fraud risk for a transaction' })
  @ApiResponse({ status: 200, description: 'Fraud check result' })
  async checkFraud(
    @Body() dto: {
      merchantId: string;
      customerId: string;
      amount: number;
      transactionId?: string;
      type?: 'EARN' | 'REDEEM';
    }
  ) {
    const ctx: TransactionContext = {
      merchantId: dto.merchantId,
      customerId: dto.customerId,
      amount: dto.amount,
      type: dto.type ?? (dto.amount >= 0 ? 'EARN' : 'REDEEM'),
    };
    return this.antifraudService.checkTransaction(ctx);
  }

  /**
   * Get fraud history for a customer
   */
  @Get('history/:customerId')
  @ApiOperation({ summary: 'Get fraud check history for a customer' })
  @ApiResponse({ status: 200, description: 'Fraud check history' })
  async getFraudHistory(
    @Param('customerId') customerId: string,
    @Query('merchantId') merchantId: string,
  ) {
    return this.antifraudService.getCustomerHistory(merchantId, customerId);
  }

  /**
   * Review a fraud check
   */
  @Post(':checkId/review')
  @ApiOperation({ summary: 'Review a fraud check' })
  @ApiResponse({ status: 200, description: 'Review recorded' })
  async reviewFraudCheck(
    @Param('checkId') checkId: string,
    @Body() dto: {
      approved: boolean;
      notes?: string;
      reviewedBy: string;
    }
  ) {
    return this.antifraudService.reviewCheck(checkId, dto);
  }

  /**
   * Get fraud statistics
   */
  @Get('stats')
  @ApiOperation({ summary: 'Get fraud statistics' })
  @ApiResponse({ status: 200, description: 'Fraud statistics' })
  async getFraudStats(@Query('merchantId') merchantId: string) {
    return this.antifraudService.getStatistics(merchantId);
  }
}
