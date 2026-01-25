import { Injectable } from '@nestjs/common';
import { Prisma, CommunicationChannel } from '@prisma/client';
import { NotificationsService } from '../../notifications/notifications.service';
import { CommunicationsService } from '../../communications/communications.service';
import { PortalTelegramNotifyService } from '../services/telegram-notify.service';
import type { PortalRequest } from '../portal.types';
import { PortalRequestHelper } from '../helpers/portal-request.helper';
import { PortalCommunicationsHelper } from '../helpers/portal-communications.helper';
import type {
  NotificationsBroadcastDto,
  PortalCampaignScheduleDto,
  PortalPushCampaignDto,
  PortalTelegramCampaignDto,
  TelegramNotifyInviteDto,
  TelegramNotifyPreferencesDto,
} from '../dto/communications.dto';

@Injectable()
export class PortalCommunicationsUseCase {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly communications: CommunicationsService,
    private readonly telegramNotify: PortalTelegramNotifyService,
    private readonly helpers: PortalRequestHelper,
    private readonly commsHelper: PortalCommunicationsHelper,
  ) {}

  notificationsBroadcast(req: PortalRequest, body: NotificationsBroadcastDto) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.notifications.broadcast({ merchantId, ...body });
  }

  listPushCampaigns(req: PortalRequest, scope?: string) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.communications
      .listChannelTasks(
        merchantId,
        CommunicationChannel.PUSH,
        this.commsHelper.normalizePushScope(scope),
      )
      .then((tasks) => tasks.map((task) => this.commsHelper.mapPushTask(task)));
  }

  createPushCampaign(req: PortalRequest, body: PortalPushCampaignDto) {
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
      .then((task) => this.commsHelper.mapPushTask(task));
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
    body: PortalCampaignScheduleDto,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.communications
      .duplicateTask(merchantId, campaignId, {
        scheduledAt: body?.scheduledAt ?? body?.startAt ?? null,
      })
      .then((task) => this.commsHelper.mapPushTask(task));
  }

  listTelegramCampaigns(req: PortalRequest, scope?: string) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.communications
      .listChannelTasks(
        merchantId,
        CommunicationChannel.TELEGRAM,
        this.commsHelper.normalizeTelegramScope(scope),
      )
      .then((tasks) =>
        tasks.map((task) => this.commsHelper.mapTelegramTask(task)),
      );
  }

  createTelegramCampaign(req: PortalRequest, body: PortalTelegramCampaignDto) {
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
      .then((task) => this.commsHelper.mapTelegramTask(task));
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
    body: PortalCampaignScheduleDto,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.communications
      .duplicateTask(merchantId, campaignId, {
        scheduledAt: body?.scheduledAt ?? body?.startAt ?? null,
      })
      .then((task) => this.commsHelper.mapTelegramTask(task));
  }

  telegramNotifyState(req: PortalRequest) {
    return this.telegramNotify.getState(this.helpers.getMerchantId(req));
  }

  telegramNotifyInvite(req: PortalRequest, body: TelegramNotifyInviteDto) {
    const actor = this.commsHelper.resolveTelegramActor(req);
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
    const actor = this.commsHelper.resolveTelegramActor(req);
    return this.telegramNotify.getPreferences(
      this.helpers.getMerchantId(req),
      actor,
    );
  }

  telegramNotifyUpdatePreferences(
    req: PortalRequest,
    body: TelegramNotifyPreferencesDto,
  ) {
    const actor = this.commsHelper.resolveTelegramActor(req);
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
