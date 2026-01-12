import { Module } from '@nestjs/common';
import { LevelsService } from './levels.service';
import { LevelsController } from './levels.controller';
import { PrismaModule } from '../prisma.module';
import { MetricsModule } from '../metrics.module';
import { LevelsAccessGuard } from '../guards/levels-access.guard';
import { CashierGuard } from '../guards/cashier.guard';
import { TelegramMiniappGuard } from '../guards/telegram-miniapp.guard';

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
