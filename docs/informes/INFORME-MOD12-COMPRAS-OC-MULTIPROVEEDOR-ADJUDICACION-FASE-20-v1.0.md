# INFORME — MOD12 Compras · OC multiproveedor desde adjudicación — Fase 20

**Versión:** 1.0
**Estado:** Implementado — pendiente G6 formal / G7 CTO
**Fecha:** 2026-07-17
**Módulo:** MOD12 Inventario / SCM — Compras
**Ejecutores:** AI-EM-ARCH · AI-SR-FULL · AI-FE-PLATFORM
**Spec:** [2026-07-17-mod12-compras-oc-multiproveedor-adjudicacion-fase20-design.md](../specs/2026-07-17-mod12-compras-oc-multiproveedor-adjudicacion-fase20-design.md)
**Prompt:** [PROMPT Fase 20](../prompts/PROMPT-MOD12-COMPRAS-OC-MULTIPROVEEDOR-ADJUDICACION-FASE-20-v1.0.md)

## Contexto

Adjudicación partida entre proveedores ya existía en API; el portal solo creaba una OC legado.

## Cambios

### Backend
- `createLineAwards` exige PR `APPROVED`.
- Tests unitarios CA-20-05.

### Frontend
- Helper `buildOrdersFromAwards` / `previewsToCreateOrderDto`.
- Tipado `orders[]` y respuesta batch en `api-client`.
- `PurchaseOrderDrawer` preview N OCs + POST batch; CTA workbench actualizado.

## CA

| CA | Estado |
| --- | --- |
| CA-20-01 Batch 2 OCs | Implementado |
| CA-20-02 Líneas por proveedor | Implementado |
| CA-20-03 unitCost desde quote | Implementado |
| CA-20-04 Sin awards | Implementado |
| CA-20-05 Awards solo APPROVED | Implementado |
| CA-20-06 RTL | Implementado |

## Verificación

| Suite | Resultado |
| --- | --- |
| API purchasing.service + flow | **36/36 pass** |
| Portal builder + drawer | **4/4 pass** (builder 3 + drawer 1) |
| `tsc` api + portal | OK |

## Protocolo

| Gate | Estado |
| --- | --- |
| G4 / G5 | Cumplido |
| G6 / G7 | Pendiente |
