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
import {
  MerchantPanelService,
  AccessGroupFilters,
} from '../merchant-panel.service';
import {
  AccessGroupDto,
  AccessGroupDtoInput,
  AccessGroupListQueryDto,
  AccessGroupListResponseDto,
  SetAccessGroupMembersDto,
} from '../dto/access-group.dto';
import { plainToInstance } from 'class-transformer';
import { ApiTags } from '@nestjs/swagger';

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

  private getMerchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get()
  async list(
    @Req() req: any,
    @Query() query: AccessGroupListQueryDto,
  ): Promise<AccessGroupListResponseDto> {
    const { page, pageSize, ...rest } = query;
    const filters: AccessGroupFilters = {
      scope: rest.scope ? (rest.scope as any) : undefined,
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
    @Req() req: any,
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
    @Req() req: any,
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
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.deleteAccessGroup(this.getMerchantId(req), id);
  }

  @Post(':id/members')
  setMembers(
    @Req() req: any,
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
