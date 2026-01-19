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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { PortalGuard } from '../../portal-auth/portal.guard';
import {
  hasPortalPermission,
  type PortalPermissionState,
} from '../../portal-auth/portal-permissions.util';
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

type PortalRequest = {
  portalMerchantId?: string;
  portalPermissions?: PortalPermissionState | null;
  portalActor?: string;
  portalStaffId?: string | null;
  portalStaffRole?: string | null;
};

type StaffAvatarFile = {
  buffer?: Buffer;
  mimetype?: string;
  originalname?: string;
  size?: number;
};

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

  private getMerchantId(req: PortalRequest) {
    return String(req.portalMerchantId);
  }

  private canViewPins(req: PortalRequest) {
    const permissions = req.portalPermissions;
    if (!permissions) return false;
    if (permissions.allowAll) return true;
    return (
      hasPortalPermission(permissions, 'staff', 'manage') ||
      hasPortalPermission(permissions, 'cashier_panel', 'manage')
    );
  }

  private stripPins<
    T extends { accesses?: Array<{ pinCode?: string | null }> },
  >(items: T[]) {
    return items.map((item) => ({
      ...item,
      accesses: Array.isArray(item.accesses)
        ? item.accesses.map((access) => ({
            ...access,
            pinCode: null,
          }))
        : [],
    }));
  }

  @Get()
  async list(
    @Req() req: PortalRequest,
    @Query() query: StaffListQueryDto,
  ): Promise<StaffListResponseDto> {
    const { page, pageSize, ...rest } = query;
    const filters: StaffFilters = {
      search: rest.search,
      status: rest.status ?? undefined,
      outletId: rest.outletId,
      groupId: rest.groupId,
      portalOnly: rest.portalOnly,
    };
    const result = await this.service.listStaff(
      this.getMerchantId(req),
      filters,
      { page, pageSize },
    );
    if (!this.canViewPins(req)) {
      result.items = this.stripPins(result.items || []);
    }
    return result as StaffListResponseDto;
  }

  @Get(':id')
  async get(
    @Req() req: PortalRequest,
    @Param('id') id: string,
  ): Promise<StaffDetailDto> {
    const staff = await this.service.getStaff(this.getMerchantId(req), id);
    if (!this.canViewPins(req)) {
      staff.accesses = this.stripPins([staff])[0]?.accesses ?? [];
    }
    return staff as StaffDetailDto;
  }

  @Post()
  async create(@Req() req: PortalRequest, @Body() body: UpsertStaffDto) {
    const staff = await this.service.createStaff(this.getMerchantId(req), body);
    return staff as StaffDetailDto;
  }

  @Put(':id')
  async update(
    @Req() req: PortalRequest,
    @Param('id') id: string,
    @Body() body: UpsertStaffDto,
  ) {
    const staff = await this.service.updateStaff(
      this.getMerchantId(req),
      id,
      body,
      {
        actor: req.portalActor,
        staffId: req.portalStaffId ?? null,
        role: req.portalStaffRole ?? null,
      },
    );
    return staff as StaffDetailDto;
  }

  @Post(':id/avatar')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  async uploadAvatar(
    @Req() req: PortalRequest,
    @Param('id') id: string,
    @UploadedFile() file: StaffAvatarFile,
  ) {
    return this.service.uploadStaffAvatar(this.getMerchantId(req), id, file);
  }

  @Get('avatar/:assetId')
  async downloadAvatar(
    @Req() req: PortalRequest,
    @Param('assetId') assetId: string,
    @Res() res: Response,
  ) {
    const asset = await this.service.getStaffAvatarAsset(
      this.getMerchantId(req),
      assetId,
    );
    res.setHeader('Content-Type', asset.mimeType ?? 'application/octet-stream');
    res.setHeader(
      'Content-Length',
      String(asset.byteSize ?? asset.data?.length ?? 0),
    );
    if (asset.fileName)
      res.setHeader('X-Filename', encodeURIComponent(asset.fileName));
    res.send(asset.data);
  }

  @Post(':id/status')
  changeStatus(
    @Req() req: PortalRequest,
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
  rotatePin(@Req() req: PortalRequest, @Param('accessId') accessId: string) {
    return this.service.rotateStaffPin(this.getMerchantId(req), accessId);
  }

  @Post('access/:accessId/revoke')
  revokePin(@Req() req: PortalRequest, @Param('accessId') accessId: string) {
    return this.service.revokeStaffPin(this.getMerchantId(req), accessId);
  }

  @Get(':id/access')
  async listAccess(@Req() req: PortalRequest, @Param('id') id: string) {
    const items = await this.service.listStaffAccesses(
      this.getMerchantId(req),
      id,
    );
    if (this.canViewPins(req)) {
      return items as StaffOutletAccessDto[];
    }
    return items.map((access) => ({
      ...access,
      pinCode: null,
    })) as StaffOutletAccessDto[];
  }

  @Post(':id/access')
  async assignAccess(
    @Req() req: PortalRequest,
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
    @Req() req: PortalRequest,
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
    @Req() req: PortalRequest,
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
