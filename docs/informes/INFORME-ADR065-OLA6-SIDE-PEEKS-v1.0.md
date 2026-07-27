# INFORME — ADR-065 Ola 6 · Side peeks (Parte B residual)

**Versión:** 1.0  
**Fecha:** 2026-07-25  
**Autor:** AI-FE-PLATFORM  
**Estado:** Cerrado (4/4 citadas en prompt §5)  
**Padre:** [INFORME-ADR065-OLA6-FE-PARTE-B-v1.0](./INFORME-ADR065-OLA6-FE-PARTE-B-v1.0.md)  
**Prompt:** `docs/prompts/PROMPT-ADR065-OLA6-KEYSET-v1.0.md` §5  
**Commit:** No (orden orquestador)

---

## Resumen

Al reemplazar la página, `items.find(id)` devolvía `undefined` y el side peek se vaciaba.  
Patrón aplicado: **conservar el registro seleccionado fuera del buffer** y, si hace falta, **cargar detalle por `id` vía API** (`inventoryApi.getItem` / `wfmApi.visitRequests.get`).  
**No** se inventó endpoint de agregación de matriz.

---

## 1. Superficies tocadas (4/4)

| Superficie | Antes | Después |
| --- | --- | --- |
| `StockWorkspace` | `detailItem = items.find(id)` → drawer `open={Boolean(detailItem)}` | Estado `detailItem`; refresh si sigue en página; fallback `getItem` |
| `PendingVisitRequestsView` | `selectedVisitRequest` derivado del inbox | Estado objeto; al paginar se conserva; open/query con `get` si no está en página |
| `SchedulingClient` | Confirm priorizaba `pendingVisitResponse.items.find` | Drop fija selección; confirm usa selección cacheada o `visitRequests.get` |
| `StockTransferDialog` | `selectedItem` solo desde `transferableItems` de la página | Cache de producto/ubicaciones + opciones mergeadas mientras el diálogo está abierto |

Specs: `StockWorkspace.spec` (peek sobrevive a page replace), `StockTransferDialog.spec` (producto cacheado).

---

## 2. Qué queda (fuera de este residual §5)

| Residual | Origen | Notas |
| --- | --- | --- |
| Endpoint agregación ocupación matriz | Parte A §3 / Parte B §7 | Sigue `drainInventoryBalances` + aviso UI |
| `page` + ListMeta en counts / items / locations / suppliers | Parte B residual | Cursor / soft-cap donde aplica |
| Desacoplar loaders `InventoryClient` (`loadIssuesList` metas cruzadas) | Parte B §6 | No tocado |
| Ancla visual de fila resaltada fuera del viewport | Prompt §5 (Assurance/Ops/Purchase) | Peek OK; fila puede no estar en página |
| Graduación web users/audit; KPI globales page-local | Parte B residual | Sin cambio |

---

## 3. Stop/go

| Gate | Estado |
| --- | --- |
| Ningún side peek §5 se vacía al cambiar de página | **GO** |
| Sin endpoint de agregación inventado | **GO** |
| Commit | No |

**Veredicto:** **GO** residual side peeks Ola 6 §5.
