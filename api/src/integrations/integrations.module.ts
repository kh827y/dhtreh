import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AtolService } from './atol/atol.service';
import { EvotorService } from './evotor/evotor.service';
import { AtolController } from './atol/atol.controller';
import { EvotorController } from './evotor/evotor.controller';
import { ModulKassaService } from './modulkassa/modulkassa.service';
import { ModulKassaController } from './modulkassa/modulkassa.controller';
import { PosterService } from './poster/poster.service';
import { PosterController } from './poster/poster.controller';
import { OAuthGuard } from '../guards/oauth.guard';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [
    AtolController,
    EvotorController,
    ModulKassaController,
    PosterController,
  ],
  providers: [
    AtolService,
    EvotorService,
    ModulKassaService,
    PosterService,
    OAuthGuard,
  ],
  exports: [AtolService, EvotorService, ModulKassaService, PosterService],
})
export class IntegrationsModule {}
