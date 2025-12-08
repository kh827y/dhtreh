import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AnalyticsAggregatorWorker } from '../src/analytics/analytics-aggregator.worker';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const worker = app.get(AnalyticsAggregatorWorker);
  const merchantId = process.argv.includes('--merchant')
    ? process.argv[process.argv.indexOf('--merchant') + 1]
    : undefined;

  if (merchantId) {
    console.log(`Recalculating RFM for merchant ${merchantId}`);
    await worker.recalculateCustomerStatsForMerchant(merchantId);
  } else {
    console.log('Running full analytics aggregation tick (aggregateForDate today)');
    await worker.aggregateForDate(new Date());
  }

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
