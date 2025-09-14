import { Controller, Get, Header, Req, UnauthorizedException } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import type { Request } from 'express';

@Controller()
export class MetricsController {
  constructor(private metrics: MetricsService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4')
  async metricsEndpoint(@Req() req: Request): Promise<string> {
    const token = process.env.METRICS_TOKEN || '';
    if (token) {
      const got = (req.headers['x-metrics-token'] as string | undefined) || '';
      const auth = (req.headers['authorization'] as string | undefined) || '';
      const bearer = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
      if (got !== token && bearer !== token) {
        throw new UnauthorizedException('Metrics token required');
      }
    }
    return await this.metrics.exportProm();
  }
}
