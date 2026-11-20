import { UserRole } from '@iwana/shared';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * Regla única de visibilidad de comentarios internos: la usan el detalle de comentarios, los
 * adjuntos y el resumen del listado (spec MOD05 Soporte vista dividida §3 F, CA-9 y CA-10).
 */
export const ROLES_RESTRICTED_FROM_INTERNAL_COMMENTS: readonly string[] = [
  UserRole.TECHNICIAN,
  UserRole.CONTRACTOR,
];

export function canSeeInternal(actor: Pick<JwtPayload, 'role'>): boolean {
  return !ROLES_RESTRICTED_FROM_INTERNAL_COMMENTS.includes(actor.role);
}
