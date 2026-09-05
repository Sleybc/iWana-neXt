/**
 * Template de aviso de cambio de email de acceso (P-02, Ola 2).
 *
 * Se envia a la DIRECCION ANTERIOR cuando el titular cambia su email de
 * acceso. No bloquea la operacion (fire-and-forget en el servicio).
 *
 * SEGURIDAD / PII: nunca incluye el email nuevo ni PII adicional — solo el
 * hecho del cambio, cuando ocurrio y a quien contactar. El `to` lo pone el
 * llamador desde el valor previo en BD (solo en memoria, nunca se loguea).
 *
 * Funcion pura — no usa motor externo ni depende de estado externo.
 */

interface LoginEmailChangedParams {
  /** Momento del cambio en ISO (se muestra tal cual, sin formato local). */
  changedAt: string;
}

/**
 * Genera el contenido del aviso de cambio de email de acceso.
 */
export function loginEmailChangedTemplate(params: LoginEmailChangedParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { changedAt } = params;
  return {
    subject: 'Tu correo de acceso cambió — iWana neXt',
    html: `<p>Te avisamos que el correo de acceso de tu cuenta de iWana neXt cambió el ${changedAt}.</p>
<p>Si hiciste este cambio, ignora este correo. Tu cuenta sigue activa: solo verifica tu nueva dirección con el correo que te enviamos a ella.</p>
<p>Si NO reconoces este cambio, contacta de inmediato al administrador de tu empresa o a soporte iWana.</p>`,
    text: `Tu correo de acceso de iWana neXt cambió el ${changedAt}.\n\nSi hiciste este cambio, ignora este correo. Si NO lo reconoces, contacta de inmediato al administrador de tu empresa o a soporte iWana.`,
  };
}
