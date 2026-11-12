import { Injectable } from '@nestjs/common';
import {
  MigrationWorkOrderReferencesPort,
  type MigrationBatchEntityIds,
  type MigrationReadContext,
} from '../../migration/ports/migration-import.ports';

/**
 * Lectura de órdenes de trabajo para la reversión de un lote de importación (ADR-110 D7):
 * una OT sobre un titular importado bloquea la reversión. Solo cuenta; no devuelve datos.
 */
@Injectable()
export class TasksMigrationReferencesAdapter extends MigrationWorkOrderReferencesPort {
  async countReferences(ctx: MigrationReadContext, ids: MigrationBatchEntityIds): Promise<number> {
    if (ids.subscriberIds.length === 0) return 0;
    const rows = (await ctx.manager.query(
      `SELECT COUNT(*)::int AS total FROM execution_orders
        WHERE tenant_id = $1 AND subscriber_id = ANY($2::varchar[])`,
      [ctx.tenantId, ids.subscriberIds],
    )) as Array<{ total: number }>;
    return Number(rows[0]?.total ?? 0);
  }
}
