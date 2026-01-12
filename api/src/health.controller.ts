import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from './prisma.service';

@Controller()
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get('healthz')
  async health(@Res({ passthrough: true }) res: Response) {
    const now = new Date().toISOString();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      res.status(200);
      return {
        ok: true,
        ts: now,
      };
    } catch (e: any) {
      res.status(503);
      return {
        ok: false,
        ts: now,
      };
    }
  }

  @Get('readyz')
  async ready(@Res({ passthrough: true }) res: Response) {
    const now = new Date().toISOString();
    let dbOk = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {}
    let migrationsOk = true;
    if (dbOk) {
      try {
        await this.prisma.$queryRawUnsafe<any[]>(
          'SELECT COUNT(*)::int as c FROM _prisma_migrations WHERE applied_steps_count > 0',
        );
      } catch {
        migrationsOk = false;
      }
    }
    const ready = dbOk && migrationsOk;
    res.status(ready ? 200 : 503);
    return {
      ready,
      ts: now,
      checks: {
        database: dbOk,
        migrations: migrationsOk,
      },
    };
  }
}
