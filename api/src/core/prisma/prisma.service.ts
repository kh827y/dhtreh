import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly slowQueryMs: number;

  constructor(private readonly config: AppConfigService) {
    const slowQueryMs =
      config.getNumber('PRISMA_SLOW_QUERY_MS', 0) ?? 0;
    super(
      slowQueryMs > 0 ? { log: [{ emit: 'event', level: 'query' }] } : {},
    );
    this.slowQueryMs = slowQueryMs;
    if (this.slowQueryMs > 0) {
      const on = this.$on as unknown as (
        event: string,
        cb: (payload: {
          duration: number;
          model?: string | null;
          action: string;
        }) => void,
      ) => void;
      on('query', (event) => {
        if (event.duration >= this.slowQueryMs) {
          const model = event.model ?? 'unknown';
          this.logger.warn(
            `slow prisma query: ${model}.${event.action} ${event.duration}ms`,
          );
        }
      });
    }
  }

  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
