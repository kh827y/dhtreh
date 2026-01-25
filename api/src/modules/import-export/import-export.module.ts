import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { ImportExportService } from './import-export.service';
import { ImportExportCustomersService } from './services/import-export-customers.service';
import { ImportExportExportsService } from './services/import-export-exports.service';
import { ImportExportFileService } from './services/import-export-file.service';
import { ImportExportJobsService } from './services/import-export-jobs.service';
import { ImportExportLogsService } from './services/import-export-logs.service';
import { ImportExportTemplatesService } from './services/import-export-templates.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [],
  providers: [
    ImportExportService,
    ImportExportFileService,
    ImportExportLogsService,
    ImportExportTemplatesService,
    ImportExportCustomersService,
    ImportExportExportsService,
    ImportExportJobsService,
  ],
  exports: [ImportExportService],
})
export class ImportExportModule {}
