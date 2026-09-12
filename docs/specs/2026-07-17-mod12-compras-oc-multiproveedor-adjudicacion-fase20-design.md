# SPEC — MOD12 Compras · OC multiproveedor desde adjudicación — Fase 20

**Versión:** 1.0
**Estado:** Diseño aprobado — habilita G4/G5 · **SUPERADO PARCIALMENTE el 2026-09-11 por la Fase 30** (ver §5)
**Fecha:** 2026-07-17
**Módulo:** MOD12 Inventario / SCM — Compras
**Autor:** AI-EM-ARCH
**Prompt:** [PROMPT Fase 20](../prompts/PROMPT-MOD12-COMPRAS-OC-MULTIPROVEEDOR-ADJUDICACION-FASE-20-v1.0.md)
**Supersedido en parte por:** [SPEC Fase 30 — adjudicación en matriz](2026-09-11-mod12-compras-adjudicacion-matriz-design.md) y [ADR-087 (propuesto)](../adrs/ADR-087-Cobertura-Adjudicacion-Derivada-Compras.md)

## 1. Problema

El API ya admite adjudicación por línea (split entre proveedores) y `POST /purchasing/orders` con `orders[]`. El portal solo crea **una** OC en modo legado, sin ligar awards ni heredar `unitCost` de quote lines. Tras la primera OC la PR pasa a `CONVERTED_TO_PO` y bloquea la segunda.

## 2. Objetivo

Permitir, desde el portal: adjudicar líneas a distintos proveedores → generar **N OCs** en un solo POST batch, con `unitCost` prefilled desde líneas de cotización.

## 3. Decisiones

| Tema | Valor |
| --- | --- |
| Agrupación | Por `awardedPartyRefId` |
| Contrato | `orders[]` (ya existente); tipado en `api-client` |
| Precio | Resolver en **portal** desde `supplier_quote_lines` vía `supplierQuoteId` + `purchaseRequestLineId` |
| Awards | Solo si PR está `APPROVED` (backend) |
| Sin awards | No ofrecer batch; CTA a Adjudicación; legado opcional oculto en happy path con awards |
| Fuera | Enforcement de `approvalLevel`; cambio de `estimatedAmount`; split qty multi-proveedor en no-PROJECT |

## 4. CA

| CA | Descripción |
| --- | --- |
| CA-20-01 | Dos awards → un POST `orders[]` → 2 OCs; PR → `CONVERTED_TO_PO` — **superado**, ver §5 |
| CA-20-02 | Cada OC solo líneas del proveedor adjudicado |
| CA-20-03 | `unitCost` prefilled desde quote line si hay `supplierQuoteId` — **superado**, ver §5 |

## 5. Superación parcial — Fase 30 (2026-09-11)

Tres decisiones de esta spec quedan superadas. El resto —agrupación por `awardedPartyRefId`, contrato
`orders[]`, exigencia de `APPROVED` para adjudicar, y el modelo de datos de
`purchase_request_line_awards`— **sigue vigente**.

| Punto de esta spec | Estado | Sustituido por |
| --- | --- | --- |
| **Interfaz de adjudicación** (pantalla por línea de solicitud, `AwardLinesPanel`) | Superado | Matriz productos × cotizaciones — [SPEC Fase 30](2026-09-11-mod12-compras-adjudicacion-matriz-design.md) §3–§5 |
| **«Precio: resolver en portal desde `supplier_quote_lines`»** (§3) y **CA-20-03** | Superado | El costo unitario se **deriva en servidor** por precedencia snapshot → línea de cotización → cliente solo sin cotización. Resolverlo en el portal habilitaba órdenes con costo cero por el camino `unitCostSource: 'missing'` |
| **CA-20-01: «PR → `CONVERTED_TO_PO`»** como resultado incondicional | Superado | La conversión pasa a ser **condicional**: solo si toda línea viva está ordenada. [ADR-087 (propuesto)](../adrs/ADR-087-Cobertura-Adjudicacion-Derivada-Compras.md) D3 |

**Nota de gobierno.** El §1 de esta spec ya enunciaba el defecto —«Tras la primera OC la PR pasa a
`CONVERTED_TO_PO` y bloquea la segunda»— como contexto conocido, y la fase se cerró sin corregirlo. El
defecto permaneció abierto desde 2026-07-17 hasta que la Fase 30 lo convirtió en bloqueante al
requerir adjudicación parcial con la solicitud abierta. Registrado como lección de proceso: un defecto
descrito en la sección de problema de una spec y no incluido en sus criterios de aceptación no queda
cubierto por ningún gate.

Asimismo, la línea «Fuera: split qty multi-proveedor en no-PROJECT» **sigue vigente y confirmada** por
decisión del CTO del 2026-09-11.
| CA-20-04 | Sin awards → no batch; empty/CTA adjudicación |
| CA-20-05 | Adjudicar con PR ≠ `APPROVED` → 400 |
| CA-20-06 | RTL builder + preview drawer |
