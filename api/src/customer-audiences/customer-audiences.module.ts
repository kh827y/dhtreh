import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { CustomerAudiencesService } from './customer-audiences.service';
import { CustomerAudiencesController } from './customer-audiences.controller';

@Module({
  imports: [PrismaModule],
  providers: [CustomerAudiencesService],
  controllers: [CustomerAudiencesController],
  exports: [CustomerAudiencesService],
})
export class CustomerAudiencesModule {}
