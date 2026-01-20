import {
  Controller,
  Get,
  Header,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { MetricsService } from './metrics.service';
import type { Request } from 'express';
import { AppConfigService } from '../config/app-config.service';

@Controller()
export class MetricsController {
  constructor(
    private metrics: MetricsService,
    private readonly config: AppConfigService,
  ) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4')
  async metricsEndpoint(@Req() req: Request): Promise<string> {
    const token = this.config.getString('METRICS_TOKEN', '') ?? '';
    const requireToken = this.config.getString('NODE_ENV') === 'production';
    if (requireToken && !token) {
      throw new UnauthorizedException('Metrics token required');
    }
    if (token) {
      const got = (req.headers['x-metrics-token'] as string | undefined) || '';
      const auth = req.headers['authorization'] || '';
      const bearer = auth.startsWith('Bearer ')
        ? auth.slice('Bearer '.length)
        : '';
      if (got !== token && bearer !== token) {
        throw new UnauthorizedException('Metrics token required');
      }
    }
    return await this.metrics.exportProm();
  }
}
