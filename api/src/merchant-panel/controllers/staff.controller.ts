import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { MerchantPanelService, StaffFilters } from '../merchant-panel.service';
import {
  ChangeStaffStatusDto,
  StaffListQueryDto,
  StaffListResponseDto,
  UpsertStaffDto,
  StaffDetailDto,
} from '../dto/staff.dto';
import { plainToInstance } from 'class-transformer';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('portal-staff')
@Controller('portal/staff')
@UseGuards(PortalGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))

export class StaffController {
  constructor(private readonly service: MerchantPanelService) {}

  private getMerchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get()
  async list(@Req() req: any, @Query() query: StaffListQueryDto): Promise<StaffListResponseDto> {
    const { page, pageSize, ...rest } = query;
    const filters: StaffFilters = {
      search: rest.search,
      status: rest.status ? (rest.status as any) : undefined,
      outletId: rest.outletId,
      groupId: rest.groupId,
      portalOnly: rest.portalOnly,
    };
    const result = await this.service.listStaff(this.getMerchantId(req), filters, { page, pageSize });
    return plainToInstance(StaffListResponseDto, result, { enableImplicitConversion: true });
  }

  @Get(':id')
  async get(@Req() req: any, @Param('id') id: string): Promise<StaffDetailDto> {
    const staff = await this.service.getStaff(this.getMerchantId(req), id);
    return plainToInstance(StaffDetailDto, staff, { enableImplicitConversion: true });
  }

  @Post()
  async create(@Req() req: any, @Body() body: UpsertStaffDto) {
    const staff = await this.service.createStaff(this.getMerchantId(req), body);
    return plainToInstance(StaffDetailDto, staff, { enableImplicitConversion: true });
  }

  @Put(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: UpsertStaffDto) {
    const staff = await this.service.updateStaff(this.getMerchantId(req), id, body);
    return plainToInstance(StaffDetailDto, staff, { enableImplicitConversion: true });
  }

  @Post(':id/status')
  changeStatus(@Req() req: any, @Param('id') id: string, @Body() body: ChangeStaffStatusDto) {
    return this.service.changeStaffStatus(this.getMerchantId(req), id, body.status);
  }

  @Post('access/:accessId/rotate')
  rotatePin(@Req() req: any, @Param('accessId') accessId: string) {
    return this.service.rotateStaffPin(this.getMerchantId(req), accessId);
  }

  @Post('access/:accessId/revoke')
  revokePin(@Req() req: any, @Param('accessId') accessId: string) {
    return this.service.revokeStaffPin(this.getMerchantId(req), accessId);
  }
}
