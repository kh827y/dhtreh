import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PortalGuard } from '../portal-auth/portal.guard';
import { PortalCustomersService } from './customers.service';
import type { ImportRow } from './customers.service';

@Controller('portal/customers')
@UseGuards(PortalGuard)
export class PortalCustomersController {
  constructor(private readonly service: PortalCustomersService) {}

  private getMerchantId(req: any): string {
    return String((req as any).portalMerchantId || '');
  }

  @Get()
  list(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('login') login?: string,
    @Query('name') name?: string,
    @Query('email') email?: string,
    @Query('tag') tag?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    return this.service.listCustomers(merchantId, {
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20,
      login,
      name,
      email,
      tag,
    });
  }

  @Post()
  async create(@Req() req: any, @Body() body: any) {
    const merchantId = this.getMerchantId(req);
    if (!body?.login) throw new BadRequestException('Логин обязателен');
    if (body.password && body.passwordConfirm && body.password !== body.passwordConfirm) {
      throw new BadRequestException('Пароли не совпадают');
    }
    return this.service.createCustomer(merchantId, {
      login: String(body.login),
      password: body.password || undefined,
      email: body.email ? String(body.email) : undefined,
      firstName: body.firstName ?? null,
      lastName: body.lastName ?? null,
      birthday: body.birthday ?? null,
      gender: body.gender ?? null,
      tags: Array.isArray(body.tags) ? body.tags : undefined,
      comment: body.comment ?? null,
      group: body.group ?? null,
      blockAccruals: !!body.blockAccruals,
    });
  }

  @Get(':customerId')
  get(@Req() req: any, @Param('customerId') customerId: string) {
    const merchantId = this.getMerchantId(req);
    return this.service.getCustomer(merchantId, customerId);
  }

  @Put(':customerId')
  async update(@Req() req: any, @Param('customerId') customerId: string, @Body() body: any) {
    const merchantId = this.getMerchantId(req);
    if (body.password && body.passwordConfirm && body.password !== body.passwordConfirm) {
      throw new BadRequestException('Пароли не совпадают');
    }
    return this.service.updateCustomer(merchantId, customerId, {
      login: body.login ? String(body.login) : undefined,
      password: body.password || undefined,
      email: body.email ? String(body.email) : undefined,
      firstName: body.firstName ?? null,
      lastName: body.lastName ?? null,
      birthday: body.birthday ?? null,
      gender: body.gender ?? null,
      tags: Array.isArray(body.tags) ? body.tags : undefined,
      comment: body.comment ?? null,
      group: body.group ?? null,
      blockAccruals: body.blockAccruals !== undefined ? !!body.blockAccruals : undefined,
    });
  }

  @Post(':customerId/accrue')
  accrue(@Req() req: any, @Param('customerId') customerId: string, @Body() body: any) {
    const merchantId = this.getMerchantId(req);
    return this.service.accruePoints(merchantId, customerId, {
      amount: Number(body.amount || 0),
      receipt: body.receipt ?? null,
      manualPoints: body.manualPoints != null ? Number(body.manualPoints) : null,
      outletId: body.outletId ?? null,
      deviceId: body.deviceId ?? null,
    });
  }

  @Post(':customerId/redeem')
  redeem(@Req() req: any, @Param('customerId') customerId: string, @Body() body: any) {
    const merchantId = this.getMerchantId(req);
    return this.service.redeemPoints(merchantId, customerId, {
      amount: Number(body.amount || 0),
      outletId: body.outletId ?? null,
      deviceId: body.deviceId ?? null,
    });
  }

  @Post(':customerId/complimentary')
  complimentary(@Req() req: any, @Param('customerId') customerId: string, @Body() body: any) {
    const merchantId = this.getMerchantId(req);
    return this.service.complimentaryAccrual(merchantId, customerId, {
      amount: Number(body.amount || 0),
      expiresInDays: Number(body.expiresInDays ?? 0),
      comment: body.comment ?? null,
    });
  }

  @Post('transactions/:transactionId/cancel')
  cancel(@Req() req: any, @Param('transactionId') transactionId: string, @Body() body: any) {
    const merchantId = this.getMerchantId(req);
    const actor = String(body?.actor || 'portal');
    return this.service.cancelTransaction(merchantId, transactionId, actor);
  }

  private parseCsv(buffer: Buffer): ImportRow[] {
    const text = buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const rows: ImportRow[] = [];
    for (const [index, raw] of lines.entries()) {
      const cells = raw.split(';').map((cell) => cell.trim().replace(/^"|"$/g, ''));
      if (cells.length < 5) continue;
      const row: ImportRow = {
        externalId: cells[0] || null,
        phone: cells[1] || '',
        fio: cells[2] || null,
        birthday: cells[3] || null,
        points: Number(cells[4] || 0),
        totalSpent: cells[5] ? Number(cells[5]) : null,
        transactionDate: cells[6] || null,
        receiptNumber: cells[7] || null,
        stamps: cells[8] ? Number(cells[8]) : null,
        accrualGroupId: cells[9] || null,
        email: cells[10] || null,
      };
      if (!row.phone) {
        throw new BadRequestException(`Строка ${index + 1}: не указан номер телефона`);
      }
      rows.push(row);
    }
    return rows;
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(@Req() req: any, @UploadedFile() file?: Express.Multer.File) {
    const merchantId = this.getMerchantId(req);
    if (!file) throw new BadRequestException('Файл не найден');
    const rows = this.parseCsv(file.buffer);
    return this.service.importCustomers(merchantId, rows);
  }
}
