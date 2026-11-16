/**
 * Dominio reservado `.invalid` (RFC 2606, RFC 6761 §6.4): nunca resuelve. Lo usan los usuarios
 * importados desde UISP sin correo propio (`uisp-<id>@importado.invalid`, ADR-110 D15); el
 * mailer jamás intenta entregar a esas direcciones.
 */
export function isReservedRecipient(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  const domain = at >= 0 ? normalized.slice(at + 1) : normalized;
  return domain === 'invalid' || domain.endsWith('.invalid');
}
