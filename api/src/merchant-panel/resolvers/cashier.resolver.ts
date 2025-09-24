import { Args, Context, Mutation, Query, Resolver, UseGuards } from '@nestjs/graphql';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { MerchantPanelService } from '../merchant-panel.service';
import { CashierCredentialsDto, CashierPinDto, CashierRotationResultDto, RotateCashierInput } from '../dto/cashier.dto';
import { plainToInstance } from 'class-transformer';

@Resolver()
@UseGuards(PortalGuard)
export class CashierResolver {
  constructor(private readonly service: MerchantPanelService) {}

  private merchantId(ctx: any) {
    return String(ctx.req?.portalMerchantId ?? ctx.portalMerchantId ?? '');
  }

  @Query(() => CashierCredentialsDto, { name: 'portalCashierCredentials' })
  async credentials(@Context() ctx: any): Promise<CashierCredentialsDto> {
    const data = await this.service.getCashierCredentials(this.merchantId(ctx));
    return plainToInstance(CashierCredentialsDto, data, { enableImplicitConversion: true });
  }

  @Query(() => [CashierPinDto], { name: 'portalCashierPins' })
  async pins(@Context() ctx: any): Promise<CashierPinDto[]> {
    const pins = await this.service.listCashierPins(this.merchantId(ctx));
    return pins.map((pin) => plainToInstance(CashierPinDto, pin, { enableImplicitConversion: true }));
  }

  @Mutation(() => CashierRotationResultDto, { name: 'portalCashierRotateCredentials' })
  async rotate(
    @Context() ctx: any,
    @Args('input', { nullable: true }) input?: RotateCashierInput,
  ): Promise<CashierRotationResultDto> {
    const payload = input ?? {};
    const data = await this.service.rotateCashierCredentials(this.merchantId(ctx), payload.regenerateLogin);
    return plainToInstance(CashierRotationResultDto, data, { enableImplicitConversion: true });
  }
}
