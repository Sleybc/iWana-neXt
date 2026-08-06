import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ExecutionOrder,
  ExecutionOrderTemplate,
  ExecutionOrderTemplateRequirement,
  ExecutionOrderTemplateVersion,
} from '@iwana/db';
import { EXECUTION_ORDER_SCHEDULING_PORT } from './ports/execution-order-scheduling.port';
import { ExecutionOrderTemplatesService } from './services/execution-order-templates.service';
import { ExecutionOrdersService } from './services/execution-orders.service';

/**
 * Módulo fino del puerto MOD09→MOD11 (ADR-047).
 *
 * Expone `EXECUTION_ORDER_SCHEDULING_PORT` sin importar `AssuranceModule`,
 * de modo que `WfmModule` puede consumir el contrato tipado sin cerrar el
 * ciclo Health → Tasks → Assurance → Wfm → Tasks.
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
  ],
  exports: [EXECUTION_ORDER_SCHEDULING_PORT],
})
export class ExecutionOrderSchedulingModule {}
