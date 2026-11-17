import { Module } from '@nestjs/common';
import { AccessControlModule } from '../../access-control/access-control.module';
import { TenantModule } from '../../tenant/tenant.module';
import { AssuranceDashboardSeriesController } from './assurance-dashboard-series.controller';
import { AssuranceDashboardSeriesService } from './assurance-dashboard-series.service';

/**
 * N3 del inicio del portal (HLD-MOD02 v3.0 §3 N3). Módulo propio dentro de assurance: solo lee
 * `support_tickets` del schema del tenant y la zona horaria por el puerto del módulo tenant.
 */
@Module({
  imports: [AccessControlModule, TenantModule],
  controllers: [AssuranceDashboardSeriesController],
  providers: [AssuranceDashboardSeriesService],
})
export class AssuranceDashboardSeriesModule {}
