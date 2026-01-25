import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly slowQueryMs: number;
  private readonly logSlowQuerySql: boolean;
  private readonly logSlowQueryParams: boolean;

  constructor(private readonly config: AppConfigService) {
    const slowQueryMs = config.getNumber('PRISMA_SLOW_QUERY_MS', 0) ?? 0;
    const logSlowQuerySql =
      config.getBoolean('PRISMA_SLOW_QUERY_LOG_SQL') ?? false;
    const logSlowQueryParams =
      config.getBoolean('PRISMA_SLOW_QUERY_LOG_PARAMS') ?? false;
    super(slowQueryMs > 0 ? { log: [{ emit: 'event', level: 'query' }] } : {});
    this.slowQueryMs = slowQueryMs;
    this.logSlowQuerySql = logSlowQuerySql;
    this.logSlowQueryParams = logSlowQueryParams;
    if (this.slowQueryMs > 0) {
      const on = this.$on as unknown as (
        event: string,
        cb: (payload: {
          duration: number;
          query?: string;
          params?: string;
          model?: string | null;
          action?: string | null;
          target?: string;
        }) => void,
      ) => void;
      on('query', (event) => {
        if (event.duration >= this.slowQueryMs) {
          const label =
            event.model && event.action
              ? `${event.model}.${event.action}`
              : event.target || 'query';
          let message = `slow prisma query: ${label} ${event.duration}ms`;
          if (this.logSlowQuerySql && event.query) {
            const preview =
              event.query.length > 1000
                ? `${event.query.slice(0, 1000)}...`
                : event.query;
            message += ` sql="${preview}"`;
            if (this.logSlowQueryParams && event.params) {
              message += ` params=${event.params}`;
            }
          }
          this.logger.warn(message);
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
