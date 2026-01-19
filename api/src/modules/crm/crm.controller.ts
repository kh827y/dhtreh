import { Controller, Get, Param, Query, UseGuards, Res } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../../core/guards/admin.guard';
import { AdminIpGuard } from '../../core/guards/admin-ip.guard';
import { CrmService } from './crm.service';
import type { Response } from 'express';

@ApiTags('crm')
@Controller('crm')
@UseGuards(AdminGuard, AdminIpGuard)
@ApiHeader({ name: 'X-Admin-Key', required: true, description: 'Админ-ключ' })
export class CrmController {
  constructor(private readonly service: CrmService) {}

  @Get(':merchantId/customer/:customerId/card')
  @ApiOkResponse({
    description: 'Карточка клиента с балансом, RFM и последними операциями',
  })
  async getCustomerCard(
    @Param('merchantId') merchantId: string,
    @Param('customerId') customerId: string,
  ) {
    return this.service.getCustomerCard(merchantId, customerId);
  }

  @Get(':merchantId/customer/search')
  @ApiOkResponse({
    description: 'Поиск клиента по id/телефону/email с краткой сводкой',
  })
  async searchCustomer(
    @Param('merchantId') merchantId: string,
    @Query('phone') phone?: string,
    @Query('email') email?: string,
    @Query('id') id?: string,
  ) {
    return this.service.searchCustomer(merchantId, phone, email, id);
  }

  @Get(':merchantId/rfm/distribution')
  @ApiOkResponse({ description: 'Распределение клиентов по классам RFM' })
  async rfmDistribution(@Param('merchantId') merchantId: string) {
    return this.service.getRfmDistribution(merchantId);
  }

  @Get(':merchantId/segments/:segmentId/customers')
  @ApiOkResponse({
    description: 'Список клиентов сегмента (пагинация по cursor)',
  })
  async listSegmentCustomers(
    @Param('merchantId') merchantId: string,
    @Param('segmentId') segmentId: string,
    @Query('limit') limitStr?: string,
    @Query('cursor') cursor?: string,
  ) {
    const limit = Math.min(
      Math.max(parseInt(limitStr || '50', 10) || 50, 1),
      200,
    );
    return this.service.listSegmentCustomers(
      merchantId,
      segmentId,
      limit,
      cursor || undefined,
    );
  }

  @Get(':merchantId/segments/:segmentId/customers.csv')
  @ApiOkResponse({ description: 'Экспорт клиентов сегмента в CSV (стрим)' })
  async exportSegmentCustomersCsv(
    @Param('merchantId') merchantId: string,
    @Param('segmentId') segmentId: string,
    @Query('batch') batchStr: string = '1000',
    @Res() res: Response,
  ) {
    const batch = Math.min(Math.max(parseInt(batchStr, 10) || 1000, 100), 5000);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="segment_${segmentId}_customers.csv"`,
    );
    await this.service.exportSegmentCustomersCsv(
      merchantId,
      segmentId,
      res,
      batch,
    );
    res.end();
  }

  @Get(':merchantId/customer/:customerId/timeline')
  @ApiOkResponse({ description: 'Таймлайн клиента (последние события)' })
  async getCustomerTimeline(
    @Param('merchantId') merchantId: string,
    @Param('customerId') customerId: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit = Math.min(
      Math.max(parseInt(limitStr || '50', 10) || 50, 10),
      200,
    );
    return this.service.getCustomerTimeline(merchantId, customerId, limit);
  }
}
