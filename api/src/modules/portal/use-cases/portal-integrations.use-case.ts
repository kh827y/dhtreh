import { Injectable } from '@nestjs/common';
import { MerchantsService } from '../../merchants/merchants.service';
import { PortalRestApiIntegrationService } from '../services/rest-api-integration.service';
import { PortalTelegramIntegrationService } from '../services/telegram-integration.service';
import type { PortalRequest } from '../portal.types';
import { PortalRequestHelper } from '../helpers/portal-request.helper';
import type {
  TelegramMiniAppConnectDto,
  TelegramMiniAppLinkDto,
} from '../dto/integrations.dto';

@Injectable()
export class PortalIntegrationsUseCase {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly restApiIntegration: PortalRestApiIntegrationService,
    private readonly telegramIntegration: PortalTelegramIntegrationService,
    private readonly helpers: PortalRequestHelper,
  ) {}

  integrations(req: PortalRequest) {
    return this.merchants.listIntegrations(this.helpers.getMerchantId(req));
  }

  restApiIntegrationState(req: PortalRequest) {
    return this.restApiIntegration.getState(this.helpers.getMerchantId(req));
  }

  restApiIntegrationIssue(req: PortalRequest) {
    return this.restApiIntegration.issueKey(this.helpers.getMerchantId(req));
  }

  restApiIntegrationDisable(req: PortalRequest) {
    return this.restApiIntegration.disable(this.helpers.getMerchantId(req));
  }

  telegramMiniAppState(req: PortalRequest) {
    return this.telegramIntegration.getState(this.helpers.getMerchantId(req));
  }

  telegramMiniAppConnect(req: PortalRequest, body: TelegramMiniAppConnectDto) {
    return this.telegramIntegration.connect(
      this.helpers.getMerchantId(req),
      body?.token || '',
    );
  }

  telegramMiniAppCheck(req: PortalRequest) {
    return this.telegramIntegration.check(this.helpers.getMerchantId(req));
  }

  telegramMiniAppLink(req: PortalRequest, body: TelegramMiniAppLinkDto) {
    return this.telegramIntegration.generateLink(
      this.helpers.getMerchantId(req),
      body?.outletId,
    );
  }

  telegramMiniAppSetupMenu(req: PortalRequest) {
    return this.telegramIntegration.setupMenu(this.helpers.getMerchantId(req));
  }

  telegramMiniAppDisconnect(req: PortalRequest) {
    return this.telegramIntegration.disconnect(this.helpers.getMerchantId(req));
  }
}
