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
  CreateStaffDto,
  OkDto,
  StaffDto,
  TokenRespDto,
  UpdateStaffDto,
} from '../dto';
import { MerchantsStaffUseCase } from '../use-cases/merchants-staff.use-case';

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
export class MerchantsStaffController {
  constructor(private readonly useCase: MerchantsStaffUseCase) {}

  // Staff
  @Get(':id/staff')
  @ApiOkResponse({ type: StaffDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  listStaff(@Param('id') id: string) {
    return this.useCase.listStaff(id);
  }

  @Post(':id/staff')
  @ApiOkResponse({ type: StaffDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  createStaff(@Param('id') id: string, @Body() dto: CreateStaffDto) {
    return this.useCase.createStaff(id, dto);
  }

  @Put(':id/staff/:staffId')
  @ApiOkResponse({ type: StaffDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  updateStaff(
    @Param('id') id: string,
    @Param('staffId') staffId: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.useCase.updateStaff(id, staffId, dto);
  }

  @Delete(':id/staff/:staffId')
  @ApiOkResponse({ type: OkDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  deleteStaff(@Param('id') id: string, @Param('staffId') staffId: string) {
    return this.useCase.deleteStaff(id, staffId);
  }

  // Staff tokens
  @Post(':id/staff/:staffId/token')
  @ApiOkResponse({ type: TokenRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  issueStaffToken(@Param('id') id: string, @Param('staffId') staffId: string) {
    return this.useCase.issueStaffToken(id, staffId);
  }

  @Delete(':id/staff/:staffId/token')
  @ApiOkResponse({ type: OkDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  revokeStaffToken(@Param('id') id: string, @Param('staffId') staffId: string) {
    return this.useCase.revokeStaffToken(id, staffId);
  }
}
