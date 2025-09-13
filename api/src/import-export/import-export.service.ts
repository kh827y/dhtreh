import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as XLSX from 'xlsx';
import * as csv from 'csv-parse/sync';
import * as csvStringify from 'csv-stringify/sync';

export interface ImportCustomersDto {
  merchantId: string;
  format: 'csv' | 'excel';
  data: Buffer;
  updateExisting?: boolean;
  sendWelcome?: boolean;
}

export interface ExportCustomersDto {
  merchantId: string;
  format: 'csv' | 'excel';
  fields?: string[];
  filters?: {
    status?: string;
    minBalance?: number;
    maxBalance?: number;
    hasTransactions?: boolean;
    createdFrom?: Date;
    createdTo?: Date;
  };
}

export interface CustomerImportRow {
  phone?: string;
  email?: string;
  name?: string;
  birthday?: string;
  gender?: string;
  city?: string;
  balance?: number;
  status?: string;
  tags?: string;
  metadata?: string;
}

@Injectable()
export class ImportExportService {
  constructor(private prisma: PrismaService) {}

  /**
   * Импорт клиентов из файла
   */
  async importCustomers(dto: ImportCustomersDto) {
    let rows: CustomerImportRow[];
    
    try {
      if (dto.format === 'csv') {
        rows = this.parseCsv(dto.data);
      } else {
        rows = this.parseExcel(dto.data);
      }
    } catch (error) {
      throw new BadRequestException(`Ошибка парсинга файла: ${error.message}`);
    }

    if (rows.length === 0) {
      throw new BadRequestException('Файл не содержит данных');
    }

    const results = {
      total: rows.length,
      imported: 0,
      updated: 0,
      errors: [] as Array<{ row: number; error: string }>,
    };

    // Обрабатываем каждую строку
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        await this.processCustomerRow(row, dto.merchantId, dto.updateExisting || false);
        
        if (dto.updateExisting && await this.customerExists(row, dto.merchantId)) {
          results.updated++;
        } else {
          results.imported++;
        }
      } catch (error) {
        results.errors.push({
          row: i + 2, // +1 для заголовка, +1 для индексации с 1
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Экспорт клиентов в файл
   */
  async exportCustomers(dto: ExportCustomersDto): Promise<Buffer> {
    // Построение условий фильтрации
    const where: any = {
      wallets: {
        some: {
          merchantId: dto.merchantId,
        },
      },
    };

    if (dto.filters) {
      if (dto.filters.hasTransactions !== undefined) {
        where.transactions = dto.filters.hasTransactions 
          ? { some: { merchantId: dto.merchantId } }
          : { none: { merchantId: dto.merchantId } };
      }

      if (dto.filters.createdFrom || dto.filters.createdTo) {
        where.createdAt = {};
        if (dto.filters.createdFrom) {
          where.createdAt.gte = dto.filters.createdFrom;
        }
        if (dto.filters.createdTo) {
          where.createdAt.lte = dto.filters.createdTo;
        }
      }
    }

    // Получаем клиентов
    const customers = await this.prisma.customer.findMany({
      where,
      include: {
        wallets: {
          where: { merchantId: dto.merchantId },
        },
        transactions: {
          where: { merchantId: dto.merchantId },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        segments: {
          include: {
            segment: true,
          },
        },
      },
    });

    // Подготавливаем данные для экспорта
    const exportData = customers.map(customer => {
      const wallet = customer.wallets[0];
      const lastTransaction = customer.transactions[0];
      const segments = customer.segments
        .map(s => s.segment.name)
        .filter(Boolean)
        .join(', ');

      const row: any = {
        'ID': customer.id,
        'Телефон': customer.phone || '',
        'Email': customer.email || '',
        'Имя': customer.name || '',
        'Дата рождения': customer.birthday?.toLocaleDateString('ru-RU') || '',
        'Пол': customer.gender || '',
        'Город': customer.city || '',
        'Баланс баллов': wallet?.balance || 0,
        'Дата регистрации': customer.createdAt.toLocaleDateString('ru-RU'),
        'Последняя покупка': lastTransaction?.createdAt.toLocaleDateString('ru-RU') || '',
        'Сегменты': segments,
        'Тэги': customer.tags?.join(', ') || '',
      };

      // Фильтруем поля если указаны
      if (dto.fields && dto.fields.length > 0) {
        const filtered: any = {};
        for (const field of dto.fields) {
          if (row[field] !== undefined) {
            filtered[field] = row[field];
          }
        }
        return filtered;
      }

      return row;
    });

    // Генерируем файл
    if (dto.format === 'csv') {
      return this.generateCsv(exportData);
    } else {
      return this.generateExcel(exportData);
    }
  }

  /**
   * Импорт транзакций
   */
  async importTransactions(
    merchantId: string,
    format: 'csv' | 'excel',
    data: Buffer
  ) {
    let rows: any[];
    
    try {
      if (format === 'csv') {
        rows = this.parseCsv(data);
      } else {
        rows = this.parseExcel(data);
      }
    } catch (error) {
      throw new BadRequestException(`Ошибка парсинга файла: ${error.message}`);
    }

    const results = {
      total: rows.length,
      imported: 0,
      errors: [] as Array<{ row: number; error: string }>,
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        // Находим клиента по телефону или email
        const customer = await this.findCustomerByRow(row, merchantId);
        
        if (!customer) {
          throw new Error('Клиент не найден');
        }

        // Создаем транзакцию
        await this.prisma.transaction.create({
          data: {
            merchantId,
            customerId: customer.id,
            type: row['Тип'] || 'MANUAL',
            amount: parseInt(row['Сумма'] || row['Баллы'] || '0'),
            orderId: row['ID заказа'] || `import_${Date.now()}_${i}`,
          },
        });

        results.imported++;
      } catch (error) {
        results.errors.push({
          row: i + 2,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Получить шаблон для импорта
   */
  async getImportTemplate(type: 'customers' | 'transactions', format: 'csv' | 'excel'): Promise<Buffer> {
    const templates = {
      customers: [
        {
          'Телефон*': '+7 900 123-45-67',
          'Email': 'customer@example.com',
          'Имя': 'Иван Иванов',
          'Дата рождения': '01.01.1990',
          'Пол': 'M',
          'Город': 'Москва',
          'Баланс баллов': '500',
          'Тэги': 'VIP, Постоянный',
        },
        {
          'Телефон*': '+7 900 123-45-68',
          'Email': 'customer2@example.com',
          'Имя': 'Мария Петрова',
          'Дата рождения': '15.05.1985',
          'Пол': 'F',
          'Город': 'Санкт-Петербург',
          'Баланс баллов': '1000',
          'Тэги': 'Новый',
        },
      ],
      transactions: [
        {
          'Телефон клиента*': '+7 900 123-45-67',
          'Тип': 'EARN',
          'Баллы': '100',
          'ID заказа': 'ORDER-001',
          'Описание': 'Покупка на 1000 руб',
        },
        {
          'Телефон клиента*': '+7 900 123-45-68',
          'Тип': 'REDEEM',
          'Баллы': '-50',
          'ID заказа': 'ORDER-002',
          'Описание': 'Списание баллов',
        },
      ],
    };

    const data = templates[type];
    
    if (format === 'csv') {
      return this.generateCsv(data);
    } else {
      return this.generateExcel(data);
    }
  }

  // Вспомогательные методы

  private parseCsv(buffer: Buffer): any[] {
    const content = buffer.toString('utf-8');
    
    // Проверяем BOM и удаляем если есть
    const cleanContent = content.charAt(0) === '\ufeff' 
      ? content.substring(1) 
      : content;

    return csv.parse(cleanContent, {
      columns: true,
      skip_empty_lines: true,
      delimiter: [',', ';', '\t'], // Автоопределение разделителя
      relax_quotes: true,
      trim: true,
    });
  }

  private parseExcel(buffer: Buffer): any[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    return XLSX.utils.sheet_to_json(worksheet, {
      defval: '',
      raw: false, // Преобразовывать даты в строки
      dateNF: 'DD.MM.YYYY',
    });
  }

  private generateCsv(data: any[]): Buffer {
    if (data.length === 0) {
      return Buffer.from('');
    }

    const csv = csvStringify.stringify(data, {
      header: true,
      delimiter: ';',
      bom: true, // Добавляем BOM для корректного отображения в Excel
    });

    return Buffer.from(csv, 'utf-8');
  }

  private generateExcel(data: any[]): Buffer {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    
    // Устанавливаем ширину колонок
    const maxWidth = 30;
    const cols = Object.keys(data[0] || {}).map(() => ({ wch: maxWidth }));
    worksheet['!cols'] = cols;

    return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  }

  private async processCustomerRow(
    row: CustomerImportRow,
    merchantId: string,
    updateExisting: boolean
  ) {
    // Валидация обязательных полей
    if (!row.phone && !row.email) {
      throw new Error('Требуется телефон или email');
    }

    // Нормализация телефона
    const phone = this.normalizePhone(row.phone);

    // Проверяем существование клиента
    let customer = await this.prisma.customer.findFirst({
      where: {
        OR: [
          { phone: phone || undefined },
          { email: row.email || undefined },
        ],
      },
    });

    if (customer && !updateExisting) {
      throw new Error('Клиент уже существует');
    }

    // Парсим дополнительные поля
    const birthday = row.birthday ? this.parseDate(row.birthday) : undefined;
    const tags = row.tags ? row.tags.split(',').map(t => t.trim()) : undefined;
    const metadata = row.metadata ? JSON.parse(row.metadata) : undefined;

    if (customer) {
      // Обновляем существующего клиента
      customer = await this.prisma.customer.update({
        where: { id: customer.id },
        data: {
          name: row.name || customer.name,
          email: row.email || customer.email,
          phone: phone || customer.phone,
          birthday: birthday || customer.birthday,
          gender: row.gender || customer.gender,
          city: row.city || customer.city,
          tags: tags || customer.tags,
          metadata: metadata || customer.metadata,
        },
      });
    } else {
      // Создаем нового клиента
      customer = await this.prisma.customer.create({
        data: {
          phone,
          email: row.email,
          name: row.name,
          birthday,
          gender: row.gender,
          city: row.city,
          tags,
          metadata,
        },
      });
    }

    // Создаем или обновляем кошелек
    const wallet = await this.prisma.wallet.findFirst({
      where: {
        customerId: customer.id,
        merchantId,
      },
    });

    if (wallet) {
      // Обновляем баланс если указан
      if (row.balance !== undefined) {
        await this.prisma.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: parseInt(row.balance.toString()),
          },
        });
      }
    } else {
      // Создаем новый кошелек
      await this.prisma.wallet.create({
        data: {
          customerId: customer.id,
          merchantId,
          balance: row.balance ? parseInt(row.balance.toString()) : 0,
          type: 'POINTS' as any,
        },
      });
    }
  }

  private async customerExists(row: CustomerImportRow, merchantId: string): Promise<boolean> {
    const phone = this.normalizePhone(row.phone);
    
    const customer = await this.prisma.customer.findFirst({
      where: {
        OR: [
          { phone: phone || undefined },
          { email: row.email || undefined },
        ],
        wallets: {
          some: { merchantId },
        },
      },
    });

    return !!customer;
  }

  private async findCustomerByRow(row: any, merchantId: string) {
    const phone = this.normalizePhone(row['Телефон клиента'] || row['Телефон']);
    const email = row['Email клиента'] || row['Email'];

    return this.prisma.customer.findFirst({
      where: {
        OR: [
          { phone: phone || undefined },
          { email: email || undefined },
        ],
        wallets: {
          some: { merchantId },
        },
      },
      include: {
        wallets: {
          where: { merchantId },
        },
      },
    });
  }

  private normalizePhone(phone?: string): string | null {
    if (!phone) return null;

    // Удаляем все нецифровые символы
    let cleaned = phone.replace(/\D/g, '');
    
    // Если начинается с 8, заменяем на 7
    if (cleaned.startsWith('8')) {
      cleaned = '7' + cleaned.substring(1);
    }
    
    // Если не начинается с 7, добавляем
    if (cleaned.length === 10 && !cleaned.startsWith('7')) {
      cleaned = '7' + cleaned;
    }

    // Проверяем длину
    if (cleaned.length !== 11) {
      throw new Error(`Неверный формат телефона: ${phone}`);
    }

    return '+' + cleaned;
  }

  private parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    // Пробуем разные форматы
    const formats = [
      /^(\d{2})\.(\d{2})\.(\d{4})$/, // DD.MM.YYYY
      /^(\d{2})\/(\d{2})\/(\d{4})$/, // DD/MM/YYYY
      /^(\d{4})-(\d{2})-(\d{2})$/,   // YYYY-MM-DD
    ];

    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        let day, month, year;
        
        if (format === formats[2]) {
          // ISO формат
          [, year, month, day] = match;
        } else {
          // DD.MM.YYYY или DD/MM/YYYY
          [, day, month, year] = match;
        }

        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    // Пробуем нативный парсер
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }

    throw new Error(`Неверный формат даты: ${dateStr}`);
  }
}
