import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import { PrismaService } from '../core/prisma/prisma.service';
import type { Response } from 'express';
import { logIgnoredError } from '../shared/logging/ignore-error.util';

@Controller()
@ApiTags('health')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @ApiOkResponse({ description: 'Health check' })
  async getHealth(@Res({ passthrough: true }) res: Response) {
    const timestamp = new Date().toISOString();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      res.status(200);
      return { status: 'ok', timestamp, checks: { database: 'ok' } };
    } catch (err) {
      logIgnoredError(err, 'AppController health', undefined, 'debug');
      res.status(503);
      return { status: 'error', timestamp, checks: { database: 'failed' } };
    }
  }

  @Get('ready')
  @ApiOkResponse({ description: 'Readiness check' })
  async getReady(@Res({ passthrough: true }) res: Response) {
    const timestamp = new Date().toISOString();
    let dbOk = false;
    try {
      // Check database connectivity
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (err) {
      logIgnoredError(err, 'AppController ready', undefined, 'debug');
    }
    const status = dbOk ? 'ready' : 'not_ready';
    res.status(dbOk ? 200 : 503);
    return {
      status,
      timestamp,
      checks: { database: dbOk ? 'ok' : 'failed' },
    };
  }

  @Get('live')
  @ApiOkResponse({ description: 'Liveness check' })
  getLive() {
    return { status: 'alive', timestamp: new Date().toISOString() };
  }
}
