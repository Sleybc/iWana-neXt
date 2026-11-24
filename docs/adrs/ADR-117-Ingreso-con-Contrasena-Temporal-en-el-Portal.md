# ADR-117: Ingreso con contraseña temporal en el portal de empresas

**Versión:** 1.0
**Estado:** Aprobado
**Aprobación:** CTO, 2026-11-24 («Sí, apruebo»), incluida la activación de la cuenta (D3).
**Fecha:** 2026-11-24
**Autor:** Claude Code · **Revisión de seguridad:** AI-SEC-ENG (§5)
**Módulos:** `apps/api` (`auth`) · `apps/portal`
**Enmienda:** [HLD-MOD02](../hlds/HLD-MOD02-ARQUITECTURA-v1.0.md) §3.1, pasos 1 y 2

## 1. Contexto

El HLD de MOD02 entrega una sesión completa a quien entra con la contraseña temporal. El portal lo lleva a cambiarla, pero la API no lo exige. Además, el cambio no activa la cuenta: queda pendiente de verificación y su sesión no se renueva, así que cae a los 15 minutos. La consola de plataforma ya limita ese primer ingreso ([ADR-116](ADR-116-Alta-del-Primer-Administrador-de-Plataforma.md)).

## 2. Decisión

| # | Decisión |
| --- | --- |
| D1 | Con `passwordResetRequired`, `POST /auth/login` devuelve solo un token de alcance `password-change`, sin cookies ni refresh, y `passwordResetRequired: true`. Si la cuenta tiene MFA activo, antes exige el código. El cambio va antes de configurar MFA. |
| D2 | El portal guarda ese token en memoria ([ADR-081](ADR-081-Modelo-de-Sesion-Cookie-HttpOnly.md), decisión 6). Recargar obliga a volver a entrar. |
| D3 | El cambio obligatorio activa una cuenta `PENDING_VERIFICATION`. No marca el correo como verificado. La nueva contraseña debe ser distinta de la temporal. La entrega de la credencial por un administrador equivale a la activación, también para usuarios importados de UISP a los que se les restablezca la contraseña. |
| D4 | La renovación rechaza una cuenta con cambio pendiente. |
| D5 | El reuso de un refresh ya usado revoca la familia y la confirma antes de responder 401. Login y renovación bloquean la fila del usuario: un restablecimiento simultáneo no deja sesiones vivas. |
| D6 | La recuperación de contraseña por enlace exige correo verificado. Evita que D3 abra ese camino a una cuenta cuyo buzón nadie probó (regla U3 de usuarios importados). Añadida por la revisión de seguridad, pendiente de ratificar por el CTO. |

## 3. Alternativas descartadas

| Alternativa | Por qué no |
| --- | --- |
| Mantener la sesión completa y confiar en el portal | Quien tenga la contraseña temporal usa la API sin cambiarla |
| Activar al entrar, sin cambiar la contraseña | Deja activa una cuenta cuya contraseña conoce otra persona |

## 4. Consecuencias

- Las sesiones de cuentas con cambio pendiente no se renuevan tras instalarlo.
- Quien entre con la temporal antes que su titular puede cambiarla e inscribir su propio MFA. Se mitiga entregándola en persona.
- Una cuenta activa con correo sin verificar ya no recupera su contraseña por enlace: la restablece un administrador.
- Una renovación cuya respuesta se pierde cierra la sesión al repetirla.
- Una cuenta creada con contraseña elegida por el administrador no tiene cambio obligatorio y sigue pendiente hasta que se active.

## 5. Revisión de AI-SEC-ENG

AI-SEC-ENG, 2026-11-24. **GO** condicionado a I-1 e I-2, corregidos en la misma ola.

| # | Severidad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| I-1 | Media | El ingreso limitado no borraba la sesión anterior del navegador | Se limpian las dos cookies del portal |
| I-2 | Media | La activación abría la recuperación por enlace a correos sin verificar | D6 |
| I-3 | Baja | El reuso no bloqueaba la fila del usuario | Bloqueo antes de revocar |
| I-4 | Baja | El reuso efectivo puede cerrar sesiones legítimas si se pierde la respuesta | Aceptado; §4 |
| I-5 | Baja | Un login fallido conservaba el token limitado anterior | Se borra al iniciar |
