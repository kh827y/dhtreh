import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { ErrorDto } from '../../loyalty/dto/dto';
import type { PortalRequest } from '../portal.types';
import { TransactionItemDto } from '../../loyalty/dto/dto';
import { PortalCustomersUseCase } from '../use-cases/portal-customers.use-case';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ImportCustomersDto,
  ManualAccrualDto,
  ManualComplimentaryDto,
  ManualRedeemDto,
  PortalCustomerPayloadDto,
} from '../dto/customers.dto';

@ApiExtraModels(TransactionItemDto)
@ApiTags('portal')
@Controller('portal')
@UseGuards(PortalGuard)
export class PortalCustomersController {
  constructor(private readonly useCase: PortalCustomersUseCase) {}

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
    return this.useCase.customerSearch(req, phone);
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
    return this.useCase.listCustomers(
      req,
      search,
      limitStr,
      offsetStr,
      segmentId,
      registeredOnlyStr,
      excludeMiniappStr,
    );
  }

  @Get('customers/:customerId')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  getCustomer(
    @Req() req: PortalRequest,
    @Param('customerId') customerId: string,
  ) {
    return this.useCase.getCustomer(req, customerId);
  }

  @Post('customers/import')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }),
  )
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  async importCustomers(
    @Req() req: PortalRequest,
    @Body() body: ImportCustomersDto,
    @UploadedFile()
    file?: {
      buffer?: Buffer;
      originalname?: string;
      mimetype?: string;
      size?: number;
    },
  ) {
    return this.useCase.importCustomers(req, body, file);
  }

  @Get('customers/import/jobs')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
  })
  listImportJobs(
    @Req() req: PortalRequest,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    return this.useCase.listImportJobs(req, limitStr, offsetStr);
  }

  @Get('customers/import/:jobId')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  getImportJob(@Req() req: PortalRequest, @Param('jobId') jobId: string) {
    return this.useCase.getImportJob(req, jobId);
  }

  @Post('customers')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  createCustomer(
    @Req() req: PortalRequest,
    @Body() body: PortalCustomerPayloadDto,
  ) {
    return this.useCase.createCustomer(req, body);
  }

  @Put('customers/:customerId')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  updateCustomer(
    @Req() req: PortalRequest,
    @Param('customerId') customerId: string,
    @Body() body: PortalCustomerPayloadDto,
  ) {
    return this.useCase.updateCustomer(req, customerId, body);
  }

  @Post('customers/:customerId/transactions/accrual')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  async manualAccrual(
    @Req() req: PortalRequest,
    @Param('customerId') customerId: string,
    @Body() body: ManualAccrualDto,
  ) {
    return this.useCase.manualAccrual(req, customerId, body);
  }

  @Post('customers/:customerId/transactions/redeem')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  async manualRedeem(
    @Req() req: PortalRequest,
    @Param('customerId') customerId: string,
    @Body() body: ManualRedeemDto,
  ) {
    return this.useCase.manualRedeem(req, customerId, body);
  }

  @Post('customers/:customerId/transactions/complimentary')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  async manualComplimentary(
    @Req() req: PortalRequest,
    @Param('customerId') customerId: string,
    @Body() body: ManualComplimentaryDto,
  ) {
    return this.useCase.manualComplimentary(req, customerId, body);
  }

  @Post('customers/:customerId/erase')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  eraseCustomer(
    @Req() req: PortalRequest,
    @Param('customerId') customerId: string,
  ) {
    return this.useCase.eraseCustomer(req, customerId);
  }

  @Delete('customers/:customerId')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  deleteCustomer(
    @Req() req: PortalRequest,
    @Param('customerId') customerId: string,
  ) {
    return this.useCase.deleteCustomer(req, customerId);
  }
}
