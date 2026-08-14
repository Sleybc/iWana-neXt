# PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.1

## Prompt de ejecución — densidad real del inicio `/dashboard` del portal (U-D2)

**Versión:** 1.1
**Estado:** Emitido — autorización viva 2026-08-12 («Autorizado EM-ARCH: plan U-D2»)
**Fecha:** 2026-08-12
**Emite:** AI-EM-ARCH (modo Orchestrator → ejecución FE)
**Etapa del workflow:** densidad real post U-D · protocolo v1.5 §3bis
**Destinatarios:** AI-FE-PLATFORM (C) · AI-SR-QA (D) · AI-PROD-UX / AI-DS-OWNER (contratos ya versionados en este ciclo)
**Origen:** plan U-D2 densidad real · adenda UX **U-D2** · DS contrato **v1.6** · sucede a [`PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.0.md`](PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.0.md) (U-D / DS v1.4, aplicado)

> Sin prompt de ejecución no hay implementación (protocolo §3, G4). Lo que no está aquí no entra.
> **Plantilla de formato (en revisión):** [`TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md).
> **Archivo destino obligatorio:** `docs/prompts/PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.1.md`.

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** el home ADMIN se lee como fila operativa densa (KPI en una línea), no como pósteres vacíos. A 1280 px: B0 + ≥ 2 grupos + arranque de B2. Postura: *visualmente sobrio, interactivamente denso*.
- **Lo que sí entra:** `density='compact'` solo en home B1; `PortalPanel compact` solo en paneles del home; gaps ≤ `gap-4` / `space-y-4`; accesos máx. 5 + «Ver más» con meta `sr-only`; description omitida/`sr-only` en idle del home.
- **Lo que no entra:** cambiar Assurance a compact; reabrir §5.1; tocar `PortalMetricCard` 148 px; tokens de marca; endpoints; fusionar/eliminar I-1…I-7; volver a retícula plana; reabrir U-R2bis / U-NAV / remediación P1.

---

## 2. Artefactos de entrada obligatorios

| Contrato | Ruta | Versión |
| --- | --- | --- |
| UX spec | [`2026-08-04-portal-dashboard-recomposicion-ux-spec.md`](../specs/2026-08-04-portal-dashboard-recomposicion-ux-spec.md) | v1.0 + adendas + **U-D** + **U-D2 2026-08-12** |
| DS contrato | [`2026-08-04-portal-dashboard-recomposicion-ds-contrato.md`](../specs/2026-08-04-portal-dashboard-recomposicion-ds-contrato.md) | **v1.6** |
| HLD | [`HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md) | v2.0.1 — sin cambio |
| Prompt precedente | [`PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.0.md`](PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.0.md) | v1.0 — U-D aplicado; no reabrir |
| Informe vivo | [`INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md`](../informes/INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md) | actualizar, no duplicar |

**API tipada:** sin endpoints nuevos, sin ampliar `@Roles`, sin migraciones.

---

## 3. Instrucciones para AI-FE-PLATFORM

**Orden de ejecución obligatorio** (gaps → historial → quick actions → panel compact → métrica):

| # | Paso | Cambio | Dónde |
| --- | --- | --- | --- |
| 1 | Gaps | Ritmo del home ≤ `gap-4` / `space-y-4` entre bandas y dentro de B2b | `DashboardClient.tsx` (+ layouts de banda) |
| 2 | Historial | Compactar densidad visual del bloque historial del inicio (sin cambiar mapa U-3 ni R-8) | `RecentActivityPanel.tsx` |
| 3 | Quick actions | Máx. **5** visibles + «Ver más»; meta en **`sr-only`** (no `line-clamp-1` visible permanente) | `QuickActionsPanel.tsx` |
| 4 | Panel compact | `PortalPanel compact` en consumidores del **home** (B2 / B2b / B3). Default `p-5` intacto fuera del home | `portal-ui.tsx` + paneles dashboard |
| 5 | Métrica | `PortalDashboardMetric`: prop `density?: 'default' \| 'compact'`. Home B1 → `density="compact"` (`flex-row`, `min-h-14`, `text-xl`, `py-2 px-3`, `rounded-2xl`). Description en idle: omitida o `sr-only`. **Assurance** y fuera de home B1 → `default` (anatomía v1.4) | `portal-ui.tsx` + `DashboardClient.tsx` |

**Reglas de composición (UX U-D2, no negociables en FE):**

- Agrupación U-1 intacta (sin póster `flex-col` en home).
- Tinte: cero sin urgencia (UX-D2-05 / U-D).
- I-1…I-7 intactos.
- `PortalMetricCard` **148 px** intacto.
- §5.1 sidebar **no** se toca.

---

## 4. Restricciones no negociables

- No romper boundaries del modulith.
- No acceder a tablas de otro módulo.
- No usar credenciales ni datos reales / PII en logs, tests o docs.
- TypeScript estricto; sin `any`; pnpm; Tailwind v4 CSS-first (sin `tailwind.config.js`).
- Lima ≠ urgencia. CTA de página navy (`Button variant="primary"`), no lima.
- Prohibido KPI fantasma. No fusionar I-1…I-7.
- **No** forzar `density='compact'` en Assurance.
- **No** aplicar `PortalPanel compact` a todos los consumidores del portal.

---

## 5. Entregables técnicos obligatorios

- Código frontend del delta (sin backend, sin migraciones, sin OpenAPI).
- Tests: `portal-dashboard-metric.spec.tsx` (default vs compact) · `portal-ui.spec.tsx` (`PortalPanel compact`) · `DashboardClient.spec.tsx` · `QuickActionsPanel` / accesos · suites de densidad existentes actualizadas.
- Comando: `pnpm --filter @iwana/portal exec jest` sobre esas suites.
- Regresión Assurance: métricas siguen en `default` (`min-h-24` / `flex-col`).

---

## 6. Entregables documentales obligatorios

- Actualizar informe vivo de recomposición (U-D2 autorizado + aplicado). **No** crear un informe nuevo.
- Contratos ya versionados en este ciclo (UX U-D2 + DS v1.6). Este prompt es la autorización de ejecución.

---

## 7. Criterios de aceptación

Trazables a UX-D2-01…08:

| ID | Criterio |
| --- | --- |
| **CA-D2-01** | Home B1: fila horizontal, `min-h-14` (~56 px). |
| **CA-D2-02** | Description no permanente en idle (omitida o `sr-only`). |
| **CA-D2-03** | Sin póster `flex-col` en home; agrupación U-1 intacta. |
| **CA-D2-04** | A 1280: B0 + ≥ 2 grupos + arranque de B2. |
| **CA-D2-05** | Cero sin tinte de urgencia. |
| **CA-D2-06** | Accesos máx. 5 + «Ver más»; meta `sr-only`. |
| **CA-D2-07** | Gaps ≤ `gap-4` / `space-y-4`. |
| **CA-D2-08** | Contratos U-D2 + DS v1.6; I-1…I-7 intactos; Assurance en `default`; `PortalMetricCard` 148 px. |
| **CA-D2-09** | Lint/typecheck de rutas tocadas en verde. |

---

## 8. Criterio de stop/go

- **Stop** inmediato si: endpoint nuevo, token de marca, reabrir §5.1, achicar Assurance, tocar 148 px de `PortalMetricCard`, o forzar B2 en viewport comprimiendo/eliminando indicadores.
- **Go:** tests del dashboard + primitive (default/compact) en verde y CA-D2-01…09 cubiertos.
