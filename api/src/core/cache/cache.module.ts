import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AppConfigModule } from '../config/config.module';
import { LookupCacheService } from './lookup-cache.service';

@Global()
@Module({
  imports: [PrismaModule, AppConfigModule],
  providers: [LookupCacheService],
  exports: [LookupCacheService],
})
export class CacheModule {}
