# Checklist - MOD12 Compras UI Alignment

**Version:** 1.0  
**Fecha:** 2026-06-25  
**Estado:** Fase A y B ejecutadas  
**Modo activo:** Mixto  
**Responsable:** AI-SR-FULL  
**Spec:** `docs/specs/SPEC-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md`  
**Informe Fase A:** `docs/informes/INFORME-MOD12-COMPRAS-UI-ALIGNMENT-FASE-A-v1.0.md`  
**Informe Fase B:** `docs/informes/INFORME-MOD12-COMPRAS-UI-ALIGNMENT-FASE-B-v1.0.md`  
**Aprobado por:** AI-EM-ARCH

---

## 1. Boundaries y alcance

- [x] Sin cambios de contrato API ni migraciones en Fase A.
- [x] Sin violacion ADR-048; Compras permanece en MOD12.
- [x] Sin nuevas dependencias npm.

## 2. Fase visual A — Quick wins (gate merge UI)

- [x] VA-01: KPIs accionables con acento semantico y skeleton.
- [x] VA-02: Badges de estado y prioridad en tabla.
- [x] VA-03: `PortalEmptyState` y `PortalSkeletonBlock` en bandeja y drawers.
- [x] VA-04: Layout split composer/bandeja segun breakpoints.
- [x] VA-05: Sin identificadores tecnicos visibles en drawer.
- [x] VA-06: Inputs unificados con `@iwana/ui` donde exista equivalente.
- [x] VA-07: `PurchaseRequestsToolbar` con chips de filtro activo y actualizar.

### Criterios CA-UI (Fase A)

- [x] CA-UI-01: Pendientes por etapa visibles sin leer tabla.
- [x] CA-UI-02: Clic en KPI aplica filtro visible (chip o tarjeta activa).
- [x] CA-UI-03: Tabla con `Badge`; sin enums crudos visibles.
- [x] CA-UI-04: Bandeja vacia con `PortalEmptyState` y CTA crear.
- [x] CA-UI-05: Cero IDs tecnicos como texto principal en drawer.
- [x] CA-UI-10: Paridad de tokens KPI con `SchedulingSummaryStrip`.

## 3. Fase visual B — Drawer operativo

- [x] VB-01: Tabs internos en workbench drawer.
- [x] VB-02: Banner "siguiente accion recomendada".
- [x] VB-03: Recepcion separada del drawer de OC.
- [x] VB-04: `SupplierPicker` con combobox accesible (aria + teclado).

### Criterios CA-UI (Fase B)

- [x] CA-UI-06: Workbench sin `PortalPanel` anidado.
- [x] CA-UI-07: OC y recepcion no en un mismo scroll.
- [x] CA-UI-08: `SupplierPicker` operable por teclado.
- [x] CA-UI-09: Layout responsive segun spec seccion 8.

## 4. Testing

- [x] Unit tests actualizados en componentes tocados (incl. Fase B).
- [x] `pnpm --filter @iwana/portal test` — suites de inventory/compras OK (15 tests).
- [x] `pnpm --filter @iwana/portal typecheck` OK.
- [x] E2E `portal-inventory-scm.spec.ts` — 5/5 OK.

## 5. Documentacion

- [x] Informe `INFORME-MOD12-COMPRAS-UI-ALIGNMENT-FASE-A-v1.0.md`.
- [x] Informe `INFORME-MOD12-COMPRAS-UI-ALIGNMENT-FASE-B-v1.0.md`.
- [x] Spec marcado Ejecutado (Fase A + B).

## 6. Captura masiva

- [x] Tabs `Sugeridos` y `Catalogo` activos en nueva solicitud.
- [x] Seleccion persistente entre tabs y filtros.
- [x] Borrador compacto con lineas seleccionadas.
- [x] CTA principal visible en desktop y mobile.
