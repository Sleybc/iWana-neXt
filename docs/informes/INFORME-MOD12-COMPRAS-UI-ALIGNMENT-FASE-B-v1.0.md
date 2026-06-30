# Informe - MOD12 Compras UI Alignment Fase B

**Version:** 1.0  
**Fecha:** 2026-06-25  
**Estado:** Ejecutado  
**Modo activo:** Mixto  
**Responsable:** AI-SR-FULL  
**Spec:** `docs/specs/SPEC-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md`  
**Informe Fase A:** `docs/informes/INFORME-MOD12-COMPRAS-UI-ALIGNMENT-FASE-A-v1.0.md`

---

## Resumen

Se ejecutó la **Fase visual B** del spec de alineación UI de Compras: workbench con tabs internos, banner de siguiente acción, recepción desacoplada del drawer de OC y `SupplierPicker` accesible por teclado.

## Entregables

| ID | Estado |
| --- | --- |
| VB-01 Tabs internos en workbench drawer | Ejecutado |
| VB-02 Banner siguiente acción recomendada | Ejecutado |
| VB-03 Recepción separada del drawer de OC | Ejecutado |
| VB-04 `SupplierPicker` combobox accesible | Ejecutado |

## Archivos principales

- `purchase-workbench.ts` — tabs, `getPurchaseNextAction`, labels
- `PurchaseRequestWorkbenchDrawer.tsx` — tabs, banner, footer por tab, `GoodsReceiptPanel` en Recepciones
- `PurchaseOrderDrawer.tsx` — solo creación de OC; sin recepción embebida
- `PurchaseWorkspace.tsx` — estado `workbenchTab`, redirección a Recepciones tras crear OC
- `SupplierPicker.tsx` — combobox ARIA, debounce 300 ms, navegación teclado
- `purchase-workbench.spec.ts`, `SupplierPicker.spec.tsx` — pruebas unitarias Fase B
- `e2e/tests/portal-inventory-scm.spec.ts` — flujo OC/recepción vía tabs del workbench

## Verificación

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @iwana/portal typecheck` | OK |
| Unit tests inventory/compras (15) | OK |
| `playwright test e2e/tests/portal-inventory-scm.spec.ts` | 5/5 OK |

## Criterios CA-UI Fase B

| ID | Estado |
| --- | --- |
| CA-UI-06 Workbench sin `PortalPanel` anidado | Cubierto |
| CA-UI-07 OC y recepción en scrolls separados | Cubierto |
| CA-UI-08 `SupplierPicker` operable por teclado | Cubierto |
| CA-UI-09 Layout responsive según spec §8 | Cubierto (sin regresión Fase A) |

## Notas de implementación

- Los CTAs del footer del workbench dependen del tab activo (cotización, aprobación, órdenes).
- Tras generar OC, el workspace cierra el drawer de orden y abre el tab **Recepciones** automáticamente.
- El banner «Siguiente acción recomendada» incluye atajo «Ir a …» hacia el tab sugerido.
