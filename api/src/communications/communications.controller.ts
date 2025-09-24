import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { PortalGuard } from '../portal-auth/portal.guard';
import { CommunicationsService } from './communications.service';
import type { TaskPayload, TemplatePayload } from './communications.service';
import { CommunicationChannel } from '@prisma/client';

@Controller('portal/communications')
@UseGuards(PortalGuard)
export class CommunicationsController {
  constructor(private readonly service: CommunicationsService) {}

  private merchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get('templates')
  listTemplates(@Req() req: any, @Query('channel') channel?: CommunicationChannel | 'ALL') {
    return this.service.listTemplates(this.merchantId(req), channel);
  }

  @Post('templates')
  createTemplate(@Req() req: any, @Body() body: TemplatePayload) {
    return this.service.createTemplate(this.merchantId(req), body);
  }

  @Put('templates/:id')
  updateTemplate(@Req() req: any, @Param('id') id: string, @Body() body: TemplatePayload) {
    return this.service.updateTemplate(this.merchantId(req), id, body);
  }

  @Post('templates/:id/archive')
  archiveTemplate(@Req() req: any, @Param('id') id: string) {
    return this.service.archiveTemplate(this.merchantId(req), id);
  }

  @Get('tasks')
  listTasks(@Req() req: any, @Query() query: { channel?: CommunicationChannel | 'ALL'; status?: string }) {
    return this.service.listTasks(this.merchantId(req), query.channel, query.status);
  }

  @Post('tasks')
  createTask(@Req() req: any, @Body() body: TaskPayload) {
    return this.service.createTask(this.merchantId(req), body);
  }

  @Post('tasks/:id/status')
  updateStatus(@Req() req: any, @Param('id') id: string, @Body() body: { status: string }) {
    return this.service.updateTaskStatus(this.merchantId(req), id, body.status);
  }

  @Get('tasks/:id/recipients')
  recipients(@Req() req: any, @Param('id') id: string) {
    return this.service.getTaskRecipients(this.merchantId(req), id);
  }
}
