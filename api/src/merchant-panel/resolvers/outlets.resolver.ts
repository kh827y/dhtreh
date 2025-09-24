import { Args, Context, ID, Mutation, Query, Resolver, UseGuards } from '@nestjs/graphql';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { MerchantPanelService, OutletFilters } from '../merchant-panel.service';
import { OutletDto, OutletListQueryDto, OutletListResponseDto, UpsertOutletInput } from '../dto/outlet.dto';
import { plainToInstance } from 'class-transformer';

@Resolver(() => OutletDto)
@UseGuards(PortalGuard)
export class OutletsResolver {
  constructor(private readonly service: MerchantPanelService) {}

  private merchantId(ctx: any) {
    return String(ctx.req?.portalMerchantId ?? ctx.portalMerchantId ?? '');
  }

  @Query(() => OutletListResponseDto, { name: 'portalOutlets' })
  async list(@Context() ctx: any, @Args() args: OutletListQueryDto): Promise<OutletListResponseDto> {
    const { page, pageSize, ...rest } = args;
    const filters: OutletFilters = {
      status: rest.status ? (rest.status as any) : undefined,
      hidden: rest.hidden,
      search: rest.search,
    };
    const result = await this.service.listOutlets(this.merchantId(ctx), filters, { page, pageSize });
    return plainToInstance(OutletListResponseDto, result, { enableImplicitConversion: true });
  }

  @Query(() => OutletDto, { name: 'portalOutlet' })
  async get(@Context() ctx: any, @Args('id', { type: () => ID }) id: string): Promise<OutletDto> {
    const outlet = await this.service.getOutlet(this.merchantId(ctx), id);
    return plainToInstance(OutletDto, outlet, { enableImplicitConversion: true });
  }

  @Mutation(() => OutletDto, { name: 'portalOutletCreate' })
  async create(@Context() ctx: any, @Args('input') input: UpsertOutletInput): Promise<OutletDto> {
    const outlet = await this.service.createOutlet(this.merchantId(ctx), input);
    return plainToInstance(OutletDto, outlet, { enableImplicitConversion: true });
  }

  @Mutation(() => OutletDto, { name: 'portalOutletUpdate' })
  async update(
    @Context() ctx: any,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpsertOutletInput,
  ): Promise<OutletDto> {
    const outlet = await this.service.updateOutlet(this.merchantId(ctx), id, input);
    return plainToInstance(OutletDto, outlet, { enableImplicitConversion: true });
  }
}
