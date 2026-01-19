import { Module } from '@nestjs/common';
import { LevelsService } from './levels.service';
import { LevelsController } from './levels.controller';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { MetricsModule } from '../../core/metrics/metrics.module';
import { LevelsAccessGuard } from '../../core/guards/levels-access.guard';
import { CashierGuard } from '../../core/guards/cashier.guard';
import { TelegramMiniappGuard } from '../../core/guards/telegram-miniapp.guard';

@Module({
  imports: [PrismaModule, MetricsModule],
  providers: [
    LevelsService,
    LevelsAccessGuard,
    CashierGuard,
    TelegramMiniappGuard,
  ],
  controllers: [LevelsController],
  exports: [LevelsService],
})
export class LevelsModule {}
