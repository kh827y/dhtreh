import { Injectable } from '@nestjs/common';
import { MerchantsService } from '../merchants.service';
import { CreateStaffDto, UpdateStaffDto } from '../dto';

@Injectable()
export class MerchantsStaffUseCase {
  constructor(private readonly merchants: MerchantsService) {}

  listStaff(merchantId: string) {
    return this.merchants.listStaff(merchantId);
  }

  createStaff(merchantId: string, dto: CreateStaffDto) {
    return this.merchants.createStaff(merchantId, {
      login: dto.login,
      email: dto.email,
      role: dto.role,
    });
  }

  updateStaff(merchantId: string, staffId: string, dto: UpdateStaffDto) {
    return this.merchants.updateStaff(merchantId, staffId, dto);
  }

  deleteStaff(merchantId: string, staffId: string) {
    return this.merchants.deleteStaff(merchantId, staffId);
  }

  issueStaffToken(merchantId: string, staffId: string) {
    return this.merchants.issueStaffToken(merchantId, staffId);
  }

  revokeStaffToken(merchantId: string, staffId: string) {
    return this.merchants.revokeStaffToken(merchantId, staffId);
  }
}
