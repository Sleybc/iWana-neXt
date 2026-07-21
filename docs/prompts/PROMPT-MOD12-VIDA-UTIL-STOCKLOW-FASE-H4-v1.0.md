# PROMPT — MOD12 Inventario — Vida útil + StockLow + eventos — Fase H4

> **Estado: CERRADO (G5+G6+G7 GO recomendado 2026-07-21).**

## Vínculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
- PRD: `docs/prds/PRD-MOD12-VIDA-UTIL-STOCKLOW-v1.0.md`
- Spec: `docs/specs/2026-07-21-mod12-vida-util-stocklow-fase-h4-design.md` (D-H4-01…10)
- Auditoría: `docs/informes/INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md` (H4)
- PRD padre: `docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md` (RF-INV-14, RF-INV-18, RF-INV-22)
- HLD eventos: `docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md` (`inventory.stock-low`, `inventory.asset-sold`)

## Módulo

- Nombre: Inventario / SCM — submódulo Vida útil, StockLow y eventos de dominio
- Código: MOD12
- Fase: H4
- Versión: 1.0
- Fecha: 2026-07-21
- Generado por: AI-EM-ARCH
- Destinatario: **AI-SR-FULL (backend, líder)** + **AI-FE-PLATFORM (portal)**
- Nombre de archivo destino: `PROMPT-MOD12-VIDA-UTIL-STOCKLOW-FASE-H4-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** cerrar H4 — alertas de vida útil consultables, publicación `StockLow` (ambos niveles) y evento de venta; RF-INV-14/18/22 dejan de estar parciales según alcance MVP.
- **Sí entra:** `INVENTORY_EVENTS` + publisher post-commit + listener log; endpoint useful-life-alerts; panel portal + enlace F2; tests; OpenAPI.
- **No entra:** BullMQ, notificaciones, auto-OC, H5, outbox/migración, resto de eventos HLD.

> **Stop:** si propones tabla de alertas materializadas, cola BullMQ o crear OC desde el listener, **detente y escala** (gate ADR / AI-EM-ARCH).

---

## 2. Artefactos de entrada obligatorios

- Cierre H3 con recomendación técnica GO (**cumplido**)
- PRD §4 RF-UL / RF-SL / RF-EV y spec D-H4-01…10
- Util existente: `serialized-asset-useful-life.util.ts` (`calculateUsefulLife`)
- Referencia umbrales: `replenishment.service.ts` (available/pending/criticality)
- Ledger: `stock-ledger.service.ts` (hooks post-TX SALE y deltas)
- Skills: `nestjs-expert`, `bullmq-specialist` (solo si escalas — no usar en MVP), `testing-patterns`, `openapi-spec-generation`, `frontend-dev-guidelines`, `system-vocabulary-review`

---

## 3. Instrucciones

### Backend (AI-SR-FULL)

1. **Eventos** — ampliar `inventory.events.ts` con `STOCK_LOW` y `ASSET_SOLD` + tipados de payload (D-H4-01).
2. **Publisher** — helper post-commit; evaluar umbrales D-H4-03/04; emitir en SALE (D-H4-02).
3. **Listener** — `InventoryDomainEventsListener` solo log (D-H4-05); registrar en `inventory.module.ts`.
4. **Endpoint** — `GET /inventory/assets/useful-life-alerts` (D-H4-06); OpenAPI.
5. **Sin migración** — D-H4-08.
6. **Tests** — matriz D-H4-09.

### Frontend (AI-FE-PLATFORM)

1. **`api-client.ts`** — método `listUsefulLifeAlerts` + tipos.
2. **Panel** — lista alertas vida útil; chip estado; enlace ficha 360 (D-H4-07).
3. **Stock bajo** — CTA/enlace a reposición F2; no duplicar bandeja.
4. **Labels** — español en `inventory-labels.ts`.
5. **Tests portal** + E2E smoke.

---

## 4. Restricciones

- Emisión **post-commit** únicamente.
- Multi-tenant por schema; prueba de aislamiento en endpoint nuevo.
- Sin PII en logs ni payloads de evento.
- Texto visible en español, sentence case.
- Cobertura ≥ 80 % en código nuevo core.
- Append-only en archivos compartidos donde aplique.

---

## 5. Entregables

- Código backend + portal + tests
- Informe: `docs/informes/INFORME-MOD12-VIDA-UTIL-STOCKLOW-FASE-H4-v1.0.md`
- OpenAPI actualizado
- E2E smoke panel vida útil
- Actualizar informe maestro MOD12 (H4 → cerrado)
- Handoff G5 → G6 → G7

---

## 6. Criterio stop/go

| Stop — escala a AI-EM-ARCH | Go |
| --- | --- |
| Quieres outbox / tabla de alertas | Sin migración en MVP |
| Quieres job BullMQ o email | Fuera de scope (opción B diferida) |
| Listener crea OC / muta stock | Solo log |
| Propones rediseñar Movimientos/Bajas | H5, después |
| Emisión dentro de la TX del ledger | Solo post-commit |

**Entrada satisfecha:** PRD H4 emitido + H3 cerrado → **EJECUTABLE**.
