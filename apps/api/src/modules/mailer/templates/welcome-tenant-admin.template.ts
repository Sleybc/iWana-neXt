/**
 * Template de correo de bienvenida para el administrador inicial de un tenant.
 *
 * Funcion pura — no usa motor externo ni depende de estado externo.
 * Incluye credenciales temporales con instruccion de cambio obligatorio en el primer ingreso.
 */

interface WelcomeTenantAdminParams {
  tenantName: string;
  loginUrl: string;
  temporaryPassword: string;
  expiresInHours: number;
}

/**
 * Genera el contenido del correo de bienvenida con credenciales temporales para el ADMIN inicial del tenant.
 *
 * SEGURIDAD: La contraseña temporal solo se incluye en este correo de onboarding controlado.
 * El usuario esta obligado a cambiarla en el primer ingreso (passwordResetRequired = true en DB).
 */
export function welcomeTenantAdminTemplate(params: WelcomeTenantAdminParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { tenantName, loginUrl, temporaryPassword, expiresInHours } = params;
  return {
    subject: 'Bienvenido a iWana neXt — Credenciales de acceso',
    html: `<h2>Bienvenido a iWana neXt</h2>
<p>Tu espacio de trabajo <strong>${tenantName}</strong> ha sido provisionado exitosamente.</p>
<p>Tus credenciales de acceso temporales son:</p>
<ul>
  <li><strong>URL de acceso:</strong> <a href="${loginUrl}">${loginUrl}</a></li>
  <li><strong>Contraseña temporal:</strong> ${temporaryPassword}</li>
</ul>
<p><strong>Importante:</strong> Estas credenciales expiran en ${expiresInHours} horas. Debes cambiar tu contraseña en el primer ingreso.</p>
<p>Si tienes alguna duda, contacta al soporte de iWana neXt.</p>`,
    text: `Bienvenido a iWana neXt\n\nTu espacio de trabajo ${tenantName} ha sido provisionado.\n\nURL de acceso: ${loginUrl}\nContraseña temporal: ${temporaryPassword}\n\nEsta contraseña expira en ${expiresInHours} horas y debe ser cambiada en el primer ingreso.`,
  };
}
