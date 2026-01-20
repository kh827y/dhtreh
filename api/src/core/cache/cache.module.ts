import { Global, Module } from '@nestjs/common';
import { LookupCacheService } from './lookup-cache.service';

@Global()
@Module({
  providers: [LookupCacheService],
  exports: [LookupCacheService],
})
export class CacheModule {}
