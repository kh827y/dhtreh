import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Prisma, CommunicationChannel } from '@prisma/client';
import { PortalGuard } from '../../portal-auth/portal.guard';
import {
  NotificationsService,
  type BroadcastArgs,
} from '../../notifications/notifications.service';
import { CommunicationsService } from '../../communications/communications.service';
import { PortalTelegramNotifyService } from '../services/telegram-notify.service';
import { PortalControllerHelpers } from './portal.controller-helpers';
import type { PortalRequest } from './portal.controller-helpers';
import { TransactionItemDto } from '../../loyalty/dto/dto';

@ApiTags('portal')
@ApiExtraModels(TransactionItemDto)
@Controller('portal')
@UseGuards(PortalGuard)
export class PortalCommunicationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly communications: CommunicationsService,
    private readonly telegramNotify: PortalTelegramNotifyService,
    private readonly helpers: PortalControllerHelpers,
  ) {}

  // Notifications broadcast (enqueue or dry-run)
  @Post('notifications/broadcast')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        dryRun: { type: 'boolean', nullable: true },
        estimated: { type: 'number', nullable: true },
      },
    },
  })
  notificationsBroadcast(
    @Req() req: PortalRequest,
    @Body() body: Omit<BroadcastArgs, 'merchantId'>,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.notifications.broadcast({ merchantId, ...body });
  }

  // ===== Push campaigns =====
  @Get('push-campaigns')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
  })
  listPushCampaigns(@Req() req: PortalRequest, @Query('scope') scope?: string) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.communications
      .listChannelTasks(
        merchantId,
        CommunicationChannel.PUSH,
        this.helpers.normalizePushScope(scope),
      )
      .then((tasks) => tasks.map((task) => this.helpers.mapPushTask(task)));
  }

  @Post('push-campaigns')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  createPushCampaign(
    @Req() req: PortalRequest,
    @Body()
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

  @Post('push-campaigns/:campaignId/cancel')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  cancelPushCampaign(
    @Req() req: PortalRequest,
    @Param('campaignId') campaignId: string,
  ) {
    return this.communications.deleteTask(
      this.helpers.getMerchantId(req),
      campaignId,
    );
  }

  @Post('push-campaigns/:campaignId/archive')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  archivePushCampaign(
    @Req() req: PortalRequest,
    @Param('campaignId') campaignId: string,
  ) {
    return this.communications.deleteTask(
      this.helpers.getMerchantId(req),
      campaignId,
    );
  }

  @Post('push-campaigns/:campaignId/duplicate')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  duplicatePushCampaign(
    @Req() req: PortalRequest,
    @Param('campaignId') campaignId: string,
    @Body() body: { scheduledAt?: string; startAt?: string },
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.communications
      .duplicateTask(merchantId, campaignId, {
        scheduledAt: body?.scheduledAt ?? body?.startAt ?? null,
      })
      .then((task) => this.helpers.mapPushTask(task));
  }

  // ===== Telegram campaigns =====
  @Get('telegram-campaigns')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
  })
  listTelegramCampaigns(
    @Req() req: PortalRequest,
    @Query('scope') scope?: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.communications
      .listChannelTasks(
        merchantId,
        CommunicationChannel.TELEGRAM,
        this.helpers.normalizeTelegramScope(scope),
      )
      .then((tasks) => tasks.map((task) => this.helpers.mapTelegramTask(task)));
  }

  @Post('telegram-campaigns')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  createTelegramCampaign(
    @Req() req: PortalRequest,
    @Body()
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

  @Post('telegram-campaigns/:campaignId/cancel')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  cancelTelegramCampaign(
    @Req() req: PortalRequest,
    @Param('campaignId') campaignId: string,
  ) {
    return this.communications.deleteTask(
      this.helpers.getMerchantId(req),
      campaignId,
    );
  }

  @Post('telegram-campaigns/:campaignId/archive')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  archiveTelegramCampaign(
    @Req() req: PortalRequest,
    @Param('campaignId') campaignId: string,
  ) {
    return this.communications.deleteTask(
      this.helpers.getMerchantId(req),
      campaignId,
    );
  }

  @Post('telegram-campaigns/:campaignId/duplicate')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  duplicateTelegramCampaign(
    @Req() req: PortalRequest,
    @Param('campaignId') campaignId: string,
    @Body() body: { scheduledAt?: string; startAt?: string },
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    return this.communications
      .duplicateTask(merchantId, campaignId, {
        scheduledAt: body?.scheduledAt ?? body?.startAt ?? null,
      })
      .then((task) => this.helpers.mapTelegramTask(task));
  }

  // ===== Telegram staff notifications (global bot) =====
  @Get('settings/telegram-notify/state')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        configured: { type: 'boolean' },
        botUsername: { type: 'string', nullable: true },
        botLink: { type: 'string', nullable: true },
      },
    },
  })
  telegramNotifyState(@Req() req: PortalRequest) {
    return this.telegramNotify.getState(this.helpers.getMerchantId(req));
  }

  @Post('settings/telegram-notify/invite')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        startUrl: { type: 'string' },
        startGroupUrl: { type: 'string' },
        token: { type: 'string' },
      },
    },
  })
  telegramNotifyInvite(
    @Req() req: PortalRequest,
    @Body() body: { forceNew?: boolean },
  ) {
    const actor = this.helpers.resolveTelegramActor(req);
    const staffId = actor.kind === 'STAFF' ? actor.staffId : null;
    return this.telegramNotify.issueInvite(this.helpers.getMerchantId(req), {
      forceNew: !!body?.forceNew,
      staffId,
    });
  }

  @Get('settings/telegram-notify/subscribers')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
  })
  telegramNotifySubscribers(@Req() req: PortalRequest) {
    return this.telegramNotify.listSubscribers(this.helpers.getMerchantId(req));
  }

  @Get('settings/telegram-notify/preferences')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        notifyOrders: { type: 'boolean' },
        notifyReviews: { type: 'boolean' },
        notifyReviewThreshold: { type: 'number' },
        notifyDailyDigest: { type: 'boolean' },
        notifyFraud: { type: 'boolean' },
      },
    },
  })
  telegramNotifyPreferences(@Req() req: PortalRequest) {
    const actor = this.helpers.resolveTelegramActor(req);
    return this.telegramNotify.getPreferences(this.helpers.getMerchantId(req), actor);
  }

  @Post('settings/telegram-notify/preferences')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        notifyOrders: { type: 'boolean' },
        notifyReviews: { type: 'boolean' },
        notifyDailyDigest: { type: 'boolean' },
        notifyFraud: { type: 'boolean' },
      },
    },
  })
  telegramNotifyUpdatePreferences(
    @Req() req: PortalRequest,
    @Body()
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

  @Post('settings/telegram-notify/subscribers/:id/deactivate')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  telegramNotifyDeactivate(@Req() req: PortalRequest, @Param('id') id: string) {
    return this.telegramNotify.deactivateSubscriber(
      this.helpers.getMerchantId(req),
      String(id || ''),
    );
  }
}
