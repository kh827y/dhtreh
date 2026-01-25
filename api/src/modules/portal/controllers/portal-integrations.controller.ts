import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PortalGuard } from '../../portal-auth/portal.guard';
import type { PortalRequest } from './portal.controller-helpers';
import { TransactionItemDto, ErrorDto } from '../../loyalty/dto/dto';
import { PortalIntegrationsUseCase } from '../use-cases/portal-integrations.use-case';

@ApiTags('portal')
@ApiExtraModels(TransactionItemDto)
@Controller('portal')
@UseGuards(PortalGuard)
export class PortalIntegrationsController {
  constructor(private readonly useCase: PortalIntegrationsUseCase) {}

  @Get('integrations')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string' },
          provider: { type: 'string' },
          isActive: { type: 'boolean' },
          lastSync: { type: 'string', nullable: true },
          errorCount: { type: 'number' },
        },
      },
    },
  })
  integrations(@Req() req: PortalRequest) {
    return this.useCase.integrations(req);
  }

  @Get('integrations/rest-api')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        status: { type: 'string' },
        integrationId: { type: 'string', nullable: true },
        apiKeyMask: { type: 'string', nullable: true },
        baseUrl: { type: 'string', nullable: true },
        issuedAt: { type: 'string', format: 'date-time', nullable: true },
        availableEndpoints: {
          type: 'array',
          items: { type: 'string' },
        },
        rateLimits: {
          type: 'object',
          properties: {
            code: {
              type: 'object',
              properties: {
                limit: { type: 'number' },
                ttl: { type: 'number' },
              },
            },
            calculate: {
              type: 'object',
              properties: {
                limit: { type: 'number' },
                ttl: { type: 'number' },
              },
            },
            bonus: {
              type: 'object',
              properties: {
                limit: { type: 'number' },
                ttl: { type: 'number' },
              },
            },
            refund: {
              type: 'object',
              properties: {
                limit: { type: 'number' },
                ttl: { type: 'number' },
              },
            },
          },
        },
        message: { type: 'string', nullable: true },
      },
    },
  })
  restApiIntegrationState(@Req() req: PortalRequest) {
    return this.useCase.restApiIntegrationState(req);
  }

  @Post('integrations/rest-api/issue')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', nullable: true },
      },
      additionalProperties: true,
    },
  })
  restApiIntegrationIssue(@Req() req: PortalRequest) {
    return this.useCase.restApiIntegrationIssue(req);
  }

  @Delete('integrations/rest-api')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  restApiIntegrationDisable(@Req() req: PortalRequest) {
    return this.useCase.restApiIntegrationDisable(req);
  }

  @Get('integrations/telegram-mini-app')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        botUsername: { type: 'string', nullable: true },
        botLink: { type: 'string', nullable: true },
        miniappUrl: { type: 'string', nullable: true },
        connectionHealthy: { type: 'boolean' },
        lastSyncAt: { type: 'string', format: 'date-time', nullable: true },
        integrationId: { type: 'string', nullable: true },
        tokenMask: { type: 'string', nullable: true },
        message: { type: 'string', nullable: true },
      },
    },
  })
  telegramMiniAppState(@Req() req: PortalRequest) {
    return this.useCase.telegramMiniAppState(req);
  }

  @Post('integrations/telegram-mini-app/connect')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  @ApiBadRequestResponse({ type: ErrorDto })
  telegramMiniAppConnect(
    @Req() req: PortalRequest,
    @Body() body: { token?: string },
  ) {
    return this.useCase.telegramMiniAppConnect(req, body);
  }

  @Post('integrations/telegram-mini-app/check')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  @ApiBadRequestResponse({ type: ErrorDto })
  telegramMiniAppCheck(@Req() req: PortalRequest) {
    return this.useCase.telegramMiniAppCheck(req);
  }

  @Post('integrations/telegram-mini-app/link')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        deepLink: { type: 'string' },
        startParam: { type: 'string' },
      },
    },
  })
  @ApiBadRequestResponse({ type: ErrorDto })
  telegramMiniAppLink(
    @Req() req: PortalRequest,
    @Body() body: { outletId?: string },
  ) {
    return this.useCase.telegramMiniAppLink(req, body);
  }

  @Post('integrations/telegram-mini-app/setup-menu')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  @ApiBadRequestResponse({ type: ErrorDto })
  telegramMiniAppSetupMenu(@Req() req: PortalRequest) {
    return this.useCase.telegramMiniAppSetupMenu(req);
  }

  @Delete('integrations/telegram-mini-app')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  telegramMiniAppDisconnect(@Req() req: PortalRequest) {
    return this.useCase.telegramMiniAppDisconnect(req);
  }
}
