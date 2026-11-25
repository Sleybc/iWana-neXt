# Spec — Transversal · MFA obligatorio en plataforma, TOTP de un solo uso y freno del segundo factor

**Versión:** 1.2 (v1.1 con GO de AI-SEC-ENG; esta registra el G0 y afina CA-2 y CA-10)
**Estado:** Aprobada. G0 del CTO el 2026-11-25 sobre los cinco puntos de §8. ADR-115 quedó Aprobado con sus dos enmiendas en la ola b.
**Fecha:** 2026-11-25
**Autor:** Claude Code · **Dictamen de origen:** AI-SEC-ENG, 2026-11-24, sobre `d19be3fb`
**Cambia:** [límites de peticiones](2026-11-06-limites-de-peticiones-spec.md) §4 y §6.3 en `platform/login`, y el bucket de ambos login (siempre IP)

## 1. Problema

| #   | Hecho en `auth.service.ts`                                                                                                                     | Severidad                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| P2  | Un código TOTP vale unos 90 s y se acepta varias veces. Hay cinco llamadas a `verifyTotp` y una sexta verificación directa en `verifyMfaSetup` | Media                                                     |
| P3  | `loginPlatform` entrega sesión completa a una cuenta `ACTIVE` con `mfaEnabled = false`. El PRD exige MFA                                       | Media; alta si existe una cuenta así accesible a terceros |
| P4  | `platform/login` no tiene freno por cuenta. Con la contraseña conocida, el código se puede adivinar desde muchas IP                            | Media en LAN; alta en internet                            |

La spec del 2026-11-06 aceptó P4 porque «tiene MFA obligatorio». Esa cita es un comentario y un valor por defecto de la entidad, no un control. Su argumento de disponibilidad sigue vigente: conocer un correo no debe bastar para dejar sin consola a un administrador.

## 2. Alcance

**Dentro:** P2 en empresa y plataforma, P3, P4, cuota por IP en los dos login, alta pública en staging y adaptación de E2E.
**Fuera:** freno por cuenta de contraseñas en plataforma (antes de exponer a internet), aviso al titular por código reutilizado, códigos de recuperación de MFA, restricción de red de la consola, vida absoluta de la sesión (spec propia, pendiente). Equipo de confianza: no se crea; el CTO eligió el 2026-11-25 conservar la sesión actual. Passkeys, cuando haya HTTPS y nombres de dominio.

## 3. Diseño

### 3.1 MFA obligatorio en plataforma (P3)

1. Tras validar contraseña y cambio obligatorio, si `mfaEnabled` es false el login entrega solo `platform-mfa-setup`, con estado `ACTIVE` o `PENDING_VERIFICATION`. Sin cookies ni refresh. El texto de la pantalla sirve también a cuentas ya activas.
2. `lockPlatformMfaEnrollment` admite ambos estados. Sigue exigiendo `mfaEnabled = false` y sin cambio de contraseña pendiente.
3. **Renovación:** el registro de refresh guarda `mfaVersion = SHA-256(secreto descifrado)`. Si falta o difiere, se revoca la familia y responde 401. Todos reingresan una vez tras el despliegue. Tras inscribir desde «Mi cuenta», la sesión vence con su access token.
4. **Inscripción sin secreto compartido:**
   - El secreto pendiente va cifrado en Redis, `mfa:pending:platform:{sub}:{jti}`, con `SET NX EX` por la vida restante del token. El mismo ingreso ve el mismo QR; otro ingreso recibe otro secreto.
   - El token lleva `credentialVersion`; `setup` y `verify` la comparan con la fila bloqueada.
   - `verify` lee Redis antes de la transacción, usa solo el secreto de su `jti` e ignora un `mfa_secret` previo con `mfa_enabled = false`. Al activar lo persiste, borra la clave y pone el `jti` en la lista negra.
   - Con Redis caído responde 503.
5. **`POST /platform-users/bootstrap`:** 404 salvo `NODE_ENV` explícito `development` o `test`; hoy solo rechaza `production`. Entrega `platform-mfa-setup` y `mfaSetupRequired`. Se retira `signPlatformToken` sin alcance y se ajusta el flujo web.
6. El bootstrap de desarrollo conserva `ACTIVE`: [ADR-116](../adrs/ADR-116-Alta-del-Primer-Administrador-de-Plataforma.md) D4 no cambia.
7. La inscripción desde «Mi cuenta» de [ADR-115](../adrs/ADR-115-Activacion-de-Cuentas-de-Plataforma.md) (en revisión) queda sin uso en sesiones nuevas. Ver §8.4.

### 3.2 Código de un solo uso (P2)

1. Columna `mfa_last_used_step integer NULL` en `public.platform_users` y en `users` de cada empresa. Sin Redis: no es transaccional con la sesión y puede perder marcas al caer.
2. Un único helper `matchTotpStep(secret, code): number | null` para los seis puntos. No usa `afterTimeStep` de otplib: lanza si el reloj retrocede.
3. Consumo en una sentencia, válida solo con una fila afectada:

   ```sql
   UPDATE … SET mfa_last_used_step = $step
   WHERE id = $id AND mfa_enabled
     AND (mfa_last_used_step IS NULL OR mfa_last_used_step < $step)
   ```

   En empresa, dentro de la transacción que emite la sesión. En plataforma la sesión vive en Redis, así que el orden es: (1) bcrypt fuera de la transacción; (2) `FOR UPDATE`, revalidar contraseña, estado, secreto, `deleted_at` y cambio pendiente, verificar, consumir y poner el contador a cero; (3) COMMIT; (4) refresh en Redis. Si Redis falla: 503, código consumido y sin cookies.

4. La petición sin código no consume. Un código con contraseña errónea tampoco. El ingreso que termina en `password-change` sí.
5. La inscripción guarda siempre su paso. El primer ingreso espera el siguiente código, normalmente menos de 30 s; la pantalla lo indica.
6. `disableMfa` consume el código antes de apagar y deja la columna en NULL.
7. Un código reutilizado responde 401, no suma al bloqueo y se audita con motivo `MFA_CODIGO_REUTILIZADO`. El `code` y el mensaje son los mismos que el del código erróneo: «Código incorrecto o ya usado. Espera el siguiente código.»

### 3.3 Freno del segundo factor en plataforma (P4)

1. Columnas `mfa_failed_attempts integer NOT NULL DEFAULT 0` y `mfa_locked_until timestamptz NULL` en `platform_users`.
2. Solo cuenta un código erróneo enviado **tras contraseña correcta**. La contraseña fallida no bloquea.
3. Al quinto fallo y en cada fallo posterior, espera de 30 minutos. El contador vuelve a cero solo con un ingreso correcto. Sin ingreso correcto del titular: 6 fallos en menos de una hora, 52 en menos de 24 h y 48 por día después. Cada ingreso correcto permite hasta 4 fallos más sin espera. Acertar: cerca de 0,016 % por día, 5 % al año si nadie actúa.
4. Tras validar la contraseña: `FOR UPDATE`, comprobar `mfa_locked_until` con `now()` de la base, verificar, y consumir o incrementar en la misma transacción. El 401 se lanza tras el COMMIT. El modelo es `disableMfa`, no `login`, que verifica antes de bloquear.
5. En espera, un código responde 401 `AUTH_ACCOUNT_LOCKED` sin verificarse. El inicio de cada espera se audita y genera una alerta. Las sesiones abiertas no se afectan.
6. Quien ya tenga la contraseña puede retrasar al titular. Se acepta: en ese caso conviene cortar. La recuperación es por runbook, con actor y motivo auditados; hoy no existe y entra en la ola c. La activación y el runbook ponen a cero contador y espera; el runbook además deja `mfa_last_used_step` en NULL y revoca sesiones.
7. `login` y `platform/login` cuentan siempre por IP, aunque la petición lleve un JWT de empresa. Se hace con `getTracker` por ruta en `@Throttle`, sin comparar rutas. Los valores 30 y 5 no cambian.

## 4. Migraciones

| Migración                | Contenido                             |
| ------------------------ | ------------------------------------- |
| Pública, siguiente a 037 | Las tres columnas de `platform_users` |
| Tenant, siguiente a 217  | `mfa_last_used_step` en `users`       |

Aditivas, sin recorrido de datos, reversibles. `NOT NULL` con valor por defecto constante. Se aplican antes del código. Por ADR-107, la ola c exige G6.5 antes de lanzar la siguiente.

## 5. E2E y herramientas

Once specs (diez `portal-*`/`web-*` y `api/execution-orders-operational`), dos seeds y `scripts/e2e-provision-operational.mjs` entran en plataforma sin código. `scripts/dev-verify-platform-login.mjs` se revisa por el mismo motivo. Sin excepción de MFA para pruebas.

1. La inscripción es un paso único previo, fuera de trazas; las specs no inscriben. `E2E_PLATFORM_TOTP_SECRET` sirve a corridas locales y contra entornos compartidos.
2. Helper común: genera el código con `node:crypto` y reutiliza la sesión dentro de cada proceso. Ante un 401 usa un paso posterior al último intentado, con dos reintentos. No reintenta ante `AUTH_ACCOUNT_LOCKED`.
3. El provisioner maneja `mfaSetupRequired`, inscribe y reingresa, también en la limpieza. La variable entra en sus dos listas cerradas de entorno. El secreto no se imprime nunca, ni con `::add-mask::`, porque la salida se copia a un log.
4. `beforeAll` de 120 s o más donde se use el helper. `workers: 1` en web para corridas reales.
5. `web-tenant-create-happy-path` ingresa además por pantalla: necesita el paso de código y otro código.
6. `scripts/dev-reset-platform-admin.mjs` gana una opción para limpiar MFA, solo en desarrollo.

## 6. Olas

| Ola | Contenido                                                 | Depende de    |
| --- | --------------------------------------------------------- | ------------- |
| a   | Helper E2E y consumidores, compatible con el login actual | G0            |
| b   | §3.1 y cuota por IP (§3.3.7)                              | a verde en CI |
| c   | §3.2, §3.3, migraciones y runbook de recuperación         | b             |

Antes de desplegar b, en todo entorno accesible a terceros el conteo de cuentas `ACTIVE` sin MFA debe ser 0: cada una se inscribe de forma supervisada o queda suspendida. Si hay duda sobre su contraseña, se rota por canal seguro y se revocan sus sesiones.

## 7. Criterios de aceptación

Las pruebas nuevas se ven rojas antes del cambio.

| #     | Criterio                                                                                                                                        | Prueba                      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| CA-1  | `ACTIVE` y `PENDING` sin MFA reciben solo `platform-mfa-setup`, sin cookies; inscriben y luego entran con código                                | Unitaria, HTTP y PostgreSQL |
| CA-2  | No se renueva una sesión previa con `mfaEnabled = false`, aunque después se inscriba, ni tras reiniciar y reinscribir MFA; se revoca la familia | PostgreSQL y Redis          |
| CA-3  | Alta pública: 404 en `staging`, `production` y sin `NODE_ENV`; en desarrollo solo entrega token de inscripción                                  | Unitaria y HTTP             |
| CA-4  | Dos ingresos simultáneos con el mismo código: una sesión, en empresa y en plataforma                                                            | PostgreSQL                  |
| CA-5  | Ingreso y `disableMfa` simultáneos con el mismo código: uno solo                                                                                | PostgreSQL                  |
| CA-6  | Si la transacción se revierte, el código sigue disponible. Si falla Redis tras el COMMIT: 503 y sin cookies                                     | PostgreSQL y unitaria       |
| CA-7  | Un paso anterior tras uno posterior se rechaza; un reloj atrasado da 401, no 500                                                                | Unitaria                    |
| CA-8  | Reutilizar no suma al bloqueo; errar sí                                                                                                         | Unitaria y PostgreSQL       |
| CA-9  | Dos empresas y la plataforma no comparten estado                                                                                                | PostgreSQL                  |
| CA-10 | `disableMfa` deja la columna en NULL y reinscribir no deja fuera al titular                                                                     | PostgreSQL                  |
| CA-11 | De diez códigos en paralelo se verifican cinco como máximo; un código correcto tras el quinto fallo no entra; contraseñas erróneas no bloquean  | PostgreSQL                  |
| CA-12 | Un JWT de empresa no abre otra cuota en los dos login                                                                                           | HTTP                        |
| CA-13 | Reglas de arquitectura: `totp.verify(` solo en el helper; token de plataforma sin alcance solo en login con código y en refresh                 | Arquitectura                |
| CA-14 | `up` y `down` de ambas migraciones                                                                                                              | Integración                 |
| CA-15 | E2E operativo en CI (mínimo 30) y corrida aparte de los diez specs reales, con conteo y cero omisiones: en CI se omiten                         | CI y corrida manual         |
| CA-16 | Dos ingresos de inscripción dan secretos distintos; gana una sola; el código del otro secreto no sirve; cambiar la contraseña invalida el token | PostgreSQL y Redis          |

CA-3 se prueba sin petición HTTP en el 404 (servicio y arranque real de la configuración). CA-2 y CA-16 se prueban con PostgreSQL real y un doble de Redis en memoria; el E2E operativo ejerce Redis real en el camino normal.

## 8. Puntos del G0 del CTO (aprobados el 2026-11-25)

1. §3.1: MFA obligatorio en el login y en la renovación. **Recomendado.**
2. §3.2: uso único en PostgreSQL, con la espera tras inscribir. **Recomendado.**
3. §3.3: 5 fallos y 30 minutos, solo del segundo factor. Revoca la aceptación del 2026-11-06 §6.3 en ese aspecto. **Recomendado.**
4. Inscripción desde «Mi cuenta»: conservarla y decidir su retiro aparte. **Recomendado:** evita ampliar el cambio.
5. Ratificar ADR-115 (en revisión), que sostiene la inscripción de §3.1. **Recomendado, solo con dos enmiendas:** punto 3 (secreto por ingreso, §3.1.4) y «Mi cuenta» (la sesión ya no continúa al renovar, §3.1.3).

## 9. Riesgos

- **Quien tenga la contraseña puede inscribirse antes que el titular.** Es inherente; lo cubre la condición previa a la ola b (§6).
- **Cuentas únicas:** un administrador que pierda su aplicación depende del runbook.
- **Reloj:** un desfase mayor de 30 s impide entrar, igual que hoy.
