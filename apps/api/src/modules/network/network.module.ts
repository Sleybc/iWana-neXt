import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  IpAssignment,
  Ipv4Network,
  NetworkInboxEvent,
  NetworkPlanProfile,
  NetworkRouter,
  NetworkRouterInterface,
  NetworkRouterInterfaceIpv4Address,
  NetworkSetting,
  ServiceProvisioning,
} from '@iwana/db';
import { NETWORK_EXECUTION_EVENTS_QUEUE } from '@iwana/shared';
import { AccessControlModule } from '../access-control/access-control.module';
import { OrganizationModule } from '../organization/organization.module';
import { TenantModule } from '../tenant/tenant.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ExecutionOrderSchedulingModule } from '../tasks/execution-order-scheduling.module';
import { SubscriberServiceContextReadModule } from '../crm/subscribers/subscriber-service-context-read.module';
import { InstalledEquipmentReadModule } from '../inventory/ports/installed-equipment-read.module';
import { TenantAwareThrottlerGuard } from '../tasks/guards/tenant-aware-throttler.guard';
import { IpamService } from './ipam.service';
import { NetworkCatalogController } from './network-catalog.controller';
import { NetworkCatalogService } from './network-catalog.service';
import { NetworkInterfaceCatalogService } from './network-interface-catalog.service';
import { NetworkAuthorizationFacade } from './authorization/network-authorization.facade';
import { NetworkTenantGuard } from './guards/network-tenant.guard';
import { NetworkActorReadAdapter } from './ports/network-actor-read.adapter';
import { NetworkActorReadPort } from './ports/network-actor-read.port';
import { ManualRouterProvisioningAdapter } from './adapters/manual-router-provisioning.adapter';
import { ROUTER_PROVISIONING_PORT } from './ports/router-provisioning.port';
import { NetworkProvisioningController } from './network-provisioning.controller';
import { ServiceProvisioningService } from './service-provisioning.service';
import { NetworkExecutionEventProcessor } from './network-execution-event.processor';
import {
  NETWORK_PROVISIONING_RECONCILE_QUEUE,
  NetworkProvisioningReconcilerProcessor,
} from './network-provisioning-reconciler.processor';
import { NETWORK_IP_PROTECTION_STATUS, resolveIpProtectionStatus } from './ip-protection-status';
import {
  NETWORK_RESERVATIONS_PAUSED,
  resolveReservationsPaused,
} from './network-reservations-state';

@Module({
  imports: [
    AuthModule,
    AccessControlModule,
    OrganizationModule,
    TenantModule,
    AuditModule,
    ExecutionOrderSchedulingModule,
    SubscriberServiceContextReadModule,
    InstalledEquipmentReadModule,
    BullModule.registerQueue(
      { name: NETWORK_EXECUTION_EVENTS_QUEUE },
      { name: NETWORK_PROVISIONING_RECONCILE_QUEUE },
    ),
    TypeOrmModule.forFeature([
      IpAssignment,
      NetworkInboxEvent,
      NetworkRouter,
      NetworkRouterInterface,
      NetworkRouterInterfaceIpv4Address,
      Ipv4Network,
      NetworkPlanProfile,
      NetworkSetting,
      ServiceProvisioning,
    ]),
  ],
  controllers: [NetworkCatalogController, NetworkProvisioningController],
  providers: [
    IpamService,
    {
      provide: NETWORK_IP_PROTECTION_STATUS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        resolveIpProtectionStatus(config.get<unknown>('NETWORK_IP_PROTECTION')),
    },
    {
      provide: NETWORK_RESERVATIONS_PAUSED,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        resolveReservationsPaused(config.get<unknown>(NETWORK_RESERVATIONS_PAUSED)),
    },
    NetworkCatalogService,
    NetworkInterfaceCatalogService,
    NetworkAuthorizationFacade,
    NetworkTenantGuard,
    NetworkActorReadAdapter,
    { provide: NetworkActorReadPort, useExisting: NetworkActorReadAdapter },
    ManualRouterProvisioningAdapter,
    { provide: ROUTER_PROVISIONING_PORT, useExisting: ManualRouterProvisioningAdapter },
    ServiceProvisioningService,
    TenantAwareThrottlerGuard,
    NetworkExecutionEventProcessor,
    NetworkProvisioningReconcilerProcessor,
  ],
})
export class NetworkModule {}
