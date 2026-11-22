import { TenantStatus } from '@iwana/shared';
import type { EntityStatusEvent } from '../audit/interfaces/entity-lifecycle.interface';

/**
 * F2-D2 (`TenantStatusSummary` v1.2): empresas en `ACTIVE` al cierre de cada mes, reconstruidas
 * desde los cambios de estado auditados en `public.platform_audit_logs` y el estado actual de
 * `public.tenants`.
 *
 * Criterio de historia fiable: todo cambio de estado queda auditado. Los de la API los registra
 * su interceptor, y el aprovisionador del worker registra su paso de `PROVISIONING` a `ACTIVE` o
 * a `PROVISIONING_FAILED` (`UPDATE` de `Tenant` con `new_value.status`, F2-D2, en la misma
 * transacción). Las activaciones anteriores a ese cambio no tienen fila: para ellas, el estado al
 * cierre es cierto si el último evento previo no es `PROVISIONING`, o si lo es y después la
 * empresa se ve en `PROVISIONING`/`PROVISIONING_FAILED` (una empresa `ACTIVE` nunca vuelve a
 * aprovisionar). Si alguna empresa existente al cierre no cumple, el mes es `null`.
 */

export interface TenantCurrentState {
  id: string;
  status: TenantStatus;
  createdAt: Date;
}

/**
 * Acciones de `platform_audit_logs` que fijan el estado de una empresa: las del interceptor
 * (`CREATE`, `UPDATE`, `DELETE`) y las que escriben el trigger de reloj de borrado (029) y la
 * purga. Las lecturas auditadas (`LIST_ACCESS`, `RECORD_ACCESS`) quedan fuera.
 */
export const TENANT_STATUS_EVENT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'TENANT_DELETION_CLOCK_SET',
  'TENANT_DELETION_CLOCK_COERCED',
  'TENANT_PURGE_COMPLETED',
] as const;

/** Colombia no tiene horario de verano desde 1993: America/Bogota es UTC-05:00 fijo. */
const BOGOTA_UTC_OFFSET_HOURS = 5;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TENANT_STATUSES = new Set<string>(Object.values(TenantStatus));
const NOT_YET_ACTIVATED = new Set<string>([
  TenantStatus.PROVISIONING,
  TenantStatus.PROVISIONING_FAILED,
]);
/** La empresa ya no existe (esquema purgado y fila borrada). */
const GONE = 'GONE';

type Observation = { at: Date; status: string; isCreate: boolean };
type StateAtClose = 'ACTIVE' | 'NOT_ACTIVE' | 'UNKNOWN';

/** Primer instante del mes siguiente en Bogotá: los eventos con `at < cierre` cuentan en el mes. */
export function bogotaMonthClose(month: string): Date {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, monthNumber, 1, BOGOTA_UTC_OFFSET_HOURS));
}

function toObservation(event: EntityStatusEvent): Observation | null {
  if (event.action === 'TENANT_PURGE_COMPLETED') {
    return { at: event.at, status: GONE, isCreate: false };
  }
  // El interceptor no guarda cuerpo en DELETE: la baja deja la empresa marcada.
  if (event.action === 'DELETE') {
    return { at: event.at, status: TenantStatus.MARKED_FOR_DELETION, isCreate: false };
  }
  if (event.status === null || !TENANT_STATUSES.has(event.status)) return null;
  return { at: event.at, status: event.status, isCreate: event.action === 'CREATE' };
}

function stateAtClose(
  observations: readonly Observation[],
  current: TenantCurrentState | undefined,
  close: Date,
): StateAtClose {
  if (current && current.createdAt >= close) return 'NOT_ACTIVE';

  let before: Observation | undefined;
  const after: Observation[] = [];
  for (const observation of observations) {
    if (observation.at < close) before = observation;
    else after.push(observation);
  }

  if (!before) {
    // Una entidad purgada solo se sabe inexistente al cierre si su alta es posterior a él.
    if (!current && after[0]?.isCreate) return 'NOT_ACTIVE';
    return 'UNKNOWN';
  }
  if (before.status === GONE) return 'NOT_ACTIVE';
  if (before.status !== TenantStatus.PROVISIONING) {
    return before.status === TenantStatus.ACTIVE ? 'ACTIVE' : 'NOT_ACTIVE';
  }
  const seenNotYetActivated =
    after.some((observation) => NOT_YET_ACTIVATED.has(observation.status)) ||
    (current !== undefined && NOT_YET_ACTIVATED.has(current.status));
  return seenNotYetActivated ? 'NOT_ACTIVE' : 'UNKNOWN';
}

/**
 * Un valor por mes de `months` (`YYYY-MM`, del más antiguo al actual). El último es el mes en
 * curso y vale `currentActive` (hoy). `events` en orden cronológico.
 */
export function reconstructActiveAtClose(input: {
  months: readonly string[];
  events: readonly EntityStatusEvent[];
  tenants: readonly TenantCurrentState[];
  currentActive: number;
}): Array<number | null> {
  const currentById = new Map(input.tenants.map((tenant) => [tenant.id, tenant]));
  const observationsById = new Map<string, Observation[]>();
  for (const tenant of input.tenants) observationsById.set(tenant.id, []);
  for (const event of input.events) {
    if (!UUID_PATTERN.test(event.entityId)) continue;
    const observation = toObservation(event);
    if (!observation) continue;
    const list = observationsById.get(event.entityId) ?? [];
    list.push(observation);
    observationsById.set(event.entityId, list);
  }
  // El CREATE del interceptor se escribe después de responder: si es el primer evento de una
  // empresa que sigue en `tenants`, rige su `createdAt` real.
  for (const [id, observations] of observationsById) {
    const current = currentById.get(id);
    const first = observations[0];
    if (current && first?.isCreate && current.createdAt < first.at) {
      observations[0] = { ...first, at: current.createdAt };
    }
  }

  return input.months.map((month, index) => {
    if (index === input.months.length - 1) return input.currentActive;
    const close = bogotaMonthClose(month);
    let active = 0;
    for (const [id, observations] of observationsById) {
      const state = stateAtClose(observations, currentById.get(id), close);
      if (state === 'UNKNOWN') return null;
      if (state === 'ACTIVE') active += 1;
    }
    return active;
  });
}
