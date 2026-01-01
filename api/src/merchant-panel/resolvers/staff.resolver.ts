import { Args, Context, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { assertPortalPermissions } from '../../portal-auth/portal-permissions.util';
import { MerchantPanelService, StaffFilters } from '../merchant-panel.service';
import {
  StaffListQueryDto,
  StaffListResponseDto,
  StaffDetailDto,
  UpsertStaffInput,
  ChangeStaffStatusInput,
} from '../dto/staff.dto';
import { plainToInstance } from 'class-transformer';

@Resolver(() => StaffDetailDto)
@UseGuards(PortalGuard)
export class StaffResolver {
  constructor(private readonly service: MerchantPanelService) {}

  private merchantId(ctx: any) {
    return String(ctx.req?.portalMerchantId ?? ctx.portalMerchantId ?? '');
  }

  private assertAccess(ctx: any, action: 'read' | 'manage') {
    assertPortalPermissions(ctx.req ?? ctx, ['staff'], action);
  }

  @Query(() => StaffListResponseDto, { name: 'portalStaffList' })
  async list(
    @Context() ctx: any,
    @Args() args: StaffListQueryDto,
  ): Promise<StaffListResponseDto> {
    this.assertAccess(ctx, 'read');
    const { page, pageSize, ...rest } = args;
    const filters: StaffFilters = {
      search: rest.search,
      status: rest.status ? (rest.status as any) : undefined,
      outletId: rest.outletId,
      groupId: rest.groupId,
      portalOnly: rest.portalOnly,
    };
    const result = await this.service.listStaff(this.merchantId(ctx), filters, {
      page,
      pageSize,
    });
    return plainToInstance(StaffListResponseDto, result, {
      enableImplicitConversion: true,
    });
  }

  @Query(() => StaffDetailDto, { name: 'portalStaff' })
  async get(
    @Context() ctx: any,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<StaffDetailDto> {
    this.assertAccess(ctx, 'read');
    const staff = await this.service.getStaff(this.merchantId(ctx), id);
    return plainToInstance(StaffDetailDto, staff, {
      enableImplicitConversion: true,
    });
  }

  @Mutation(() => StaffDetailDto, { name: 'portalStaffCreate' })
  async create(
    @Context() ctx: any,
    @Args('input') input: UpsertStaffInput,
  ): Promise<StaffDetailDto> {
    this.assertAccess(ctx, 'manage');
    const staff = await this.service.createStaff(this.merchantId(ctx), input);
    return plainToInstance(StaffDetailDto, staff, {
      enableImplicitConversion: true,
    });
  }

  @Mutation(() => StaffDetailDto, { name: 'portalStaffUpdate' })
  async update(
    @Context() ctx: any,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpsertStaffInput,
  ): Promise<StaffDetailDto> {
    this.assertAccess(ctx, 'manage');
    const staff = await this.service.updateStaff(
      this.merchantId(ctx),
      id,
      input,
      {
        actor: ctx.req?.portalActor ?? ctx.portalActor,
        staffId: ctx.req?.portalStaffId ?? ctx.portalStaffId ?? null,
        role: ctx.req?.portalStaffRole ?? ctx.portalStaffRole ?? null,
      },
    );
    return plainToInstance(StaffDetailDto, staff, {
      enableImplicitConversion: true,
    });
  }

  @Mutation(() => StaffDetailDto, { name: 'portalStaffChangeStatus' })
  async changeStatus(
    @Context() ctx: any,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: ChangeStaffStatusInput,
  ): Promise<StaffDetailDto> {
    this.assertAccess(ctx, 'manage');
    const staff = await this.service.changeStaffStatus(
      this.merchantId(ctx),
      id,
      input.status,
    );
    return plainToInstance(StaffDetailDto, staff, {
      enableImplicitConversion: true,
    });
  }
}
