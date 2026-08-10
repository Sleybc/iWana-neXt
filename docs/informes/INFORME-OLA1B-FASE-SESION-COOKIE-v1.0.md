# INFORME — OLA1-b · Fase · Access token a cookie `httpOnly` (paso 1 de la migración en dos pasos)

**Versión:** 1.0
**Fecha:** 2026-08-09
**Autor:** AI-EM-ARCH (orquestador, modo ejecutor — consolidación de los 5 tracks del encargo)
**Decisión rectora:** [ADR-081](../adrs/ADR-081-Modelo-de-Sesion-Cookie-HttpOnly.md) **(Aprobado por el CTO, 2026-08-09)** — condiciones C-1…C-9 congeladas como criterios de aceptación
**Encargo:** [PROMPT-TRANSVERSAL-OLA1-B-SESION-COOKIE-v1.0.md](../prompts/PROMPT-TRANSVERSAL-OLA1-B-SESION-COOKIE-v1.0.md)
**Estado de la fase:** **CERRADA** — C-1…C-9 en verde; punto de no retorno alcanzado y declarado; re-verificación independiente de AI-SEC-ENG emitida (Track 5)

---

## 1. Resumen ejecutivo

Se ejecutó y cerró el **paso 1** de la migración de [ADR-081](../adrs/ADR-081-Modelo-de-Sesion-Cookie-HttpOnly.md): el access token de ambas aplicaciones de navegador (`web` y `portal`) pasa a cookie `httpOnly`, deja de existir en almacenamiento local, la resolución de tenant se hace desde el token de la cookie, la protección CSRF se vuelve requisito duro, y la consola de plataforma gana ciclo de refresco.

Evidencia de cierre en esta corrida real (2026-08-09, `Cached: 0`):

- **E2E portal: 159 passed / 0 failed** (suite completa, 1 worker, servidor fresco `PW_FORCE_FRESH_SERVER=1`) — tras el punto de no retorno.
- **`pnpm test`: 3126 passed / 15 skipped** (API), todas las suites del monorepo en verde (`Tasks: 9 successful`).
- **`pnpm typecheck`: 8/8 tareas en verde.**
- **`pnpm lint`: 0 errores** (10 warnings pre-existentes).
- **Re-verificación independiente AI-SEC-ENG (Track 5):** C-1, C-2 y C-3 **APROBADOS** con veredicto formal y evidencia propia (§4).

El bloqueo C-9 declarado en el informe del Track 4 ([INFORME-OLA1B-E2E-SESION-COOKIE-v1.0.md](INFORME-OLA1B-E2E-SESION-COOKIE-v1.0.md)) fue consecuencia de tracks 1-2 aterrizando en paralelo sin commitear; con el working tree estabilizado, el punto de no retorno se alcanzó: **el soporte de lectura de tokens desde `localStorage` fue retirado y el test de arquitectura C-3 ya no admite excepción `C3-BACKUP-READ`** (§5).

---

## 2. Estado por condición (CA-1…CA-8)

| Condición | Criterio | Estado | Evidencia |
| --- | --- | --- | --- |
| **CA-1 (C-1, merge)** | Petición autenticada de tenant resuelve contexto solo desde el token verificado de la cookie | ✅ **VERDE** | `TenantMiddleware.tryExtractJwtPayload()` lee cookies de access por audiencia + Bearer (transición). Tests bloqueantes: `tenant.middleware.spec.ts:265` (JWT válido + slug impostor → `findBySlug` no llamado) y `:303` (cookie + slug impostor → resuelve por token). Suite completa del spec: **11/11** + rutas públicas **5/5** |
| **CA-2 (C-2, merge)** | Todo método mutante autenticado por cookie exige protección CSRF; test negativo | ✅ **VERDE** | `CsrfGuard` (APP_GUARD global acotado, custom-header `X-Requested-With`) rechaza 403 mutantes con cookie válida sin cabecera; cubre POST/PUT/PATCH/DELETE y exime `@Public()`/Bearer. `csrf.guard.spec.ts`: **9/9** (incluye el test negativo) |
| **CA-3 (C-3, merge)** | Cero coincidencias de `localStorage` sobre claves de token en ambas apps (incluidos alcances limitados) | ✅ **VERDE** | `c3-no-token-storage.arch.spec.ts` (portal y web): barrido de ambas apps exigiendo `toEqual([])`; **sin excepción `C3-BACKUP-READ`** (punto de no retorno alcanzado). Ambos specs **1/1** |
| **CA-4 (C-4, cierre)** | Variable de URL del API separada por aplicación | ✅ **VERDE** | `NEXT_PUBLIC_WEB_API_URL` (web) y `NEXT_PUBLIC_PORTAL_API_URL` (portal) en `next.config.ts`, `.env.example`, `.env.production.example`, Dockerfiles, Compose, CI y clave de caché de Turborepo. Ambos `api-client.ts` leen su variable por app (`resolveApiBase()`), cerrándose la referencia muerta a `NEXT_PUBLIC_API_URL` que reportó el Track 3 |
| **CA-5 (C-5, cierre)** | Cookies con nombre distinto por audiencia, `__Host-` en producción, `path` mínimo, `Secure` acoplado a producción en el esquema | ✅ **VERDE** | `session-cookies.constants.ts` (nombres `portalAccessToken`/`webAccessToken`/refresh por audiencia + `__Host-` en producción); `ACCESS_COOKIE_OPTIONS` con `path: '/'`; `COOKIE_SECURE` acoplado a producción en `app.config.ts` (Joi, con spec `app.config.cookie-secure.spec.ts`). nginx verificado: `Set-Cookie` intacto en ambos vhosts |
| **CA-6 (C-6, cierre)** | `platform/login` emite cookie de refresh; la sesión de `SYSTEM_ADMIN` se renueva | ✅ **VERDE** | `auth.controller.ts:163-167`: `platformLogin()` emite `platformAccessCookieName()` + `platformRefreshCookieName()`. Cubierto en `auth.controller.http.spec.ts` y `tenant.middleware.spec.ts:336` (refresh de plataforma sin `X-Tenant-Slug`) |
| **CA-7 (C-9, cierre)** | Helper de siembra migrado a cookies; las 22 specs pasan antes de retirar el soporte antiguo, con `Cached: 0` | ✅ **VERDE** | `e2e/tests/helpers/portal-session.ts` (siembra por cookie `portalAccessToken`, contrato C-5). 22 specs migradas. Corrida completa **159/159** con servidor fresco (evidencia en §3). **Punto de no retorno alcanzado:** retiro del soporte `localStorage` en ambos `api-client.ts` + helper sin puente + C-3 sin excepción |
| **CA-8 (checklist §5.3)** | Las dos revisiones de deuda de CSP documentadas con decisión y fecha | ✅ **VERDE** | Ambas decisiones registradas: (a) CSP del API vía `helmet` → **diferir** (justificación en informe Track 3, §5.1); (b) hardening de CSP con nonces → **diferir al paso 2** de la migración (informe Track 4, §8). Detalle en §7 |

---

## 3. Evidencia de corridas — `Cached: 0`

### 3.1 Suite E2E portal (criterio C-9 / CA-7)

Corrida completa en una sola invocación con servidor fresco (`PW_FORCE_FRESH_SERVER=1`), después del punto de no retorno:

```
$env:PW_FORCE_FRESH_SERVER='1'; pnpm exec playwright test --config=e2e/playwright.portal.config.ts --reporter=list
Running 159 tests using 1 worker
159 passed (7.5m)
EXIT=0
```

- `Cached: 0`: la suite invoca Playwright directamente (no pasa por la caché de Turborepo) y el servidor se levantó fresco — los logs muestran la compilación del portal por el webServer. No se reutilizó servidor externo.
- Antes de los fixes finales, la misma corrida daba **157/159** con dos fallos que se corrigieron en esta fase: (a) el mock de inventario resolvía el rol solo por header `Authorization` (tras C-9 la sesión viaja en cookie, por lo que el rol `ADMIN` no se propagaba al re-sembrar sesión → botón "Aprobar" ausente); (b) error transitorio de escritura de screenshots en Windows (`UNKNOWN`) en `portal-commercial-ui-evidence`, resuelto con reintento. Evidencia en el log `e2e-portal-full4.log`.

### 3.2 Suites unitarias y de verificación del monorepo

| Suite | Comando | Resultado |
| --- | --- | --- |
| Unit tests | `pnpm test` | **`Tasks: 9 successful, 9 total`; `Cached: 0`** — API: 3126 passed / 15 skipped; portal, web y paquetes en verde. `TEST_EXIT=0` |
| Typecheck | `pnpm typecheck` | **8/8 tareas en verde** (`Cached: 5 cached` por no-cambio en paquetes base, tareas afectadas re-ejecutadas) |
| Lint | `pnpm lint` | **0 errores**, 10 warnings pre-existentes (`LINT_EXIT=0`) |

Nota sobre `Cached: 5` en typecheck: corresponde a paquetes sin cambios; las apps `web`/`portal`/`api` re-compilaron (sus fuentes cambiaron). Ninguna evidencia de caché invalida los resultados de los tracks.

### 3.3 Consolidación CI Linux por SHA (G6.5) — corrida 31395607153

La declaración de cierre de esta fase (2026-08-09) se emitió con evidencia local (`Cached: 0`, §3.1–§3.2). La **evidencia de CI Linux por SHA en `main` (G6.5)** quedó confirmada el **2026-08-10** con la corrida [31395607153](https://github.com/Sleybc/iWana-neXt/actions/runs/31395607153) sobre el SHA corregido `66e9ce41`:

| Job | Resultado |
| --- | --- |
| E2E operativo R4.1 — API + storage + BullMQ reales | ✅ success |
| Lint + Typecheck + Build + Unit tests | ✅ success |
| Integridad de citas ADR | ✅ success |
| Build y validación de imágenes production | ✅ success |

**No conformidad de secuencia (registrada):** la fase se declaró CERRADA con evidencia local **antes** de contar con la verificación de CI Linux por SHA en `main`. El merge a `main` (`9bf776c`) disparó la corrida 31338427530, cuyo job E2E R4.1 falló por un **flake dependiente de la hora de ejecución** en el test 5d — solapamiento de ventanas de agenda entre el test 1a (`anchorScheduleIso(60..180)`) y el test 5d (`nowIso(900..930)`) cuando CI corre en UTC nocturno → `400` del `ScheduleConflictService`, no un defecto de la migración. Se corrigió post-cierre con el commit `66e9ce41` (`nowIso` → `anchorScheduleIso` en el test 5d) y la corrida 31395607153 quedó **completamente verde**, con el artefacto sanitizado `e2e-r41-summary` (693 B, expira 2026-11-08).

---

## 4. Re-verificación independiente AI-SEC-ENG (Track 5) — condiciones de merge

AI-SEC-ENG (aprobador de cierre, **no productor de ningún track**) ejecutó sus propios tests y emitió veredicto formal (2026-08-09). El veredicto y la evidencia quedan consolidados en este §4 (no existe informe de track independiente; §9 registra la referencia):

| Condición | Tests ejecutados por SEC-ENG | Resultado | Veredicto |
| --- | --- | --- | --- |
| **C-1** | `tenant.middleware.spec.ts` (11/11) · `tenant/tests/tenant-public-routes.spec.ts` (5/5) | PASS | **APROBADO** |
| **C-2** | `auth/guards/csrf.guard.spec.ts` (9/9, incluye test negativo) | PASS | **APROBADO** |
| **C-3** | `c3-no-token-storage.arch.spec.ts` (portal 1/1 · web 1/1) | PASS | **APROBADO** |
| Refuerzo | `api-client.spec.ts` (web y portal), `session-cookies.constants.spec.ts`, `auth.controller.http.spec.ts`, `jwt.strategy`, `app.config.cookie-secure.spec.ts` | PASS | — |

**Veredicto global del Track 5: `APROBADO`** para C-1, C-2 y C-3, con dos observaciones de riesgo bajo documentadas y aceptadas (H1: la consola de plataforma resuelve tenant por slug con token de plataforma — por diseño, contenido por RBAC de plataforma; H2: `/auth/refresh` es `@Public()` y queda fuera del guard CSRF — protección por cookie + `SameSite=Strict` + rotación, riesgo pre-existente y mínimo).

---

## 5. Punto de no retorno — declaración formal (C-9)

Con la suite E2E en verde (159/159) se retiró el soporte de lectura de tokens desde `localStorage` en ambas aplicaciones:

1. **`apps/portal/src/lib/api-client.ts`** — retirados `readLegacyAccessTokenFromStorage()`, `readLegacyMfaSetupTokenFromStorage()`, `ACCESS_TOKEN_STORAGE_KEY`, `MFA_SETUP_TOKEN_STORAGE_KEY`. Los tokens viven solo en memoria (`inMemoryAccessToken`, `inMemoryMfaSetupToken`).
2. **`apps/web/src/lib/api-client.ts`** — retirados `readLegacyAccessTokenFromStorage()` y `ACCESS_TOKEN_STORAGE_KEY`; token solo en memoria.
3. **`e2e/tests/helpers/portal-session.ts`** — sin puente de `localStorage`; siembra exclusivamente por cookie `portalAccessToken`. El slug de tenant se conserva en `localStorage` (no es token; C-3 no lo cubre).
4. **C-3 actualizado** — ambos `c3-no-token-storage.arch.spec.ts` exigen `toEqual([])` sin excepción `C3-BACKUP-READ` (comentario: "Punto de no retorno alcanzado (C-9): YA NO EXISTE excepción").
5. **E2E MFA setup** (`portal-admin-first-access.spec.ts`) — el token limitado `mfa-setup` se obtiene por flujo de login real (no por siembra de storage), coherente con la decisión 6 del ADR (token limitado solo en memoria).

**Declaración:** el punto de no retorno del ADR-081 (paso 1) está **alcanzado y verificado por test**, no por revisión. El sistema ya no es reversible por este mecanismo (el retiro del soporte antiguo es el punto de no retorno, según ADR-081 §plan).

---

## 6. Resultado de las dos revisiones de deuda §5.3 (CA-8)

| Deuda | Dueño | Decisión registrada (2026-08-09) |
| --- | --- | --- |
| CSP del API vía `helmet` no alineada con el baseline de las apps | AI-PLAT-OPS | **DIFERIR** — el API sirve JSON (única HTML: Swagger solo en no-prod); alinear implicaría tocar `main.ts` (backend, fuera de alcance); riesgo bajo pre-existente. Re-evaluación programada con la habilitación del dominio productivo (ADR-070/078). Detalle: [INFORME-PLAT-OPS-OLA1B-TRACK3-CONFIGURACION-v1.0.md](INFORME-PLAT-OPS-OLA1B-TRACK3-CONFIGURACION-v1.0.md) §5.1 |
| Hardening de CSP con nonces (`proxy.ts` + renderizado dinámico) | AI-FE-PLATFORM | **DIFERIR al paso 2** de la migración de ADR-081 (exige `proxy.ts` + renderizado dinámico). Estado verificado: CSP baseline emitida vía `async headers()`; `'unsafe-inline'` documentado como requerido por Next sin `proxy.ts`; cero `dangerouslySetInnerHTML`. Detalle: [INFORME-OLA1B-E2E-SESION-COOKIE-v1.0.md](INFORME-OLA1B-E2E-SESION-COOKIE-v1.0.md) §8 |

---

## 7. Desviaciones y supuestos

- **Correcciones al estado que suponía el ADR** (declaradas en el prompt, §3, y verificadas): token `password-change` de web sin clave propia (vive en la clave de sesión); no existía helper compartido de siembra E2E; `.env.example` no declaraba `NEXT_PUBLIC_API_URL` ni `COOKIE_SECURE`. Las tres quedaron resueltas por los tracks (C-3/corrección 1, helper compartido, documentación C-4/C-5).
- **Supuesto del token `mfa-setup`** (coordinado en el Track 4, §7.1): el token limitado no viaja en cookie ni en storage — vive en memoria y se obtiene por flujo de login. Los tests de `portal-admin-first-access` que lo requieren fueron adaptados al flujo real de login (decisión aceptada por AI-EM-ARCH al resolver el bloqueo C-9).
- **OpenAPI:** `platform/login` no cambia su contrato de payload (la emisión de cookies es transporte, no superficie de API); no se requirió regenerar OpenAPI.

---

## 8. Criterio de salida

- [x] CA-1, CA-2, CA-3 en verde (bloqueantes de merge) — ver §2 y §4
- [x] CA-4, CA-5, CA-6, CA-7 en verde (cierre de OLA1-b) — ver §2 y §3
- [x] CA-8: revisiones de deuda documentadas — ver §6
- [x] Re-verificación independiente de AI-SEC-ENG sobre C-1, C-2, C-3 (track 5) — ver §4
- [x] Informe de fase archivado en `docs/informes/` con evidencia — este documento
- [x] Soporte antiguo retirado como último acto, con las 22 especificaciones ya en verde (punto de no retorno declarado) — ver §5

**Estado de la fase: CERRADA.**

---

## 9. Artefactos y referencias

- **Encargo:** [PROMPT-TRANSVERSAL-OLA1-B-SESION-COOKIE-v1.0.md](../prompts/PROMPT-TRANSVERSAL-OLA1-B-SESION-COOKIE-v1.0.md)
- **Decisión rectora:** [ADR-081](../adrs/ADR-081-Modelo-de-Sesion-Cookie-HttpOnly.md)
- **Informes de tracks:** [Track 3 — Configuración](INFORME-PLAT-OPS-OLA1B-TRACK3-CONFIGURACION-v1.0.md) · [Track 4 — E2E](INFORME-OLA1B-E2E-SESION-COOKIE-v1.0.md) · Track 5 — re-verificación SEC-ENG (evidencia resumida en §4)
- **Logs de corrida (no versionados):** `e2e-portal-full4.log`, `test-ola1b.log`, `typecheck-ola1b.log`, `lint-ola1b.log`
- **Evidencia CI Linux por SHA (G6.5):** corrida [31395607153](https://github.com/Sleybc/iWana-neXt/actions/runs/31395607153) sobre `66e9ce41` — los 4 jobs en verde; artefacto sanitizado `e2e-r41-summary` (693 B, expira 2026-11-08). Detalle y no conformidad de secuencia en §3.3
- **Changelog del programa:** actualizado en [INFORME-PROGRAMA-REGULARIZACION-MODULOS-v1.0.md](INFORME-PROGRAMA-REGULARIZACION-MODULOS-v1.0.md)
