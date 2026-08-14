# PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.2

## Prompt de ejecución — U-D3: KPI vertical y retícula de hasta 4 por fila

**Versión:** 1.2
**Estado:** Ejecutado — AI-FE-PLATFORM + AI-SR-QA GO (2026-08-12)
**Fecha:** 2026-08-12
**Emite:** AI-EM-ARCH
**Destinatarios:** AI-FE-PLATFORM · AI-SR-QA
**Origen:** [`INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.2.md`](../informes/INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.2.md)

> Lo que no está aquí no entra. **No** endpoints. **No** tokens de marca. **No** 148 px en home. **No** sparkline. **No** reabrir navy / §5.1. **No** fusionar I-1…I-7.

**Contratos congelados (citados):** UX adenda **U-D3** · DS **v1.7**.

---

## 1. Objetivo

Sustituir la fila `density='compact'` (`min-h-14` / `flex-row` / `text-xl`) del home B1 por el KPI compacto **vertical** (U-D: `min-h-24`, `flex-col`, cifra `text-2xl`, rótulo visible) y una retícula de **hasta 4 columnas a 1280**, sin `max-w` del 50 % en grupos de un hijo.

## 2. Alcance FE

| ID | Cambio | Archivo |
| --- | --- | --- |
| D3-SHELL | `density='compact'` = vertical `min-h-24 flex-col` + cifra `text-2xl` + `rounded-2xl` + rótulo visible; eyebrow de card sigue omitido en grupo B1 | `portal-ui.tsx` `PortalDashboardMetric` |
| D3-GRID | `metricGroupGridClassName`: `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`; un hijo **sin** `max-w-[calc(50%-0.5rem)]` | `DashboardClient.tsx` |
| D3-SKEL | Skeleton B1 misma forma (`h-24` no `h-14`) | `DashboardClient.tsx` `MetricsSkeleton` |
| D3-TEST | Actualizar aserciones de compact fila / max-w 50 % | `portal-dashboard-metric.spec.tsx` · `DashboardClient.spec.tsx` |

**No entra:** `PortalMetricCard` 148 px; Assurance `density='default'`; `PortalPanel compact`; 8/4 B2/B2b (deuda P2 declarada); copy nav.

## 3. Tests

Jest portal de métrica + dashboard. `audit-ui.mjs` sobre rutas tocadas. Typecheck `@iwana/portal`.

## 4. Stop/go

Stop: token de marca, sparkline, 148 px en home, §5.1, endpoint. Go: typecheck + Jest de rutas tocadas en verde + checklist DS v1.7 §I.
