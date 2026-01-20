import { Injectable } from '@nestjs/common';
import type { PromotionStatus } from '@prisma/client';
import type {
  OperationsLogFilters,
  PromotionPayload,
  TierPayload,
} from './loyalty-program.types';
import { LoyaltyProgramPromotionsService } from './services/loyalty-program-promotions.service';
import { LoyaltyProgramTiersService } from './services/loyalty-program-tiers.service';
import { LoyaltyProgramOperationsService } from './services/loyalty-program-operations.service';

export type {
  OperationsLogFilters,
  PromotionPayload,
  TierDto,
  TierMembersResponse,
  TierPayload,
} from './loyalty-program.types';

@Injectable()
export class LoyaltyProgramService {
  constructor(
    private readonly tiers: LoyaltyProgramTiersService,
    private readonly promotions: LoyaltyProgramPromotionsService,
    private readonly operations: LoyaltyProgramOperationsService,
  ) {}

  // ===== Loyalty tiers =====
  listTiers(merchantId: string) {
    return this.tiers.listTiers(merchantId);
  }

  getTier(merchantId: string, tierId: string) {
    return this.tiers.getTier(merchantId, tierId);
  }

  listTierCustomers(
    merchantId: string,
    tierId: string,
    params?: { limit?: number; cursor?: string },
  ) {
    return this.tiers.listTierCustomers(merchantId, tierId, params);
  }

  createTier(merchantId: string, payload: TierPayload) {
    return this.tiers.createTier(merchantId, payload);
  }

  updateTier(merchantId: string, tierId: string, payload: TierPayload) {
    return this.tiers.updateTier(merchantId, tierId, payload);
  }

  deleteTier(merchantId: string, tierId: string) {
    return this.tiers.deleteTier(merchantId, tierId);
  }

  // ===== Promotions =====
  deletePromotion(merchantId: string, promotionId: string) {
    return this.promotions.deletePromotion(merchantId, promotionId);
  }

  listPromotions(merchantId: string, status?: PromotionStatus | 'ALL') {
    return this.promotions.listPromotions(merchantId, status);
  }

  listPromotionBasics(merchantId: string, ids: string[]) {
    return this.promotions.listPromotionBasics(merchantId, ids);
  }

  createPromotion(merchantId: string, payload: PromotionPayload) {
    return this.promotions.createPromotion(merchantId, payload);
  }

  updatePromotion(
    merchantId: string,
    promotionId: string,
    payload: PromotionPayload,
  ) {
    return this.promotions.updatePromotion(merchantId, promotionId, payload);
  }

  getPromotion(merchantId: string, promotionId: string) {
    return this.promotions.getPromotion(merchantId, promotionId);
  }

  countPromotionParticipants(merchantId: string, promotionId: string) {
    return this.promotions.countPromotionParticipants(merchantId, promotionId);
  }

  changePromotionStatus(
    merchantId: string,
    promotionId: string,
    status: PromotionStatus,
    actorId?: string,
  ) {
    return this.promotions.changePromotionStatus(
      merchantId,
      promotionId,
      status,
      actorId,
    );
  }

  bulkUpdatePromotionStatus(
    merchantId: string,
    promotionIds: string[],
    status: PromotionStatus,
    actorId?: string,
  ) {
    return this.promotions.bulkUpdatePromotionStatus(
      merchantId,
      promotionIds,
      status,
      actorId,
    );
  }

  // ===== Operations log =====
  operationsLog(merchantId: string, filters: OperationsLogFilters = {}) {
    return this.operations.operationsLog(merchantId, filters);
  }
}
