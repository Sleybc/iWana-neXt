# Diseño — MOD11 ↔ MOD12: reverso de un consumo de inventario de OT

**Versión:** 1.0
**Estado:** **Propuesto.** Pendiente de la revisión cruzada de G1 (`sr-backend` factibilidad, `sec-eng` riesgo y `prod-ux` copy) y de la aprobación del CTO.
**Fecha:** 2026-10-09
**Modo:** Product Architect + Architect
**Autor:** AI-EM-ARCH
**Origen:** deuda §8.1 de la spec `docs/specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md` v1.1, que es condición de G7 (`docs/plans/2026-10-09-mod11-mod12-deuda-g7.md` §1).
**Decisiones de producto del CTO (2026-10-09):**

- **P1:** solo un supervisor revierte.
- **P2:** el reverso también es posible después del cierre de la OT, con un acto de corrección explícito.
- **P3:** el equipo vuelve a la custodia del técnico y se cierra su comodato.
- **P4:** queda un movimiento contrario con rastro, nunca un borrado.

**ADR en los que se apoya, sin modificarlos:**

- [ADR-068](../adrs/ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md) (Aprobado): coreografía por outbox, decisión 6, y OT terminal inmutable con settlement append-only, decisión 10.
- [ADR-090](../adrs/ADR-090-Correccion-de-OT-Dueno-del-Dato-y-Anulacion-por-Error.md) (Aprobado): ninguna corrección destruye rastro (§D5); una corrección sobre la OT es explícita y registrada (§D4).
- ADR-048 (Aprobado): el ownership del inventario es de MOD12.
- [ADR-074](../adrs/ADR-074-Autenticacion-de-Redis.md) (Aprobado): Redis autenticado.

**Spec hermana vigente:** la del consumo de inventario, v1.1. Esta spec **reutiliza su infraestructura**: outbox, cotejo con el outbox, firma HMAC, cola dedicada, recibos, D7, D11 y la regla de test integrado por motivo. No la supera.

---

## 1. Problema

Un consumo confirmado mueve el stock de verdad. El serial sale de la custodia del técnico, queda en el sitio del cliente y abre un comodato. Si el técnico se equivocó de equipo, de cantidad o de OT, **hoy no hay forma de deshacerlo**:

- el stock queda mal;
- el serial figura instalado en el cliente equivocado;
- el comodato queda abierto.

La única salida sería editar la base de datos, que es justo lo que ADR-090 §D5 prohíbe.

## 2. Decisiones

| # | Decisión | Por qué |
| --- | --- | --- |
| **R1** | **El reverso es un acto propio de supervisión sobre una línea de consumo `CONFIRMED`**, con un motivo obligatorio. Lo solicita MOD11 con el comando `POST /tasks/execution-orders/:id/item-usage/:usageId/reversal`. Exige rol de supervisión, el permiso `SUPERVISE` y el alcance por sede de `assertSupervisionScope`. | P1. Mismo alcance que la anulación de ADR-090 §D3. |
| **R2** | **Se revierte la línea completa**, sin reversos parciales en la v1. Para corregir una cantidad, se revierte y se registra de nuevo. | Un reverso parcial obliga a llevar saldo por línea y abre dobles reversos. Revertir y volver a registrar cubre el caso sin estado nuevo. |
| **R3** | **El consumo original no se edita.** Nace el registro append-only `execution_order_item_usage_reversals`, con `id`, `item_usage_id` único, `reversal_request_id` (UUID de idempotencia), `reason`, `requested_by`, `requested_at`, `status` (`PENDING`, `CONFIRMED` o `REJECTED`), `stock_movement_id`, `rejection_reason_code` y `decided_at`. La línea de consumo **expone** su estado de reverso como proyección. | P4 y ADR-090 §D5. **Una sola solicitud de reverso por línea**: el índice único lo garantiza. Para revertir de nuevo hace falta otra línea. |
| **R4** | **El reverso también vale sobre una OT terminal.** Ahí es un **acto de corrección posterior al cierre**: no reescribe el resultado, el cierre, la actividad ni la evidencia. Se anexa como settlement y queda visible como «Corrección posterior al cierre». | P2 y ADR-068 decisión 10. |
| **R5** | **La coreografía reutiliza la del consumo.** MOD11 escribe `InventoryConsumptionReversalRequestedV1` en su outbox. El worker lo coteja con el outbox, lo firma y lo reencola en `inventory-execution-requests`. El consumidor de MOD12 lo distingue por tipo y responde con `InventoryReversalConfirmedV1` o `InventoryReversalRejectedV1`. Se aplican las mismas reglas: recibo terminal, respuesta idempotente fuera de la guarda `aggregateVersion`, diagnóstico de D11 y D7 para los pendientes. | No hay infraestructura nueva. Los riesgos de procedencia, retención y carrera ya quedaron cerrados en la spec hermana. |
| **R6** | **El movimiento contrario lo decide MOD12** a partir del **movimiento original** (`stock_movement_id` de la línea): <br>• destino `INSTALLED_AT_CUSTOMER`: el serial vuelve del sitio del cliente a la custodia móvil del técnico, su estado vuelve a `ASSIGNED_TO_TECHNICIAN` y se cierra el comodato (`closeOpenLoanWithManager`); <br>• consumo por cantidad: la cantidad vuelve a la custodia de origen. <br>El movimiento lleva el origen `EXECUTION_ORDER_REVERSAL` (valor nuevo de `StockMovementOrigin`), con referencia al movimiento original y clave de idempotencia `reversalRequestId`. | P3. MOD12 es dueño del inventario (ADR-048), así que MOD11 no le dice cómo mover. Solo identifica qué consumo revertir. |
| **R7** | **MOD12 rechaza el reverso cuando el mundo cambió**, con un motivo tipado: <br>• `REVERSAL_ASSET_MOVED`: el serial ya no está donde lo dejó el consumo; <br>• `REVERSAL_CUSTODY_INACTIVE`: el técnico ya no tiene custodia activa; <br>• `REVERSAL_ORIGINAL_NOT_FOUND`: no existe el movimiento original. <br>Un rechazo deja recibo, no reintenta y se ve en la consola con su copy. | Mismo principio que la D5 hermana: un rechazo de negocio es un resultado, no un error técnico. |
| **R8** | **El gate de cierre deja de contar el consumo revertido.** El evaluador excluye las líneas con reverso `CONFIRMED`. Sobre una OT **abierta**, el requisito `MATERIAL` puede volver a quedar pendiente. Sobre una OT **terminal** pasa lo mismo, pero el resultado **no cambia** (R4). La consola muestra el requisito pendiente con la marca de corrección posterior. | Que el checklist diga la verdad. La OT ya cerrada no se reabre por sí sola. Reabrirla, si alguien lo pide, sería otra decisión. |

**Fuera de alcance:**

- reversos parciales;
- reverso de un reverso;
- reabrir una OT cerrada;
- reverso de consumos de cuadrilla (no existen en la v1, según el plan de deuda G7 §3);
- ajustes de inventario que no vengan de una OT.

## 3. Contrato (se congela al aprobar)

Archivo: `packages/shared/src/contracts/operations/execution-orders.ts`, contrato **v1.7**.

```ts
export interface ReverseItemUsageCommand {
  reason: string;            // obligatorio; texto libre con filtro anti-PII (patrón safeTextField)
}

export interface InventoryConsumptionReversalRequestedV1 extends EventPayloadBase {
  reversalRequestId: string;        // idempotencia extremo a extremo
  inventoryRequestId: string;       // el consumo original
  originalStockMovementId: string;  // el movimiento a contrarrestar
  technicianCustodyId: string;      // responsibleRefId del técnico (semántica v1.6)
  actorUserId: string;              // el supervisor; atribución, no autorización
}
export interface InventoryReversalConfirmedV1 extends EventPayloadBase {
  reversalRequestId: string;
  stockMovementId: string;          // el movimiento contrario
}
export interface InventoryReversalRejectedV1 extends EventPayloadBase {
  reversalRequestId: string;
  reasonCode: 'REVERSAL_ASSET_MOVED' | 'REVERSAL_CUSTODY_INACTIVE' | 'REVERSAL_ORIGINAL_NOT_FOUND';
}
// ExecutionOrderItemUsage: + reversal?: { status: 'PENDING'|'CONFIRMED'|'REJECTED';
//   requestedAt: string; rejectionReasonCode: string | null } | null
// ExecutionOrderAllowedAction: + 'REVERSE_ITEM_USAGE' (solo supervisión, solo líneas CONFIRMED sin reverso)
```

El esquema Zod de runtime acompaña al contrato, igual que en la v1.6.

## 4. Datos

- **Migración 140 (MOD11):** tabla `execution_order_item_usage_reversals`, con índice único sobre `item_usage_id` y otro sobre `(tenant_id, reversal_request_id)`. El `down` se bloquea si hay filas, igual que la 137 y la 139.
- **Migración 141 (MOD12):** recibos de reverso. **Por decidir en F1:** si reutiliza `inventory_execution_request_receipts` añadiendo una columna `kind`, o si crea una tabla propia.
- **Enum:** `StockMovementOrigin.EXECUTION_ORDER_REVERSAL`. Si el tipo vive en la base de datos, va también en la 141.

## 5. Criterios de aceptación

- **RA-01** — Un supervisor revierte un CPE serial `CONFIRMED` de una OT abierta. El serial vuelve a la custodia móvil del técnico en estado `ASSIGNED_TO_TECHNICIAN`, el comodato se cierra, queda un movimiento `EXECUTION_ORDER_REVERSAL` que referencia el original, y la línea muestra el reverso `CONFIRMED`.
- **RA-02** — Revertir un consumo por cantidad devuelve el saldo a la custodia de origen.
- **RA-03** — El consumo original **no cambia**: ni su estado, ni su movimiento, ni su recibo.
- **RA-04** — Sobre una OT **terminal**, el reverso se aplica y el resultado, el cierre y la evidencia quedan intactos. La consola muestra «Corrección posterior al cierre».
- **RA-05** — Un técnico, aunque sea el asignado, **no puede** revertir: `403` y la acción no aparece en `allowedActions`. Un supervisor fuera de su sede, tampoco.
- **RA-06** — Sin motivo, o con un motivo con PII, el comando se rechaza con `422`.
- **RA-07** — Una segunda solicitud de reverso sobre la misma línea se rechaza (`409`). El replay de la misma solicitud es idempotente: un solo movimiento contrario y un solo recibo, también en una **carrera real**.
- **RA-08** — Cada motivo de R7 termina `REJECTED`, con recibo, sin reintentos y con su copy visible. **Test integrado por motivo**, contra Postgres y Redis reales (norma del CTO del 2026-10-08).
- **RA-09** — Tras un reverso `CONFIRMED`, el requisito `MATERIAL` que ese consumo satisfacía vuelve a pendiente en el checklist. En la OT terminal, el resultado no cambia.
- **RA-10** — Una línea `PENDING` o `REJECTED` no ofrece la acción de reverso.
- **RA-11** — Las garantías de la spec hermana se mantienen para los nuevos tipos de evento: cotejo con el outbox antes de firmar, DLQ sin PII y retención de 24 horas.

## 6. Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | Igual que el consumo: el esquema se deriva de `public.tenants` y el job va firmado y cotejado con el outbox. |
| **Seguridad** | Es una mutación de inventario iniciada por un supervisor: `SUPERVISE` más el alcance de sede. El motivo pasa por el filtro anti-PII. La procedencia del job está cubierta (cotejo, HMAC y Redis autenticado). |
| **Datos** | Migraciones 140 y 141, ambas aditivas, reversibles y con `down` bloqueado si hay datos. Un valor nuevo de enum. |
| **Escala** | Un job por reverso. Volumen bajo: el reverso es excepcional. |
| **Regulación** | El motivo es texto libre con filtro anti-PII. `actorUserId` es solo atribución. |
| **Boundaries** | Igual que el consumo. MOD11 no le dice a MOD12 cómo mover, solo qué consumo revertir. |

## 7. Bloques (detalle en el plan)

| Bloque | Qué entrega | Dueño |
| --- | --- | --- |
| **V1** | Lado MOD11: contrato v1.7, comando, migración 140, `allowedActions`, emisión al outbox, evaluador (R8) y aplicación de la respuesta | `sr-backend` |
| **V2** | Lado MOD12: consumidor del nuevo tipo, movimiento contrario, cierre de comodato, recibos y motivos de R7 | `sr-backend` |
| **V3** | Consola: acción de reverso para supervisión, diálogo con motivo, estado del reverso y marca de corrección posterior al cierre | `fe-platform` |
| **V4** | RA-01 a RA-11 integrados contra Postgres y Redis reales | `sr-qa` |
| **V5** | Revisión de seguridad de V1 y V2 | `sec-eng` |

## 8. Preguntas para la revisión G1

1. **F1:** ¿recibo de reverso en la misma tabla, con `kind`, o en una tabla propia? ¿El ledger ya permite contrarrestar un movimiento por referencia, o hace falta una operación nueva?
2. **S1:** ¿el alcance de sede basta para un reverso posterior al cierre, o hace falta además auditoría reforzada?
3. **U1:** el copy del diálogo de reverso, de los tres motivos de R7 y de «Corrección posterior al cierre».
