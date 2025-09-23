import { Body, Controller, Get, Put, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { PortalGuard } from '../portal-auth/portal.guard';
import { AntiFraudService } from '../antifraud/antifraud.service';

@Controller('portal/antifraud')
@UseGuards(PortalGuard)
export class PortalAntifraudController {
  constructor(private readonly antifraud: AntiFraudService) {}

  private getMerchantId(req: any): string {
    return String((req as any).portalMerchantId || '');
  }

  @Get('settings')
  getSettings(@Req() req: any) {
    return this.antifraud.getPortalSettings(this.getMerchantId(req));
  }

  @Put('settings')
  async updateSettings(@Req() req: any, @Body() body: any) {
    const merchantId = this.getMerchantId(req);
    const parseNumber = (value: any) => {
      if (value === null || value === undefined || value === '') return null;
      const num = Number(value);
      if (!Number.isFinite(num) || num < 0) {
        throw new BadRequestException('Лимиты должны быть неотрицательными числами');
      }
      return Math.floor(num);
    };
    const emails = Array.isArray(body.notifyEmails)
      ? body.notifyEmails
      : typeof body.notifyEmails === 'string'
        ? body.notifyEmails.split(',')
        : [];
    return this.antifraud.updatePortalSettings(merchantId, {
      dailyAccrualLimit: parseNumber(body.dailyAccrualLimit),
      monthlyAccrualLimit: parseNumber(body.monthlyAccrualLimit),
      maxPointsPerEarn: parseNumber(body.maxPointsPerEarn),
      notifyEmails: emails,
      notifyOutletAdmins: !!body.notifyOutletAdmins,
    });
  }
}
