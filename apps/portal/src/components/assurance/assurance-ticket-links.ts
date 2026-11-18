import { AccessPermissionKey, type TicketPartyProfileKind } from '@iwana/shared';
import { buildPendingVisitInboxHref } from '@/components/scheduling/pending-visit-scheduling-handoff';

/**
 * Enlaces del detalle del ticket (spec MOD10 §3 L, CA-12). Cada enlace exige el permiso de lectura
 * del módulo destino; sin él, el dato se muestra como texto. Los identificadores llegan del
 * servidor, pero se validan como UUID antes de construir la ruta: un valor inesperado no enlaza.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

type HasPermission = (permission: AccessPermissionKey) => boolean;

/** Permiso de lectura de la ficha a la que enlaza una parte del ticket. */
export const TICKET_PARTY_PROFILE_PERMISSION: Readonly<
  Record<TicketPartyProfileKind, AccessPermissionKey>
> = {
  SUBSCRIBER: AccessPermissionKey.CRM_SUBSCRIBERS_READ,
  EXPEDIENTE: AccessPermissionKey.CRM_EXPEDIENTES_READ,
};

const TICKET_PARTY_PROFILE_PATH: Readonly<Record<TicketPartyProfileKind, string>> = {
  SUBSCRIBER: '/dashboard/crm/subscribers',
  EXPEDIENTE: '/dashboard/crm/expedientes',
};

/** Ficha del solicitante o del relacionado; `null` sin permiso, sin ficha o con id no válido. */
export function getTicketPartyProfileHref(
  profile: { kind: TicketPartyProfileKind; id: string } | null | undefined,
  hasPermission: HasPermission,
): string | null {
  if (!profile || !isUuid(profile.id)) return null;
  const base = TICKET_PARTY_PROFILE_PATH[profile.kind];
  const permission = TICKET_PARTY_PROFILE_PERMISSION[profile.kind];
  if (!base || !permission || !hasPermission(permission)) return null;
  return `${base}/${encodeURIComponent(profile.id)}`;
}

/** Visita activa en la bandeja de visitas (Programación); exige `wfm.schedule.read`. */
export function getTicketVisitHref(
  visitId: string | null | undefined,
  hasPermission: HasPermission,
): string | null {
  if (!isUuid(visitId) || !hasPermission(AccessPermissionKey.WFM_SCHEDULE_READ)) return null;
  return buildPendingVisitInboxHref(visitId);
}

/** Orden de ejecución en su consola (`?executionOrderId=`); exige `operations.execution_orders.read`. */
export function getTicketExecutionOrderHref(
  executionOrderId: string | null | undefined,
  hasPermission: HasPermission,
): string | null {
  if (
    !isUuid(executionOrderId) ||
    !hasPermission(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ)
  ) {
    return null;
  }
  return `/dashboard/operations/execution-orders?executionOrderId=${encodeURIComponent(executionOrderId)}`;
}
