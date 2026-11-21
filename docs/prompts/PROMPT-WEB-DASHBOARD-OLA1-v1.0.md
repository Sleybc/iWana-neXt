# PROMPT — WEB-DASHBOARD · Ola 1 (cifras reales y limpieza)

**Versión:** 1.0 · **Fecha:** 2026-11-21 · **Emisor:** AI-EM-ARCH · **Etapa:** 4 (G4 se emite con contrafirma pendiente del receptor)
**Precondición:** G0-1 y G0-2 de [INFORME-WEB-DASHBOARD-AUDITORIA-v1.0.md](../informes/INFORME-WEB-DASHBOARD-AUDITORIA-v1.0.md) §4 — ✅ aprobados por el CTO el 2026-11-21.
**Plan:** [2026-11-21-web-dashboard-auditoria-remediacion.md](../plans/2026-11-21-web-dashboard-auditoria-remediacion.md) · **Spec de pantalla:** [UX portada de señal](../specs/2026-08-11-web-centro-control-portada-senal-ux-spec.md) v1.0 (no cambia el diseño)

## Contrato congelado — `TenantStatusSummary` v1.0

Lo producen §A y lo consumen §B y §C en paralelo. Un cambio a este contrato es el único motivo de re-sync, y se pide con `[BLOQUEO]` a AI-EM-ARCH.

- **Constante** `TENANT_ATTENTION_STATUSES = ['PROVISIONING_FAILED','SUSPENDED','MARKED_FOR_DELETION'] as const`, en `packages/shared/src/enums/tenant-status.enum.ts` (G0-2).
- **Tipo** `TenantStatusSummary`, en `packages/shared/src/dto/`:
  `{ total: number; byStatus: Record<TenantStatus, number>; updatedLast7Days: number; attention: Array<{ id: string; name: string; status: TenantStatus; updatedAt: string }>; generatedAt: string }`
  - `byStatus` trae todas las claves de `TenantStatus`, en 0 si no hay empresas en ese estado.
  - `attention` lleva como máximo 5 empresas con estado en `TENANT_ATTENTION_STATUSES`, ordenadas por severidad (`PROVISIONING_FAILED`, `MARKED_FOR_DELETION`, `SUSPENDED`) y luego por `updatedAt` descendente. No lleva PII.
- **Endpoint** `GET /api/v1/tenants/summary`, respuesta `{ data: TenantStatusSummary }`.
  - Guards: los mismos de `GET /tenants` (`tenant.controller.ts:742-743`), es decir, `@Roles(PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)` bajo `JwtAuthGuard` y `RolesGuard` de la clase. `RolesGuard` exige un token de plataforma; no se añade otro guard.
  - Se declara antes de `@Get(':id')` (`tenant.controller.ts:775`).

## §A — sr-backend: endpoint de resumen (E-1, E-3)

1. Crear la constante y el tipo en `@iwana/shared` y exportarlos en `index.ts`.
2. `TenantService.getStatusSummary()`: una consulta con `GROUP BY status` y `COUNT(*) FILTER (WHERE updated_at >= now() - interval '7 days')`, más una consulta de `attention` con `LIMIT 5`. Sin N+1.
3. Pruebas:
   - Unitaria del servicio.
   - Integración contra Postgres, sembrando **más de 100** empresas y comprobando que `total` y `byStatus` son exactos.
   - 403 para un token de tenant.
4. OpenAPI: `@ApiResponse` con el tipo.

**Fuera de alcance:** índices (E-4), `/health`, cambiar `GET /tenants`.

## §B — fe-platform: consumir el resumen y limpiar (E-1, E-2, L-1…L-11, V-1)

1. Añadir `tenantApi.summary()` en `apps/web/src/lib/api-client.ts`.
   - `DashboardClient` deja de pedir `tenantApi.list` y toma chips, distribución e indicadores de `byStatus`, `total` y `updatedLast7Days`. El chip «Requieren atención» suma `TENANT_ATTENTION_STATUSES`.
   - `NotificationBell` pinta `attention` y deja de pedir la lista de 100.
   - Hasta que §A esté publicado, usar un mock derivado del tipo compartido.
2. Aplicar las filas L-1 a L-13 del informe §2 tal como están escritas: borrar `PanelCard.tsx`, `layout/Header.tsx` y `layout/ThemeToggle.tsx`; mover `TenantsTable` y su spec a `components/tenants/`; cambiar `<main>` por `div` y los `h3` por `h2`; persistir el sidebar con try/catch; dar a la campana un estado de error con reintento real; mover el copy a `PLATFORM_UI_COPY`; desacoplar los indicadores de salud de la lógica de negocio; pedir `status: 'ACTIVE'` al servidor en los selectores de `/users` y `/audit-logs`; y validar la sesión de `AuthProvider` solo al montar.
3. V-1: comprobar con `pnpm --filter @iwana/web build` y `start` si `auth/me` y `branding/public` siguen pidiéndose dos veces. Si persiste, deduplicar; si no, registrarlo como efecto de StrictMode.
4. Actualizar `DashboardClient.spec.tsx`, `SignalChips.spec.tsx` y `NotificationBell.spec.tsx` según los cambios.

**Fuera de alcance:** primitives nuevas de `@iwana/ui`, tokens y el formateador de fechas compartido (Ola 3). No tocar el aspecto visual.

## §C — sr-qa: blindaje de pruebas (Q-1, Q-2 parcial, Q-3 en e2e/)

1. axe con `wcag2a`, `wcag2aa`, `wcag21aa` y `wcag22aa` en `web-auth-dashboard.spec.ts`, `web-audit-logs-historial.spec.ts` y `web-empresas-directorio.spec.ts`. En `/dashboard`, además a 375 px y en tema oscuro.
2. `e2e/tests/helpers/web-api-mocks.ts`:
   - Mock de `/tenants/summary` desde el tipo compartido, con opción `health` configurable.
   - Que `platform-audit-logs` respete `limit`.
   - `DASHBOARD_TENANTS` y `loginToDashboard` compartidos, sin la duplicación de Q17.
3. E2E: con un resumen de 233 empresas, los chips muestran los conteos del resumen y no 100.
4. Nuevo `apps/web/src/components/dashboard/SystemStatusPanel.spec.tsx`: cuatro niveles, `formatLastChecked`, salud parcial.

**Fuera de alcance:** `DashboardClient.spec.tsx`, que es de §B. Partir sus tests (Q-3) y cubrir el reintento real y los tramos de `formatRelativeDate` (resto de Q-2) va en el bloque 2C de la Ola 2, sobre el código ya cerrado.

## Entradas, restricciones y entregables

- **Entradas:** [informe](../informes/INFORME-WEB-DASHBOARD-AUDITORIA-v1.0.md) §2 (filas citadas por ID), [spec UX](../specs/2026-08-11-web-centro-control-portada-senal-ux-spec.md) v1.0 con la aclaración del 2026-11-21, y el código citado en cada fila.
- **Restricciones:** las de `AGENTS.md`, en especial `pnpm`, boundaries del Modulith, nada de PII en logs ni en fixtures, y la escritura mínima.
- **Entregables:** el código y las pruebas de cada bloque; el reporte con rutas, conteos reales y deuda; y la sección «Ola 1» añadida al informe por AI-EM-ARCH al cerrar.
- **Criterios de aceptación:**
  - CA-1: en vivo, los chips y la distribución coinciden con `GROUP BY status`.
  - CA-2: la campana lista hasta 5 empresas de `attention`, sin pedir `tenants?limit=100`.
  - CA-3: un solo `<main>`, y los títulos de panel en `h2`.
  - CA-4: axe con `wcag22aa` en verde a 375 px y 1280 px, claro y oscuro.
  - CA-5: los selectores de `/users` y `/audit-logs` listan todas las empresas activas (8 con los datos de desarrollo).
- **Detenerse si:** el contrato no alcanza, una prueba existente se pone roja y «ajustarla» cambiaría su intención (pasar por `test-change-reviewer`), o hace falta tocar `@iwana/ui` o tokens. En cualquiera de los casos, `[BLOQUEO]` a AI-EM-ARCH.

## Paso de cierre (stop/go)

- `pnpm --filter @iwana/shared --filter @iwana/api --filter @iwana/web typecheck lint test` con conteo real (`iwana-test-evidence`, `Cached: 0`).
- E2E de la consola: `playwright.web.config.ts` en verde.
- `boundary-reviewer` sobre §A; `test-change-reviewer` sobre las specs modificadas.
- Revisión en vivo de `/dashboard`: los chips coinciden con `SELECT status, count(*) FROM public.tenants GROUP BY status`.
- G6 de la ola, y commit local por bloque y sin push. El push va en el tren siguiente (ADR-107 D2), con orden expresa del CTO.
