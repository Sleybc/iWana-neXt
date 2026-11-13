import { Module } from '@nestjs/common';
import { ExecutionOrderConsumptionReadAdapter } from './execution-order-consumption-read.adapter';
import { ExecutionOrderConsumptionReadPort } from './execution-order-consumption-read.port';

/** Módulo fino de MOD11: consumo de la OT de instalación cerrada para MOD14. */
@Module({
  providers: [
    ExecutionOrderConsumptionReadAdapter,
    {
      provide: ExecutionOrderConsumptionReadPort,
      useExisting: ExecutionOrderConsumptionReadAdapter,
    },
  ],
  exports: [ExecutionOrderConsumptionReadPort],
})
export class ExecutionOrderConsumptionReadModule {}
