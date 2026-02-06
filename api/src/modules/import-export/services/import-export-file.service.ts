import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as csv from 'csv-parse/sync';
import * as csvStringify from 'csv-stringify/sync';
import type { RowRecord } from '../import-export.types';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';

@Injectable()
export class ImportExportFileService {
  parseCsv(buffer: Buffer): RowRecord[] {
    const content = buffer.toString('utf-8');

    const cleanContent =
      content.charAt(0) === '\ufeff' ? content.substring(1) : content;

    const rows = csv.parse(cleanContent, {
      columns: true,
      skip_empty_lines: true,
      delimiter: [',', ';', '\t'],
      relax_quotes: true,
      trim: true,
    }) as unknown[];

    return rows
      .map((row) => this.toRecord(row))
      .filter((row): row is RowRecord => row !== null);
  }

  async parseExcel(buffer: Buffer): Promise<RowRecord[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return [];
    }

    const rows: RowRecord[] = [];
    const headers: string[] = [];

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values = row.values as unknown[];
      if (rowNumber === 1) {
        for (let i = 1; i < values.length; i++) {
          const header = this.stringifyValue(
            this.normalizeExcelCell(values[i]),
          ).trim();
          headers[i - 1] = header || `column_${i}`;
        }
        return;
      }

      if (!headers.length) {
        return;
      }

      const record: RowRecord = {};
      let hasData = false;
      for (let i = 1; i <= headers.length; i++) {
        const header = headers[i - 1];
        if (!header) {
          continue;
        }
        const cellValue = this.normalizeExcelCell(values[i]);
        record[header] = cellValue;
        if (
          cellValue !== '' &&
          cellValue !== null &&
          cellValue !== undefined
        ) {
          hasData = true;
        }
      }

      if (hasData) {
        rows.push(record);
      }
    });

    return rows;
  }

  generateCsv(data: Array<Record<string, unknown>>): Buffer {
    if (data.length === 0) {
      return Buffer.from('');
    }

    const safeData = data.map((row) => {
      const sanitized: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        const raw = this.stringifyCsvValue(value);
        sanitized[key] = this.sanitizeCsvValue(raw);
      }
      return sanitized;
    });

    const csvText = csvStringify.stringify(safeData, {
      header: true,
      delimiter: ';',
      bom: true,
    }) as string;

    return Buffer.from(csvText, 'utf-8');
  }

  async generateExcel(data: Array<Record<string, unknown>>): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');
    const headers = Object.keys(data[0] || {});

    if (headers.length) {
      worksheet.columns = headers.map((header) => ({
        header,
        key: header,
        width: 30,
      }));
      for (const row of data) {
        const normalized: Record<string, unknown> = {};
        for (const header of headers) {
          normalized[header] = this.normalizeExcelOutputValue(row[header]);
        }
        worksheet.addRow(normalized);
      }
    }

    const raw = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  }

  csvCell(value: string) {
    const safe = this.sanitizeCsvValue(value);
    const escaped = safe.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  private stringifyCsvValue(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    if (value instanceof Date) return value.toISOString();
    try {
      return JSON.stringify(value);
    } catch (err) {
      logIgnoredError(
        err,
        'ImportExportFileService stringifyCsvValue',
        undefined,
        'debug',
      );
      return '';
    }
  }

  private sanitizeCsvValue(value: string) {
    const trimmed = value.replace(/^[\t\r\n ]+/, '');
    if (trimmed && /^[=+@-]/.test(trimmed)) {
      return `'${value}`;
    }
    return value;
  }

  private toRecord(value: unknown): RowRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as RowRecord;
  }

  private normalizeExcelCell(value: unknown): unknown {
    if (value == null) return '';
    if (value instanceof Date) return value;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if (typeof obj.result === 'string' || typeof obj.result === 'number') {
        return obj.result;
      }
      if (obj.result instanceof Date) {
        return obj.result;
      }
      if (typeof obj.text === 'string') {
        return obj.text;
      }
      if (Array.isArray(obj.richText)) {
        return obj.richText
          .map((part) => {
            if (
              part &&
              typeof part === 'object' &&
              typeof (part as { text?: unknown }).text === 'string'
            ) {
              return (part as { text: string }).text;
            }
            return '';
          })
          .join('');
      }
      if (typeof obj.hyperlink === 'string') {
        return obj.hyperlink;
      }
      if (typeof obj.formula === 'string') {
        return obj.formula;
      }
      if (typeof obj.error === 'string') {
        return obj.error;
      }
    }
    return this.stringifyCsvValue(value);
  }

  private normalizeExcelOutputValue(value: unknown): unknown {
    if (value == null) return null;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    if (value instanceof Date) return value;
    if (typeof value === 'bigint') return String(value);
    return this.stringifyCsvValue(value);
  }

  private stringifyValue(value: unknown): string {
    return this.stringifyCsvValue(value);
  }
}
