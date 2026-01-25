import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminGuard } from '../../../core/guards/admin.guard';
import { AdminIpGuard } from '../../../core/guards/admin-ip.guard';
import { AdminAuditInterceptor } from '../../admin/admin-audit.interceptor';
import { ErrorDto, TransactionItemDto } from '../../loyalty/dto/dto';
import {
  CreateOutletDto,
  OkDto,
  OutletDto,
  UpdateOutletDto,
  UpdateOutletStatusDto,
} from '../dto';
import { MerchantsOutletsUseCase } from '../use-cases/merchants-outlets.use-case';

@Controller('merchants')
@UseGuards(AdminGuard, AdminIpGuard)
@UseInterceptors(AdminAuditInterceptor)
@ApiTags('merchants')
@ApiHeader({
  name: 'X-Admin-Key',
  required: true,
  description: 'Админ-ключ (в проде проксируется сервером админки)',
})
@ApiExtraModels(TransactionItemDto)
export class MerchantsOutletsController {
  constructor(private readonly useCase: MerchantsOutletsUseCase) {}

  @Get(':id/outlets')
  @ApiOkResponse({ type: OutletDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  listOutlets(@Param('id') id: string) {
    return this.useCase.listOutlets(id);
  }

  @Post(':id/outlets')
  @ApiOkResponse({ type: OutletDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  createOutlet(@Param('id') id: string, @Body() dto: CreateOutletDto) {
    return this.useCase.createOutlet(id, dto);
  }

  @Put(':id/outlets/:outletId')
  @ApiOkResponse({ type: OutletDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  updateOutlet(
    @Param('id') id: string,
    @Param('outletId') outletId: string,
    @Body() dto: UpdateOutletDto,
  ) {
    return this.useCase.updateOutlet(id, outletId, dto);
  }

  @Delete(':id/outlets/:outletId')
  @ApiOkResponse({ type: OkDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  deleteOutlet(@Param('id') id: string, @Param('outletId') outletId: string) {
    return this.useCase.deleteOutlet(id, outletId);
  }

  @Put(':id/outlets/:outletId/status')
  @ApiOkResponse({ type: OutletDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  updateOutletStatus(
    @Param('id') id: string,
    @Param('outletId') outletId: string,
    @Body() dto: UpdateOutletStatusDto,
  ) {
    return this.useCase.updateOutletStatus(id, outletId, dto);
  }
}
