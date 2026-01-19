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
import type { Request } from 'express';
import { PortalGuard } from '../../portal-auth/portal.guard';
import {
  MerchantPanelService,
  AccessGroupFilters,
} from '../merchant-panel.service';
import {
  AccessGroupDtoInput,
  AccessGroupListQueryDto,
  AccessGroupListResponseDto,
  SetAccessGroupMembersDto,
} from '../dto/access-group.dto';
import { ApiTags } from '@nestjs/swagger';

type PortalRequest = Request & {
  portalMerchantId?: string;
};

@ApiTags('portal-access-groups')
@Controller('portal/access-groups')
@UseGuards(PortalGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class AccessGroupsController {
  constructor(private readonly service: MerchantPanelService) {}

  private getMerchantId(req: PortalRequest) {
    return String(req.portalMerchantId ?? '');
  }

  @Get()
  async list(
    @Req() req: PortalRequest,
    @Query() query: AccessGroupListQueryDto,
  ): Promise<AccessGroupListResponseDto> {
    const { page, pageSize, ...rest } = query;
    const filters: AccessGroupFilters = {
      scope: rest.scope,
      search: rest.search,
    };
    const result = await this.service.listAccessGroups(
      this.getMerchantId(req),
      filters,
      { page, pageSize },
    );
    return result;
  }

  @Post()
  async create(
    @Req() req: PortalRequest,
    @Body() body: AccessGroupDtoInput & { actorId?: string },
  ) {
    const group = await this.service.createAccessGroup(
      this.getMerchantId(req),
      body,
      body.actorId,
    );
    return group;
  }

  @Put(':id')
  async update(
    @Req() req: PortalRequest,
    @Param('id') id: string,
    @Body() body: AccessGroupDtoInput & { actorId?: string },
  ) {
    const group = await this.service.updateAccessGroup(
      this.getMerchantId(req),
      id,
      body,
      body.actorId,
    );
    return group;
  }

  @Delete(':id')
  remove(@Req() req: PortalRequest, @Param('id') id: string) {
    return this.service.deleteAccessGroup(this.getMerchantId(req), id);
  }

  @Post(':id/members')
  setMembers(
    @Req() req: PortalRequest,
    @Param('id') id: string,
    @Body() body: SetAccessGroupMembersDto,
  ) {
    return this.service.setGroupMembers(
      this.getMerchantId(req),
      id,
      body.staffIds ?? [],
    );
  }
}
