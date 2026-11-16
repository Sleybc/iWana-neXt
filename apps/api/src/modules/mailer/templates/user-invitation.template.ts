/**
 * Template de correo de invitación al portal empresarial para una persona del equipo que aún
 * no tiene contraseña (personal traído de UISP, spec «usuarios» §2.4).
 *
 * Funcion pura — no usa motor externo ni depende de estado externo.
 * El HTML es basico y portable; los estilos van inline para maxima compatibilidad con clientes de correo.
 */

interface UserInvitationParams {
  /** Enlace del portal empresarial a /auth/reset-password con el token de un solo uso. */
  createPasswordLink: string;
  expiresInDays: number;
}

/**
 * Genera el contenido del correo de invitación: crear la contraseña y entrar al portal.
 *
 * SEGURIDAD: el enlace contiene el token de un solo uso. No incluir PII de la persona — solo
 * el enlace y el vencimiento.
 */
export function userInvitationTemplate(params: UserInvitationParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { createPasswordLink, expiresInDays } = params;
  const expiry = expiresInDays === 1 ? '1 día' : `${expiresInDays} días`;
  return {
    subject: 'Te invitaron a iWana',
    html: `<p>Te invitaron a iWana.</p>
<p>Crea tu contraseña para entrar al portal empresarial.</p>
<p><a href="${createPasswordLink}">Crear mi contraseña</a></p>
<p>Este enlace vence en ${expiry}. Si vence, pide que te envíen la invitación de nuevo.</p>
<p>Si no esperabas esta invitación, ignora este correo.</p>`,
    text: `Te invitaron a iWana\n\nCrea tu contraseña para entrar al portal empresarial:\n${createPasswordLink}\n\nEste enlace vence en ${expiry}. Si vence, pide que te envíen la invitación de nuevo.\n\nSi no esperabas esta invitación, ignora este correo.`,
  };
}
