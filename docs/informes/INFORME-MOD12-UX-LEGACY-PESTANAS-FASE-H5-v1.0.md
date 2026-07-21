# Informe — MOD12 Inventario — UX pestañas legacy — Fase H5

**Version:** 1.0  
**Fecha:** 2026-07-21  
**Estado:** ✅ Entrega completa — **G5 GO** · **G6 GO** · **G7 GO recomendado**  
**Orquestador:** AI-EM-ARCH  
**Ejecutor FE:** AI-FE-PLATFORM  
**PRD:** `docs/prds/PRD-MOD12-UX-LEGACY-PESTANAS-v1.0.md`  
**Spec:** `docs/specs/2026-07-21-mod12-ux-legacy-pestanas-fase-h5-design.md`

---

## 1. Resumen

Cerrado H5: `MovementsWorkspace`, formulario solicitar baja en `WriteOffsPanel`, cero `<select>` nativos en inventory portal.

---

## 2. Entregables

| Artefacto | Ruta |
| --- | --- |
| MovementsWorkspace | `apps/portal/src/components/inventory/MovementsWorkspace.tsx` |
| WriteOffsPanel (+ solicitud) | `WriteOffsPanel.tsx` |
| Select filters | `AssetLoansPanel.tsx`, `UsefulLifeAlertsPanel.tsx` |
| Shell | `InventoryClient.tsx` (tabs montan workspaces) |

---

## 3. Gates

| Gate | Veredicto |
| --- | --- |
| G5 | **GO** |
| G6 | **GO** |
| G7 | **GO recomendado** |

---

## 4. Verificación

```text
rg "<select" apps/portal/src/components/inventory/ → 0
pnpm --filter @iwana/portal test -- InventoryClient MovementsWorkspace UsefulLife AssetLoans → 41/41
npx playwright test e2e/tests/portal-inventory-scm.spec.ts -g "baja|vida útil" --config e2e/playwright.portal.config.ts → 2/2
```

E2E: smoke vida útil + solicitar/aprobar baja (combobox `@iwana/ui`; helper `selectComboboxOption`).
