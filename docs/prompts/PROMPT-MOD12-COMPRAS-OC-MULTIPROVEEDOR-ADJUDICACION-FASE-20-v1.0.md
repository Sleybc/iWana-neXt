# PROMPT DE EJECUCIÓN — MOD12 Compras · OC multiproveedor — Fase 20

**Versión:** 1.0
**Gate:** G4 — AI-EM-ARCH
**Ejecutores:** AI-SR-FULL + AI-FE-PLATFORM
**Spec:** [2026-07-17-mod12-compras-oc-multiproveedor-adjudicacion-fase20-design.md](../specs/2026-07-17-mod12-compras-oc-multiproveedor-adjudicacion-fase20-design.md)

## Objetivo

Cerrar adjudicación partida → N OCs por proveedor en el portal, usando `orders[]` y precio desde quote lines.

## STOP

- No cambiar fórmula de `estimatedAmount`.
- No enforzar `approvalLevel` por rol.
- No nueva migración si no hace falta.
- No tokens nuevos en `@iwana/ui`.

## Backend

- `createLineAwards`: exigir PR `APPROVED`; mensaje en español.
- Tests unit/integration del guard.

## Frontend

- Helper `buildOrdersFromAwards(detail)` → payload batch.
- Tipar `orders?` y respuesta `{ orders }` en `api-client`.
- `PurchaseOrderDrawer`: preview N OCs cuando hay awards; confirmar un POST.
- `handleCreateOrder` acepta respuesta batch.

## Informe

`docs/informes/INFORME-MOD12-COMPRAS-OC-MULTIPROVEEDOR-ADJUDICACION-FASE-20-v1.0.md`
