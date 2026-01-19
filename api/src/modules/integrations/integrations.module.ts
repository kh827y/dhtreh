import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { RestApiIntegrationsService } from './rest-api-integrations.service';
import { IntegrationApiKeyGuard } from './integration-api-key.guard';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { IntegrationsLoyaltyController } from './integrations-loyalty.controller';

@Module({
  imports: [PrismaModule, LoyaltyModule],
  controllers: [IntegrationsLoyaltyController],
  providers: [RestApiIntegrationsService, IntegrationApiKeyGuard],
  exports: [RestApiIntegrationsService, IntegrationApiKeyGuard],
})
export class IntegrationsModule {}
