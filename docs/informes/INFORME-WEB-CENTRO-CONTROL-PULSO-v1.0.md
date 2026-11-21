# INFORME — Centro de control «Pulso de plataforma» (`apps/web`, `/dashboard`)

**Versión:** 1.0 · **Fecha:** 2026-11-21 · **Emisor:** AI-EM-ARCH · **Plan:** [2026-11-21-web-centro-control-pulso-plataforma.md](../plans/2026-11-21-web-centro-control-pulso-plataforma.md) · **Dirección:** [v1.1](../specs/2026-11-21-web-centro-control-pulso-plataforma-direccion.md)

## Fase 1 — Recomposición sin backend

**Estado:** G6 ✅ 2026-11-21 (AI-EM-ARCH) · commit local, sin push.

| Bloque | Agente | Entregable |
| --- | --- | --- |
| 1A | `ds-owner` | Contrato DS v1.3 congelado (§7bis): `PulseStrip`, `AttentionQueue`, `density` compacta. D4 procede |
| 1B | `fe-platform` | Primitives movidas a `@iwana/ui` (portal sin copias), `DashboardClient` recompuesto, `LatestTenantsPanel` |
| 1C | `sr-qa` | E2E de la portada reescrita contra CA-PP-01…08; axe `wcag22aa` |

**Evidencia (conteo real, `--force`, `Cached: 0`):**

| Comando | Resultado |
| --- | --- |
| `@iwana/ui` typecheck lint test | 14 suites · 142 tests |
| `@iwana/web` typecheck lint test | 40 suites · 292 tests |
| `@iwana/portal` typecheck lint test | 457 suites · 5198 tests + 1 omitido |
| `playwright.web.config.ts --workers=1` | 33/35; las 2 rojas son preexistentes (triaje `e2e-triage`) |
| axe `wcag22aa` 375/1280, claro/oscuro | 4/4 |
| E2E inicio del portal (servidor de desarrollo) | 47/47 |
| `audit-ui.mjs` | P0/P1 = 0 |
| Revisión en vivo `localhost:3001/dashboard` 1440×900 | B0, B1, B2 y B4 conforme al prototipo; consola sin errores |

**Decisiones de AI-EM-ARCH:** lima en «Todo al día» permitido por el contrato DS §7bis.3 (CA-PP-07 se lee como «sin lima decorativa»); el punto lima de la actividad era defecto y se corrigió. Los enlaces por estado de la leyenda compacta se conservan. `test-change-reviewer` pidió restaurar 13 coberturas de `DashboardClient.spec.tsx`; restauradas. Sobre las E2E, `test-change-reviewer` no encontró regresión probada.

**Deuda:**

| # | Deuda | Severidad |
| --- | --- | --- |
| F1-D1 | `DashboardMetricStrip` sigue vivo: lo usa `/tenants` | P3 |
| F1-D2 | `web-empresas-directorio` D-5 (25 vs 24 px a 375) y `web-tenant-create-happy-path` (backend real) rojas preexistentes | P2 |
| F1-D3 | E2E del portal con build de producción no corrida: 3002 ocupado por `pnpm dev` (CA-PP-09 verificado en dev) | P2 |
| F1-D4 | Actividad filtra en cliente (atajo) hasta la Fase 2 | P3 |
| F1-D5 | `PulseStrip` sin `aria-busy` por celda | P3 |
| F1-D7 | `web-audit-logs-datepicker:198` con `exact` queda más débil; el mock de `/tenants` corta por `limit` sin ordenar (sin prueba de orden de «Últimas empresas») | P3 |
| F1-D6 | `'danger'` aún en `dashboard-visuals.tsx` y `DashboardAreaCards.tsx` del portal | P3 |

## Fase 2 — P1 y P3

**Estado:** G6 ✅ 2026-11-21 (AI-EM-ARCH) · commit local, sin push. Encargo: [FASE2](../prompts/PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE2-v1.0.md).

| Bloque | Agente | Entregable |
| --- | --- | --- |
| Contratos | AI-EM-ARCH | `TenantStatusSummary` v1.1, `PlatformUsersSummary` v1.0, `AUDIT_SESSION_ACTIONS` en `packages/shared` |
| §A | `sr-backend` | Serie mensual en `PlatformAuditService.countEntityLifecycleByMonth`, `GET platform-users/summary`, `excludeSessionEvents` |
| §B | `fe-platform` | Tendencia con `Chart` (ADR-112), delta del mes, antigüedad del alta, celda Equipo interno, área Usuarios internos; filtro de sesión en servidor |
| §C | `sr-qa` | Mocks v1.1, CA-PP2-01…06, axe |

**Evidencia (conteo real, `--force`, `Cached: 0`):**

| Comando | Resultado |
| --- | --- |
| `@iwana/shared` test | 59 suites · 811 tests |
| `@iwana/web` typecheck lint test | 40 suites · 299 tests |
| `@iwana/api` typecheck lint test | 626/627 suites · 8374/8375 tests; la roja (`app.config.production-urls.spec.ts`) pasa aislada 29/29: intermitente bajo carga, ajena al cambio |
| Integración `DB_NAME=test` (3 specs) | 3 suites · 11 tests |
| `e2e/playwright.web.config.ts --workers=1` | 41/43; rojas = las 2 preexistentes de F1-D2 |
| axe `wcag22aa` 375/1280, claro/oscuro | 4/4 |
| Revisión en vivo 1440×900 con datos reales | 5 celdas, tendencia 184 altas / 182 bajas, B2 termina a 761 px; sin P2 ni P4 |

**Revisores:** `boundary-reviewer` GO con condición (SQL directo sobre `platform_audit_logs` desde `TenantService`) → corregido moviendo la agregación a `PlatformAuditService`. `contract-drift-reviewer`: sin deriva. `test-change-reviewer`: sin regresiones; hueco del `@Transform` cubierto con `query-platform-audit-logs.dto.spec.ts`. sr-qa halló la tendencia en ceros sin estado vacío (CA-PP2-01) → corregido.

**Deuda:**

| # | Deuda | Severidad |
| --- | --- | --- |
| F2-D1 | `web-chart.tsx` repite `portal-chart.tsx`; subirlo a `@iwana/ui` lo decide ds-owner | P3 |
| F2-D2 | Sin serie histórica de activas: la tendencia no tiene la línea de activas ni el selector de periodo del prototipo | P3 |
| F2-D3 | Fila «usuarios sin verificación en dos pasos» en la cola: no pedida; decide prod-ux | P3 |
| F2-D4 | `platform_audit_logs` es append-only: la integración deja filas sintéticas en `test` | P3 |
| F2-D5 | `exportCsv` de auditoría no aplica `excludeSessionEvents` | P3 |
| F2-D6 | `app.config.production-urls.spec.ts` intermitente bajo carga | P2 |
| F2-D7 | Mocks E2E repiten literales de sesión en vez de importar `AUDIT_SESSION_ACTIONS` | P3 |

## Fase 3 — P2

**Estado:** G6 ✅ 2026-11-21 (AI-EM-ARCH) · commit local, sin push. Encargo: [FASE3](../prompts/PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE3-v1.0.md).

| Bloque | Agente | Entregable |
| --- | --- | --- |
| Contrato | AI-EM-ARCH | `PlatformHealthHistory` v1.0 en `packages/shared` |
| §A | `sr-backend` | Migración `public/034_platform_health_samples`, entidad, muestreador del worker cada 5 min (retención 35 días), `GET /api/v1/platform/health/history` |
| §B | `plat-ops` | `API_INTERNAL_URL` en `docker-compose.prod.yml` y `.env.example`; red `data` compartida worker↔API |
| §C | `fe-platform` | Celda «Disponibilidad, 30 días», tracker de 30 días en Salud, área Colas de trabajo con nombres en español |
| §D | `sr-qa` | Mocks `healthHistory`, CA-PP3-01…03 y 05, axe |

**Evidencia (conteo real):**

| Comando | Resultado |
| --- | --- |
| `@iwana/db` jest `--force` | 83 suites · 458 tests |
| `@iwana/worker` jest `--force` | 29 suites · 315 tests |
| `@iwana/api` jest `--force` | 628/629 suites · 8383/8384 tests; la roja es F2-D6 (`app.config.production-urls.spec.ts`, pasa aislada) |
| `@iwana/web` typecheck lint test | 40 suites · 304 tests |
| Integración `DB_NAME=test` | API 5/5 (401 anónimo y token inválido, 403 token de empresa, día parcial, días sin muestras, tabla vacía) · worker 2/2 (Redis real: cola vacía y antigüedad; retención) |
| `e2e/playwright.web.config.ts --workers=1` | 46/49; rojas: las 2 de F1-D2 y D-4 de `web-empresas-directorio`, intermitente (aislada 2/2) |
| Portada (focal) y axe `wcag22aa` | 28/28 · 4/4 |
| Revisión en vivo 1440×900 con endpoint real | 200 con 30 días; sin muestras aún: «Sin dato disponible» y tracker neutro, nunca verde; B2 termina a 762 px; sin P4 |
| Migración 034 | aplicada en `dbiw` y `test` con `pnpm --filter @iwana/db migration:run` |

**Revisores:** `boundary-reviewer` sin hallazgos (una nota menor); `contract-drift-reviewer` sin deriva (2 menores); `test-change-reviewer` sin regresiones. La señal instantánea de servicio caído queda en «Requiere tu atención».

**Deuda:**

| # | Deuda | Severidad |
| --- | --- | --- |
| F3-D1 | Umbrales de color de disponibilidad (100 % verde, desde 99 % ámbar) fijados por fe-platform: confirmar con prod-ux | P2 |
| F3-D2 | No se observó en vivo que el worker de `pnpm dev` escriba muestras (el rol MCP no lee la tabla) | P2 |
| F3-D3 | Sonda HTTP del muestreador a `API_INTERNAL_URL`: revisión de `sec-eng` antes de G7 | P2 |
| F3-D4 | Tracker local de `apps/web`; candidato a `@iwana/ui` (ds-owner) | P3 |
| F3-D5 | `PlatformQueueSnapshot` y `PlatformHealthSampleQueue` sin `satisfies` entre sí; nombres de cola en copy a mano | P3 |
| F3-D6 | Sin prueba E2E de 401 (cubierto en integración del API); `formatPercent` trunca en vez de redondear | P3 |
| F3-D7 | `docker-compose.e2e.yml` sin API: ese worker no mide `api` | P3 |

## Fase 4 — P4

**Estado:** detenida en espera del CTO. No se implementa.

[ADR-114 (propuesto)](../adrs/ADR-114-Uso-por-Empresa-en-la-Consola-de-Plataforma.md): el API de plataforma no lee schemas de empresa; un job del worker guarda por hora un conteo por empresa en `public.tenant_usage_snapshots`. Dictamen de AI-SEC-ENG (§7): **aprobable con 7 condiciones**; principal hallazgo de contexto: API y worker comparten el rol `DB_APP_USER`, así que el confinamiento es de código, no de base de datos.

| Espera decisión del CTO | Opciones |
| --- | --- |
| D3 de la dirección: mostrar conteos por empresa | Aprobar ADR-114 con las condiciones de §7 (recomendado) · rechazar y dejar P4 sin montar |
| Visibilidad de P4 | Solo `SYSTEM_ADMIN` · también `IWANA_SUPPORT` |
