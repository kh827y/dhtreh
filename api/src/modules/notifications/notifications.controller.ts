import { Body, Controller, Post, UseGuards, Req, Logger } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  NotificationsService,
  type BroadcastArgs,
} from './notifications.service';
import { AdminGuard } from '../../core/guards/admin.guard';
import { AdminIpGuard } from '../../core/guards/admin-ip.guard';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { safeExecAsync } from '../../shared/safe-exec';

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(AdminGuard, AdminIpGuard)
@ApiHeader({ name: 'X-Admin-Key', required: true })
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(
    private readonly svc: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('broadcast')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  async broadcast(@Body() body: BroadcastArgs, @Req() _req: any) {
    const res = await this.svc.broadcast(body);
    await safeExecAsync(
      () =>
        this.prisma.adminAudit.create({
          data: {
            actor: 'admin',
            method: 'POST',
            path: '/notifications/broadcast',
            merchantId: body.merchantId,
            action: body.dryRun ? 'broadcast.dryrun' : 'broadcast.enqueue',
            payload: {
              channel: body.channel,
              segmentId: body.segmentId ?? null,
              template: body.template ?? null,
              variables: (body.variables ?? null) as Prisma.InputJsonValue,
            },
          },
        }),
      async () => undefined,
      this.logger,
      'admin audit write failed',
    );
    return res;
  }

  @Post('test')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  async test(
    @Body()
    body: {
      merchantId: string;
      channel: 'EMAIL' | 'PUSH';
      to: string;
      template?: { subject?: string; text?: string; html?: string };
    },
    @Req() _req: any,
  ) {
    const res = await this.svc.test(
      body.merchantId,
      body.channel,
      body.to,
      body.template,
    );
    await safeExecAsync(
      () =>
        this.prisma.adminAudit.create({
          data: {
            actor: 'admin',
            method: 'POST',
            path: '/notifications/test',
            merchantId: body.merchantId,
            action: 'test.enqueue',
            payload: { channel: body.channel, to: body.to },
          },
        }),
      async () => undefined,
      this.logger,
      'admin audit write failed',
    );
    return res;
  }
}
