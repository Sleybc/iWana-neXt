# Informe — MOD12 Inventario — Vida útil + StockLow + eventos — Fase H4

**Version:** 1.0  
**Fecha:** 2026-07-21  
**Estado:** ✅ Entrega completa — **G5 GO** · G6/G7 pendientes  
**Modo activo:** Ejecución multiagente (AI-SR-FULL + AI-FE-PLATFORM)  
**Orquestador:** AI-EM-ARCH  
**PRD:** `docs/prds/PRD-MOD12-VIDA-UTIL-STOCKLOW-v1.0.md`  
**Spec:** `docs/specs/2026-07-21-mod12-vida-util-stocklow-fase-h4-design.md` (aprobado CTO)  
**G5:** `INFORME-MOD12-VIDA-UTIL-STOCKLOW-FASE-H4-G5-AUDITORIA-ARCH-v1.0.md`

---

## 1. Resumen

Implementada la fase **H4**: alertas de vida útil consultables, publicación `StockLow` (ambos niveles) y `asset-sold`, listener de log, panel portal bajo Activos.

---

## 2. Entregables

### Backend

| Artefacto | Ruta |
| --- | --- |
| Eventos | `inventory.events.ts` — `STOCK_LOW`, `ASSET_SOLD` |
| Publisher | `inventory-domain-event-publisher.service.ts` |
| Listener | `inventory-domain-events.listener.ts` |
| Endpoint | `GET /inventory/assets/useful-life-alerts` |
| Enganches | ledger público, stock-issue SALE, write-off approve, cycle-count, goods-receipt, counter-purchase |

### Frontend

| Artefacto | Ruta |
| --- | --- |
| Panel | `UsefulLifeAlertsPanel.tsx` — Activos → Vida útil |
| API client | `listUsefulLifeAlerts` |
| CTA F2 | Enlace a reposición (sin duplicar bandeja) |

---

## 3. Trazabilidad RF

| RF | Estado |
| --- | --- |
| RF-INV-18 | ✅ Alertas pull + panel |
| RF-INV-22 | ✅ StockLow ambos niveles (publisher) |
| RF-INV-14 | ✅ `inventory.asset-sold` |
| H4 | ✅ Cerrado funcionalmente (pendiente G6/G7) |

---

## 4. Deuda aceptada

- P3: listado useful-life full-scan en memoria
- Sin BullMQ / notificaciones / auto-OC

---

## 5. Gates

| Gate | Veredicto |
| --- | --- |
| G5 ARCH | **GO** (v1.1 tras P1) |
| G6 UX/DS/QA | Pendiente |
| G7 EM-ARCH | Pendiente |

---

## 6. Verificación

```text
pnpm --filter @iwana/api test -- useful-life write-off inventory-domain-event → 29/29
pnpm --filter @iwana/api test -- inventory → 332 passed (entrega BE)
pnpm --filter @iwana/portal test -- UsefulLifeAlertsPanel InventoryClient → 36/36
```
