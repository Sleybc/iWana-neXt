# Plan — Corrección de expiración de sesión durante el trabajo activo (portal, proveedores)

- **Fecha:** 2026-09-09
- **Autoridad:** AI-EM-ARCH (modo combinado Architect + EM + Orchestrator, sesión ejecutora)
- **Estado:** Aprobado por el CTO en sesión; en ejecución
- **Base de trabajo:** checkout principal `C:\appiw` (rama vigente con WIP de inventory; sin worktrees, por decisión del CTO en sesión). Los cambios conviven con el WIP existente.
- **Origen:** reporte del usuario — formulario "Nuevo proveedor" (`dashboard/inventory?tab=suppliers`) falló con "No fue posible guardar / Tu sesión expiró..." al enviar; consola: `POST :3002/api/v1/purchasing/suppliers → 401` y `POST :3002/api/v1/auth/refresh → 401`.

## Diagnóstico (causa raíz, verificado en código Y confirmado en BD)

El access token (cookie 15 min) expiró durante el llenado del formulario y el refresh reactivo **también falló**. Tres defectos estructurales:

1. **`apps/api/src/modules/auth/auth.controller.ts:210-224`** — `/auth/refresh` prioriza la cookie de plataforma `webRefreshToken` y no hace fallback a la cookie tenant. Las cookies no se aíslan por puerto: con la consola plataforma (`apps/web`, localhost:3001) abierta en el mismo navegador, el refresh del portal ejecuta la rama de plataforma (tokens solo en Redis, volátiles en dev) → 401 con sesión tenant válida.
   **Confirmación BD (Tarea 0, 2026-09-09):** `tenant_iwana.refresh_tokens` — 0 filas `REUSE_ATTACK`, 0 `PASSWORD_CHANGE`, sin revocaciones masivas; las familias del usuario afectado siguen activas. El 401 no dejó rastro en Postgres del tenant → consistente con fallo en la rama plataforma (Redis). Hipótesis reuse-attack y password-change **refutadas** como causa del incidente.
2. **`apps/api/src/modules/auth/auth.service.ts:486-496`** — la detección de reuse revoca la familia completa; combinada con el single-flight de refresh por pestaña (`apps/portal/src/lib/api-client.ts:179`), dos pestañas rotando en carrera producirían un falso reuse-attack. Defecto estructural preventivo (no fue la causa de este incidente).
3. **Sin refresh proactivo** — el único refresh es reactivo tras 401. Con formularios largos (>15 min sin llamadas de red) se garantiza pasar por ese camino. Si el refresh falla, `terminalSessionError` queda pegajoso (`api-client.ts:412-414`) sin notificar a `AuthProvider`: estado zombi hasta recarga completa.

Hipótesis descartadas: cambios del working tree (sin archivos de auth modificados), CSRF (da 403), guards (endpoint `@Public()`), tenant sin resolver (da 400/403/404).

## Criterios de aceptación

1. Usuario activo nunca ve expiración: renovación proactiva antes del vencimiento.
2. Carrera entre pestañas no revoca la familia (single-flight cross-tab).
3. Cookie de plataforma presente no rompe el refresh tenant (ruteo por audiencia + fallback).
4. Si la sesión es realmente irrecuperable: modal de re-auth en sitio sin perder el formulario; el guardado se reintenta con éxito tras re-autenticar.
5. Gates AGENTS.md completos + revisión de seguridad reforzada (superficie de auth).

## Frentes de corrección

### Frente A — API: ruteo por audiencia y fallback en /auth/refresh

Skills: `auth-implementation-patterns`, `nestjs-expert`, `backend-security-coder`, `testing-patterns`.

- **A1. Ruteo por audiencia** (`auth.controller.ts`): con ambas cookies presentes, rama por `X-Tenant-Slug` (portal siempre lo envía; web nunca); fallback a la otra cookie si la elegida falla 401. Detección de reuse intacta. Sin cambios de contrato OpenAPI.
- **A2. TTLs configurables**: `JWT_ACCESS_EXPIRATION`/`JWT_REFRESH_EXPIRATION` al schema Joi de `app.config.ts`, consumidos en `auth.service.ts` y sincronizados con los maxAge de cookies (defaults 15m/7d).
- **A3. Observabilidad**: log estructurado de cada 401 de refresh con reason code (`REFRESH_COOKIE_MISSING`, `REFRESH_INVALID`, `REFRESH_REUSE_DETECTED`, `REFRESH_EXPIRED`, `REFRESH_USER_UNAVAILABLE`, equivalentes plataforma) — sin PII, sin cambiar el body de error.
- **A4. Tests** integration/unit: ruteo por header, fallback en ambos sentidos, una sola cookie, reuse-detection intacta, flags de cookies, parser de TTL.

### Frente B — Portal: refresh proactivo y single-flight entre pestañas

Skills: `frontend-dev-guidelines`, `frontend-security-coder`, `testing-patterns`.

- **B1. Single-flight cross-tab** (`api-client.ts`): Web Locks API (`navigator.locks.request('iwana-portal-auth-refresh')`) + `BroadcastChannel('iwana-portal-auth')`; re-verificación de renovación reciente dentro del lock; degradación elegante sin esas APIs.
- **B2. Refresh proactivo**: decodificar `exp` del access token en memoria; renovación a `exp − 90s`; reprogramación en `visibilitychange`/`focus`; cancelación en logout; fallo proactivo tolerado (no fija estado terminal por sí solo).
- **B3. Estado terminal notificable (contrato congelado con frente C)**: evento `iwana:session-expired` en window al fallar el refresh definitivamente + export `clearTerminalSessionError()`.
- **B4. Tests**: dedupe cross-tab, proactivo con fake timers, emisión de evento y desbloqueo tras re-login.

### Frente C — UX de recuperación de sesión en sitio

Skills: `iwana-identity-ui-review`, `core-components`, `system-vocabulary-review`.

- **C1. Modal de re-auth**: componente en portal (ModalLayer, consistente con `@iwana/ui`) montado ante `iwana:session-expired`; reutiliza el flujo de login existente (incluye MFA). Al éxito: `clearTerminalSessionError()`, cerrar modal. El drawer del proveedor no se desmonta → datos intactos.
- **C2. Alerta accionable**: en `SupplierFormDrawer`/`InventoryClient`, CTA "Iniciar sesión" (abre el modal) y "Reintentar" tras re-auth.
- **C3. Tests de componente**: fallo 401 → modal → re-login → retry de guardado exitoso con datos conservados.

### Frente D — Verificación E2E y gates

Skills: `playwright-skill`, `e2e-testing-patterns`, `verification-before-completion`.

- **D1. E2E portal**: con TTL corto por config (A2): (a) flujo proveedor → esperar >TTL access → submit → éxito transparente; (b) refresh irrecuperable (interceptar `/auth/refresh` → 401) → modal → re-login → datos conservados y guardado exitoso.
- **D2. Review de seguridad reforzada** (perspectiva AI-SEC-ENG): fallback no amplía superficie, sin PII en logs, flags de cookie intactos, sin cambios en OpenAPI.
- **D3. Gates pre-merge**: `pnpm lint`, `pnpm typecheck`, `pnpm test`, cobertura ≥80% en módulos tocados, informe en `docs/informes/INFORME-SESION-REFRESH-PORTAL-v1.0.md`.

## Delegación y secuenciación

1. Tarea 0 — **completada**: H1 confirmada con evidencia de BD (ver arriba).
2. Frentes A y B en paralelo (conjuntos de archivos disjuntos); contrato congelado B↔C: evento `iwana:session-expired` + `clearTerminalSessionError()`.
3. Frente C tras B.
4. Frente D tras A+B+C; review de seguridad antes de merge.
5. Desempates técnicos por AI-EM-ARCH; escalación al CTO solo si se requiere cambiar estructura de cookies (fuera de alcance: ADR-081 no se modifica).
