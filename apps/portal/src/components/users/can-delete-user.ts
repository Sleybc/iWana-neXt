import { UserRole } from '@iwana/shared';

/**
 * RF-RBAC-04 — espejo exacto de `users.service.ts` `remove()`.
 *
 * 1. No permitir self-delete.
 * 2. Si `target.role === ADMIN` y `actorRole !== SYSTEM_ADMIN` → no puede eliminar.
 * 3. Si el actor es `SYSTEM_ADMIN` → sí puede eliminar un `ADMIN`.
 *
 * No duplicar literales mágicos: usar siempre este helper en UI.
 */
export function canDeleteUser(params: {
  targetId: string;
  targetRole: string;
  actorUserId: string | undefined;
  actorRole: string | undefined;
}): boolean {
  const { targetId, targetRole, actorUserId, actorRole } = params;

  if (!actorUserId) {
    return false;
  }

  if (targetId === actorUserId) {
    return false;
  }

  if (targetRole === UserRole.ADMIN && actorRole !== UserRole.SYSTEM_ADMIN) {
    return false;
  }

  return true;
}

/** Motivo de bloqueo del botón eliminar, alineado a RF-RBAC-04 y al rol del actor. */
export function getDeleteUserBlockedReason(params: {
  targetId: string;
  targetRole: string;
  actorUserId: string | undefined;
  actorRole: string | undefined;
}): string | null {
  if (canDeleteUser(params)) {
    return null;
  }

  if (params.actorUserId && params.targetId === params.actorUserId) {
    return 'No puedes eliminarte a ti mismo';
  }

  if (params.targetRole === UserRole.ADMIN && params.actorRole !== UserRole.SYSTEM_ADMIN) {
    return 'No puedes eliminar a otro administrador del tenant';
  }

  return 'No puedes eliminar este usuario';
}
