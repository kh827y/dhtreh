import { Module } from '@nestjs/common';
import { CampaignController } from './campaign.controller';
import { CampaignService } from './campaign.service';
import { SegmentController } from './segment.controller';
import { SegmentService } from './segment.service';
import { PrismaModule } from '../prisma.module';
import { ConfigModule } from '@nestjs/config';
import { CampaignCronService } from './campaign.cron';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [CampaignController, SegmentController],
  providers: [CampaignService, SegmentService, CampaignCronService],
  exports: [CampaignService, SegmentService],
})
export class CampaignModule {}
