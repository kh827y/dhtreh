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
import { PortalGuard } from '../../portal-auth/portal.guard';
import { type BroadcastArgs } from '../../notifications/notifications.service';
import type { PortalRequest } from './portal.controller-helpers';
import { TransactionItemDto } from '../../loyalty/dto/dto';
import { PortalCommunicationsUseCase } from '../use-cases/portal-communications.use-case';

@ApiTags('portal')
@ApiExtraModels(TransactionItemDto)
@Controller('portal')
@UseGuards(PortalGuard)
export class PortalCommunicationsController {
  constructor(private readonly useCase: PortalCommunicationsUseCase) {}

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
    return this.useCase.notificationsBroadcast(req, body);
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
    return this.useCase.listPushCampaigns(req, scope);
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
    return this.useCase.createPushCampaign(req, body);
  }

  @Post('push-campaigns/:campaignId/cancel')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  cancelPushCampaign(
    @Req() req: PortalRequest,
    @Param('campaignId') campaignId: string,
  ) {
    return this.useCase.cancelPushCampaign(req, campaignId);
  }

  @Post('push-campaigns/:campaignId/archive')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  archivePushCampaign(
    @Req() req: PortalRequest,
    @Param('campaignId') campaignId: string,
  ) {
    return this.useCase.archivePushCampaign(req, campaignId);
  }

  @Post('push-campaigns/:campaignId/duplicate')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  duplicatePushCampaign(
    @Req() req: PortalRequest,
    @Param('campaignId') campaignId: string,
    @Body() body: { scheduledAt?: string; startAt?: string },
  ) {
    return this.useCase.duplicatePushCampaign(req, campaignId, body);
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
    return this.useCase.listTelegramCampaigns(req, scope);
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
    return this.useCase.createTelegramCampaign(req, body);
  }

  @Post('telegram-campaigns/:campaignId/cancel')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  cancelTelegramCampaign(
    @Req() req: PortalRequest,
    @Param('campaignId') campaignId: string,
  ) {
    return this.useCase.cancelTelegramCampaign(req, campaignId);
  }

  @Post('telegram-campaigns/:campaignId/archive')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  archiveTelegramCampaign(
    @Req() req: PortalRequest,
    @Param('campaignId') campaignId: string,
  ) {
    return this.useCase.archiveTelegramCampaign(req, campaignId);
  }

  @Post('telegram-campaigns/:campaignId/duplicate')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  duplicateTelegramCampaign(
    @Req() req: PortalRequest,
    @Param('campaignId') campaignId: string,
    @Body() body: { scheduledAt?: string; startAt?: string },
  ) {
    return this.useCase.duplicateTelegramCampaign(req, campaignId, body);
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
    return this.useCase.telegramNotifyState(req);
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
    return this.useCase.telegramNotifyInvite(req, body);
  }

  @Get('settings/telegram-notify/subscribers')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: { type: 'object', additionalProperties: true },
    },
  })
  telegramNotifySubscribers(@Req() req: PortalRequest) {
    return this.useCase.telegramNotifySubscribers(req);
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
    return this.useCase.telegramNotifyPreferences(req);
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
    return this.useCase.telegramNotifyUpdatePreferences(req, body);
  }

  @Post('settings/telegram-notify/subscribers/:id/deactivate')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  telegramNotifyDeactivate(@Req() req: PortalRequest, @Param('id') id: string) {
    return this.useCase.telegramNotifyDeactivate(req, id);
  }
}
