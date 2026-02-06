import { Body, Controller, Post, UseGuards, Req, Logger } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { AdminGuard } from '../../core/guards/admin.guard';
import { AdminIpGuard } from '../../core/guards/admin-ip.guard';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { safeExecAsync } from '../../shared/safe-exec';
import { NotificationsBroadcastDto, NotificationsTestDto } from './dto';

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
  async broadcast(@Body() body: NotificationsBroadcastDto, @Req() _req: any) {
    const templatePayload = body.template ? { ...body.template } : null;
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
              template: (templatePayload ?? null) as Prisma.InputJsonValue,
              variables: (body.variables ?? null) as Prisma.InputJsonValue,
            },
          },
        }),
      () => undefined,
      this.logger,
      'admin audit write failed',
    );
    return res;
  }

  @Post('test')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  async test(@Body() body: NotificationsTestDto, @Req() _req: any) {
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
      () => undefined,
      this.logger,
      'admin audit write failed',
    );
    return res;
  }
}
