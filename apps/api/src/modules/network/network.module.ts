import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Ipv4Network,
  NetworkPlanProfile,
  NetworkRouter,
  NetworkSetting,
  ServiceProvisioning,
} from '@iwana/db';
import { NETWORK_EXECUTION_EVENTS_QUEUE } from '@iwana/shared';
import { AccessControlModule } from '../access-control/access-control.module';
import { SERVICE_PROVISIONING_COMMERCIAL_STATUS_PORT } from '../crm/ports/service-provisioning-commercial-status.port';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ExecutionOrderSchedulingModule } from '../tasks/execution-order-scheduling.module';
import { SubscriberServiceContextReadModule } from '../crm/subscribers/subscriber-service-context-read.module';
import { InstalledEquipmentReadModule } from '../inventory/ports/installed-equipment-read.module';
import { TenantAwareThrottlerGuard } from '../tasks/guards/tenant-aware-throttler.guard';
import { IpamService } from './ipam.service';
import { NetworkCatalogController } from './network-catalog.controller';
import { NetworkCatalogService } from './network-catalog.service';
import { NetworkTenantGuard } from './guards/network-tenant.guard';
import { NetworkActorReadAdapter } from './ports/network-actor-read.adapter';
import { NetworkActorReadPort } from './ports/network-actor-read.port';
import { ManualRouterProvisioningAdapter } from './adapters/manual-router-provisioning.adapter';
import { ROUTER_PROVISIONING_PORT } from './ports/router-provisioning.port';
import { NetworkProvisioningController } from './network-provisioning.controller';
import { ServiceProvisioningService } from './service-provisioning.service';
import { ServiceProvisioningCommercialStatusAdapter } from './adapters/service-provisioning-commercial-status.adapter';
import { NetworkExecutionEventProcessor } from './network-execution-event.processor';
import {
  NETWORK_PROVISIONING_RECONCILE_QUEUE,
  NetworkProvisioningReconcilerProcessor,
} from './network-provisioning-reconciler.processor';

@Module({
  imports: [
    AuthModule,
    AccessControlModule,
    AuditModule,
    ExecutionOrderSchedulingModule,
    SubscriberServiceContextReadModule,
    InstalledEquipmentReadModule,
    BullModule.registerQueue(
      { name: NETWORK_EXECUTION_EVENTS_QUEUE },
      { name: NETWORK_PROVISIONING_RECONCILE_QUEUE },
    ),
    TypeOrmModule.forFeature([
      NetworkRouter,
      Ipv4Network,
      NetworkPlanProfile,
      NetworkSetting,
      ServiceProvisioning,
    ]),
  ],
  controllers: [NetworkCatalogController, NetworkProvisioningController],
  providers: [
    IpamService,
    NetworkCatalogService,
    NetworkTenantGuard,
    NetworkActorReadAdapter,
    { provide: NetworkActorReadPort, useExisting: NetworkActorReadAdapter },
    ManualRouterProvisioningAdapter,
    { provide: ROUTER_PROVISIONING_PORT, useExisting: ManualRouterProvisioningAdapter },
    ServiceProvisioningService,
    TenantAwareThrottlerGuard,
    NetworkExecutionEventProcessor,
    NetworkProvisioningReconcilerProcessor,
    ServiceProvisioningCommercialStatusAdapter,
    {
      provide: SERVICE_PROVISIONING_COMMERCIAL_STATUS_PORT,
      useExisting: ServiceProvisioningCommercialStatusAdapter,
    },
  ],
  exports: [SERVICE_PROVISIONING_COMMERCIAL_STATUS_PORT],
})
export class NetworkModule {}
