import { Injectable } from '@nestjs/common';
import { MerchantsService } from '../merchants.service';
import {
  CreateOutletDto,
  UpdateOutletDto,
  UpdateOutletStatusDto,
} from '../dto';

@Injectable()
export class MerchantsOutletsUseCase {
  constructor(private readonly merchants: MerchantsService) {}

  listOutlets(merchantId: string) {
    return this.merchants.listOutlets(merchantId);
  }

  createOutlet(merchantId: string, dto: CreateOutletDto) {
    return this.merchants.createOutlet(merchantId, dto.name);
  }

  updateOutlet(merchantId: string, outletId: string, dto: UpdateOutletDto) {
    return this.merchants.updateOutlet(merchantId, outletId, dto);
  }

  deleteOutlet(merchantId: string, outletId: string) {
    return this.merchants.deleteOutlet(merchantId, outletId);
  }

  updateOutletStatus(
    merchantId: string,
    outletId: string,
    dto: UpdateOutletStatusDto,
  ) {
    return this.merchants.updateOutletStatus(merchantId, outletId, dto.status);
  }
}
