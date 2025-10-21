import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  STAFF_MOTIVATION_ALLOWED_PERIODS,
  STAFF_MOTIVATION_DEFAULT_EXISTING_POINTS,
  STAFF_MOTIVATION_DEFAULT_NEW_POINTS,
  STAFF_MOTIVATION_MAX_CUSTOM_DAYS,
  normalizePeriod,
} from '../../staff-motivation/staff-motivation.constants';

export interface StaffMotivationSettingsDto {
  enabled: boolean;
  pointsForNewCustomer: number;
  pointsForExistingCustomer: number;
  leaderboardPeriod: string;
  customDays?: number | null;
  updatedAt: Date;
}

export interface UpdateStaffMotivationPayload {
  enabled: boolean;
  pointsForNewCustomer: number;
  pointsForExistingCustomer: number;
  leaderboardPeriod: string;
  customDays?: number | null;
}

@Injectable()
export class StaffMotivationService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(merchantId: string): Promise<StaffMotivationSettingsDto> {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });
    const normalized = normalizePeriod(
      settings?.staffMotivationLeaderboardPeriod ?? null,
      settings?.staffMotivationCustomDays ?? null,
    );

    return {
      enabled: settings?.staffMotivationEnabled ?? false,
      pointsForNewCustomer:
        settings?.staffMotivationNewCustomerPoints ??
        STAFF_MOTIVATION_DEFAULT_NEW_POINTS,
      pointsForExistingCustomer:
        settings?.staffMotivationExistingCustomerPoints ??
        STAFF_MOTIVATION_DEFAULT_EXISTING_POINTS,
      leaderboardPeriod: normalized.period,
      customDays: normalized.customDays,
      updatedAt: settings?.updatedAt ?? new Date(0),
    };
  }

  async updateSettings(
    merchantId: string,
    payload: UpdateStaffMotivationPayload,
  ): Promise<StaffMotivationSettingsDto> {
    this.validatePayload(payload);

    const updated = await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      create: {
        merchantId,
        staffMotivationEnabled: payload.enabled,
        staffMotivationNewCustomerPoints: Math.round(
          payload.pointsForNewCustomer,
        ),
        staffMotivationExistingCustomerPoints: Math.round(
          payload.pointsForExistingCustomer,
        ),
        staffMotivationLeaderboardPeriod: payload.leaderboardPeriod,
        staffMotivationCustomDays:
          payload.leaderboardPeriod === 'custom'
            ? (payload.customDays ?? null)
            : null,
      },
      update: {
        staffMotivationEnabled: payload.enabled,
        staffMotivationNewCustomerPoints: Math.round(
          payload.pointsForNewCustomer,
        ),
        staffMotivationExistingCustomerPoints: Math.round(
          payload.pointsForExistingCustomer,
        ),
        staffMotivationLeaderboardPeriod: payload.leaderboardPeriod,
        staffMotivationCustomDays:
          payload.leaderboardPeriod === 'custom'
            ? (payload.customDays ?? null)
            : null,
      },
    });

    return {
      enabled: updated.staffMotivationEnabled,
      pointsForNewCustomer: updated.staffMotivationNewCustomerPoints,
      pointsForExistingCustomer: updated.staffMotivationExistingCustomerPoints,
      leaderboardPeriod: updated.staffMotivationLeaderboardPeriod ?? 'week',
      customDays: updated.staffMotivationCustomDays ?? null,
      updatedAt: updated.updatedAt,
    };
  }

  private validatePayload(payload: UpdateStaffMotivationPayload) {
    if (
      !STAFF_MOTIVATION_ALLOWED_PERIODS.includes(
        payload.leaderboardPeriod as any,
      )
    ) {
      throw new BadRequestException('Недопустимый период рейтинга');
    }

    if (
      payload.pointsForNewCustomer < 0 ||
      payload.pointsForExistingCustomer < 0
    ) {
      throw new BadRequestException('Баллы не могут быть отрицательными');
    }

    if (payload.leaderboardPeriod === 'custom') {
      const days = payload.customDays ?? 0;
      if (
        !Number.isInteger(days) ||
        days <= 0 ||
        days > STAFF_MOTIVATION_MAX_CUSTOM_DAYS
      ) {
        throw new BadRequestException(
          `Для собственного периода укажите количество дней от 1 до ${STAFF_MOTIVATION_MAX_CUSTOM_DAYS}`,
        );
      }
    }
  }
}
