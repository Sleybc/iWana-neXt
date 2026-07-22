import { isPlatformOnlyRole, PlatformRole, UserRole } from '@iwana/shared';

/**
 * RF-RBAC-04 + ADR-063 — espejo exacto de `users.service.ts` `remove()`.
 *
 * 1. No permitir self-delete.
 * 2. Si el objetivo tiene un rol de plataforma persistido y el actor no →
 *    no puede eliminar. Antes esta regla solo miraba `target.role === ADMIN`,
 *    así que un objetivo `SYSTEM_ADMIN` o `IWANA_SUPPORT` no quedaba protegido
 *    en absoluto (hallazgo residual de la auditoría de cierre). Tras ADR-061 §4
 *    ese estado ya no debería existir en `users.role`, pero la comprobación
 *    opera sobre el literal recibido de la API, no sobre el tipo.
 * 3. Si `target.role === ADMIN` y `actorRole !== SYSTEM_ADMIN` → no puede eliminar.
 * 4. Si el actor es `SYSTEM_ADMIN` → sí puede eliminar un `ADMIN`.
 * 5. ADR-063: el administrador principal designado no se puede eliminar mientras
 *    lo sea, sea quien sea el actor. Hay que transferir la designación primero.
 *
 * `targetIsPrincipalAdmin` es opcional a propósito: `undefined` significa «la
 * respuesta no trae el dato», no «no lo es». Solo bloquea con `true`, de modo
 * que la UI nunca deshabilita el botón por un dato que no tiene — el API sigue
 * siendo la autoridad y responde 409.
 *
 * No duplicar literales mágicos: usar siempre este helper en UI.
 */
export function canDeleteUser(params: {
  targetId: string;
  targetRole: string;
  targetIsPrincipalAdmin?: boolean | undefined;
  actorUserId: string | undefined;
  actorRole: string | undefined;
}): boolean {
  const { targetId, targetRole, targetIsPrincipalAdmin, actorUserId, actorRole } = params;

  if (!actorUserId) {
    return false;
  }

  if (targetId === actorUserId) {
    return false;
  }

  if (isPlatformOnlyRole(targetRole) && !isPlatformOnlyRole(actorRole ?? '')) {
    return false;
  }

  if (targetRole === UserRole.ADMIN && actorRole !== PlatformRole.SYSTEM_ADMIN) {
    return false;
  }

  if (targetIsPrincipalAdmin === true) {
    return false;
  }

  return true;
}

/** Motivo de bloqueo del botón eliminar, alineado a RF-RBAC-04 y al rol del actor. */
export function getDeleteUserBlockedReason(params: {
  targetId: string;
  targetRole: string;
  targetIsPrincipalAdmin?: boolean | undefined;
  actorUserId: string | undefined;
  actorRole: string | undefined;
}): string | null {
  if (canDeleteUser(params)) {
    return null;
  }

  if (params.actorUserId && params.targetId === params.actorUserId) {
    return 'No puedes eliminarte a ti mismo';
  }

  if (isPlatformOnlyRole(params.targetRole) && !isPlatformOnlyRole(params.actorRole ?? '')) {
    return 'No puedes eliminar a un usuario con rol de plataforma';
  }

  if (params.targetRole === UserRole.ADMIN && params.actorRole !== PlatformRole.SYSTEM_ADMIN) {
    return 'No puedes eliminar a otro administrador del tenant';
  }

  if (params.targetIsPrincipalAdmin === true) {
    return 'Es el administrador principal de la empresa; designa otro antes de eliminarlo';
  }

  return 'No puedes eliminar este usuario';
}
