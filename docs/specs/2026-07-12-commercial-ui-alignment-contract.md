# Contrato UI — Módulo Comercial (alineación Firma iWana)

**Fecha:** 2026-07-12  
**Estado:** Cerrado (alineación remanente 2026-07-18 — ver `docs/informes/INFORME-COMMERCIAL-UI-ALIGNMENT-v1.0.md`)  
**Alcance:** `apps/portal/src/components/commercial/**`  
**Referencia:** [Firma iWana](2026-07-12-firma-iwana-diseno-visual-design.md), [InventoryClient.tsx](../../apps/portal/src/components/inventory/InventoryClient.tsx)

## Auditoría resumida

**Puntaje baseline:** 68/100 (P0: 0, P1: 4, P2: 8, P3: 4)  
**Veredicto:** Requiere rediseño estructural antes de cierre G6.

Hallazgos P1 bloqueantes: ausencia de `PortalPanel`, tokens `text-gray-*`/`text-red-*` en copy operativo, labels ad hoc sin `portal-eyebrow`, botones destructivos inline sin variantes de `Button`.

## Jerarquía obligatoria

```text
space-y-6 → PageHeader → PortalAlert? → TabsList (portalModuleTabs*) → TabsContent (space-y-6) → PortalPanel → contenido
```

## Primitives requeridos

| Superficie | Primitive |
| --- | --- |
| Sección | `PortalPanel` (eyebrow, title, description, actions) |
| KPIs | `portalMetricCardShellClassName` + `portalMetricCardAccentClassName` |
| Tablas | `portalDataTableShell/Head/Cell` + thead `bg-iwana-surface-soft` |
| Inputs | `commercialFieldClassName` / `commercialTextareaClassName` |
| Estados | `PortalSkeletonBlock`, `PortalEmptyState`, `PortalAlert` |
| Búsqueda | `PortalSearchField` |

## Estructura de carpetas

```text
commercial/
  catalog/PlanCatalogPanel.tsx, AdditionalProductsPanel.tsx, AdditionalServicesPanel.tsx
  offers/, taxation/, compatibility/
  commercial-field-styles.ts, commercial-labels.ts, CommercialDashboard.tsx
```

## Carril rápido vs gate

| Cambio | Gate |
| --- | --- |
| Tokens, PortalPanel, field-styles, mover catálogo | No (DS-OWNER) |
| Tab Resumen + `GET /commercial/dashboard/summary` | G4 EM-ARCH |
