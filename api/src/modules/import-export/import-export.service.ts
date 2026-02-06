import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { ImportExportJobsService } from './services/import-export-jobs.service';
import { ImportExportCustomersService } from './services/import-export-customers.service';
import { ImportExportExportsService } from './services/import-export-exports.service';
import { ImportExportLogsService } from './services/import-export-logs.service';
import { ImportExportTemplatesService } from './services/import-export-templates.service';
import type {
  BulkUpdateCustomersDto,
  ExportCustomersDto,
  ImportCustomersDto,
  ImportCustomersJobDto,
  ImportJobSummary,
} from './import-export.types';

export * from './import-export.types';

@Injectable()
export class ImportExportService {
  constructor(
    private readonly jobs: ImportExportJobsService,
    private readonly customers: ImportExportCustomersService,
    private readonly exportsService: ImportExportExportsService,
    private readonly logs: ImportExportLogsService,
    private readonly templates: ImportExportTemplatesService,
  ) {}

  enqueueImportCustomers(dto: ImportCustomersJobDto) {
    return this.jobs.enqueueImportCustomers(dto);
  }

  getImportJobSummary(
    merchantId: string,
    jobId: string,
  ): Promise<ImportJobSummary> {
    return this.jobs.getImportJobSummary(merchantId, jobId);
  }

  listImportJobs(
    merchantId: string,
    limit = 20,
    offset = 0,
  ): Promise<ImportJobSummary[]> {
    return this.jobs.listImportJobs(merchantId, limit, offset);
  }

  processImportJob(jobId: string) {
    return this.jobs.processImportJob(jobId);
  }

  importCustomers(dto: ImportCustomersDto) {
    return this.customers.importCustomers(dto);
  }

  bulkUpdateCustomers(dto: BulkUpdateCustomersDto) {
    return this.customers.bulkUpdateCustomers(dto);
  }

  exportCustomers(dto: ExportCustomersDto): Promise<Buffer> {
    return this.exportsService.exportCustomers(dto);
  }

  streamCustomersCsv(dto: ExportCustomersDto, res: Response, batch = 1000) {
    return this.exportsService.streamCustomersCsv(dto, res, batch);
  }

  streamTransactionsCsv(
    params: {
      merchantId: string;
      from?: Date;
      to?: Date;
      type?: string;
      customerId?: string;
      outletId?: string;
      staffId?: string;
    },
    res: Response,
    batch = 1000,
  ) {
    return this.exportsService.streamTransactionsCsv(params, res, batch);
  }

  importTransactions(
    merchantId: string,
    format: 'csv' | 'excel',
    data: Buffer,
  ) {
    return this.customers.importTransactions(merchantId, format, data);
  }

  getImportExportStats(merchantId: string) {
    return this.logs.getImportExportStats(merchantId);
  }

  getImportTemplate(
    type: 'customers' | 'transactions',
    format: 'csv' | 'excel',
  ) {
    return this.templates.getImportTemplate(type, format);
  }
}
