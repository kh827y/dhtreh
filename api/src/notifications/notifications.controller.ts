import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { NotificationsService, type BroadcastArgs } from './notifications.service';
import { AdminGuard } from '../admin.guard';
import { AdminIpGuard } from '../admin-ip.guard';

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(AdminGuard, AdminIpGuard)
@ApiHeader({ name: 'X-Admin-Key', required: true })
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Post('broadcast')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  async broadcast(@Body() body: BroadcastArgs) {
    return this.svc.broadcast(body);
  }

  @Post('test')
  @ApiOkResponse({ schema: { type: 'object', properties: { ok: { type: 'boolean' } } } })
  async test(@Body() body: { merchantId: string; channel: 'EMAIL'|'PUSH'|'SMS'; to: string; template?: { subject?: string; text?: string; html?: string } }) {
    return this.svc.test(body.merchantId, body.channel, body.to, body.template);
  }
}
