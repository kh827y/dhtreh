import { Module } from '@nestjs/common';
import { OneCController } from './onec.controller';
import { OneCService } from './onec.service';
import { PrismaModule } from '../../prisma.module';
import { ConfigModule } from '@nestjs/config';
import { LoyaltyModule } from '../../loyalty/loyalty.module';

@Module({
  imports: [PrismaModule, ConfigModule, LoyaltyModule],
  controllers: [OneCController],
  providers: [OneCService],
  exports: [OneCService],
})
export class OneCModule {}
