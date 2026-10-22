import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NetworkSetting, ServiceProvisioning } from '@iwana/db';
import { SERVICE_PROVISIONING_READ_PORT } from '../tasks/ports/service-provisioning-read.port';
import { ServiceProvisioningReadAdapter } from './adapters/service-provisioning-read.adapter';

@Module({
  imports: [TypeOrmModule.forFeature([NetworkSetting, ServiceProvisioning])],
  providers: [
    ServiceProvisioningReadAdapter,
    { provide: SERVICE_PROVISIONING_READ_PORT, useExisting: ServiceProvisioningReadAdapter },
  ],
  exports: [SERVICE_PROVISIONING_READ_PORT],
})
export class NetworkProvisioningReadModule {}
