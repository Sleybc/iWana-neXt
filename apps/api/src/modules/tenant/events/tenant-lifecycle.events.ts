import { TenantStatus } from '@iwana/shared';

/**
 * Eventos en proceso del ciclo de vida de una empresa (EventEmitter2 del API). Los módulos con
 * trabajos repetibles por empresa (facturación, red) los escuchan para retirar o volver a
 * programar sus repetibles, sin que el módulo de empresas conozca sus colas (B(c) / K,
 * 2026-11-22: un repetible de una empresa retirada fallaba cada vuelta para siempre).
 */
export const TENANT_RETIRED_EVENT = 'tenant.retired';
export const TENANT_RESTORED_EVENT = 'tenant.restored';

/** Solo identificadores: sin nombre de empresa ni datos personales. */
export interface TenantLifecycleEvent {
  tenantId: string;
  schemaName: string;
}

/**
 * Una empresa ya no debe tener trabajos programados: no existe, está retirada (`deletedAt`) o
 * marcada para eliminación. Las demás (suspendida, inactiva) conservan su programación.
 */
export function isRetiredTenant(
  tenant: { status: TenantStatus | string; deletedAt: Date | string | null } | null | undefined,
): boolean {
  return !tenant || tenant.deletedAt !== null || tenant.status === TenantStatus.MARKED_FOR_DELETION;
}
