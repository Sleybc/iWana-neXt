import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { ExecutionOrderResult, InventoryDisposition, WfmWorkType } from '@iwana/shared';
import type { DataSource } from 'typeorm';
import {
  ExecutionOrderConsumptionReadPort,
  type ClosedInstallationConsumption,
} from './execution-order-consumption-read.port';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Resultados que cuentan como instalación ejecutada (ADR-098 D5, ADR-099 E1). */
const EXECUTED_RESULTS = [
  ExecutionOrderResult.EXECUTED,
  ExecutionOrderResult.EXECUTED_WITH_OBSERVATIONS,
  ExecutionOrderResult.REQUIRES_FOLLOW_UP,
];

const CONSUMED_DISPOSITIONS = [
  InventoryDisposition.INSTALLED_AT_CUSTOMER,
  InventoryDisposition.INTERNAL_CONSUMPTION,
];

interface OrderRow {
  id: string;
  execution_order_number: string;
  subscriber_id: string | null;
  closed_at: Date | string;
}

interface LineRow {
  item_id: string;
  quantity: number;
  serial_number: string | null;
  final_disposition: InventoryDisposition;
}

@Injectable()
export class ExecutionOrderConsumptionReadAdapter extends ExecutionOrderConsumptionReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async getClosedInstallationConsumption(
    executionOrderId: string,
  ): Promise<ClosedInstallationConsumption | null> {
    if (!UUID_PATTERN.test(executionOrderId)) return null;
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const orders = (await qr.query(
        `SELECT id::text AS id, execution_order_number, subscriber_id, closed_at
           FROM execution_orders
          WHERE tenant_id = $1 AND id = $2
            AND work_type = $3
            AND is_annulled = false
            AND closed_at IS NOT NULL
            AND result::text = ANY($4::text[])`,
        [tenantId, executionOrderId, WfmWorkType.INSTALLATION, EXECUTED_RESULTS],
      )) as OrderRow[];
      const order = orders[0];
      if (!order) return null;

      // Mismo criterio que el cierre: los reversos confirmados no cuentan. Un movimiento que
      // MOD12 rechazó no consumió nada.
      const lines = (await qr.query(
        `SELECT u.item_id, u.quantity, u.serial_number, u.final_disposition
           FROM execution_order_item_usage u
          WHERE u.tenant_id = $1 AND u.execution_order_id = $2
            AND u.final_disposition::text = ANY($3::text[])
            AND u.movement_status IS DISTINCT FROM 'REJECTED'
            AND NOT EXISTS (
              SELECT 1 FROM execution_order_item_usage_reversals r
               WHERE r.tenant_id = u.tenant_id AND r.item_usage_id = u.id
                 AND r.status = 'CONFIRMED')
          ORDER BY u.created_at ASC, u.id ASC`,
        [tenantId, executionOrderId, CONSUMED_DISPOSITIONS],
      )) as LineRow[];

      return {
        executionOrderId: order.id,
        executionOrderNumber: order.execution_order_number,
        subscriberId: order.subscriber_id,
        closedAt: new Date(order.closed_at).toISOString(),
        lines: lines.map((line) => ({
          itemId: line.item_id,
          quantity: Number(line.quantity),
          serialNumber: line.serial_number,
          finalDisposition: line.final_disposition,
        })),
      };
    });
  }
}
