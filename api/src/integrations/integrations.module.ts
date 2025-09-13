import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AtolService } from './atol/atol.service';
import { EvotorService } from './evotor/evotor.service';
import { AtolController } from './atol/atol.controller';
import { EvotorController } from './evotor/evotor.controller';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [AtolController, EvotorController],
  providers: [AtolService, EvotorService],
  exports: [AtolService, EvotorService],
})
export class IntegrationsModule {}
