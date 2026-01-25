import { Injectable } from '@nestjs/common';
import { MerchantsService } from '../merchants.service';

@Injectable()
export class MerchantsPortalAuthUseCase {
  constructor(private readonly merchants: MerchantsService) {}

  rotatePortalKey(merchantId: string) {
    return this.merchants.rotatePortalKey(merchantId);
  }

  setPortalLoginEnabled(merchantId: string, body: { enabled: boolean }) {
    return this.merchants.setPortalLoginEnabled(merchantId, !!body?.enabled);
  }

  initTotp(merchantId: string) {
    return this.merchants.initTotp(merchantId);
  }

  verifyTotp(merchantId: string, body: { code: string }) {
    return this.merchants.verifyTotp(merchantId, String(body?.code || ''));
  }

  disableTotp(merchantId: string) {
    return this.merchants.disableTotp(merchantId);
  }

  impersonatePortal(merchantId: string) {
    return this.merchants.impersonatePortal(merchantId);
  }
}
