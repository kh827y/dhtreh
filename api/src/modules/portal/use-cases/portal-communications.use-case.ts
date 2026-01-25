import { Injectable } from '@nestjs/common';
import { Prisma, CommunicationChannel } from '@prisma/client';
import {
  NotificationsService,
  type BroadcastArgs,
} from '../../notifications/notifications.service';
import { CommunicationsService } from '../../communications/communications.service';
import { PortalTelegramNotifyService } from '../services/telegram-notify.service';
import {
  PortalControllerHelpers,
  type PortalRequest,
} from '../controllers/portal.controller-helpers';

@Injectable()
export class PortalCommunicationsUseCase {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly communications: CommunicationsService,
    private readonly telegramNotify: PortalTelegramNotifyService,
    private readonly helpers: PortalControllerHelpers,
  ) {}

  notificationsBroadcast(
    req: PortalRequest,
    body: Omit<BroadcastArgs, 'merchantId'>,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.notifications.broadcast({ merchantId, ...body });
  }

  listPushCampaigns(req: PortalRequest, scope?: string) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.communications
      .listChannelTasks(
        merchantId,
        CommunicationChannel.PUSH,
        this.helpers.normalizePushScope(scope),
      )
      .then((tasks) => tasks.map((task) => this.helpers.mapPushTask(task)));
  }

  createPushCampaign(
    req: PortalRequest,
    body: {
      text?: string;
      audience?: string;
      audienceId?: string;
      audienceName?: string;
      startAt?: string;
      scheduledAt?: string;
      timezone?: string;
    },
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    const scheduledAt = body?.scheduledAt ?? body?.startAt ?? null;
    const audienceId = body?.audienceId ? String(body.audienceId) : undefined;
    const audienceCode =
      typeof body?.audience === 'string' && body.audience.trim()
        ? body.audience.trim()
        : undefined;
    const audienceName =
      typeof body?.audienceName === 'string' && body.audienceName.trim()
        ? body.audienceName.trim()
        : (audienceCode ?? undefined);
    return this.communications
      .createTask(merchantId, {
        channel: CommunicationChannel.PUSH,
        scheduledAt,
        timezone: body?.timezone ?? null,
        audienceId,
        audienceCode,
        audienceName,
        payload: {
          text: body?.text ?? '',
          audience: audienceCode ?? audienceId ?? null,
        },
      })
      .then((task) => this.helpers.mapPushTask(task));
  }

  cancelPushCampaign(req: PortalRequest, campaignId: string) {
    return this.communications.deleteTask(
      this.helpers.getMerchantId(req),
      campaignId,
    );
  }

  archivePushCampaign(req: PortalRequest, campaignId: string) {
    return this.communications.deleteTask(
      this.helpers.getMerchantId(req),
      campaignId,
    );
  }

  duplicatePushCampaign(
    req: PortalRequest,
    campaignId: string,
    body: { scheduledAt?: string; startAt?: string },
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.communications
      .duplicateTask(merchantId, campaignId, {
        scheduledAt: body?.scheduledAt ?? body?.startAt ?? null,
      })
      .then((task) => this.helpers.mapPushTask(task));
  }

  listTelegramCampaigns(req: PortalRequest, scope?: string) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.communications
      .listChannelTasks(
        merchantId,
        CommunicationChannel.TELEGRAM,
        this.helpers.normalizeTelegramScope(scope),
      )
      .then((tasks) => tasks.map((task) => this.helpers.mapTelegramTask(task)));
  }

  createTelegramCampaign(
    req: PortalRequest,
    body: {
      audienceId?: string;
      audienceName?: string;
      text?: string;
      media?: Record<string, unknown> | null;
      startAt?: string;
      scheduledAt?: string;
      timezone?: string;
    },
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.communications
      .createTask(merchantId, {
        channel: CommunicationChannel.TELEGRAM,
        audienceId: body?.audienceId ?? undefined,
        audienceName: body?.audienceName ?? undefined,
        audienceSnapshot: {
          audienceId: body?.audienceId ?? null,
          audienceName: body?.audienceName ?? null,
        },
        scheduledAt: body?.scheduledAt ?? body?.startAt ?? null,
        timezone: body?.timezone ?? null,
        payload: {
          text: body?.text ?? '',
        },
        media: (body?.media ?? null) as Prisma.InputJsonValue | null,
      })
      .then((task) => this.helpers.mapTelegramTask(task));
  }

  cancelTelegramCampaign(req: PortalRequest, campaignId: string) {
    return this.communications.deleteTask(
      this.helpers.getMerchantId(req),
      campaignId,
    );
  }

  archiveTelegramCampaign(req: PortalRequest, campaignId: string) {
    return this.communications.deleteTask(
      this.helpers.getMerchantId(req),
      campaignId,
    );
  }

  duplicateTelegramCampaign(
    req: PortalRequest,
    campaignId: string,
    body: { scheduledAt?: string; startAt?: string },
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.communications
      .duplicateTask(merchantId, campaignId, {
        scheduledAt: body?.scheduledAt ?? body?.startAt ?? null,
      })
      .then((task) => this.helpers.mapTelegramTask(task));
  }

  telegramNotifyState(req: PortalRequest) {
    return this.telegramNotify.getState(this.helpers.getMerchantId(req));
  }

  telegramNotifyInvite(req: PortalRequest, body: { forceNew?: boolean }) {
    const actor = this.helpers.resolveTelegramActor(req);
    const staffId = actor.kind === 'STAFF' ? actor.staffId : null;
    return this.telegramNotify.issueInvite(this.helpers.getMerchantId(req), {
      forceNew: !!body?.forceNew,
      staffId,
    });
  }

  telegramNotifySubscribers(req: PortalRequest) {
    return this.telegramNotify.listSubscribers(this.helpers.getMerchantId(req));
  }

  telegramNotifyPreferences(req: PortalRequest) {
    const actor = this.helpers.resolveTelegramActor(req);
    return this.telegramNotify.getPreferences(
      this.helpers.getMerchantId(req),
      actor,
    );
  }

  telegramNotifyUpdatePreferences(
    req: PortalRequest,
    body: {
      notifyOrders?: boolean;
      notifyReviews?: boolean;
      notifyReviewThreshold?: number;
      notifyDailyDigest?: boolean;
      notifyFraud?: boolean;
    },
  ) {
    const actor = this.helpers.resolveTelegramActor(req);
    return this.telegramNotify.updatePreferences(
      this.helpers.getMerchantId(req),
      actor,
      {
        notifyOrders: body?.notifyOrders,
        notifyReviews: body?.notifyReviews,
        notifyReviewThreshold: body?.notifyReviewThreshold,
        notifyDailyDigest: body?.notifyDailyDigest,
        notifyFraud: body?.notifyFraud,
      },
    );
  }

  telegramNotifyDeactivate(req: PortalRequest, id: string) {
    return this.telegramNotify.deactivateSubscriber(
      this.helpers.getMerchantId(req),
      String(id || ''),
    );
  }
}
