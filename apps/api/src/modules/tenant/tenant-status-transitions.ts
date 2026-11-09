import { ConflictException } from '@nestjs/common';
import { TenantStatus } from '@iwana/shared';

/**
 * DT-4 v1.1 (spec 2026-11-09-plat-ops-dt4 §8.2-§8.4): códigos estables de los
 * `409 Conflict` del ciclo de vida del tenant. Viajan en el sobre de error
 * `{ code, message }`, el mismo formato que usan los demás módulos de la API.
 */
export const TENANT_ERROR_CODES = {
  TENANT_NOT_RETRYABLE: 'TENANT_NOT_RETRYABLE',
  TENANT_PROVISIONING_IN_PROGRESS: 'TENANT_PROVISIONING_IN_PROGRESS',
  TENANT_STATUS_TRANSITION_NOT_ALLOWED: 'TENANT_STATUS_TRANSITION_NOT_ALLOWED',
} as const;

export type TenantErrorCode = (typeof TENANT_ERROR_CODES)[keyof typeof TENANT_ERROR_CODES];

/**
 * Vías que cambian el estado de un tenant desde la API (§8.4). `provisioning` es
 * la vía interna de `setProvisioningStatus` (encolado y reintento); `DELETE` y el
 * worker de aprovisionamiento tienen sus propias guardas.
 */
export type TenantStatusRoute = 'patch' | 'suspend' | 'activate' | 'provisioning';

const OPERATIVE: readonly TenantStatus[] = [
  TenantStatus.ACTIVE,
  TenantStatus.SUSPENDED,
  TenantStatus.INACTIVE,
];

/**
 * Tabla de transiciones permitidas: por vía y por estado destino, los estados
 * de origen admitidos. Cualquier par ausente es una transición prohibida.
 */
export const TENANT_STATUS_TRANSITIONS: Readonly<
  Record<TenantStatusRoute, Readonly<Partial<Record<TenantStatus, readonly TenantStatus[]>>>>
> = {
  patch: {
    [TenantStatus.ACTIVE]: OPERATIVE,
    [TenantStatus.SUSPENDED]: OPERATIVE,
    [TenantStatus.INACTIVE]: OPERATIVE,
  },
  suspend: {
    [TenantStatus.SUSPENDED]: [TenantStatus.ACTIVE, TenantStatus.SUSPENDED],
  },
  activate: {
    [TenantStatus.ACTIVE]: [
      TenantStatus.ACTIVE,
      TenantStatus.SUSPENDED,
      TenantStatus.INACTIVE,
      TenantStatus.MARKED_FOR_DELETION,
    ],
  },
  provisioning: {
    [TenantStatus.PROVISIONING]: [TenantStatus.PROVISIONING, TenantStatus.PROVISIONING_FAILED],
    [TenantStatus.PROVISIONING_FAILED]: [TenantStatus.PROVISIONING],
  },
};

/** Estados desde los que `retry-provisioning` puede reencolar (§8.2). */
export const RETRYABLE_TENANT_STATUSES: readonly TenantStatus[] = [
  TenantStatus.PROVISIONING,
  TenantStatus.PROVISIONING_FAILED,
];

export function isTenantStatusTransitionAllowed(
  route: TenantStatusRoute,
  from: TenantStatus,
  to: TenantStatus,
): boolean {
  return TENANT_STATUS_TRANSITIONS[route][to]?.includes(from) ?? false;
}

/** `409 TENANT_STATUS_TRANSITION_NOT_ALLOWED` con el sobre `{ code, message }`. */
export function tenantStatusTransitionConflict(): ConflictException {
  return new ConflictException({
    code: TENANT_ERROR_CODES.TENANT_STATUS_TRANSITION_NOT_ALLOWED,
    message: 'El estado actual de la empresa no permite este cambio.',
  });
}

/**
 * Lanza `409 TENANT_STATUS_TRANSITION_NOT_ALLOWED` si la vía no admite pasar de
 * `from` a `to`. Es la comprobación rápida previa; la garantía frente a cambios
 * concurrentes es el UPDATE condicional del servicio.
 */
export function assertTenantStatusTransition(
  route: TenantStatusRoute,
  from: TenantStatus,
  to: TenantStatus,
): void {
  if (!isTenantStatusTransitionAllowed(route, from, to)) {
    throw tenantStatusTransitionConflict();
  }
}
