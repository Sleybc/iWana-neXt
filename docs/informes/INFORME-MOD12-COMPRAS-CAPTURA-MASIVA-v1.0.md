# INFORME - MOD12 Compras Captura Masiva

**Version:** 1.0  
**Fecha:** 2026-07-04  
**Estado:** Ejecutado (Fase 1 + Fase 2)  
**Responsable:** AI-SR-FULL  
**Spec:** `docs/specs/2026-07-02-mod12-compras-captura-masiva-design.md`  
**Plan:** `docs/plans/2026-07-02-mod12-compras-captura-masiva.md`

---

## Resumen

- Se reemplazo la captura linea por linea en `PurchaseRequestComposer` por seleccion masiva con tabs `Sugeridos` y `Catalogo`.
- La seleccion temporal persiste al cambiar de tab y filtros; el borrador compacto concentra la edicion fina antes del submit.
- Se mantuvo el camino de linea manual y el layout split del workspace de compras sin cambios de contrato API ni schema.

## Archivos principales

| Area | Archivos |
| --- | --- |
| Estado borrador | `purchase-request-draft.ts`, `purchase-suggestions.ts`, `purchase-draft-estimate.ts`, `purchase-composer-preferences.ts`, `purchase-request-submit.ts` |
| UI bulk | `PurchaseSourceTabs.tsx`, `PurchaseSuggestionList.tsx`, `PurchaseCatalogBulkTable.tsx`, `PurchaseSelectionBar.tsx`, `PurchaseDraftLinesTable.tsx`, `PurchaseBulkEditBar.tsx` |
| Integracion | `PurchaseRequestComposer.tsx`, `PurchaseWorkspace.tsx`, `InventoryClient.tsx` |

## Evidencia

```powershell
pnpm --filter @iwana/portal test -- purchase-request-draft.spec.ts purchase-suggestions.spec.ts purchase-draft-estimate.spec.ts purchase-composer-preferences.spec.ts purchase-request-submit.spec.ts PurchaseRequestComposer.spec.tsx InventoryClient.spec.tsx
pnpm --filter @iwana/portal typecheck
```

## Riesgos residuales

- Ranking de sugerencias acotado a senales de stock y frecuencia reciente (ultimas 15 solicitudes).
- Busqueda de catalogo depende de `listCatalogOptions({ search })`; volumenes muy altos pueden requerir paginacion futura.
