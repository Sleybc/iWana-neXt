/**
 * Aviso de contraseñas erróneas repetidas en plataforma.
 *
 * SEGURIDAD: sin correo, IP ni enlace. Al resto de administradores solo les llega el
 * identificador de la cuenta, para buscarla en la auditoría.
 */
export function platformPasswordAttackTemplate(accountId: string | null): {
  subject: string;
  html: string;
  text: string;
} {
  const what = accountId
    ? `La cuenta de plataforma ${accountId} recibió muchas contraseñas incorrectas en la última hora.`
    : 'Tu cuenta de plataforma recibió muchas contraseñas incorrectas en la última hora.';
  const action = accountId
    ? 'Revisa la auditoría y confirma con la persona titular si fue ella.'
    : 'Si no fuiste tú, usa una contraseña única y avisa a otro administrador. Este aviso no bloquea tu cuenta.';
  return {
    subject: 'Intentos repetidos de ingreso a una cuenta de plataforma — iWana neXt',
    html: `<p>${what}</p>\n<p>${action}</p>`,
    text: `${what}\n\n${action}`,
  };
}
