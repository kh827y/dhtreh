import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Controller()
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get('healthz')
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  @Get('readyz')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      // можно добавить проверку иных зависимостей (очередей и т.д.)
      return { ready: true };
    } catch (e: any) {
      return { ready: false, error: String(e?.message || e) };
    }
  }
}

