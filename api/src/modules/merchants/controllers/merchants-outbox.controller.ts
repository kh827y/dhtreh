import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminGuard } from '../../../core/guards/admin.guard';
import { AdminIpGuard } from '../../../core/guards/admin-ip.guard';
import { AdminAuditInterceptor } from '../../admin/admin-audit.interceptor';
import { ErrorDto, TransactionItemDto } from '../../loyalty/dto/dto';
import {
  BulkUpdateRespDto,
  OkDto,
  OutboxEventDto,
  OutboxPauseDto,
  OutboxRetrySinceDto,
} from '../dto';
import { MerchantsOutboxUseCase } from '../use-cases/merchants-outbox.use-case';

@Controller('merchants')
@UseGuards(AdminGuard, AdminIpGuard)
@UseInterceptors(AdminAuditInterceptor)
@ApiTags('merchants')
@ApiHeader({
  name: 'X-Admin-Key',
  required: true,
  description: 'Админ-ключ (в проде проксируется сервером админки)',
})
@ApiExtraModels(TransactionItemDto)
export class MerchantsOutboxController {
  constructor(private readonly useCase: MerchantsOutboxUseCase) {}

  // Outbox monitor
  @Get(':id/outbox')
  @ApiOkResponse({ type: OutboxEventDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  listOutbox(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('limit') limitStr?: string,
    @Query('type') type?: string,
    @Query('since') since?: string,
  ) {
    return this.useCase.listOutbox(id, status, limitStr, type, since);
  }

  @Post(':id/outbox/:eventId/retry')
  @ApiOkResponse({ type: OkDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  retryOutbox(@Param('id') id: string, @Param('eventId') eventId: string) {
    return this.useCase.retryOutbox(id, eventId);
  }

  @Delete(':id/outbox/:eventId')
  @ApiOkResponse({ type: OkDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  deleteOutbox(@Param('id') id: string, @Param('eventId') eventId: string) {
    return this.useCase.deleteOutbox(id, eventId);
  }

  @Post(':id/outbox/retryAll')
  @ApiOkResponse({ type: BulkUpdateRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  retryAll(@Param('id') id: string, @Query('status') status?: string) {
    return this.useCase.retryAll(id, status);
  }

  @Get(':id/outbox/event/:eventId')
  @ApiOkResponse({ type: OutboxEventDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  getOutboxEvent(@Param('id') id: string, @Param('eventId') eventId: string) {
    return this.useCase.getOutboxEvent(id, eventId);
  }

  @Post(':id/outbox/retrySince')
  @ApiOkResponse({ type: BulkUpdateRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  retrySince(@Param('id') id: string, @Body() body: OutboxRetrySinceDto) {
    return this.useCase.retrySince(id, body);
  }

  @Post(':id/outbox/pause')
  @ApiOkResponse({ type: OkDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  pauseOutbox(@Param('id') id: string, @Body() body: OutboxPauseDto) {
    return this.useCase.pauseOutbox(id, body);
  }

  @Post(':id/outbox/resume')
  @ApiOkResponse({ type: OkDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  resumeOutbox(@Param('id') id: string) {
    return this.useCase.resumeOutbox(id);
  }

  @Get(':id/outbox/stats')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        merchantId: { type: 'string' },
        since: { type: 'string', nullable: true },
        counts: { type: 'object', additionalProperties: { type: 'number' } },
        lastDeadAt: { type: 'string', nullable: true },
      },
    },
  })
  outboxStats(@Param('id') id: string, @Query('since') sinceStr?: string) {
    return this.useCase.outboxStats(id, sinceStr);
  }

  @Get(':id/outbox.csv')
  @ApiOkResponse({ schema: { type: 'string', description: 'CSV (streamed)' } })
  async outboxCsv(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('status') status?: string,
    @Query('since') since?: string,
    @Query('type') type?: string,
    @Query('limit') limitStr?: string,
    @Query('batch') batchStr: string = '1000',
  ) {
    return this.useCase.outboxCsv(id, res, {
      status,
      since,
      type,
      limitStr,
      batchStr,
    });
  }

  @Get(':id/outbox/by-order')
  @ApiOkResponse({ type: OutboxEventDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  async outboxByOrder(
    @Param('id') id: string,
    @Query('orderId') orderId: string,
    @Query('limit') limitStr?: string,
  ) {
    return this.useCase.outboxByOrder(id, orderId, limitStr);
  }
}
