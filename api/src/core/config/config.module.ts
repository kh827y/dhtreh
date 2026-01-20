import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './app-config.service';
import { ConfigCheckService } from './config-check.service';

@Global()
@Module({
  providers: [AppConfigService, ConfigCheckService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
