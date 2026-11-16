import { createHash } from 'node:crypto';

/**
 * SHA-256 hex de un token opaco de un solo uso (refresh, restablecimiento de contraseña,
 * invitación). En BD solo vive este hash; el valor en claro existe en memoria y en el enlace.
 * Lo comparten Auth (que lo verifica) y Usuarios (que emite la invitación) para que ambos
 * calculen exactamente el mismo valor.
 */
export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
