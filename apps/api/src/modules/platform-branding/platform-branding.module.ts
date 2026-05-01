import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformBrandingSettings } from '@iwana/db';
import { AuditModule } from '../audit/audit.module';
import { MediaModule } from '../media/media.module';
import { PlatformBrandingController } from './platform-branding.controller';
import { PlatformBrandingService } from './platform-branding.service';

@Module({
  imports: [TypeOrmModule.forFeature([PlatformBrandingSettings]), MediaModule, AuditModule],
  controllers: [PlatformBrandingController],
  providers: [PlatformBrandingService],
  exports: [PlatformBrandingService],
})
export class PlatformBrandingModule {}
