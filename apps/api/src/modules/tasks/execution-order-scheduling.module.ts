import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ExecutionOrder,
  ExecutionOrderTemplate,
  ExecutionOrderTemplateRequirement,
  ExecutionOrderTemplateVersion,
} from '@iwana/db';
import { EXECUTION_ORDER_SCHEDULING_PORT } from './ports/execution-order-scheduling.port';
import { EXECUTION_ORDER_READ_PORT } from './ports/execution-order-read.port';
import { ExecutionOrderTemplatesService } from './services/execution-order-templates.service';
import { ExecutionOrdersService } from './services/execution-orders.service';

/**
 * Módulo fino de puertos de lectura y scheduling de MOD11.
 *
 * Expone los contratos tipados sin importar `TasksModule`, `AssuranceModule`
 * ni CRM. WFM consume el puerto de scheduling (ADR-047) y CRM puede consultar
 * la existencia de OT de retiro sin cerrar un ciclo de módulos.
 *
 * `TasksModule` sigue siendo el owner HTTP/completo de OT; este módulo solo
 * cablea el puerto de scheduling con las dependencias mínimas (las demás
 * inyecciones de `ExecutionOrdersService` son `@Optional()`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExecutionOrder,
      ExecutionOrderTemplate,
      ExecutionOrderTemplateVersion,
      ExecutionOrderTemplateRequirement,
    ]),
  ],
  providers: [
    ExecutionOrderTemplatesService,
    ExecutionOrdersService,
    { provide: EXECUTION_ORDER_SCHEDULING_PORT, useExisting: ExecutionOrdersService },
    { provide: EXECUTION_ORDER_READ_PORT, useExisting: ExecutionOrdersService },
  ],
  exports: [EXECUTION_ORDER_SCHEDULING_PORT, EXECUTION_ORDER_READ_PORT],
})
export class ExecutionOrderSchedulingModule {}
