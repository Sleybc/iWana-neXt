import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ipv4Network, NetworkPlanProfile, NetworkRouter, NetworkSetting } from '@iwana/db';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { IpamService } from './ipam.service';
import { NetworkCatalogController } from './network-catalog.controller';
import { NetworkCatalogService } from './network-catalog.service';
import { NetworkTenantGuard } from './guards/network-tenant.guard';
import { NetworkActorReadAdapter } from './ports/network-actor-read.adapter';
import { NetworkActorReadPort } from './ports/network-actor-read.port';

@Module({
  imports: [
    AuthModule,
    AccessControlModule,
    AuditModule,
    TypeOrmModule.forFeature([NetworkRouter, Ipv4Network, NetworkPlanProfile, NetworkSetting]),
  ],
  controllers: [NetworkCatalogController],
  providers: [
    IpamService,
    NetworkCatalogService,
    NetworkTenantGuard,
    NetworkActorReadAdapter,
    { provide: NetworkActorReadPort, useExisting: NetworkActorReadAdapter },
  ],
  exports: [IpamService, NetworkCatalogService, NetworkActorReadPort],
})
export class NetworkModule {}
