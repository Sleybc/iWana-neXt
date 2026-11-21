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

Pendiente.

## Fase 3 — P2

Pendiente.

## Fase 4 — P4

ADR-114 (propuesto) con dictamen de AI-SEC-ENG: aprobable con 7 condiciones. Espera D3 del CTO; no se implementa.
