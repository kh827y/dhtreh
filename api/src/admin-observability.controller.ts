import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AdminIpGuard } from './admin-ip.guard';
import { OpsAlertMonitor } from './alerts/ops-alert-monitor.service';
import { AlertsService } from './alerts/alerts.service';
import { ConfigService } from '@nestjs/config';

@UseGuards(AdminGuard, AdminIpGuard)
@Controller()
export class AdminObservabilityController {
  constructor(
    private readonly monitor: OpsAlertMonitor,
    private readonly alerts: AlertsService,
    private readonly config: ConfigService,
  ) {}

  @Get('observability/summary')
  async summary() {
    const snapshot = await this.monitor.snapshot({ includeIncidents: true });
    const sentryEnabled = Boolean(this.config.get<string>('SENTRY_DSN'));
    const otelEnabled =
      this.config.get<string>('OTEL_ENABLED') === '1' ||
      Boolean(this.config.get<string>('OTEL_EXPORTER_OTLP_ENDPOINT'));
    return {
      ok: true,
      ...snapshot,
      telemetry: {
        prometheus: true,
        grafana: true,
        sentry: sentryEnabled,
        otel: otelEnabled,
      },
    };
  }

  @Get('alerts/state')
  async state() {
    return {
      ok: true,
      status: this.alerts.getStatus(),
      incidents: this.alerts.getRecent(),
    };
  }

  @Post('alerts/test')
  async test(@Body() body: any) {
    const text =
      typeof body?.text === 'string' && body.text.trim()
        ? body.text.trim()
        : 'Тестовое оповещение: админка';
    await this.alerts.notifyIncident({
      title: 'Тест оповещения',
      lines: [text],
      severity: 'info',
      throttleKey: `test:${text.slice(0, 16)}`,
      throttleMinutes: 0,
      force: true,
    });
    return { ok: true };
  }
}
