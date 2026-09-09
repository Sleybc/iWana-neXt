# INFORME-SESION-REFRESH-PORTAL-v1.0

**Fecha:** 2026-09-09
**Módulo:** MOD01 Autenticación (transversal: cliente HTTP y UX de sesión del portal)
**Tipo:** Corrección de defecto de sesión + hardening de superficie de auth
**Estado:** Ejecutado — verificación QA/seguridad completada (frente D del plan)
**Plan:** [docs/plans/2026-09-09-fix-sesion-expirada-proveedores.md](../plans/2026-09-09-fix-sesion-expirada-proveedores.md)

---

## 1. Problema

Durante el llenado del formulario «Nuevo proveedor» (`/dashboard/inventory?tab=suppliers`),
la sesión del portal expiró a mitad del trabajo activo. El envío falló con
«No fue posible guardar / Tu sesión expiró…», el refresh reactivo también devolvió
401 y el usuario quedó sin vía de recuperación sin recargar y sin perder el formulario.
Consola reportada: `POST /api/v1/purchasing/suppliers → 401` y
`POST /api/v1/auth/refresh → 401`.

## 2. Diagnóstico

Tarea 0 del plan — evidencia de BD (2026-09-09, esquema `tenant_iwana`):

- `refresh_tokens`: **0** filas con `revokeReason = REUSE_ATTACK`, **0** con
  `PASSWORD_CHANGE`, sin revocaciones masivas.
- Las familias de sesión del usuario afectado seguían **activas**.

El 401 del incidente no dejó rastro en Postgres del tenant → el refresh nunca llegó a
la rama tenant: falló en la rama de plataforma (Redis, volátil en dev). Hipótesis de
reuse-attack y de password-change **refutadas** como causa. Diagnóstico H1 confirmado:
la cookie de plataforma (`webRefreshToken`) presente en el mismo navegador (consola
plataforma abierta en localhost:3001) desviaba el refresh del portal.

## 3. Causa raíz (3 defectos estructurales)

| # | Defecto | Ubicación original | Naturaleza |
| --- | --- | --- | --- |
| 1 | `/auth/refresh` priorizaba la cookie de plataforma sin fallback a la cookie tenant; las cookies no se aíslan por puerto en localhost | `apps/api/src/modules/auth/auth.controller.ts:210-224` (pre-corrección) | Defecto directo del incidente |
| 2 | La detección de reuse revoca la familia completa; combinada con single-flight de refresh **por pestaña**, dos pestañas rotando en carrera producen un falso reuse-attack | `apps/api/src/modules/auth/auth.service.ts:486-496` + `apps/portal/src/lib/api-client.ts:179` (pre-corrección) | Preventivo (no causó el incidente) |
| 3 | Sin refresh proactivo: el único refresh es reactivo tras 401; con formularios largos (>15 min sin red) se garantiza pasar por ese camino, y el fallo dejaba `terminalSessionError` pegajoso sin notificar a la UI | `apps/portal/src/lib/api-client.ts:412-414` (pre-corrección) | Defecto de UX/robustez |

## 4. Correcciones por frente

### Frente A — API: ruteo por audiencia y fallback

| Archivo | Cambio |
| --- | --- |
| `apps/api/src/modules/auth/auth.controller.ts` | `POST /auth/refresh` con ruteo por audiencia: el header `X-Tenant-Slug` decide el primer intento (portal lo envía siempre; la consola de plataforma nunca); fallback a la otra cookie si la primera es rechazada con 401 (líneas 228-302). Cookies re-emitidas **solo** de la rama exitosa (`refreshTenantSession` 308-322, `refreshPlatformSession` 328-344). Fallos no-401 se relanzan sin enmascarar; si ambas ramas fallan se relanza el error **primario** (de la audiencia declarada), líneas 273-298 |
| `apps/api/src/modules/auth/auth.service.ts` | TTLs de firma (`expiresIn`) y de persistencia (`expiresAt`/Redis `EX`) leídos de config en el constructor (líneas 157-158, 1384, 1418, 1455-1458, 597-611, 668-711). Logger con reason codes sin PII: `REFRESH_INVALID`, `REFRESH_REUSE_DETECTED` (solo prefijo de 8 caracteres del `familyId`), `REFRESH_EXPIRED`, `REFRESH_USER_UNAVAILABLE`, `PLATFORM_REFRESH_*` equivalentes. Detección de reuse intacta |
| `apps/api/src/modules/auth/token-ttl.constants.ts` (nuevo) | Parser `parseDurationToSeconds` (formato `<n><s\|m\|h\|d>`), defaults 15m/7d, resolvers únicos para firma JWT y `maxAge` de cookies |
| `apps/api/src/app.config.ts` | `JWT_ACCESS_EXPIRATION` / `JWT_REFRESH_EXPIRATION` en el schema Joi: patrón estricto, mínimo 60 s por token, mensajes de error accionables (líneas 154-190). Nota: `apps/api/.env.development` ya definía ambas variables (líneas 47-48); desde esta corrección la configuración está **viva** (antes se ignoraba: TTLs hardcodeados) |

Tests nuevos: `apps/api/src/modules/auth/tests/auth.controller.refresh.http.spec.ts`,
`apps/api/src/modules/auth/tests/token-ttl.constants.spec.ts`,
`apps/api/src/app.config.jwt-ttl.spec.ts`, más ampliaciones de
`auth.controller.http.spec.ts` / `auth.service.spec.ts` / `auth.tenant-context.http.spec.ts`.

### Frente B — Portal: refresh proactivo y single-flight cross-tab

| Archivo | Cambio |
| --- | --- |
| `apps/portal/src/lib/api-client.ts` | **B1** single-flight cross-tab: Web Locks (`iwana-portal-auth-refresh`, líneas 482-501) con re-verificación de renovación reciente dentro del lock + `BroadcastChannel('iwana-portal-auth')` (429-473); degradación elegante sin esas APIs. **B2** refresh proactivo: `exp` decodificada en memoria (251-267), renovación a `exp − 90s` (615-639), re-programación en `visibilitychange`/`focus` (570-608), cancelación en logout; fallo proactivo tolerado sin estado terminal (661-668). **B3** evento `SESSION_EXPIRED_EVENT` (`iwana:session-expired`, 188, 416-427) solo en fallo reactivo definitivo + export `clearTerminalSessionError()` (300-302) |
| `apps/portal/src/lib/api-client.spec.ts` | Cobertura de sesión: dedupe de refresh concurrente, estado terminal, anuncio/adopción cross-tab, proactivo a exp−90s, tolerancia de fallo proactivo, cancelación por logout, emisión del evento y desbloqueo tras re-login |

### Frente C — UX de recuperación en sitio

| Archivo | Cambio |
| --- | --- |
| `apps/portal/src/components/auth/SessionRecoveryModal.tsx` (nuevo) | Modal global de re-autenticación en sitio: escucha `iwana:session-expired` y `iwana:session-recovery-open`; reutiliza el flujo del AuthProvider (`login` + `completeMfaLogin`, incluye MFA); al éxito ejecuta `clearTerminalSessionError()` y cierra **sin recargar ni redirigir** (311-317). Caminos no reutilizables (MFA setup, contraseña temporal) degradan con mensaje + salida explícita. Foco atrapado, `Escape` deshabilitado a propósito (el modal es la única vía de recuperación), capa propia en el contrato de drawers (ADR-075) |
| `apps/portal/src/app/layout.tsx` | Montaje de `<SessionRecoveryModal />` dentro de `AuthProvider` (línea 52), una sola instancia global |
| `apps/portal/src/components/inventory/SupplierFormDrawer.tsx` | Prop `isSessionError` (líneas 239-243); alerta de error con CTAs «Iniciar sesión» (abre el modal vía `openSessionRecovery()`) y «Reintentar» (reintenta el guardado) — líneas 520-548 |
| `apps/portal/src/components/inventory/InventoryClient.tsx` | Helper `isSessionError()` (243), estado `supplierSessionExpired` y clasificación del error de envío/detalle del drawer de proveedores (3187 y efectos asociados) |

## 5. Decisión del fallback y su justificación de seguridad

**Decisión:** ruteo por audiencia declarada (`X-Tenant-Slug`) con **un** fallback a la
otra cookie, en vez de aislar cookies por host/puerto (fuera de alcance: ADR-081 no se
modifica) ni de deducir la audiencia probando cookies en silencio.

**Justificación (perspectiva AI-SEC-ENG):**

1. **No amplía superficie:** cada rama exige la posesión de su propia cookie
   (`refreshToken` vs `webRefreshToken`), validada por nombre explícito, nunca por
   ausencia de la otra. Un atacante sin cookies obtiene el mismo
   `REFRESH_COOKIE_MISSING` de siempre; con una sola cookie el comportamiento es
   idéntico al previo.
2. **Sin escalación cruzada:** los tokens de cada audiencia llevan issuer/claims
   propios (`JWT_CLAIMS_BY_TOKEN_TYPE`) y cada estrategia valida la suya: un token de
   plataforma no autentica en el portal ni viceversa. El fallback solo elige *cuál*
   credencial presentar, no *qué* autoriza.
3. **Reuse-detection intacta:** la lógica de revocación de familia vive en el servicio
   y no fue alterada; el fallback prueba la credencial alternativa, nunca re-intenta
   la rechazada. Si la rama declarada falla por reuse, la familia ya quedó revocada en
   el servicio (efecto persistente) aunque el fallback tenga éxito.
4. **Errores sin enmascarar:** solo un 401 (credencial rechazada) habilita el
   fallback; cualquier otro error (500, etc.) se relanza de inmediato. Si ambas ramas
   fallan, se relanza el error **primario** (audiencia declarada), de modo que un
   `REFRESH_REUSE_DETECTED` real nunca se enmascara con un fallo del fallback.
5. ** Cookies de respuesta solo de la rama exitosa:** una rama rechazada no re-emite
   cookies, evitando sobrescribir la credencial válida de la otra audiencia.

Caso borde aceptado (documentado como deuda, §10): petición del portal con la cookie
tenant muerta y una cookie de plataforma **válida** presente → el fallback re-emite la
sesión de plataforma; el siguiente `/auth/me` del portal la rechaza por audiencia y el
flujo termina en el estado de sesión expirada (sin bucle: el reintento del cliente
marca `skipRefreshRetry`). Requiere posesión de credenciales válidas de plataforma en
el mismo navegador; sin impacto de privilegio.

## 6. TTLs configurables

- `JWT_ACCESS_EXPIRATION` (default `15m`) y `JWT_REFRESH_EXPIRATION` (default `7d`),
  formato `<n><s|m|h|d>`, mínimo 60 s, validados al arranque por Joi.
- Una sola fuente de verdad (`token-ttl.constants.ts`): la firma del JWT y el `maxAge`
  de ambas cookies de sesión usan el mismo resolver — la cookie vive exactamente lo
  que vive el token que porta.
- `apps/api/.env.development` ya definía ambas variables (líneas 47-48); antes de esta
  corrección eran ignoradas (TTLs hardcodeados en `auth.service.ts` y en las opciones
  de cookie del controlador). Ahora están vivas.

## 7. Cómo probar manualmente

1. **Sesión transparente (TTL corto):**
   1. Detener el API dev. Arrancarlo con TTL corto: `JWT_ACCESS_EXPIRATION=20s pnpm --filter @iwana/api dev` (el resto de env igual).
   2. En el portal (3002), iniciar sesión y abrir «Nuevo proveedor»; esperar >20 s sin tocar la pestaña.
   3. Completar y enviar: el guardado debe tener éxito sin ver «Tu sesión expiró» ni el modal (la renovación proactiva a exp−90 s ya renovó la sesión; con 20 s dispara de inmediato).
2. **Recuperación en sitio (refresh irrecuperable):**
   1. Con el API en TTL normal, iniciar sesión y abrir «Nuevo proveedor»; completar el paso de identidad y el comercial.
   2. Provocar el fallo real (opcional para demo: detener el API) y enviar: aparece la alerta con «Iniciar sesión»/«Reintentar» y el modal «Vuelve a iniciar sesión».
   3. Re-autenticarse dentro del modal: el modal cierra sin recargar, el drawer conserva los datos; pulsar «Reintentar»: el guardado tiene éxito.
3. **Cross-tab:** dos pestañas del portal; dejar que ambas renueven cerca de exp: solo una llama `/auth/refresh` (lock + broadcast); la familia no se revoca (sin falso reuse-attack).

## 8. E2E (frente D1)

**Ejecutado y en verde (2 corridas):** `e2e/tests/portal-session-recovery.spec.ts`
(nuevo), sobre el flujo real del navegador (api-client, AuthProvider, modal y drawer
reales) con el API simulado por `page.route` — el patrón de toda la suite portal.

| Escenario | Resultado |
| --- | --- |
| (a) Sesión transparente con access token de 20 s (equivale a `JWT_ACCESS_EXPIRATION=20s`): la renovación proactiva ocurre sola, se espera >TTL, el alta de proveedor tiene éxito, sin modal ni «Tu sesión expiró», sin recarga | PASS (23,9 s / 23,6 s) |
| (b) Refresh bloqueado con 401 + guardado con 401: alerta con CTAs, modal automático, re-login dentro del modal, cierre **sin recarga** (sonda de contexto JS), datos del drawer intactos, «Reintentar» guarda con éxito | PASS (1,9 s) |

Comando ejecutado (seguro contra el entorno dev del usuario: todo el tráfico `/api/v1`
queda interceptado en un contexto de navegador aislado; cero llamadas al API real):

```
pnpm exec playwright test e2e/tests/portal-session-recovery.spec.ts --config e2e/playwright.portal.config.ts
```

**Pendiente (documentado, no ejecutado):** la variante con API real y TTL corto por
configuración, porque los configs E2E del repo no levantan el API (`playwright.portal.config.ts`
asume un API ya corriendo en 127.0.0.1:3000) y el entorno actual tiene el API dev vivo
con la base de datos real (`tenant_iwana`): un E2E de auth contra ese entorno rotaría
sesiones y sembraría datos del usuario. Procedimiento en entorno controlado (Postgres
y Redis desechables, sin el API dev del usuario en marcha):

```
# 1) API fresco con TTL corto y almacenes desechables (envs de DB/REDIS apuntando a instancias de prueba)
JWT_ACCESS_EXPIRATION=20s PW_FORCE_FRESH_SERVER=1 pnpm --filter @iwana/api dev
# 2) Portal fresco (la config fuerza same-origin /api/v1)
PW_FORCE_FRESH_SERVER=1 pnpm exec playwright test e2e/tests/portal-session-recovery.spec.ts --config e2e/playwright.portal.config.ts
```

El escenario (a) del spec ya cubre la semántica del TTL corto por el lado del cliente
(token con `exp` a 20 s emitido por el login); la variante con API real añade la
verificación de que el TTL configurado llega al JWT firmado, que queda cubierta a
nivel unitario/integración por `app.config.jwt-ttl.spec.ts`, `token-ttl.constants.spec.ts`
y los specs HTTP de refresh.

## 9. Gates pre-merge (AGENTS.md) — resultados reales

| Gate | Comando | Resultado |
| --- | --- | --- |
| Tests API | `pnpm --filter @iwana/api test` | **3760 pass, 15 skipped, 0 fail** (309 suites) |
| Tests portal | `pnpm --filter @iwana/portal test` | **2131 pass, 1 skipped, 0 fail** (240 suites) |
| Cobertura módulo auth | `jest src/modules/auth --coverage --collectCoverageFrom="modules/auth/**/*.ts"` | **85,57% statements** (86,82% branch / 84,41% funcs / 86,25% lines) — ≥80% ✓. `auth.controller.ts` 87,6%, `auth.service.ts` 96,04%, `token-ttl.constants.ts` 95,23% |
| Cobertura portal (trinquete oficial) | `jest --coverage` (suite completa, thresholds del config) | Global **66,25% stmt / 59,27% branch / 59,7% funcs / 67,34% lines** — supera el trinquete (55/47/49/57) ✓. Nota: cobertura por archivo de `api-client.ts` degradada por instrumentación (archivo >500 KB, deopt de Babel); el bloque de sesión añadido por el frente B (298 líneas sobre 9349 preexistentes) está cubierto por `api-client.spec.ts` y por el E2E nuevo |
| Arquitectura (gate C-3) | `pnpm --filter @iwana/portal exec jest src/architecture --silent` | **1/1 pass** (`c3-no-token-storage.arch.spec.ts` — sin tokens en storage; ADR-081 intacto) |
| Lint | `pnpm lint` | **0 errores**, 46 warnings — todos en archivos del WIP preexistente (scheduling, settings, etc.); ninguno en archivos de los frentes |
| Typecheck | `pnpm typecheck` | **8/8 tareas OK** |

## 10. Hallazgos de la revisión de seguridad (AI-SEC-ENG)

Ninguno crítico ni alto. No se requirió corregir código de los frentes.

| Severidad | Hallazgo | Resolución |
| --- | --- | --- |
| Resuelto | Caso borde del fallback: portal con cookie tenant muerta + cookie de plataforma válida re-emite sesión de plataforma a una petición del portal. Iteración fail-fast (2026-09-09, §13): con `X-Tenant-Slug` declarado solo se intenta la rama tenant; la cookie de plataforma se ignora sin consumirla y el 401 es inmediato (§5 queda como justificación histórica del diseño anterior) | Resuelto por fail-fast por audiencia |
| Bajo | `JWT_ACCESS_EXPIRATION` y `JWT_REFRESH_EXPIRATION` se validan independientes (cada una ≥60 s); una config con access > refresh dejaría una cookie de access que sobrevive a la familia (`app.config.ts:154-190`) | Inocuo: el `exp` del propio JWT gobierna la validez. Hardening futuro: validación cruzada de campos |
| Resuelto | `/auth/refresh` no lleva `@Throttle` explícito; queda bajo el `ThrottlerGuard` global (`app.module.ts:250`) y la detección de reuse | Resuelto en la iteración fail-fast (2026-09-09, §13): `@Throttle({ default: { ttl: 60000, limit: 30 } })` + `@ApiResponse` 429, convención del archivo (`change-password` usa 10/min) |
| Informativo | Logs nuevos verificados limpios: solo reason codes y prefijo de 8 caracteres del `familyId` (`auth.service.ts:511-514, 641-644`; `auth.controller.ts:243, 291-293`); sin tokens, hashes completos, correos ni IPs | Sin acción |
| Informativo | Cookies: `httpOnly`, `SameSite=Strict`, `secure=isCookieSecure()` y paths intactos; `maxAge` ahora sincronizado con los TTLs configurados en ambas cookies (`auth.controller.ts:96-119`) | Sin acción |
| Informativo | Contrato OpenAPI de `POST /auth/refresh` sin cambios: misma ruta, verbos, `@HttpCode(200)`, respuestas 200/401 y cuerpo `{ data: { accessToken } }` | Sin acción |
| Informativo | `BroadcastChannel` difunde solo a same-origin (garantía de la plataforma); el mensaje lleva únicamente el access token en memoria; sin escrituras nuevas a `localStorage`/`sessionStorage`/cookies JS (verificado en diff; gate C-3 en verde) | Sin acción |
| Informativo | `SessionRecoveryModal`: el formulario no loguea credenciales; salidas con rutas internas fijas (sin open-redirect); el evento de apertura viaja sin `detail` → no puede abrir el modal con datos precargados; la empresa se prellena desde el slug persistido (no es token) | Sin acción |

Cobertura OWASP de los cambios: A07 (identificación y fallos de autenticación) —
fallback con posesión de credencial exigida, reuse-detection intacta, sesión
terminable y recuperable; A09 (fallos de logging y monitoreo) — reason codes
estables sin PII, base para alertas sobre `REFRESH_REUSE_DETECTED` /
`PLATFORM_REFRESH_REUSE_DETECTED`.

## 11. Deuda restante y seguimiento

1. **Aislamiento de cookies por host en dev** — resuelta por convención
   (iteración 2026-09-09, §13): el portal sigue en `http://localhost:3002` y la
   consola plataforma pasa a `http://127.0.0.1:3001`; hosts distintos → jars de
   cookies distintos. `scripts/next-dev.mjs` lo recuerda en su log inicial y
   `AGENTS.md` lo fija como gotcha 14. Residual: quien navegue ambas consolas en
   `localhost` queda cubierto por el fail-fast, no por el jar. En producción el
   riesgo ya era menor (prefijo `__Host-` + hosts distintos por consola).
2. **Umbral de cobertura de `src/lib` del portal:** el trinquete global (55/47/49/57)
   diluye archivos enormes como `api-client.ts` (20,52% instrumentado, dominado por
   código de dominio preexistente). Recomendado: dividir el cliente HTTP de dominios y
   fijar umbral por superficie para el bloque de sesión.
3. **Variante E2E con API real y TTL corto:** queda documentado el procedimiento (§8)
   para ejecutarlo en un entorno controlado con almacenes desechables.
4. **Monitoreo:** crear alertas sobre los reason codes nuevos
   (`REFRESH_FALLBACK_ATTEMPTED` recurrente indicaría coexistencia de consolas en el
   mismo navegador; `*_REUSE_DETECTED` debe seguir siendo raro).

## 12. Trazabilidad

- Plan aprobado: `docs/plans/2026-09-09-fix-sesion-expirada-proveedores.md` (frentes
  A, B, C ejecutados por sus agentes; este informe cierra el frente D).
- ADR-081 (sesión en cookies httpOnly, decisiones C-2/C-5/C-6/C-9) — sin cambios.
- ADR-061 / ADR-019 (audiencias y rotación de refresh) — sin cambios.
- ADR-075 (capas Z del portal) — el modal se integra con el contrato vigente.
- Evidencia de ejecución: comandos y resultados en §8-§9 de este informe.

## 13. Iteración fail-fast por audiencia + @Throttle + convención de host (2026-09-09)

Seguimiento menor de §10-§11: el portal **siempre** declara audiencia tenant
(`X-Tenant-Slug`) y una sesión de plataforma jamás lo autoriza (`/auth/me` la
rechaza por audiencia). El fallback a la cookie de plataforma con audiencia
tenant declarada era un ciclo desperdiciado garantizado: rotaba tokens
inútilmente y posponía una llamada el error que termina en el modal de
recuperación.

| Archivo | Cambio |
| --- | --- |
| `apps/api/src/modules/auth/auth.controller.ts` | `POST /auth/refresh` fail-fast por audiencia: con `X-Tenant-Slug` presente solo se intenta la rama tenant; si su cookie falta o es rechazada → 401 inmediato con reason code `REFRESH_COOKIE_MISSING — audiencia tenant declarada sin cookie tenant`, ignorando la cookie de plataforma sin consumirla. Sin header se conserva platform-first + fallback a tenant (retrocompatibilidad). Docblock actualizado. Contrato OpenAPI sin cambios (misma ruta, 200/401/429) |
| `apps/api/src/modules/auth/auth.controller.ts` | `@Throttle({ default: { ttl: 60000, limit: 30 } })` + `@ApiResponse` 429 en el refresh: 30/min cubre 1 renovación/~15 min por pestaña + ráfagas multi-pestaña deduplicadas por el single-flight cross-tab, sin abrir fuerza bruta (reuse-detection intacta en el servicio) |
| `apps/api/src/modules/auth/tests/auth.controller.refresh.http.spec.ts` | 3 tests reescritos a fail-fast ("fallback plataforma" → 401 sin invocar plataforma ni emitir sus cookies; reuse en rama tenant → 401 inmediato; "ambas fallan" → solo rama tenant intentada) + 2 tests nuevos (audiencia tenant + solo cookie de plataforma → 401 "No se encontro el refresh token.", plataforma no invocada; `X-Tenant-Slug` duplicado → fail-fast). Docblock del spec actualizado. Tests sin header intactos |
| `scripts/next-dev.mjs` | Log inicial con la URL resuelta (`resolveDevPort` parsea `--port`/`-p`) + recordatorio de la convención (solo dev) |
| `AGENTS.md` | Nuevo gotcha 14: convención de aislamiento por host + ruteo del refresh por audiencia |

Gates re-ejecutados: `jest src/modules/auth` **349 pass / 0 fail**
(13 suites; +2 netos por los tests nuevos); `pnpm --filter @iwana/api typecheck`
OK; ESLint de los archivos tocados limpio. Portal/E2E sin cambios: el 401
temprano termina en el mismo modal, una vuelta antes, y el E2E mockea el API.

Revisión experta (sr-backend + sec-eng, solo lectura): doble PASS sin bloqueos.
Hallazgo bajo no bloqueante corregido en la misma iteración: `X-Tenant-Slug`
duplicado (`string[]` en Express) ahora normalizado al primer valor en el
controlador, con test de duplicado (el parser HTTP une duplicados con coma;
la rama `Array.isArray` queda como defensa).

Siguen fuera de alcance (§11): división de `api-client.ts` para cobertura por
superficie (deuda 2) y alertas sobre reason codes (deuda 4).
