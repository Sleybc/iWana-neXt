# MOD12 H4 — Vida útil + StockLow + eventos — Implementation Plan

> **For agentic workers:** Use `subagent-driven-development`. Steps use checkbox syntax.

**Goal:** Cerrar H4 (RF-INV-14/18/22): alertas vida útil consultables, emitir StockLow (ambos niveles) + asset-sold, listener log, panel portal.

**Architecture:** Publisher post-commit en inventory; un canal `inventory.stock-low` con `level`; endpoint pull useful-life-alerts; FE panel + enlace F2. Sin migración ni BullMQ.

**Tech Stack:** NestJS 11, TypeORM, EventEmitter2, Next.js portal, Jest, Playwright

**Spec:** `docs/specs/2026-07-21-mod12-vida-util-stocklow-fase-h4-design.md` (aprobado CTO)  
**Prompt:** `docs/prompts/PROMPT-MOD12-VIDA-UTIL-STOCKLOW-FASE-H4-v1.0.md`

---

## Files (previsto)

| File | Responsibility |
| --- | --- |
| `apps/api/.../events/inventory.events.ts` | Constantes + payloads |
| `apps/api/.../services/inventory-domain-event-publisher.service.ts` | Eval umbrales + emit post-commit |
| `apps/api/.../listeners/inventory-domain-events.listener.ts` | Log only |
| `apps/api/.../services/stock-ledger.service.ts` | Hook publisher tras TX |
| `apps/api/.../services/serialized-asset*.ts` / controller | Endpoint useful-life-alerts |
| `apps/portal/.../api-client.ts` | Cliente alerts |
| `apps/portal/.../UsefulLifeAlertsPanel.tsx` (o similar) | UI |
| `apps/portal/.../InventoryClient.tsx` | Integración pestaña |

---

## Task 1 — Eventos + tipados

- [ ] Ampliar `INVENTORY_EVENTS` con `STOCK_LOW`, `ASSET_SOLD`
- [ ] Tipar payloads D-H4-01
- [ ] Tests de constantes/tipos si aplica patrón repo

## Task 2 — Publisher + dedup

- [ ] Implementar evaluación available/pending (familia F2)
- [ ] Emitir solo al cruzar hacia abajo (D-H4-04)
- [ ] Tests unitarios cruzar / no re-emitir

## Task 3 — Enganche ledger

- [ ] Post-commit tras deltas y SALE
- [ ] Test SALE → `asset-sold`

## Task 4 — Listener

- [ ] `@OnEvent` log sin side-effects
- [ ] Registrar en module

## Task 5 — Endpoint useful-life-alerts

- [ ] GET paginado + filtros
- [ ] OpenAPI + isolation test

## Task 6 — Portal

- [ ] api-client + panel + labels + enlace F2
- [ ] Tests componente + E2E smoke

## Task 7 — Informe fase + gates

- [ ] `INFORME-MOD12-VIDA-UTIL-STOCKLOW-FASE-H4-v1.0.md`
- [ ] G5 → G6 → G7
