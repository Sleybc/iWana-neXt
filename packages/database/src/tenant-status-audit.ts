/**
 * Auditoría de los cambios de estado de una empresa que hace un proceso del sistema, no una
 * persona (F2-D2, `TenantStatusSummary` v1.2).
 *
 * El aprovisionador del worker pasa la empresa de `PROVISIONING` a `ACTIVE` o a
 * `PROVISIONING_FAILED`. La serie «Activas al cierre» del API reconstruye el estado de cada mes con
 * los eventos `UPDATE` de `Tenant` que traen `new_value.status`. Por eso la fila tiene la misma forma
 * que la del interceptor del API: `action = 'UPDATE'`, `entity_type = 'Tenant'`, `entity_id` = id de
 * la empresa y `new_value.status`. El actor es el sistema: `user_id` nulo, `new_value.actor` y
 * `request_id` con el nombre del proceso, como la fila del trigger 029. Solo lleva el id y los
 * estados, ningún dato personal.
 *
 * Decisión AI-EM-ARCH (2026-11-22): el worker inserta directo con el rol app, que tiene INSERT
 * sobre `platform_audit_logs` (migración 015; ya hay filas de sistema). Si la auditoría falla, la
 * transición falla con ella: es traza regulatoria y el cambio se cierra sin ella.
 */

export const TENANT_AUDIT_ENTITY = 'Tenant';
/** Proceso del sistema que hace la transición (actor de la fila). */
export const TENANT_PROVISIONING_AUDIT_ACTOR = 'worker:tenant-provisioning';

export interface TenantStatusTransitionAudit {
  action: 'UPDATE';
  entityType: typeof TENANT_AUDIT_ENTITY;
  entityId: string;
  oldValue: { status: string };
  newValue: { status: string; actor: string };
  requestId: string;
}

export function buildTenantStatusTransitionAudit(
  tenantId: string,
  fromStatus: string,
  toStatus: string,
  actor: string = TENANT_PROVISIONING_AUDIT_ACTOR,
): TenantStatusTransitionAudit {
  return {
    action: 'UPDATE',
    entityType: TENANT_AUDIT_ENTITY,
    entityId: tenantId,
    oldValue: { status: fromStatus },
    newValue: { status: toStatus, actor },
    requestId: actor,
  };
}

export const INSERT_TENANT_STATUS_TRANSITION_AUDIT_SQL = `INSERT INTO public.platform_audit_logs
  (user_id, action, entity_type, entity_id, old_value, new_value, request_id)
VALUES (NULL, $1, $2, $3, $4::jsonb, $5::jsonb, $6)`;

/**
 * Escribe la fila con el ejecutor recibido. Para que el cambio de estado y su auditoría queden
 * juntos, debe ser el `EntityManager` de la transacción que hace el `UPDATE`.
 */
export async function insertTenantStatusTransitionAudit(
  executor: { query(sql: string, params?: unknown[]): Promise<unknown> },
  audit: TenantStatusTransitionAudit,
): Promise<void> {
  await executor.query(INSERT_TENANT_STATUS_TRANSITION_AUDIT_SQL, [
    audit.action,
    audit.entityType,
    audit.entityId,
    JSON.stringify(audit.oldValue),
    JSON.stringify(audit.newValue),
    audit.requestId,
  ]);
}
