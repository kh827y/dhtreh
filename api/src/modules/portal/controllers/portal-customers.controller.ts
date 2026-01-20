import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { MerchantsService } from '../../merchants/merchants.service';
import { ErrorDto } from '../../loyalty/dto/dto';
import { PortalCustomersService } from '../services/customers.service';
import type { PortalCustomerDto } from '../services/customers.service';
import { PortalControllerHelpers } from './portal.controller-helpers';
import type { PortalRequest } from './portal.controller-helpers';
import { TransactionItemDto } from '../../loyalty/dto/dto';
import { ImportExportService } from '../../import-export/import-export.service';

@ApiExtraModels(TransactionItemDto)
@ApiTags('portal')
@Controller('portal')
@UseGuards(PortalGuard)
export class PortalCustomersController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly customersService: PortalCustomersService,
    private readonly importExport: ImportExportService,
    private readonly helpers: PortalControllerHelpers,
  ) {}

  // Customer search by phone (CRM helper)
  @Get('customer/search')
  @ApiOkResponse({
    schema: {
      oneOf: [
        {
          type: 'object',
          properties: {
            customerId: { type: 'string' },
            phone: { type: 'string', nullable: true },
            balance: { type: 'number' },
          },
        },
        { type: 'null' },
      ],
    },
  })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  customerSearch(@Req() req: PortalRequest, @Query('phone') phone: string) {
    return this.merchants.findCustomerByPhone(
      this.helpers.getMerchantId(req),
      String(phone || ''),
    );
  }

  // ===== Customers CRUD =====
  @Get('customers')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
  })
  listCustomers(
    @Req() req: PortalRequest,
    @Query('search') search?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
    @Query('segmentId') segmentId?: string,
    @Query('registeredOnly') registeredOnlyStr?: string,
    @Query('excludeMiniapp') excludeMiniappStr?: string,
  ) {
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200)
      : 50;
    const offset = offsetStr ? Math.max(parseInt(offsetStr, 10) || 0, 0) : 0;
    let registeredOnly: boolean | undefined;
    if (typeof registeredOnlyStr === 'string') {
      registeredOnly = !['0', 'false', 'no'].includes(
        registeredOnlyStr.trim().toLowerCase(),
      );
    }
    let excludeMiniapp: boolean | undefined;
    if (typeof excludeMiniappStr === 'string') {
      excludeMiniapp = !['0', 'false', 'no'].includes(
        excludeMiniappStr.trim().toLowerCase(),
      );
    }
    return this.customersService.list(this.helpers.getMerchantId(req), {
      search,
      limit,
      offset,
      segmentId,
      registeredOnly,
      excludeMiniapp,
    });
  }

  @Get('customers/:customerId')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  getCustomer(
    @Req() req: PortalRequest,
    @Param('customerId') customerId: string,
  ) {
    return this.customersService.get(
      this.helpers.getMerchantId(req),
      String(customerId || ''),
    );
  }

  @Post('customers/import')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  async importCustomers(
    @Req() req: PortalRequest,
    @Body()
    body: {
      format: 'csv' | 'excel';
      data: string;
      updateExisting?: boolean;
      sendWelcome?: boolean;
    },
  ) {
    if (!body?.data) throw new BadRequestException('Data is required');
    const raw = body.data.split(',').pop() || '';
    const buffer = Buffer.from(raw, 'base64');
    return this.importExport.importCustomers({
      merchantId: this.helpers.getMerchantId(req),
      format: body.format,
      data: buffer,
      updateExisting: body.updateExisting,
      sendWelcome: body.sendWelcome,
    });
  }

  @Post('customers')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  createCustomer(@Req() req: PortalRequest, @Body() body: unknown) {
    const payload = this.normalizeCustomerPayload(body);
    return this.customersService.create(this.helpers.getMerchantId(req), payload);
  }

  @Put('customers/:customerId')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  updateCustomer(
    @Req() req: PortalRequest,
    @Param('customerId') customerId: string,
    @Body() body: unknown,
  ) {
    const payload = this.normalizeCustomerPayload(body);
    return this.customersService.update(
      this.helpers.getMerchantId(req),
      String(customerId || ''),
      payload,
    );
  }

  @Post('customers/:customerId/transactions/accrual')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  async manualAccrual(
    @Req() req: PortalRequest,
    @Param('customerId') customerId: string,
    @Body() body: unknown,
  ) {
    const payload = this.helpers.asRecord(body);
    const staffId =
      typeof req.portalStaffId === 'string' && req.portalStaffId.trim()
        ? req.portalStaffId.trim()
        : null;
    return this.customersService.accrueManual(
      this.helpers.getMerchantId(req),
      String(customerId || ''),
      staffId,
      {
        purchaseAmount: this.helpers.coerceNumber(payload.purchaseAmount) ?? 0,
        points: this.helpers.coerceNumber(payload.points),
        receiptNumber: this.helpers.coerceString(payload.receiptNumber),
        outletId: this.helpers.coerceString(payload.outletId),
        comment: this.helpers.coerceString(payload.comment),
      },
    );
  }

  @Post('customers/:customerId/transactions/redeem')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  async manualRedeem(
    @Req() req: PortalRequest,
    @Param('customerId') customerId: string,
    @Body() body: unknown,
  ) {
    const payload = this.helpers.asRecord(body);
    const staffId =
      typeof req.portalStaffId === 'string' && req.portalStaffId.trim()
        ? req.portalStaffId.trim()
        : null;
    return this.customersService.redeemManual(
      this.helpers.getMerchantId(req),
      String(customerId || ''),
      staffId,
      {
        points: this.helpers.coerceNumber(payload.points) ?? 0,
        outletId: this.helpers.coerceString(payload.outletId),
        comment: this.helpers.coerceString(payload.comment),
      },
    );
  }

  @Post('customers/:customerId/transactions/complimentary')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  async manualComplimentary(
    @Req() req: PortalRequest,
    @Param('customerId') customerId: string,
    @Body() body: unknown,
  ) {
    const payload = this.helpers.asRecord(body);
    const staffId =
      typeof req.portalStaffId === 'string' && req.portalStaffId.trim()
        ? req.portalStaffId.trim()
        : null;
    return this.customersService.issueComplimentary(
      this.helpers.getMerchantId(req),
      String(customerId || ''),
      staffId,
      {
        points: this.helpers.coerceNumber(payload.points) ?? 0,
        expiresInDays: this.helpers.coerceNumber(payload.expiresInDays),
        outletId: this.helpers.coerceString(payload.outletId),
        comment: this.helpers.coerceString(payload.comment),
      },
    );
  }

  @Post('customers/:customerId/erase')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  eraseCustomer(
    @Req() req: PortalRequest,
    @Param('customerId') customerId: string,
  ) {
    return this.customersService.erasePersonalData(
      this.helpers.getMerchantId(req),
      String(customerId || ''),
    );
  }

  @Delete('customers/:customerId')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  deleteCustomer(
    @Req() req: PortalRequest,
    @Param('customerId') customerId: string,
  ) {
    return this.customersService.remove(
      this.helpers.getMerchantId(req),
      String(customerId || ''),
    );
  }

  private normalizeCustomerPayload(
    body: unknown,
  ): Partial<PortalCustomerDto> & { firstName?: string; lastName?: string } {
    const payload = this.helpers.asRecord(body);
    const tags = Array.isArray(payload.tags)
      ? payload.tags
          .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
          .filter((tag) => tag.length > 0)
      : undefined;
    const firstName = this.helpers.coerceString(payload.firstName) ?? undefined;
    const lastName = this.helpers.coerceString(payload.lastName) ?? undefined;
    return {
      phone: this.helpers.coerceString(payload.phone),
      email: this.helpers.coerceString(payload.email),
      name: this.helpers.coerceString(payload.name),
      firstName,
      lastName,
      birthday: this.helpers.coerceString(payload.birthday),
      gender: this.helpers.coerceString(payload.gender),
      tags,
      comment: this.helpers.coerceString(payload.comment),
      accrualsBlocked:
        payload.accrualsBlocked === undefined
          ? undefined
          : Boolean(payload.accrualsBlocked),
      redemptionsBlocked:
        payload.redemptionsBlocked === undefined
          ? undefined
          : Boolean(payload.redemptionsBlocked),
    };
  }
}
