/**
 * Aviso de espera del segundo factor en plataforma.
 *
 * SEGURIDAD: sin correo, IP, código ni enlace. Al resto de administradores solo les llega el
 * identificador de la cuenta, para buscarla en la auditoría.
 */
export function platformMfaLockTemplate(accountId: string | null): {
  subject: string;
  html: string;
  text: string;
} {
  const what = accountId
    ? `La cuenta de plataforma ${accountId} entró en espera por códigos de verificación incorrectos.`
    : 'Tu cuenta de plataforma entró en espera por códigos de verificación incorrectos.';
  const why =
    'Quien los ingresó conocía la contraseña. La espera dura 30 minutos como máximo y no cierra sesiones abiertas.';
  const action = accountId
    ? 'Confirma con la persona titular si fue ella. Si no, aplica el procedimiento de recuperación.'
    : 'Si no fuiste tú, cambia tu contraseña desde una sesión abierta y avisa a otro administrador.';
  return {
    subject: 'Cuenta de plataforma en espera — iWana neXt',
    html: `<p>${what}</p>\n<p>${why}</p>\n<p>${action}</p>`,
    text: `${what}\n\n${why}\n\n${action}`,
  };
}
