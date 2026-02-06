import { Injectable } from '@nestjs/common';
import { ImportExportFileService } from './import-export-file.service';

@Injectable()
export class ImportExportTemplatesService {
  constructor(private readonly files: ImportExportFileService) {}

  async getImportTemplate(
    type: 'customers' | 'transactions',
    format: 'csv' | 'excel',
  ): Promise<Buffer> {
    const templates = {
      customers: [
        {
          'ID клиента во внешней среде': 'CRM-001',
          'Номер телефона': '+7 900 123-45-67',
          ФИО: 'Иван Иванов',
          'Дата рождения': '1989-01-15',
          Пол: 'М',
          Email: 'ivan@example.com',
          Комментарий: 'VIP',
          'Баланс баллов': '1200',
          Уровень: 'Silver',
          'Блокировка начислений': 'нет',
          'Блокировка списаний': 'нет',
          'Сумма покупок': '56000',
          'Количество визитов': '14',
          'Дата последней покупки': '2024-10-12',
          'Сумма операции': '',
          'Начисленные баллы': '',
          'Списанные баллы': '',
          'Дата операции': '',
          'ID операции': '',
          'Номер чека': '',
        },
        {
          'ID клиента во внешней среде': 'CRM-001',
          'Номер телефона': '+7 900 123-45-67',
          ФИО: 'Иван Иванов',
          'Дата рождения': '',
          Пол: '',
          Email: 'ivan@example.com',
          Комментарий: '',
          'Баланс баллов': '',
          Уровень: 'Silver',
          'Блокировка начислений': '',
          'Блокировка списаний': '',
          'Сумма покупок': '',
          'Количество визитов': '',
          'Дата последней покупки': '',
          'Сумма операции': '1500',
          'Начисленные баллы': '75',
          'Списанные баллы': '0',
          'Дата операции': '2024-10-12 14:23',
          'ID операции': 'ORDER-001',
          'Номер чека': '000123',
        },
      ],
      transactions: [
        {
          'Телефон клиента*': '+7 900 123-45-67',
          Тип: 'EARN',
          Баллы: '100',
          'ID заказа': 'ORDER-001',
          Описание: 'Покупка на 1000 руб',
        },
        {
          'Телефон клиента*': '+7 900 123-45-68',
          Тип: 'REDEEM',
          Баллы: '-50',
          'ID заказа': 'ORDER-002',
          Описание: 'Списание баллов',
        },
      ],
    };

    const data = templates[type];

    if (format === 'csv') {
      return this.files.generateCsv(data);
    }
    return await this.files.generateExcel(data);
  }
}
