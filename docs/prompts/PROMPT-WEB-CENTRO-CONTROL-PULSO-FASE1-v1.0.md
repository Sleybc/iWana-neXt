# PROMPT — WEB-CENTRO-CONTROL · Pulso de plataforma · Fase 1 (recomposición sin backend)

**Versión:** 1.0 · **Fecha:** 2026-11-21 · **Emisor:** AI-EM-ARCH · **Etapa:** 4 (G4 con contrafirma pendiente del receptor)
**Precondición:** G0 D1 y D2 ✅ CTO 2026-11-21 en la [dirección](../specs/2026-11-21-web-centro-control-pulso-plataforma-direccion.md) §7.
**Plan:** [2026-11-21-web-centro-control-pulso-plataforma.md](../plans/2026-11-21-web-centro-control-pulso-plataforma.md) · **Prototipo:** [prototipo_web_centro_control.html](../prototipo/prototipo_web_centro_control.html) (solo los bloques marcados «Hoy») · **Contrato DS vigente:** [consolidación v1.2](../specs/2026-11-21-web-portal-dashboard-consolidacion-ds-contrato.md)

## Composición de la Fase 1

Sin endpoints nuevos. Fuentes: `tenantApi.summary()`, `tenantApi.list({ limit: 5 })` (el servicio ya ordena por alta descendente), `platformAuditApi.list()`, `healthApi.get()`.

| Banda | Contenido | Fuente |
| --- | --- | --- |
| B0 | `PageHeader`: título, última lectura (`generatedAt`) y Actualizar | — |
| B1 | Pulso, una superficie y 4 celdas: Empresas activas · Altas en curso · Requieren atención (con `StackedBar` por estado) · Salud de plataforma (estado y «API · base de datos · Redis») | `summary`, `health` |
| B2 izq. (8) | Dos áreas: **Empresas** (`TenantStatusDistribution` compacta) y **Salud de plataforma** (`SystemStatusPanel` compacto, reglas E1–E6 del contrato DS §4.1 intactas) | `summary`, `health` |
| B2 der. (4) | **Requiere tu atención**: una fila por empresa de `summary.attention` (En riesgo: puesta en marcha con error; Atención: suspendida o en eliminación) y una fila En riesgo por servicio de salud caído. Máx. 6. Cada fila abre el detalle de esa empresa (la ruta que ya usa `NotificationBell`). Vacía: «Todo al día» | `summary.attention`, `health` |
| B4 izq. (7) | **Últimas empresas**: tabla-en-card, 5 filas, sin pager: empresa, estado, alta, último cambio | `tenants?limit=5` |
| B4 der. (5) | **Actividad reciente** sin eventos de sesión, máx. 5 | `platform-audit-logs` |

Sale de la pantalla: `DashboardMetricStrip` (lo sustituye el pulso), el chip «Cambios esta semana» y el indicador «Atención operativa» (lo sustituye la cola). **No se monta** nada de P1–P4: ni tendencia, ni deltas, ni disponibilidad histórica, ni equipo interno, ni uso por empresa.

## §A — ds-owner: contrato DS v1.3 (aditivo)

1. Añadir al contrato de consolidación una sección v1.3 con dos primitives de `@iwana/ui`, derivadas 1:1 de `apps/portal/src/components/dashboard/DashboardPulse.tsx` y `DashboardAttentionQueue.tsx`: API, anatomía, estados requeridos y mapa de migración del portal. Tonos por `Tone` (`danger` → `error`); `progress` sigue siendo exclusivo del delta.
2. Variante compacta de las dos áreas de B2 sobre `Card`, sin tokens nuevos.
3. Veredicto D4 de la dirección. Si la promoción no procede, `[BLOQUEO]` con alternativa.

**Fuera de alcance:** código, tokens nuevos, `Chart`.

## §B — fe-platform: primitives y pantalla

1. Mover (no copiar) las dos piezas del portal a `packages/ui`, exportarlas en `index.ts` y sumarlas al inventario de `core-components`; el portal las importa de `@iwana/ui` y sus archivos locales se borran.
2. Recomponer `apps/web/src/components/dashboard/DashboardClient.tsx` según la tabla. Reutilizar `TenantStatusDistribution`, `SystemStatusPanel`, `RecentActivityPanel`, `ErrorState`, `EmptyState` y `StackedBar`; borrar `DashboardMetricStrip` y su spec.
3. Actividad sin sesión: pedir `limit: 20`, descartar en cliente las acciones de sesión del enum `AuditAction` y pintar 5. Marcar `// atajo: filtra en cliente sobre 20, subir a filtro de servidor en Fase 2`.
4. Copy nuevo en `PLATFORM_UI_COPY`; sin «tenant», enums ni ids visibles.
5. Actualizar `DashboardClient.spec.tsx` y las specs del portal que cambien de import.

**Fuera de alcance:** `apps/api`, `packages/shared`, `NotificationBell`, `/tenants`.

## §C — sr-qa: E2E y accesibilidad

1. Reescribir `e2e/tests/web-centro-control-portada.spec.ts` contra CA-PP-01…08 con los mocks de `e2e/tests/helpers/web-api-mocks.ts` (añadir `tenants?limit=5`).
2. axe `wcag22aa` en `/dashboard` a 375 y 1280 px, claro y oscuro.
3. Correr la E2E del inicio del portal tras el traslado de §B (build de producción, puerto 3002 libre).

**Fuera de alcance:** `DashboardClient.spec.tsx` (es de §B).

## Entradas, restricciones y entregables

- **Restricciones:** `AGENTS.md` (pnpm, escritura mínima, sin PII en fixtures); no ejecutar `scripts/dev.mjs` ni matar procesos por nombre; todo en `main`.
- **Entregables:** código y pruebas por bloque, reporte con rutas, conteos reales y deuda. AI-EM-ARCH abre `INFORME-WEB-CENTRO-CONTROL-PULSO-v1.0.md` al cerrar.
- **Criterios de aceptación:**

| ID | Criterio |
| --- | --- |
| CA-PP-01 | A 1440 × 900 se ven B0, B1 y B2 completos sin desplazar |
| CA-PP-02 | Cada conteo por estado aparece en el pulso y en el área Empresas, y en ningún otro bloque |
| CA-PP-03 | La cola ordena En riesgo antes que Atención, cada fila abre su empresa y, sin filas, dice «Todo al día» |
| CA-PP-04 | Una fuente en error degrada solo sus bloques, con Reintentar; nunca pinta `0` ni fila, tampoco durante la carga |
| CA-PP-05 | Ningún bloque de P1–P4 está montado |
| CA-PP-06 | Actividad: máx. 5, sin eventos de sesión, con `<time dateTime>` |
| CA-PP-07 | Lima solo en la barra del ítem activo del menú; sin degradado azul→lima; `audit-ui.mjs` con P0/P1 = 0 |
| CA-PP-08 | axe `wcag22aa` en verde a 375 y 1280 px, claro y oscuro |
| CA-PP-09 | Las dos piezas existen solo en `@iwana/ui`; la E2E del inicio del portal sigue en verde |

- **Detenerse si:** hace falta un endpoint, un token nuevo o cambiar el contrato DS congelado; o una prueba existente se pone roja y ajustarla cambia su intención (`test-change-reviewer`). `[BLOQUEO]` a AI-EM-ARCH.

## Paso de cierre (stop/go)

- `pnpm --filter @iwana/ui --filter @iwana/web --filter @iwana/portal typecheck lint test` con conteo real (`iwana-test-evidence`, `Cached: 0`).
- `playwright.web.config.ts` en verde y E2E del inicio del portal.
- `test-change-reviewer` sobre las specs modificadas; `iwana-identity-ui-review` en modo review sobre `/dashboard`.
- Revisión en vivo en `localhost:3001/dashboard` contra el prototipo, claro y oscuro.
- G6 y commit local por bloque con índice temporal, sin push (ADR-107 D2).
