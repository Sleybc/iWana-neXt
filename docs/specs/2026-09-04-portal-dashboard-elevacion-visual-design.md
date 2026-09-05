# Spec UX/DS — Elevación visual del inicio (`/dashboard`)

**Versión:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-09-04  
**Autor:** AI-PROD-UX / AI-DS-OWNER (dirección) · ejecución AI-FE-PLATFORM  
**Dirección:** A — anatomía y ritmo (inspiración TailAdmin filtrada por Firma iWana)

**Entradas**

- Plan: elevación visual del inicio (TailAdmin como ritmo, no como plantilla)
- [`2026-09-04-portal-dashboard-centro-mando-ux-spec.md`](2026-09-04-portal-dashboard-centro-mando-ux-spec.md) v1.1 — B1b intacta
- [`HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md) v2.0.4 — sin endpoints nuevos
- ADR-023: TailAdmin = shell y anatomía; paleta y gauges fuera
- Firma iWana §3 (degradado solo progreso) · §4/2.1 (KPI + hueco sparkline)

**Qué es.** Completar la anatomía de I-1…I-7, un bloque **Foco de hoy** con ratio real, y avisos de campo como tabla-en-card. No reabre el contrato de indicadores. No inventa series ni %.

---

## 1. Tarea

El centro de mando ya dice qué atender. Se siente básico porque todas las piezas pesan igual: cards compactas sin delta, sin cifra *title*, sin bloque de foco, avisos en lista plana.

Orden de lectura:

B0 → **Foco de hoy** (si el rol tiene fuente) → B1 → B1b → B2 (tabla de avisos si aplica) → B3.

---

## 2. KPI (`PortalDashboardMetric`)

Sin cambiar IDs, fuentes ni destinos de I-1…I-7.

| Pieza | Contrato |
| --- | --- |
| Cifra compacta (home) | Rol *title*: `.font-thin-exo text-3xl tabular-nums text-iwana-primary`. Densidad `default` (otras pantallas) conserva `font-mono text-2xl` |
| Delta | Badge tonal cuando la **misma fuente** tenga una señal comparable. Nunca % YoY ni tendencia inventada. Lima (`tone: progress`) solo avance (p. ej. visitas de hoy sin vencidas) |
| Sparkline | Prop opcional `sparkline?: readonly number[]`. Polilínea SVG si hay ≥2 puntos. **Sin serie en los contratos actuales → no se pinta trazo ni hueco falso** |
| Cáscara compacta | `min-h-28 rounded-2xl shadow-iwana-soft` |

Deltas honestos (home):

| ID | Delta | Tono |
| --- | --- | --- |
| I-1 | `overdueCount > 0` → `{n} vencidas`; si no, `todayCount > 0` → `Sin vencidas` | danger / progress |
| I-2 | `overdueSlaCount > 0` → `{n} con atención vencida` | warning |
| I-3 | `atRiskCount > 0` → `{n} en riesgo` | warning |
| I-4 | `breachedCount > 0` → `{n} incumplidos` | danger |
| I-5…I-7 | Sin delta extra (la cifra ya es la señal) | — |

Cero sin señal: sin tinte warning/danger (U-D vigente).

---

## 3. Foco de hoy

Una card, no un gauge. Primitive: `PortalPanel` + `ProgressMeter` (`from-iwana-primary to-iwana-secondary`). Porcentaje en `text-iwana-secondary-700`.

**No se monta** si el rol no pide WFM, assurance ni commercial (vista base, técnico, auditor).

| Rol / fuente | Ratio | Rótulo | Destino |
| --- | --- | --- | --- |
| WFM pedido y ok | `todayCount / (todayCount + overdueCount)` | Visitas del día frente a la carga | Agenda de hoy |
| Si no WFM: assurance | `(openCount - atRiskCount - breachedCount) / openCount` acotado a 0–100 | Casos al día frente a los abiertos | Mesa `status=OPEN` |
| Si no: commercial | `catalogSellableActiveCount / catalogActiveCount` | Catálogo listo para vender | `/dashboard/commercial` |

Reglas:

1. Denominador 0 → empty con acción; **no** barra al 0 %.
2. Fuente en error → aviso + Reintentar; **no** 0 %.
3. Numerador 0 con denominador > 0 → 0 % es honesto (hay carga y nada al día).
4. Copy sentence case. Sin WFM, NOC, SLA suelto, enums.

---

## 4. Avisos de campo → tabla-en-card

`FieldAttentionBlock`: `portalDataTableShellClassName` dentro de `PortalPanel compact`. Columnas **Aviso** y **Estado**. Máximo 5 filas (preview; sin pager). Fila enlaza a la agenda. Empty y error no cambian de copy.

Mesa de ayuda: no hay filas de caso en el resumen; no se finge una tabla de tickets.

B1b: chips. Sin mosaico.

---

## 5. Prohibido

Paleta TailAdmin, Outfit, radial gauge, mapa, bento, glass, series inventadas, Recharts, `--chart-*`, lima en urgencia, reabrir I-1…I-7.

---

## 6. Criterios

| ID | Criterio | Cómo se verifica |
| --- | --- | --- |
| CA-EV-01 | Compact home usa cifra *title* (Exo thin), no `text-2xl` semibold genérico | Jest primitive `density="compact"` |
| CA-EV-02 | Sin `sparkline` no hay SVG de serie | Jest primitive |
| CA-EV-03 | Sparkline con ≥2 puntos pinta polilínea; 1 punto no | Jest primitive |
| CA-EV-04 | I-1 sin vencidas y con visitas pinta delta lima «Sin vencidas» | Jest DashboardClient |
| CA-EV-05 | Foco usa `ProgressMeter`; lima solo en % de avance | Jest + receta |
| CA-EV-06 | Denominador 0 o error de fuente ≠ barra 0 % | Jest derivación + DashboardClient |
| CA-EV-07 | Avisos de campo son `<table>` en shell de tabla | Jest DashboardClient |
| CA-EV-08 | Vista base y técnico sin Foco de hoy | Jest |
| CA-EV-09 | I-1…I-7 intactos (ids, hrefs, fuentes) | Composición existente |
| CA-EV-10 | `audit-ui` P0/P1 = 0 en archivos tocados | Script identidad |
