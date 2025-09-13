import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SegmentService } from './segment.service';
import type { CreateSegmentDto } from './segment.service';
import { ApiKeyGuard } from '../guards/api-key.guard';

@ApiTags('Customer Segments')
@Controller('segments')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class SegmentController {
  constructor(private readonly segmentService: SegmentService) {}

  /**
   * Создать новый сегмент
   */
  @Post()
  @ApiOperation({ summary: 'Создать сегмент клиентов' })
  @ApiResponse({ status: 201, description: 'Сегмент создан' })
  async createSegment(@Body() dto: CreateSegmentDto) {
    return this.segmentService.createSegment(dto);
  }

  /**
   * Получить список сегментов
   */
  @Get('merchant/:merchantId')
  @ApiOperation({ summary: 'Получить список сегментов мерчанта' })
  @ApiResponse({ status: 200, description: 'Список сегментов' })
  async getSegments(@Param('merchantId') merchantId: string) {
    return this.segmentService.getSegments(merchantId);
  }

  /**
   * Получить детали сегмента
   */
  @Get(':segmentId')
  @ApiOperation({ summary: 'Получить информацию о сегменте' })
  @ApiResponse({ status: 200, description: 'Информация о сегменте' })
  @ApiResponse({ status: 404, description: 'Сегмент не найден' })
  async getSegment(@Param('segmentId') segmentId: string) {
    return this.segmentService.getSegment(segmentId);
  }

  /**
   * Обновить сегмент
   */
  @Put(':segmentId')
  @ApiOperation({ summary: 'Обновить сегмент' })
  @ApiResponse({ status: 200, description: 'Сегмент обновлен' })
  @ApiResponse({ status: 404, description: 'Сегмент не найден' })
  async updateSegment(
    @Param('segmentId') segmentId: string,
    @Body() dto: Partial<CreateSegmentDto>,
  ) {
    return this.segmentService.updateSegment(segmentId, dto);
  }

  /**
   * Добавить клиентов в сегмент
   */
  @Post(':segmentId/customers')
  @ApiOperation({ summary: 'Добавить клиентов в статический сегмент' })
  @ApiResponse({ status: 200, description: 'Клиенты добавлены' })
  async addCustomers(
    @Param('segmentId') segmentId: string,
    @Body() dto: { customerIds: string[] },
  ) {
    return this.segmentService.addCustomersToSegment(segmentId, dto.customerIds);
  }

  /**
   * Удалить клиентов из сегмента
   */
  @Delete(':segmentId/customers')
  @ApiOperation({ summary: 'Удалить клиентов из статического сегмента' })
  @ApiResponse({ status: 200, description: 'Клиенты удалены' })
  async removeCustomers(
    @Param('segmentId') segmentId: string,
    @Body() dto: { customerIds: string[] },
  ) {
    return this.segmentService.removeCustomersFromSegment(segmentId, dto.customerIds);
  }

  /**
   * Пересчитать динамический сегмент
   */
  @Post(':segmentId/recalculate')
  @ApiOperation({ summary: 'Пересчитать динамический сегмент' })
  @ApiResponse({ status: 200, description: 'Сегмент пересчитан' })
  async recalculateSegment(@Param('segmentId') segmentId: string) {
    return this.segmentService.recalculateSegment(segmentId);
  }

  /**
   * Создать стандартные сегменты
   */
  @Post('merchant/:merchantId/defaults')
  @ApiOperation({ summary: 'Создать стандартные сегменты для мерчанта' })
  @ApiResponse({ status: 201, description: 'Сегменты созданы' })
  async createDefaultSegments(@Param('merchantId') merchantId: string) {
    return this.segmentService.createDefaultSegments(merchantId);
  }
}
