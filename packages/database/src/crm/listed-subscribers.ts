import type { QueryRunner } from 'typeorm';
import { ACTIVATED_SUBSCRIBER_STATUSES } from '@iwana/shared';

/**
 * Alcance de suscriptor de CRM (spec 2026-11-21 v1.1, commit e7e173e4): primera activación
 * o un servicio que llegó a activarse. Cubre al importado y al contrato activado a mano, que
 * siguen en PROSPECT/LEAD mientras falten datos fiscales; el prospecto sin servicio queda fuera.
 *
 * Dueño: CRM. Vive en `@iwana/db` porque el worker no puede importar `apps/api` (ADR-114 §7
 * condición 1): CRM lo usa en su lista, búsquedas y conteos, y el muestreador de uso por
 * empresa lo usa vía {@link countListedSubscribers}. Una sola definición, sin copia.
 * Requiere el alias `s` sobre `subscribers`.
 */
export const LISTED_SUBSCRIBER_SCOPE_SQL = `((s.activated_at IS NOT NULL AND s.status IN (${ACTIVATED_SUBSCRIBER_STATUSES.map((status) => "'" + status + "'").join(', ')})) OR EXISTS (
  SELECT 1
    FROM contracts activated_contract
   WHERE activated_contract.subscriber_id = s.id
     AND activated_contract.tenant_id = s.tenant_id
     AND activated_contract.deleted_at IS NULL
     AND activated_contract.status::text IN ('ACTIVE', 'SUSPENDED', 'TERMINATED')
))`;

/**
 * Cuenta los suscriptores que la lista de CRM muestra sin filtros (no borrados y dentro de
 * {@link LISTED_SUBSCRIBER_SCOPE_SQL}). Solo devuelve el número; ninguna fila sale.
 * El llamador fija `search_path` con `runInTenantSchema`.
 */
export async function countListedSubscribers(qr: QueryRunner, tenantId: string): Promise<number> {
  const rows = (await qr.query(
    `SELECT count(*)::int AS total
       FROM subscribers s
      WHERE s.tenant_id = $1
        AND s.deleted_at IS NULL
        AND ${LISTED_SUBSCRIBER_SCOPE_SQL}`,
    [tenantId],
  )) as Array<{ total: number | string }>;
  return Number(rows[0]?.total ?? 0);
}
