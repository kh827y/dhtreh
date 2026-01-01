import { Args, Context, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { assertPortalPermissions } from '../../portal-auth/portal-permissions.util';
import {
  MerchantPanelService,
  AccessGroupFilters,
} from '../merchant-panel.service';
import {
  AccessGroupDto,
  AccessGroupDtoInput,
  AccessGroupListQueryDto,
  AccessGroupListResponseDto,
  SetAccessGroupMembersInput,
} from '../dto/access-group.dto';
import { plainToInstance } from 'class-transformer';

@Resolver(() => AccessGroupDto)
@UseGuards(PortalGuard)
export class AccessGroupsResolver {
  constructor(private readonly service: MerchantPanelService) {}

  private merchantId(ctx: any) {
    return String(ctx.req?.portalMerchantId ?? ctx.portalMerchantId ?? '');
  }

  private assertAccess(ctx: any, action: 'read' | 'manage') {
    assertPortalPermissions(ctx.req ?? ctx, ['access_groups'], action);
  }

  @Query(() => AccessGroupListResponseDto, { name: 'portalAccessGroups' })
  async list(
    @Context() ctx: any,
    @Args() args: AccessGroupListQueryDto,
  ): Promise<AccessGroupListResponseDto> {
    this.assertAccess(ctx, 'read');
    const { page, pageSize, ...rest } = args;
    const filters: AccessGroupFilters = {
      scope: rest.scope ? (rest.scope as any) : undefined,
      search: rest.search,
    };
    const result = await this.service.listAccessGroups(
      this.merchantId(ctx),
      filters,
      { page, pageSize },
    );
    return plainToInstance(AccessGroupListResponseDto, result, {
      enableImplicitConversion: true,
    });
  }

  @Query(() => AccessGroupDto, { name: 'portalAccessGroup' })
  async get(
    @Context() ctx: any,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<AccessGroupDto> {
    this.assertAccess(ctx, 'read');
    const group = await this.service.getAccessGroup(this.merchantId(ctx), id);
    return plainToInstance(AccessGroupDto, group, {
      enableImplicitConversion: true,
    });
  }

  @Mutation(() => AccessGroupDto, { name: 'portalAccessGroupCreate' })
  async create(
    @Context() ctx: any,
    @Args('input') input: AccessGroupDtoInput,
  ): Promise<AccessGroupDto> {
    this.assertAccess(ctx, 'manage');
    const group = await this.service.createAccessGroup(
      this.merchantId(ctx),
      input,
    );
    return plainToInstance(AccessGroupDto, group, {
      enableImplicitConversion: true,
    });
  }

  @Mutation(() => AccessGroupDto, { name: 'portalAccessGroupUpdate' })
  async update(
    @Context() ctx: any,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: AccessGroupDtoInput,
  ): Promise<AccessGroupDto> {
    this.assertAccess(ctx, 'manage');
    const group = await this.service.updateAccessGroup(
      this.merchantId(ctx),
      id,
      input,
    );
    return plainToInstance(AccessGroupDto, group, {
      enableImplicitConversion: true,
    });
  }

  @Mutation(() => Boolean, { name: 'portalAccessGroupDelete' })
  async remove(
    @Context() ctx: any,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    this.assertAccess(ctx, 'manage');
    await this.service.deleteAccessGroup(this.merchantId(ctx), id);
    return true;
  }

  @Mutation(() => Boolean, { name: 'portalAccessGroupSetMembers' })
  async setMembers(
    @Context() ctx: any,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: SetAccessGroupMembersInput,
  ): Promise<boolean> {
    this.assertAccess(ctx, 'manage');
    await this.service.setGroupMembers(
      this.merchantId(ctx),
      id,
      input.staffIds ?? [],
    );
    return true;
  }
}
