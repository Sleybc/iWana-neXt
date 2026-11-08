import { TenantContext } from '@iwana/db';
import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ExpedienteStatus } from '@iwana/shared';
import {
  IContractStandingReadPort,
  type ProspectDiscardRow,
} from '../../privacy/requests/ports/contract-standing-read.port';

@Injectable()
export class CrmContractStandingReadAdapter implements IContractStandingReadPort {
  async standing(
    partyId: string | null,
    ctx: { manager: EntityManager; requesterDocumentHmac?: string | null },
  ): Promise<{
    subscriberIds: string[];
    contractIds: string[];
    expedienteIds: string[];
    openContractIds: string[];
    lastTerminatedAt: string | null;
    unreconciledContractClock: boolean;
  }> {
    const tenantId = TenantContext.getOrThrow().tenantId;
    const subscribers = (await ctx.manager.query(
      "SELECT s.id::text AS id, to_jsonb(s)->>'expediente_id' AS expediente_id FROM subscribers s WHERE s.party_id = $1 AND s.tenant_id = $2 ORDER BY s.id",
      [partyId, tenantId],
    )) as Array<{ id: string; expediente_id: string | null }>;
    const rows = (await ctx.manager.query(
      `SELECT COALESCE(array_agg(c.id ORDER BY c.id), ARRAY[]::uuid[]) AS contract_ids, COALESCE(array_agg(c.id ORDER BY c.id) FILTER (
                  WHERE c.status NOT IN ('TERMINATED', 'ARCHIVED')
                ), ARRAY[]::uuid[]) AS open_contract_ids,
                max(c.terminated_at) FILTER (
                  WHERE c.status IN ('TERMINATED', 'ARCHIVED')
                ) AS last_terminated_at,
                count(*) FILTER (
                  WHERE c.status IN ('TERMINATED', 'ARCHIVED')
                ) AS terminal_count,
                count(*) FILTER (
                  WHERE c.status IN ('TERMINATED', 'ARCHIVED')
                    AND c.terminated_at IS NOT NULL
                ) AS terminal_with_clock
           FROM contracts c
           JOIN subscribers s ON s.id = c.subscriber_id AND s.tenant_id = c.tenant_id
          WHERE s.party_id = $1 AND s.tenant_id = $2 AND c.deleted_at IS NULL`,
      [partyId, tenantId],
    )) as Array<{
      contract_ids: string[];
      open_contract_ids: string[];
      last_terminated_at: Date | string | null;
      terminal_count: string | number;
      terminal_with_clock: string | number;
    }>;
    const openContractIds = rows[0]?.open_contract_ids ?? [];
    const lastTerminatedAt = rows[0]?.last_terminated_at;
    const terminalCount = Number(rows[0]?.terminal_count ?? 0);
    const terminalWithClock = Number(rows[0]?.terminal_with_clock ?? 0);
    const expedienteIds = subscribers.flatMap((row) =>
      row.expediente_id ? [row.expediente_id] : [],
    );
    if (ctx.requesterDocumentHmac) {
      const expedientes = (await ctx.manager.query(
        'SELECT id::text AS id FROM expediente_records WHERE document_number_hmac = $1 AND tenant_id = $2 ORDER BY id',
        [ctx.requesterDocumentHmac, tenantId],
      )) as Array<{ id: string }>;
      expedienteIds.push(...expedientes.map((row) => row.id));
    }
    return {
      contractIds: rows[0]?.contract_ids ?? [],
      expedienteIds: [...new Set(expedienteIds)].sort(),
      subscriberIds: subscribers.map(({ id }) => id),
      openContractIds,
      lastTerminatedAt: lastTerminatedAt ? new Date(lastTerminatedAt).toISOString() : null,
      // D-EXP-1 (B-2): el adaptador devuelve siempre terminalWithClock <
      // terminalCount; basta UN terminal sin reloj válido para no liberar al
      // titular (el máximo de los demás no lo sustituye). Sin terminales,
      // ambos conteos son 0 y la comparación es false.
      unreconciledContractClock: terminalWithClock < terminalCount,
    };
  }

  /**
   * Barrido de prospectos descartados (H-EXP B2-R3 B1): el motor enumera
   * por este puerto, nunca con SQL directo a `expediente_records`.
   *
   * Descarte verificable del prospecto (H-EXP B1, D-EXP-1).
   *
   * Solo el estado DESCARTADO con su `status_changed_at` demuestra el descarte;
   * cualquier otro estado o un reloj ausente devuelve `discardedAt: null` para
   * que el motor falle cerrado en lugar de inventar una fecha. `hasContract`
   * cubre contratos vivos enlazados por suscriptor del expediente.
   */
  async findProspectDiscard(
    expedienteIds: string[],
    ctx: { manager: EntityManager },
  ): Promise<ProspectDiscardRow[]> {
    if (expedienteIds.length === 0) return [];
    const tenantId = TenantContext.getOrThrow().tenantId;
    const rows = (await ctx.manager.query(
      `SELECT e.id::text AS expediente_id,
              CASE WHEN e.status = $3 THEN e.status_changed_at ELSE NULL END AS discarded_at,
              EXISTS (
                SELECT 1 FROM subscribers s
                JOIN contracts c ON c.subscriber_id = s.id AND c.deleted_at IS NULL
                WHERE s.expediente_id = e.id AND s.tenant_id = e.tenant_id
              ) AS has_contract
         FROM expediente_records e
        WHERE e.id = ANY($1::uuid[]) AND e.tenant_id = $2
        ORDER BY e.id`,
      [expedienteIds, tenantId, ExpedienteStatus.DESCARTADO],
    )) as Array<{
      expediente_id: string;
      discarded_at: Date | string | null;
      has_contract: boolean;
    }>;
    return rows.map((row) => ({
      expedienteId: row.expediente_id,
      discardedAt: row.discarded_at ? new Date(row.discarded_at).toISOString() : null,
      hasContract: row.has_contract === true,
    }));
  }

  async listProspectDiscard(ctx: { manager: EntityManager }): Promise<ProspectDiscardRow[]> {
    const tenantId = TenantContext.getOrThrow().tenantId;
    const rows = (await ctx.manager.query(
      `SELECT e.id::text AS expediente_id,
              CASE WHEN e.status = $2 THEN e.status_changed_at ELSE NULL END AS discarded_at,
              EXISTS (
                SELECT 1 FROM subscribers s
                JOIN contracts c ON c.subscriber_id = s.id AND c.deleted_at IS NULL
                WHERE s.expediente_id = e.id AND s.tenant_id = e.tenant_id
              ) AS has_contract
         FROM expediente_records e
        WHERE e.status = $2 AND e.tenant_id = $1
        ORDER BY e.status_changed_at, e.id`,
      [tenantId, ExpedienteStatus.DESCARTADO],
    )) as Array<{
      expediente_id: string;
      discarded_at: Date | string | null;
      has_contract: boolean;
    }>;
    return rows.map((row) => ({
      expedienteId: row.expediente_id,
      discardedAt: row.discarded_at ? new Date(row.discarded_at).toISOString() : null,
      hasContract: row.has_contract === true,
    }));
  }
}
