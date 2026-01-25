import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
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

  parseExcel(buffer: Buffer): RowRecord[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      defval: '',
      raw: false,
      dateNF: 'DD.MM.YYYY',
    }) as unknown[];

    return rows
      .map((row) => this.toRecord(row))
      .filter((row): row is RowRecord => row !== null);
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

  generateExcel(data: Array<Record<string, unknown>>): Buffer {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

    const maxWidth = 30;
    const cols = Object.keys(data[0] || {}).map(() => ({ wch: maxWidth }));
    worksheet['!cols'] = cols;

    const raw = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;

    return Buffer.from(raw);
  }

  csvCell(value: string) {
    const safe = this.sanitizeCsvValue(value);
    const escaped = safe.replace(/\"/g, '\"\"');
    return `\"${escaped}\"`;
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
    if (trimmed && /^[=+\\-@]/.test(trimmed)) {
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
}
