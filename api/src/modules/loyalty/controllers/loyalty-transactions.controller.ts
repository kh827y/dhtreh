import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AntiFraudGuard } from '../../../core/guards/antifraud.guard';
import { CashierGuard } from '../../../core/guards/cashier.guard';
import { SubscriptionGuard } from '../../../core/guards/subscription.guard';
import {
  BalanceDto,
  CommitDto,
  CommitRespDto,
  ErrorDto,
  OkDto,
  PublicSettingsDto,
  QrMintDto,
  QrMintRespDto,
  QuoteDto,
  QuoteEarnRespDto,
  QuoteRedeemRespDto,
  RefundDto,
  RefundRespDto,
} from '../dto/dto';
import type {
  CashierRequest,
  RequestWithRequestId,
  TeleauthRequest,
} from './loyalty-controller.types';
import { LoyaltyTransactionsUseCase } from '../use-cases/loyalty-transactions.use-case';

@ApiTags('loyalty')
@ApiExtraModels(QuoteRedeemRespDto, QuoteEarnRespDto)
@UseGuards(CashierGuard, SubscriptionGuard)
@Controller('loyalty')
export class LoyaltyTransactionsController {
  constructor(private readonly useCase: LoyaltyTransactionsUseCase) {}

  @Post('qr')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: QrMintRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  async mintQr(@Body() dto: QrMintDto, @Req() req: TeleauthRequest) {
    return this.useCase.mintQr(dto, req);
  }

  @Post('quote')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(QuoteRedeemRespDto) },
        { $ref: getSchemaPath(QuoteEarnRespDto) },
      ],
    },
  })
  @ApiBadRequestResponse({ type: ErrorDto })
  async quote(
    @Body() dto: QuoteDto,
    @Req() _req: Request & { requestId?: string },
  ) {
    return this.useCase.quote(dto, _req);
  }

  @Post('commit')
  @UseGuards(AntiFraudGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Идемпотентность COMMIT',
  })
  @ApiOkResponse({ type: CommitRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  async commit(
    @Body() dto: CommitDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: RequestWithRequestId,
  ) {
    return this.useCase.commit(dto, res, req);
  }

  @Post('cancel')
  @ApiOkResponse({ type: OkDto })
  async cancel(@Body('holdId') holdId: string, @Req() req: CashierRequest) {
    return this.useCase.cancel(holdId, req);
  }

  @Get('balance/:merchantId/:customerId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ type: BalanceDto })
  balance2(
    @Param('merchantId') merchantId: string,
    @Param('customerId') customerId: string,
  ) {
    return this.useCase.balance(merchantId, customerId);
  }

  // Публичные настройки, доступные мини-аппе (без админ-ключа)
  @Get('settings/:merchantId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ type: PublicSettingsDto })
  async publicSettings(@Param('merchantId') merchantId: string) {
    return this.useCase.publicSettings(merchantId);
  }

  @Get('miniapp-logo/:merchantId/:assetId')
  async getMiniappLogo(
    @Param('merchantId') merchantId: string,
    @Param('assetId') assetId: string,
    @Res() res: Response,
  ) {
    return this.useCase.getMiniappLogo(merchantId, assetId, res);
  }

  @Post('refund')
  @UseGuards(AntiFraudGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Идемпотентность REFUND',
  })
  @ApiOkResponse({ type: RefundRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  async refund(
    @Body() dto: RefundDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: RequestWithRequestId,
  ) {
    return this.useCase.refund(dto, res, req);
  }
}
