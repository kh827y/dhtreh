import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import { Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

const config = new AppConfigService();
const enabled = config.getOtelEnabled();
if (enabled) {
  const logger = new Logger('otel');
  const serviceName = config.getOtelServiceName();
  const serviceVersion = config.getAppVersion();
  const endpoint = config.getOtelExporterEndpoint();

  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
        config.getNodeEnv(),
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
      new PrismaInstrumentation(),
    ],
  });

  try {
    sdk.start();

    logger.log('Tracing initialized');
  } catch (err) {
    logger.error(
      'Tracing init error',
      err instanceof Error ? err.stack : String(err),
    );
  }

  const shutdown = () => {
    sdk.shutdown().catch(() => {});
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
