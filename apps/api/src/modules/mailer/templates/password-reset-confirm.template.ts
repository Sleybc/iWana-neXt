/**
 * Template de correo de confirmacion de cambio de contraseña.
 *
 * Funcion pura — no recibe parametros, no usa motor externo.
 * Se envia despues de que el usuario completa exitosamente el restablecimiento.
 */

/**
 * Genera el contenido del correo de confirmacion de restablecimiento de contrasena.
 *
 * SEGURIDAD: No incluye ningun dato del usuario ni informacion de la nueva contraseña.
 * Solo notifica que el cambio fue exitoso e indica como reportar si no fue el usuario.
 */
export function passwordResetConfirmTemplate(): {
  subject: string;
  html: string;
  text: string;
} {
  return {
    subject: 'Tu contraseña ha sido actualizada — iWana neXt',
    html: `<p>Tu contraseña ha sido actualizada exitosamente.</p>
<p>Si no realizaste este cambio, contacta de inmediato al soporte de iWana neXt.</p>`,
    text: `Tu contraseña ha sido actualizada — iWana neXt\n\nTu contraseña ha sido actualizada exitosamente.\n\nSi no realizaste este cambio, contacta de inmediato al soporte de iWana neXt.`,
  };
}
