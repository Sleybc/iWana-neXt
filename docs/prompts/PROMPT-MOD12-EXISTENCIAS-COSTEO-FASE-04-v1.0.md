# PROMPT - MOD12 Existencias — Costeo promedio móvil — Fase 04

> **Estado: Emitido (G4) — EJECUTABLE** (criterios de entrada satisfechos 2026-07-20: **ADR-059 aprobado por el CTO** + G7 F3B confirmado + G1 SR-FULL/PROD-UX cerrado; ADR-022). Recordatorio: sin claim DIAN/fiscal; lock en recepción concurrente es stop condition — ver §6.

## Vinculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
- PRD: `docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md` §7 Fase 4
- ADR: `docs/adrs/ADR-059-Costeo-Promedio-Movil-Valoracion-Inventario.md`
- Spec: `docs/specs/2026-07-20-mod12-existencias-costeo-fase04-design.md`
- Entrada de fase: G7 F3B confirmado CTO 2026-07-20 (ADR-022)

## Modulo

- Nombre: Inventario / SCM — submódulo Existencias (stock)
- Codigo: MOD12
- Fase: 04 (Costeo y valoración operativa)
- Version: 1.0
- Fecha: 2026-07-20
- Generado por: AI-EM-ARCH
- Destinatario: AI-SR-FULL (backend) + AI-FE-PLATFORM (portal) + AI-DATA-ENG consultivo (migración 080)
- Nombre de archivo destino: `PROMPT-MOD12-EXISTENCIAS-COSTEO-FASE-04-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** cada ítem mantiene un **costo promedio** actualizado en recepción; las salidas del kardex sellan `unitCost`; el valor de inventario usa ese promedio.
- **Sí entra:** migración 080 `average_cost`; update en recepción OC/mostrador; sellado de salidas/ajustes/transferencias; cadena de valoración; UI labels «Costo promedio» / «Valor de inventario»; tests de fórmula y concurrencia.
- **No entra:** FIFO; promedio por bodega; DIAN/asientos; recosteo histórico outbound; reportes exportables; depreciación de serializados.

> **Stop:** no afirmar cumplimiento fiscal. No implementar capas FIFO «de paso». Si la recepción concurrente no puede lockearse, detener y escalar a EM-ARCH.

---

## 2. Artefactos de entrada obligatorios

- ADR-059 **Aprobado** (bloqueante)
- Spec D-F4-1…11 / CA-F4-01…08
- PRD §7 Fase 4 congelado
- Skills: `nestjs-expert`, `database-migration`, `postgresql`, `testing-patterns`, `frontend-dev-guidelines`, `system-vocabulary-review`, `openapi-spec-generation`

---

## 3. Instrucciones

### Backend (AI-SR-FULL)

1. Migración tenant **080** + registro en `runner.ts`; backfill; `down()` reversible.
2. Entidad + DTO shared `averageCost`; OpenAPI.
3. Servicio de costeo (o helper en módulo) invocado desde `GoodsReceiptService` y `CounterPurchaseService` en la misma TX del ledger; lock por ítem.
4. Extender callers del ledger que descuentan stock para pasar `unitCost` sellado (issue dispatch, sale, consumption, EO, write-off, adjustment, transfer, cycle-count close).
5. Dashboard + replenishment: priorizar `averageCost` en `resolveUnitCost`.
6. Tests: fórmula, concurrencia, sellado salida, ajuste no muta avg, OpenAPI.

### Frontend (AI-FE-PLATFORM)

1. Labels canónicos «Costo promedio», «Valor de inventario»; «Sin costo» intacto.
2. Detalle/form ítem: mostrar `averageCost` (lectura o campo según patrón de standardCost).
3. Dashboard KPI: copy alineado a valoración operativa (no fiscal).
4. Kardex: mostrar unitCost en salidas cuando venga poblado.
5. Specs portal mínimos + E2E smoke si el patrón del módulo lo exige.

---

## 4. Restricciones

- Multi-tenant schema; sin PII en logs.
- Texto español sentence case; sin enums crudos.
- Cobertura ≥80% en código nuevo core.
- Append-only en archivos compartidos con otros tracks.
- No mezclar con cambios de audit RLS ajenos del working tree.

---

## 5. Entregables

- Código + migración 080 + tests
- Informe `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-04-v1.0.md`
- OpenAPI actualizado
- Handoff G5 → EM-ARCH

---

## 6. Criterio stop/go

| Stop | Go |
| --- | --- |
| Fórmula sin tests de concurrencia | CA-F4-01…08 con evidencia |
| Claim DIAN en UI/docs | Copy solo operativo |
| FIFO/capas introducidos | Solo promedio por ítem |

**Entrada satisfecha:** ADR-059 Aprobado CTO 2026-07-20 → este prompt es **EJECUTABLE**.
