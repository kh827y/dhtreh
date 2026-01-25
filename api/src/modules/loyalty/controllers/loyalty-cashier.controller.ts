import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CashierGuard } from '../../../core/guards/cashier.guard';
import {
  AllowInactiveSubscription,
  SubscriptionGuard,
} from '../../../core/guards/subscription.guard';
import {
  CashierActivateDto,
  CashierSessionStartDto,
  CashierStaffAccessDto,
  CashierCustomerResolveDto,
  CashierCustomerResolveRespDto,
  CashierOutletTransactionsRespDto,
  ErrorDto,
} from '../dto/dto';
import type { CashierRequest } from './loyalty-controller.types';
import { LoyaltyCashierUseCase } from '../use-cases/loyalty-cashier.use-case';

@ApiTags('loyalty')
@UseGuards(CashierGuard, SubscriptionGuard)
@Controller('loyalty')
export class LoyaltyCashierController {
  constructor(private readonly useCase: LoyaltyCashierUseCase) {}

  // ===== Cashier Auth (public) =====

  @Post('cashier/activate')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        merchantId: { type: 'string' },
        login: { type: 'string' },
        expiresAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  async cashierActivate(
    @Body() body: CashierActivateDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.useCase.cashierActivate(body, req, res);
  }

  @Get('cashier/device')
  @AllowInactiveSubscription()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        active: { type: 'boolean' },
        merchantId: { type: 'string', nullable: true },
        login: { type: 'string', nullable: true },
        expiresAt: { type: 'string', format: 'date-time', nullable: true },
        lastSeenAt: { type: 'string', format: 'date-time', nullable: true },
      },
    },
  })
  async cashierDevice(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.useCase.cashierDevice(req, res);
  }

  @Delete('cashier/device')
  @AllowInactiveSubscription()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  async logoutCashierDevice(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.useCase.logoutCashierDevice(req, res);
  }

  @Post('cashier/staff-access')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        staff: { type: 'object', additionalProperties: true },
        accesses: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
      },
    },
  })
  async cashierStaffAccess(
    @Body() body: CashierStaffAccessDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.useCase.cashierStaffAccess(body, req, res);
  }

  @Post('cashier/session')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        merchantId: { type: 'string' },
        sessionId: { type: 'string' },
        staff: { type: 'object', additionalProperties: true },
        outlet: { type: 'object', additionalProperties: true },
        startedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  async startCashierSession(
    @Body() body: CashierSessionStartDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.useCase.startCashierSession(body, req, res);
  }

  @Get('cashier/session')
  @AllowInactiveSubscription()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        active: { type: 'boolean' },
        merchantId: { type: 'string', nullable: true },
        sessionId: { type: 'string', nullable: true },
        staff: { type: 'object', nullable: true, additionalProperties: true },
        outlet: { type: 'object', nullable: true, additionalProperties: true },
        startedAt: { type: 'string', format: 'date-time', nullable: true },
        lastSeenAt: { type: 'string', format: 'date-time', nullable: true },
      },
    },
  })
  async currentCashierSession(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.useCase.currentCashierSession(req, res);
  }

  @Post('cashier/customer')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ type: CashierCustomerResolveRespDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  async resolveCashierCustomer(
    @Req() req: CashierRequest,
    @Body() dto: CashierCustomerResolveDto,
  ) {
    return this.useCase.resolveCashierCustomer(req, dto);
  }

  @Delete('cashier/session')
  @AllowInactiveSubscription()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  async logoutCashierSession(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.useCase.logoutCashierSession(req, res);
  }

  @Get('cashier/leaderboard')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        settings: { type: 'object', additionalProperties: true },
        period: { type: 'object', additionalProperties: true },
        items: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
      },
    },
  })
  async cashierLeaderboard(
    @Req() req: CashierRequest,
    @Query('merchantId') merchantIdQuery?: string,
    @Query('outletId') outletId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.useCase.cashierLeaderboard(
      req,
      merchantIdQuery,
      outletId,
      limit,
    );
  }

  @Get('cashier/outlet-transactions')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: { $ref: getSchemaPath(CashierOutletTransactionsRespDto) },
  })
  async cashierOutletTransactions(
    @Req() req: CashierRequest,
    @Query('merchantId') merchantIdQuery?: string,
    @Query('outletId') outletIdQuery?: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
  ) {
    return this.useCase.cashierOutletTransactions(
      req,
      merchantIdQuery,
      outletIdQuery,
      limitStr,
      beforeStr,
    );
  }
}
