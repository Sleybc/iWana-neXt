import { Module } from '@nestjs/common';
import { ConfigurationController } from './configuration.controller';
import { SettingsRegistryService } from './services/settings-registry.service';

@Module({
  controllers: [ConfigurationController],
  providers: [SettingsRegistryService],
  exports: [SettingsRegistryService],
})
export class ConfigurationModule {}
