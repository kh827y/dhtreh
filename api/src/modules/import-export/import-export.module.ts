import { Module } from '@nestjs/common';
import { ImportExportService } from './import-export.service';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [],
  providers: [ImportExportService],
  exports: [ImportExportService],
})
export class ImportExportModule {}
