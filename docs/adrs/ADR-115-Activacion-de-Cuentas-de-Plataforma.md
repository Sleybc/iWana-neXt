# ADR-115: Activación de cuentas de plataforma

**Estado:** En revisión  
**Fecha** · 2026-11-23

Los administradores de plataforma pueden dar de alta cuentas desde la consola. La implementación está activa en desarrollo. La decisión mantiene la separación entre plataformas y empresas de [ADR-061](ADR-061-Frontera-de-Audiencias-JWT-y-Procedencia-de-Roles.md) y la política de verificación en dos pasos de MOD01.

1. `POST /api/v1/platform-users` exige `SYSTEM_ADMIN` y un token de plataforma. Crea la cuenta en `public.platform_users` con estado pendiente, una contraseña temporal aleatoria que se muestra una sola vez y cambio de contraseña obligatorio. El administrador entrega la credencial por un canal seguro.
2. La persona titular entra con la contraseña temporal y recibe el alcance existente `password-change`. Después del cambio inicia sesión con su contraseña definitiva y recibe `platform-mfa-setup`, que solo autoriza la configuración y confirmación de TOTP de la propia cuenta. Ambos pasos usan tokens de alcance limitado y carecen de cookies de sesión.
3. El servidor guarda cifrado el secreto TOTP y reutiliza el mismo QR mientras la cuenta está pendiente. La primera confirmación válida activa la cuenta en la misma transacción que registra `MFA_ENABLED`. Al iniciar sesión nuevamente, se exige el código para emitir la sesión completa.
4. El alta y la confirmación registran actor y cuenta sin credenciales en los eventos de auditoría. El listado y el resumen incluyen la cuenta pendiente desde el alta. El resumen deja de contarla entre las cuentas sin verificación en dos pasos tras la confirmación.

En `public.platform_users`, el estado pendiente representa activación de la cuenta. Se reutilizan sus columnas actuales. Las cuentas de empresa conservan su flujo de verificación de correo.

## Configuración desde Mi cuenta

Una persona con sesión completa y cuenta de plataforma activa puede configurar TOTP para su propia cuenta. El servidor solicita la contraseña actual antes de ofrecer el QR. El desafío cifrado vence a los cinco minutos y se vincula a la cuenta, a la sesión y a su contraseña vigente. La clave de cifrado del desafío se deriva para este uso. La confirmación válida guarda el secreto, activa TOTP y audita el evento en una sola transacción. Una cuenta que ya tiene TOTP activo no puede volver a inscribirse por esta vía. La sesión actual continúa y los siguientes inicios de sesión exigen un código.
