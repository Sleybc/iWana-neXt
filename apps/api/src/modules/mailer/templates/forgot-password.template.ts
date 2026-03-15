/**
 * Template de correo para solicitud de restablecimiento de contraseña.
 *
 * Funcion pura — no usa motor externo ni depende de estado externo.
 * El HTML es basico y portable; los estilos van inline para maxima compatibilidad con clientes de correo.
 */

interface ForgotPasswordParams {
  resetLink: string;
  expiresInMinutes: number;
}

/**
 * Genera el contenido del correo para iniciar el flujo de recuperacion de contrasena.
 *
 * SEGURIDAD: El resetLink contiene el token de un solo uso.
 * No incluir PII del usuario en el HTML — solo el enlace.
 */
export function forgotPasswordTemplate(params: ForgotPasswordParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { resetLink, expiresInMinutes } = params;
  return {
    subject: 'Restablece tu contraseña — iWana neXt',
    html: `<p>Hemos recibido una solicitud para restablecer tu contraseña.</p>
<p><a href="${resetLink}">Haz clic aquí para restablecer tu contraseña</a></p>
<p>Este enlace expira en ${expiresInMinutes} minutos.</p>
<p>Si no solicitaste esto, ignora este correo.</p>`,
    text: `Restablece tu contraseña — iWana neXt\n\nHaz clic en el siguiente enlace:\n${resetLink}\n\nEste enlace expira en ${expiresInMinutes} minutos.`,
  };
}
