import { Injectable } from '@nestjs/common';
import { StaffOutletAccessStatus, StaffStatus } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MerchantsService } from '../merchants/merchants.service';

@Injectable()
export class MerchantPanelCashierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MerchantsService,
  ) {}

  async listCashierPins(merchantId: string) {
    const accesses = await this.prisma.staffOutletAccess.findMany({
      where: {
        merchantId,
        status: StaffOutletAccessStatus.ACTIVE,
        staff: { status: StaffStatus.ACTIVE },
      },
      include: {
        staff: true,
        outlet: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return accesses.map((access) => ({
      id: access.id,
      staffId: access.staffId,
      staffName:
        `${access.staff?.firstName ?? ''} ${access.staff?.lastName ?? ''}`.trim(),
      outletId: access.outletId,
      outletName: access.outlet?.name ?? null,
      pinCode: access.pinCode,
      status: access.status,
      updatedAt: access.pinUpdatedAt ?? access.createdAt,
    }));
  }

  getCashierCredentials(merchantId: string) {
    return this.merchants.getCashierCredentials(merchantId);
  }

  rotateCashierCredentials(merchantId: string, regenerateLogin?: boolean) {
    return this.merchants.rotateCashierCredentials(merchantId, regenerateLogin);
  }

  listCashierActivationCodes(merchantId: string) {
    return this.merchants.listCashierActivationCodes(merchantId);
  }

  issueCashierActivationCodes(merchantId: string, count: number) {
    return this.merchants.issueCashierActivationCodes(merchantId, count);
  }

  revokeCashierActivationCode(merchantId: string, codeId: string) {
    return this.merchants.revokeCashierActivationCode(merchantId, codeId);
  }

  listCashierDeviceSessions(merchantId: string) {
    return this.merchants.listCashierDeviceSessions(merchantId);
  }

  revokeCashierDeviceSession(merchantId: string, sessionId: string) {
    return this.merchants.revokeCashierDeviceSession(merchantId, sessionId);
  }
}
