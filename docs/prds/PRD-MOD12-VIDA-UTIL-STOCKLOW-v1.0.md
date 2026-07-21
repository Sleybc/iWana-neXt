# PRD — MOD12 Inventario / Submódulo Vida útil, StockLow y eventos de dominio

**Version:** 1.0  
**Estado:** ✅ **MVP cerrado** — G5+G6+G7 GO recomendado (2026-07-21)  
**Fecha:** 2026-07-21  
**Modo activo:** Product Architect + Orchestrator  
**Autor:** AI-EM-ARCH  
**Clasificación:** Confidencial — Uso interno  
**PRD padre:** [PRD-MOD12-INVENTARIO-SCM-v1.0.md](PRD-MOD12-INVENTARIO-SCM-v1.0.md)  
**ADR relacionado:** [ADR-048](../adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md) — **no se requiere ADR nuevo** (D-H4-08)  
**Auditoría de origen:** [INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md](../informes/INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md) (hallazgo **H4**)  
**Spec de diseño:** [2026-07-21-mod12-vida-util-stocklow-fase-h4-design.md](../specs/2026-07-21-mod12-vida-util-stocklow-fase-h4-design.md)

---

## 1. Contexto y motivación

Tras cerrar H3 (bajas con aprobación), el siguiente hueco de MOD12 es **H4** (severidad Media):

- **RF-INV-18:** la vida útil se calcula on-read en ficha 360 (`calculateUsefulLife`), pero **no hay** consulta/listado de activos por vencer ni panel operativo.
- **RF-INV-22:** no existe evento `StockLow`; la cobertura real es *pull* F2 (`GET /inventory/replenishment/suggestions`).
- **RF-INV-14:** el movimiento `SALE` existe; **no** se emite evento de dominio para Billing/ERP futuro.

Purchasing vive dentro del mismo módulo inventory; no hay puerto consumidor. El MVP **publica** eventos y demuestra el cableado con un listener de log, sin auto-crear OC.

## 2. Alcance

### Declaración de arranque

> **Fase siguiente de MOD12: H4 — Vida útil + StockLow + eventos de dominio.**  
> Prompt: [`PROMPT-MOD12-VIDA-UTIL-STOCKLOW-FASE-H4-v1.0.md`](../prompts/PROMPT-MOD12-VIDA-UTIL-STOCKLOW-FASE-H4-v1.0.md) — **EJECUTABLE** al aprobar este PRD.  
> Agentes: **AI-SR-FULL** (backend, líder) + **AI-FE-PLATFORM** (portal).  
> **H5** (pestañas legacy) queda **después** de H4.

### Decisiones de producto (brainstorming)

| Tema | Elección |
| --- | --- |
| Umbrales StockLow | **C** — ambos: `below-minimum` y `below-reorder` |
| Alertas vida útil | **A** — endpoint + panel portal; sin BullMQ |
| Consumidor eventos | **B** — emitir + listener mínimo (log); sin crear OC |

### En scope

- Ampliar `INVENTORY_EVENTS` con `inventory.stock-low` y `inventory.asset-sold`.
- Emisión post-commit al cruzar umbrales (dedup D-H4-04) y en SALE.
- Listener `@OnEvent` que solo loguea (sin side-effects de compras).
- `GET /inventory/assets/useful-life-alerts` paginado.
- Portal: panel de alertas de vida útil + enlace a reposición F2 (sin duplicar F2).

### Fuera de scope

- Jobs BullMQ / notificaciones email-push.
- Auto-creación de solicitudes de compra.
- Consumidor Billing/ERP real.
- Resto de eventos HLD (received, assigned, returned, written-off).
- Rediseño pestañas legacy (**H5**).
- Migración de schema / outbox persistente.

## 3. Personas y casos de uso

| Persona | Rol | Necesidad |
| --- | --- | --- |
| Operaciones | ADMIN / NOC | Ver activos por vencer / vencidos y actuar (revisar ficha 360) |
| Almacén | ADMIN | Ver stock bajo vía reposición F2; confiar en que el sistema emite StockLow |
| Integración futura | Billing/ERP | Suscribirse a `inventory.asset-sold` sin acoplarse al ledger |
| Auditoría técnica | SUPPORT | Trazar en logs emisiones StockLow / SALE |

| CU | Actor | Descripción |
| --- | --- | --- |
| CU-H4-01 | Operaciones | Listar alertas de vida útil filtradas por estado |
| CU-H4-02 | Operaciones | Abrir ficha 360 desde una alerta |
| CU-H4-03 | Sistema | Emitir StockLow al cruzar mínimo y/o reorder |
| CU-H4-04 | Sistema | Emitir asset-sold al registrar SALE |
| CU-H4-05 | Almacén | Navegar a reposición F2 ante stock bajo (UI existente) |

## 4. Requerimientos funcionales

| ID | Requisito | Prioridad |
| --- | --- | --- |
| RF-UL-01 | `GET /inventory/assets/useful-life-alerts` lista activos con estado `por-vencer` o `vencida`. | MVP |
| RF-UL-02 | El cálculo reusa `calculateUsefulLife` (umbral ≤ 3 meses = `por-vencer`). | MVP |
| RF-UL-03 | Portal muestra panel de alertas con copy en español y enlace a ficha 360. | MVP |
| RF-SL-01 | Tras un movimiento que **cruza** hacia `available < minimumStock`, emitir `inventory.stock-low` con `level=below-minimum`. | MVP |
| RF-SL-02 | Tras un movimiento que **cruza** hacia `available+pending < reorderPoint`, emitir `inventory.stock-low` con `level=below-reorder`. | MVP |
| RF-SL-03 | No re-emitir el mismo nivel si el ítem ya estaba bajo ese umbral. | MVP |
| RF-SL-04 | Listener mínimo registra la emisión sin crear OC ni mutar stock. | MVP |
| RF-SL-05 | Portal enlaza stock bajo a la subvista de reposición F2 (sin duplicar bandeja). | MVP |
| RF-EV-01 | Todo path SALE que cierra movimiento emite `inventory.asset-sold` post-commit. | MVP |
| RF-EV-02 | Payloads sin PII; referencias opacas (`itemId`, `serializedAssetId`, `stockMovementId`). | MVP |

**Trazabilidad PRD padre:** RF-UL-* → **RF-INV-18**; RF-SL-* → **RF-INV-22**; RF-EV-* → **RF-INV-14**.

## 5. Gates

| Gate | Criterio |
| --- | --- |
| G5 ARCH | Emisión post-commit; boundaries respetados; listener sin side-effects de compras |
| G6 UX/DS/QA | Panel vida útil usable; copy español; E2E smoke |
| G7 EM-ARCH | RF-INV-14/18/22 ✅ (parcial→construido según alcance); H4 cerrado en informe maestro |

## 6. Criterios de aceptación (MVP)

- [x] Endpoint useful-life-alerts filtra correctamente `por-vencer` / `vencida`.
- [x] Cruzar mínimo emite `below-minimum`; cruzar reorder emite `below-reorder`.
- [x] Ya bajo umbral + movimiento → no re-emite ese nivel.
- [x] SALE emite `asset-sold`; listener loguea.
- [x] Portal: panel vida útil + enlace F2; tests + E2E smoke.
- [x] OpenAPI actualizado; informe de fase H4.

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Doble emisión / ruido | Dedup al cruzar (D-H4-04) + tests |
| Emisión en TX fallida | Solo post-commit (D-H4-02) |
| Divergencia F2 vs evento | Misma familia de cálculo available/pending |
| Expectativa de notificaciones | Fuera de scope; documentar en D-H4-10 |

---

**Prompt de ejecución:** [PROMPT-MOD12-VIDA-UTIL-STOCKLOW-FASE-H4-v1.0.md](../prompts/PROMPT-MOD12-VIDA-UTIL-STOCKLOW-FASE-H4-v1.0.md)
