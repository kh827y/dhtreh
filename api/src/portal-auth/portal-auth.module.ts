import { Module } from '@nestjs/common';
import { PortalAuthController } from './portal-auth.controller';
import { PrismaModule } from '../prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PortalAuthController],
})
export class PortalAuthModule {}
