import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  SmsProvider,
  SendSmsParams,
  SmsResult,
  BalanceResult,
  SmsStatus,
  BulkSmsParams,
  BulkSmsResult,
} from '../sms-provider.interface';

/**
 * SMS.RU - популярный российский SMS провайдер
 * Документация: https://sms.ru/api
 */
@Injectable()
export class SmscProvider implements SmsProvider {
  private readonly apiUrl = 'https://smsc.ru/sys';
  private readonly login: string;
  private readonly password: string;
  private readonly sender: string;

  constructor(private configService: ConfigService) {
    this.login = this.configService.get('SMSC_LOGIN') || '';
    this.password = this.configService.get('SMSC_PASSWORD') || '';
    this.sender = this.configService.get('SMSC_SENDER') || 'LOYALTY';
  }

  async sendSms(params: SendSmsParams): Promise<SmsResult> {
    try {
      const formData = new URLSearchParams({
        login: this.login,
        psw: this.password,
        phones: this.formatPhone(params.phone),
        mes: params.message,
        sender: params.sender || this.sender,
        charset: 'utf-8',
        fmt: '3', // JSON формат ответа
        cost: '2', // Получить стоимость
        translit: params.translit ? '1' : '0',
        test: params.test ? '1' : '0',
      });

      if (params.time) {
        formData.append('time', Math.floor(params.time.getTime() / 1000).toString());
      }

      if (params.messageId) {
        formData.append('id', params.messageId);
      }

      const response = await fetch(`${this.apiUrl}/send.php?${formData}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        return {
          id: '',
          status: 'failed',
          error: this.getErrorMessage(data.error_code),
        };
      }

      return {
        id: data.id?.toString() || '',
        status: data.id ? 'sent' : 'failed',
        cost: parseFloat(data.cost || 0),
        parts: parseInt(data.sms || 1),
        balance: parseFloat(data.balance || 0),
      };
    } catch (error) {
      return {
        id: '',
        status: 'failed',
        error: error.message || 'Ошибка отправки SMS',
      };
    }
  }

  async checkBalance(): Promise<BalanceResult> {
    try {
      const formData = new URLSearchParams({
        login: this.login,
        psw: this.password,
        fmt: '3',
      });

      const response = await fetch(`${this.apiUrl}/balance.php?${formData}`, {
        method: 'GET',
      });

      const data = await response.json();

      return {
        balance: parseFloat(data.balance || 0),
        currency: data.currency || 'RUB',
        credit: parseFloat(data.credit || 0),
      };
    } catch (error) {
      throw new Error(`Ошибка проверки баланса: ${error.message}`);
    }
  }

  async getSmsStatus(messageId: string): Promise<SmsStatus> {
    try {
      const formData = new URLSearchParams({
        login: this.login,
        psw: this.password,
        phone: '', // Будет заполнено из истории
        id: messageId,
        fmt: '3',
      });

      const response = await fetch(`${this.apiUrl}/status.php?${formData}`, {
        method: 'GET',
      });

      const data = await response.json();

      if (data.error) {
        return {
          id: messageId,
          status: 'failed',
          error: this.getErrorMessage(data.error_code),
        };
      }

      return {
        id: messageId,
        status: this.mapStatus(data.status),
        deliveredAt: data.last_date ? new Date(data.last_date) : undefined,
        error: data.err ? this.getErrorMessage(data.err) : undefined,
      };
    } catch (error) {
      return {
        id: messageId,
        status: 'failed',
        error: error.message,
      };
    }
  }

  async sendBulkSms(params: BulkSmsParams): Promise<BulkSmsResult> {
    const results: any[] = [];
    let totalCost = 0;
    let sent = 0;
    let failed = 0;

    // SMSC поддерживает отправку на несколько номеров через запятую
    // но для отслеживания статуса каждого сообщения лучше отправлять по одному
    for (const message of params.messages) {
      const result = await this.sendSms({
        phone: message.phone,
        message: message.message,
        sender: params.sender,
        translit: params.translit,
      });

      results.push({
        phone: message.phone,
        id: result.id,
        status: result.status,
        error: result.error,
      });

      if (result.status === 'sent' || result.status === 'queued') {
        sent++;
        totalCost += result.cost || 0;
      } else {
        failed++;
      }

      // Небольшая задержка между запросами
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return {
      total: params.messages.length,
      sent,
      failed,
      cost: totalCost,
      messages: results,
    };
  }

  private formatPhone(phone: string): string {
    // Удаляем все нецифровые символы
    let cleaned = phone.replace(/\D/g, '');
    
    // Если начинается с 8, заменяем на 7
    if (cleaned.startsWith('8')) {
      cleaned = '7' + cleaned.substring(1);
    }
    
    // Если не начинается с 7, добавляем
    if (!cleaned.startsWith('7')) {
      cleaned = '7' + cleaned;
    }
    
    return cleaned;
  }

  private mapStatus(status: number): SmsStatus['status'] {
    switch (status) {
      case -3: return 'failed'; // Сообщение не найдено
      case -2: return 'pending'; // Остановлено
      case -1: return 'pending'; // Ожидает отправки
      case 0: return 'pending'; // Передано оператору
      case 1: return 'delivered'; // Доставлено
      case 2: return 'sent'; // Прочитано
      case 3: return 'expired'; // Просрочено
      case 20: return 'failed'; // Невозможно доставить
      case 22: return 'failed'; // Неверный номер
      case 23: return 'failed'; // Запрещено
      case 24: return 'failed'; // Недостаточно средств
      case 25: return 'failed'; // Недоступный номер
      default: return 'pending';
    }
  }

  private getErrorMessage(code: number): string {
    const errors: Record<number, string> = {
      1: 'Ошибка в параметрах',
      2: 'Неверный логин или пароль',
      3: 'Недостаточно средств',
      4: 'IP-адрес заблокирован',
      5: 'Неверный формат даты',
      6: 'Сообщение запрещено',
      7: 'Неверный формат номера',
      8: 'Сообщение на указанный номер не может быть доставлено',
      9: 'Отправка более одного одинакового сообщения в минуту запрещена',
    };
    
    return errors[code] || `Ошибка ${code}`;
  }
}
