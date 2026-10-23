import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceProvisioning } from '@iwana/db';
import { SERVICE_PROVISIONING_COMMERCIAL_STATUS_PORT } from '../crm/ports/service-provisioning-commercial-status.port';
import { AuditModule } from '../audit/audit.module';
import { ServiceProvisioningCommercialStatusAdapter } from './adapters/service-provisioning-commercial-status.adapter';

@Module({
  imports: [AuditModule, TypeOrmModule.forFeature([ServiceProvisioning])],
  providers: [
    ServiceProvisioningCommercialStatusAdapter,
    {
      provide: SERVICE_PROVISIONING_COMMERCIAL_STATUS_PORT,
      useExisting: ServiceProvisioningCommercialStatusAdapter,
    },
  ],
  exports: [SERVICE_PROVISIONING_COMMERCIAL_STATUS_PORT],
})
export class NetworkCommercialStatusModule {}
