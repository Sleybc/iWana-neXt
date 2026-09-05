# INFORME-MOD02-DASHBOARD-ELEVACION-VISUAL-v1.0

## Informe vivo — elevación visual del inicio (`/dashboard`)

**Versión:** 1.0  
**Estado:** Completado  
**Fecha:** 2026-09-04  
**Modo activo:** ejecutor  
**Módulo:** MOD02 Dashboard Empresa  
**Dirección:** A — anatomía y ritmo (TailAdmin filtrado por Firma iWana)

**Contratos**

- UX/DS: [`docs/specs/2026-09-04-portal-dashboard-elevacion-visual-design.md`](../specs/2026-09-04-portal-dashboard-elevacion-visual-design.md) v1.0
- HLD: [`docs/hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md) **v2.0.4**
- Centro de mando: spec v1.2 §12 (adenda; I-1…I-7 y B1b no se reabren)

---

## 1. Qué se entregó

- KPI compacto: cifra *title* (`.font-thin-exo text-3xl`), slot sparkline solo con ≥2 puntos reales (home no pasa serie).
- Deltas honestos: I-1 «Sin vencidas» lima si hay visitas y ninguna vencida; I-3 «en riesgo» si aplica.
- **Foco de hoy:** `ProgressMeter` con ratio `today / (today + overdue)` (o mesa / catálogo si no hay campo). Sin gauge. Sin 0 % si no hay denominador o la fuente falló.
- Avisos de campo: tabla-en-card (Aviso / Estado), máx. 5 filas.
- Vista base y técnico: sin Foco.

No hay endpoints nuevos. No hay Recharts. No se copia paleta TailAdmin.

---

## 2. Verificación

Jest (2026-09-04):

```
PASS portal-dashboard-metric.spec.tsx
PASS dashboard-today-focus.spec.ts
PASS DashboardClient.spec.tsx (44)
PASS dashboard-role-composition.spec.ts
PASS TenantSummaryCard.spec.tsx
```

`audit-ui` sobre DashboardClient, today-focus y portal-ui: **P0/P1 = 0**. Un P2 heurístico previo en `portalFilterChipClassName` (lima-50 de chip de filtro, no Foco ni KPI).
