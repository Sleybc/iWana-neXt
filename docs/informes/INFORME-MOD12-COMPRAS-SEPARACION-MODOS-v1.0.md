# INFORME - MOD12 Compras Separacion de Modos

**Version:** 1.0  
**Fecha:** 2026-07-04  
**Estado:** Ejecutado  
**Responsable:** AI-SR-FULL  
**Spec:** `docs/specs/2026-07-04-mod12-compras-separacion-modos-workspace-design.md`  
**Plan:** `docs/plans/2026-07-04-mod12-compras-separacion-modos-workspace.md`

---

## Resumen

- Se separo el workspace de `Compras` en dos modos explicitos: `inbox` para bandeja operativa y `create` para nueva solicitud.
- La creacion ya no compite visualmente con la bandeja ni con el drawer de trabajo; al entrar en `Nueva solicitud` la vista toma el canvas completo.
- El flujo mobile de creacion ahora opera en `2 pasos reales`: captura de productos y revision/cierre.
- El submit de solicitudes expone un resultado explicito `{ ok, requestId }`, por lo que el parent solo cierra el modo `create` cuando la creacion fue exitosa.

## Decisiones implementadas

- `PurchaseWorkspace` orquesta exclusividad entre bandeja, create mode y workbench.
- `PurchaseCreateModeHeader` y `PurchaseCreateModeShell` introducen una entrada/salida clara del contexto de creacion.
- `PurchaseRequestComposer` agrega la variante `presentation="create-mode"`, cabecera compacta, guard de salida con borrador y flujo mobile en dos etapas.
- Se mantuvieron los filtros de bandeja al volver desde create mode.
- Se habilito un CTA visible en desktop para `Nueva solicitud`.

## Archivos principales

| Area | Archivos |
| --- | --- |
| Orquestacion | `PurchaseWorkspace.tsx`, `InventoryClient.tsx`, `PurchaseRequestsToolbar.tsx` |
| Create mode | `PurchaseCreateModeHeader.tsx`, `PurchaseCreateModeShell.tsx`, `PurchaseRequestComposer.tsx` |
| Pruebas | `InventoryClient.spec.tsx`, `PurchaseRequestComposer.spec.tsx` |

## Evidencia

```powershell
pnpm --filter @iwana/portal test -- --runInBand PurchaseRequestComposer.spec.tsx InventoryClient.spec.tsx
pnpm --filter @iwana/portal test -- --runInBand PurchaseRequestComposer.spec.tsx InventoryClient.spec.tsx purchase-request-draft.spec.ts purchase-request-submit.spec.ts purchase-suggestions.spec.ts
pnpm --filter @iwana/portal typecheck
```

Resultado:

- `5` suites PASS
- `28` tests PASS
- `typecheck` PASS

## Riesgos residuales

- `InventoryClient.spec.tsx` sigue emitiendo una advertencia `act(...)` por una carga asincrona secundaria de `loadCatalogOptions()` al entrar a `Compras`; no rompe la suite, pero conviene estabilizarla en una siguiente pasada.
- La confirmacion de salida con borrador usa `window.confirm` en esta fase; si el producto exige una experiencia mas consistente, debe migrarse a un dialogo del sistema UI.
- La mejora mobile reduce dependencia de tablas como patron primario, pero todavia convive con componentes tabulares en desktop dentro del mismo arbol.

## Follow-ups fuera de fase

- Convertir el guard de descarte en un dialog consistente del portal.
- Reducir o eliminar la advertencia `act(...)` en `InventoryClient.spec.tsx`.
- Evaluar persistencia de borrador si `Nueva solicitud` va a manejar sesiones largas o alta interrupcion operativa.
