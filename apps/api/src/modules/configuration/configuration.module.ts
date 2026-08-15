import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { OrganizationModule } from '../organization/organization.module';
import { TenantModule } from '../tenant/tenant.module';
import { UsersModule } from '../users/users.module';
import { ConfigurationController } from './configuration.controller';
import { SettingsRegistryService } from './services/settings-registry.service';
import { SettingsPriorityService } from './services/settings-priority.service';

@Module({
  imports: [AccessControlModule, TenantModule, UsersModule, OrganizationModule],
  controllers: [ConfigurationController],
  providers: [SettingsRegistryService, SettingsPriorityService],
  exports: [SettingsRegistryService],
})
export class ConfigurationModule {}
