# MOD12 Compras UI Alignment — Fase visual A Implementation Plan

**Fecha:** 2026-06-25  
**Estado:** Ejecutado (Fase A)  
**Modo activo:** Mixto  
**Responsable ejecucion:** AI-SR-FULL  
**Aprobado por:** AI-EM-ARCH  
**Spec:** `docs/specs/SPEC-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md`  
**Checklist:** `docs/quality/CHECKLIST-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md`

---

## Goal

Cerrar la brecha visual minima del submodulo Compras (Fase visual A) para cumplir gate de merge UI sin tocar backend.

## Tareas

### Task 1 — KPIs accionables (`VA-01`)

**Files:** `PurchaseWorkspaceSummary.tsx`, `PurchaseWorkspace.tsx`

- Reemplazar tarjetas planas por patron `SchedulingSummaryStrip` (acento, `rounded-3xl`, skeleton).
- Propagar `activeKpiFilter`, `onKpiFilterChange`, `isLoading`.
- Mapear KPI a preset cliente: `pendingQuotes`, `pendingApproval`, `readyForPo`, `pendingReceipt`, `urgent`, `overdue`.

### Task 2 — Toolbar y filtros (`VA-07`)

**Files:** `PurchaseRequestsToolbar.tsx` (nuevo), `PurchaseRequestsTable.tsx`, `PurchaseWorkspace.tsx`

- Extraer filtros y acciones a toolbar.
- Chips de filtros activos + limpiar.
- Extender `PurchaseRequestFilters` con `kpiPreset?: PurchaseKpiPreset`.

### Task 3 — Tabla semantica (`VA-02`, `VA-03`)

**Files:** `PurchaseRequestsTable.tsx`, `inventory-labels.ts`

- Badges estado/prioridad con variantes.
- `PortalEmptyState`, `PortalSkeletonBlock`, `PortalAlert`.
- Fila clickeable + highlight activo.
- Columnas Fase A: numero, tipo, prioridad, area, estado, fecha requerida, alertas.

### Task 4 — Layout split (`VA-04`)

**Files:** `PurchaseWorkspace.tsx`, `PurchaseRequestComposer.tsx`

- Grid `5fr/7fr` en `>=1280px`.
- Composer en drawer mobile desde CTA toolbar.
- Titulo "Nueva solicitud de compra"; secciones con `PortalSectionHeader`.

### Task 5 — Drawer cleanup parcial (`VA-05`, `VA-06`)

**Files:** `PurchaseRequestWorkbenchDrawer.tsx`, `PurchaseOrderDrawer.tsx`

- Eliminar IDs tecnicos visibles en lineas.
- Unificar inputs `@iwana/ui`.
- Sin tabs completos aun (Fase B).

## Verificacion

```bash
corepack pnpm --filter @iwana/portal test -- PurchaseWorkspace PurchaseRequests InventoryClient
corepack pnpm --filter @iwana/portal typecheck
corepack pnpm test:e2e:portal -- portal-inventory-scm.spec.ts
```

## Gate

Fase A cerrada cuando checklist secciones 2 y 4 esten completas (CA-UI-01 a CA-UI-05, CA-UI-10).
