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
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { MerchantPanelService, StaffFilters } from '../merchant-panel.service';
import {
  ChangeStaffStatusDto,
  AssignStaffAccessDto,
  StaffListQueryDto,
  StaffListResponseDto,
  UpsertStaffDto,
  StaffDetailDto,
  StaffOutletAccessDto,
} from '../dto/staff.dto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('portal-staff')
@Controller('portal/staff')
@UseGuards(PortalGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class StaffController {
  constructor(private readonly service: MerchantPanelService) {}

  private getMerchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get()
  async list(
    @Req() req: any,
    @Query() query: StaffListQueryDto,
  ): Promise<StaffListResponseDto> {
    const { page, pageSize, ...rest } = query;
    const filters: StaffFilters = {
      search: rest.search,
      status: rest.status ? (rest.status as any) : undefined,
      outletId: rest.outletId,
      groupId: rest.groupId,
      portalOnly: rest.portalOnly,
    };
    const result = await this.service.listStaff(
      this.getMerchantId(req),
      filters,
      { page, pageSize },
    );
    return result as StaffListResponseDto;
  }

  @Get(':id')
  async get(@Req() req: any, @Param('id') id: string): Promise<StaffDetailDto> {
    const staff = await this.service.getStaff(this.getMerchantId(req), id);
    return staff as StaffDetailDto;
  }

  @Post()
  async create(@Req() req: any, @Body() body: UpsertStaffDto) {
    const staff = await this.service.createStaff(this.getMerchantId(req), body);
    return staff as StaffDetailDto;
  }

  @Put(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpsertStaffDto,
  ) {
    const staff = await this.service.updateStaff(
      this.getMerchantId(req),
      id,
      body,
    );
    return staff as StaffDetailDto;
  }

  @Post(':id/status')
  changeStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: ChangeStaffStatusDto,
  ) {
    return this.service.changeStaffStatus(
      this.getMerchantId(req),
      id,
      body.status,
    );
  }

  @Post('access/:accessId/rotate')
  rotatePin(@Req() req: any, @Param('accessId') accessId: string) {
    return this.service.rotateStaffPin(this.getMerchantId(req), accessId);
  }

  @Post('access/:accessId/revoke')
  revokePin(@Req() req: any, @Param('accessId') accessId: string) {
    return this.service.revokeStaffPin(this.getMerchantId(req), accessId);
  }

  @Get(':id/access')
  async listAccess(@Req() req: any, @Param('id') id: string) {
    const items = await this.service.listStaffAccesses(
      this.getMerchantId(req),
      id,
    );
    return items as StaffOutletAccessDto[];
  }

  @Post(':id/access')
  async assignAccess(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: AssignStaffAccessDto,
  ) {
    const access = await this.service.addStaffAccess(
      this.getMerchantId(req),
      id,
      body.outletId,
    );
    return access as StaffOutletAccessDto;
  }

  @Delete(':id/access/:outletId')
  revokeAccess(
    @Req() req: any,
    @Param('id') id: string,
    @Param('outletId') outletId: string,
  ) {
    return this.service.removeStaffAccess(
      this.getMerchantId(req),
      id,
      outletId,
    );
  }

  @Post(':id/access/:outletId/regenerate-pin')
  async regenerateOutletPin(
    @Req() req: any,
    @Param('id') id: string,
    @Param('outletId') outletId: string,
  ) {
    const access = await this.service.regenerateStaffOutletPin(
      this.getMerchantId(req),
      id,
      outletId,
    );
    return access as StaffOutletAccessDto;
  }
}
