import { Injectable } from '@nestjs/common';
import { MerchantsService } from '../merchants.service';

@Injectable()
export class MerchantsCashierUseCase {
  constructor(private readonly merchants: MerchantsService) {}

  getCashier(merchantId: string) {
    return this.merchants.getCashierCredentials(merchantId);
  }

  setCashier(merchantId: string, body: { login?: string }) {
    return this.merchants.setCashierCredentials(
      merchantId,
      String(body?.login || ''),
    );
  }

  rotateCashier(merchantId: string, body: { regenerateLogin?: boolean }) {
    return this.merchants.rotateCashierCredentials(
      merchantId,
      !!body?.regenerateLogin,
    );
  }
}
