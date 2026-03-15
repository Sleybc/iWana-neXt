/**
 * Template de correo para verificacion de direccion de correo electronico.
 *
 * Funcion pura — no usa motor externo ni depende de estado externo.
 */

interface EmailVerificationParams {
  verifyLink: string;
}

/**
 * Genera el contenido del correo de verificacion de email.
 *
 * SEGURIDAD: El enlace incluye un token de un solo uso.
 * No se incluye PII del usuario en el HTML — solo el enlace de accion.
 */
export function emailVerificationTemplate(params: EmailVerificationParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { verifyLink } = params;
  return {
    subject: 'Verifica tu correo electrónico — iWana neXt',
    html: `<p>Gracias por registrarte en iWana neXt.</p>
<p>Por favor verifica tu dirección de correo electrónico haciendo clic en el enlace:</p>
<p><a href="${verifyLink}">Verificar mi correo electrónico</a></p>
<p>Si no creaste una cuenta en iWana neXt, ignora este correo.</p>`,
    text: `Verifica tu correo electrónico — iWana neXt\n\nHaz clic en el siguiente enlace para verificar tu correo:\n${verifyLink}\n\nSi no creaste una cuenta en iWana neXt, ignora este correo.`,
  };
}
