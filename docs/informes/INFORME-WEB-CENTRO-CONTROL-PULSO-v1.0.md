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
| ~~F3-D2~~ | Cerrada 2026-11-22: el worker de `pnpm dev` escribió la muestra de salud al arrancar (`db_ok` y `redis_ok` en verdadero, 19 colas) y la consola la pinta. En local `api_ok` queda nulo porque `.env` no define `API_INTERNAL_URL` (está en `.env.example`): el API no se mide y el tracker marca el día sin dato | — |
| F3-D3 | Sonda HTTP del muestreador a `API_INTERNAL_URL`: revisión de `sec-eng` antes de G7 | P2 |
| F3-D4 | Tracker local de `apps/web`; candidato a `@iwana/ui` (ds-owner) | P3 |
| F3-D5 | `PlatformQueueSnapshot` y `PlatformHealthSampleQueue` sin `satisfies` entre sí; nombres de cola en copy a mano | P3 |
| F3-D6 | Sin prueba E2E de 401 (cubierto en integración del API); `formatPercent` trunca en vez de redondear | P3 |
| F3-D7 | `docker-compose.e2e.yml` sin API: ese worker no mide `api` | P3 |

## Fase 4 — P4, uso por empresa

**Estado:** G6 ✅ 2026-11-21 (AI-EM-ARCH) · commit local, sin push. [ADR-114](../adrs/ADR-114-Uso-por-Empresa-en-la-Consola-de-Plataforma.md) aprobado por el CTO el 2026-11-21 con D3. Visibilidad (CTO): «System_Admin, y a los roles que se les dé permiso» → constante `PLATFORM_TENANT_USAGE_ROLES` (hoy solo `SYSTEM_ADMIN`). Encargo: [FASE4](../prompts/PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE4-v1.0.md).

| Bloque | Agente | Entregable |
| --- | --- | --- |
| Contrato | AI-EM-ARCH | `TenantUsage` v1.0 y `PLATFORM_TENANT_USAGE_ROLES` en `packages/shared` |
| §A | `sr-backend` | Migración `public/035_tenant_usage_snapshots` (FK en cascada), definición única de suscriptor listado en `@iwana/db` (CRM la importa), job horario del worker, `GET /api/v1/tenants/usage` auditado |
| §B | `fe-platform` | Área «Uso por empresa» solo para roles autorizados; «Sin dato», desactualizada a 2 h, cupo 0 distinto de sin cupo |
| §C | `sr-qa` | `web-centro-control-uso-empresa.spec.ts`, rol de los mocks alineado al API real, CA-PP3-05 reformulado |
| Verificación | `sec-eng` | Las 7 condiciones del ADR-114 §7 cumplen: GO |

**Evidencia (conteo real, `--force`, `Cached: 0`):**

| Comando | Resultado |
| --- | --- |
| `@iwana/shared` | 59 suites · 811 tests |
| `@iwana/db` | 85 suites · 463 tests |
| `@iwana/worker` | 30 suites · 317 tests |
| `@iwana/api` | 629/630 suites · 8388/8389 tests; la roja es F2-D6 |
| `@iwana/web` (paquete solo) | 40 suites · 308 tests; en la corrida paralela de 5 paquetes CA-PP2-02 superó los 15 s |
| Integración `DB_NAME=test` | API 4/4 (200 con solo campos del contrato, 401, 403 `IWANA_SUPPORT`, 403 empresa) · worker 2/2 (definición de CRM, fallo aislado sin 0, cascada) |
| `e2e/playwright.web.config.ts --workers=1` | 57/59; rojas = las 2 de F1-D2 |
| E2E uso por empresa y axe | 10/10 · 4/4 |
| Revisión en vivo 1440×900 como `SYSTEM_ADMIN` | `tenants/usage` 200; iWana «Sin dato» (aún sin medición); B3 en 3 + 2; B2 termina a 761 px; sin desplazamiento horizontal |
| Migración 035 | aplicada en `dbiw` y `test` |

**Revisores:** `boundary-reviewer` GO; la definición en `@iwana/db` en vez de un puerto de CRM la acepta AI-EM-ARCH (nota en ADR-114 §7). `contract-drift-reviewer` sin deriva; cupo 0 frente a sin cupo → corregido. `test-change-reviewer` sin regresiones.

**Incidencia de entorno:** el API de `pnpm dev` (3000) cayó durante la fase, probablemente al recompilar `@iwana/db`. Con autorización del usuario se arrancó solo el API con `pnpm --filter @iwana/api dev` en una pestaña nueva; web, portal y contenedores no se tocaron.

**Deuda:**

| # | Deuda | Severidad |
| --- | --- | --- |
| F4-D1 | Medición «bajo demanda tras activar una empresa» (ADR-114 D2) no implementada: una empresa nueva sale «sin dato» hasta una hora | P2 |
| F4-D2 | El conteo incluye anonimizados (regla de la lista CRM); el conteo de colas de CRM los excluye. Decide el CTO | P2 |
| F4-D3 | Permisos de plataforma asignables por pantalla: exigen un modelo de permisos de plataforma con ADR propio | P3 |
| F4-D4 | Umbrales de color del uso (90 % / 95 %) tomados del prototipo; confirmar con prod-ux | P3 |
| F4-D5 | Una fila por empresa sin tope; límite o «Ver más» por decidir (prod-ux) | P3 |
| F4-D6 | La cascada se probó borrando la empresa directo, no con la función de purga R7 | P3 |
| ~~F4-D7~~ | Cerrada 2026-11-22: el worker midió iWana (1 suscriptor activo, cupo 10 000) y la consola lo muestra en «Uso por empresa» | — |
