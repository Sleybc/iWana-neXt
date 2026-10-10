# Diseño — MOD11 ↔ MOD12: reverso de un consumo de inventario de OT

**Versión:** 1.2
**Estado:** **Aprobado por el CTO el 2026-10-10**, con el índice parcial de R3, `REVERSAL_LOAN_MISMATCH`, las migraciones 140 y 141 (con el valor de enum no reversible) y la decisión R9 sobre motivo y PII. **El contrato v1.7 del §3 queda congelado desde esta aprobación.**
**Fecha:** 2026-10-09 · **Revisión:** 2026-10-10
**Cambio v1.1 → v1.2 (2026-10-10, fe de erratas de AI-EM-ARCH tras V4-R):** RA-03, RA-05 y RA-06 se alinean con las convenciones vigentes del repositorio. Las decisiones R1 a R10 y el contrato v1.7 no cambian. Detalle en §9b.
**Cambio v1.0 → v1.1 (2026-10-10):** incorpora F1 (GO de factibilidad con dos consultas), S1 (GO condicionado con una consulta) y U1 (GO de copy). Cambian R3, R5, R6, R7 y R8; nacen R9 (motivo y auditoría) y R10 (re-solicitud D7 de reversos). Detalle en §9.
**Modo:** Product Architect + Architect
**Autor:** AI-EM-ARCH
**Origen:** deuda §8.1 de la spec `docs/specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md` v1.1, condición de G7 (`docs/plans/2026-10-09-mod11-mod12-deuda-g7.md` §1).

**Decisiones de producto del CTO (2026-10-09):**

- **P1:** solo un supervisor revierte.
- **P2:** también después del cierre de la OT, con un acto de corrección explícito.
- **P3:** el equipo vuelve a la custodia del técnico y se cierra el comodato.
- **P4:** movimiento contrario con rastro, nunca un borrado.

**ADR en los que se apoya, sin modificarlos:**

- [ADR-068](../adrs/ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md) (Aprobado): coreografía por outbox (decisión 6) y OT terminal inmutable con settlement append-only (decisión 10).
- [ADR-090](../adrs/ADR-090-Correccion-de-OT-Dueno-del-Dato-y-Anulacion-por-Error.md) (Aprobado): ninguna corrección destruye rastro (§D5) y toda corrección es explícita y registrada (§D4).
- ADR-048 (Aprobado): el ownership del inventario es de MOD12.
- [ADR-074](../adrs/ADR-074-Autenticacion-de-Redis.md) (Aprobado): Redis autenticado.

**Spec hermana vigente:** la de consumo, v1.1. Esta spec **reutiliza su infraestructura**: outbox, cotejo con el outbox, firma HMAC, cola dedicada, recibos, D7, D11 y la regla de test integrado por motivo. No la supera.

---

## 1. Problema

Un consumo confirmado mueve el stock de verdad: el serial sale de la custodia del técnico, queda en el sitio del cliente y abre un comodato. Si el técnico se equivocó de equipo, de cantidad o de OT, **hoy no hay forma de deshacerlo**. El stock queda mal, el serial figura instalado en el cliente equivocado y el comodato queda abierto. La única salida sería editar la base de datos, que es justo lo que ADR-090 §D5 prohíbe.

## 2. Decisiones

| # | Decisión | Por qué |
| --- | --- | --- |
| **R1** | **El reverso es un acto propio de supervisión sobre una línea de consumo `CONFIRMED`**, con un motivo obligatorio. Lo solicita MOD11 con `POST /tasks/execution-orders/:id/item-usage/:usageId/reversal`. Exige rol de supervisión, el permiso `SUPERVISE` y el alcance por sede de `assertSupervisionScope`. | P1. Mismo alcance que la anulación de ADR-090 §D3. |
| **R2** | **Se revierte la línea completa**; no hay reversos parciales en la v1. Para corregir una cantidad, se revierte y se registra de nuevo. | Un reverso parcial obliga a llevar saldo por línea y abre dobles reversos. |
| **R3** | **El consumo original no se edita.** Nace el registro append-only `execution_order_item_usage_reversals`, con `id`, `item_usage_id`, `reversal_request_id` (UUID de idempotencia, único por tenant), `reason`, `requested_by`, `requested_at`, `status` (`PENDING`, `CONFIRMED` o `REJECTED`), `stock_movement_id`, `rejection_reason_code`, `decided_at`, `last_requested_at` y `request_attempts`. La línea de consumo **expone** su estado de reverso como proyección. **Una línea admite un solo reverso activo**: el índice único **parcial** sobre `item_usage_id` cubre los estados `PENDING` y `CONFIRMED`. Tras un `REJECTED`, el supervisor puede pedir **uno nuevo** cuando haya resuelto la causa. Los rechazos anteriores se conservan como historial. | P4 y ADR-090 §D5. *(v1.1: con el índice único simple de la v1.0, un rechazo por algo que se puede corregir, como una custodia inactiva, dejaba la línea imposible de revertir para siempre.)* |
| **R4** | **El reverso también vale sobre una OT terminal**, como **acto de corrección posterior al cierre**. No reescribe el resultado, el cierre, la actividad ni la evidencia: se anexa como settlement y queda visible como «Corrección posterior al cierre». | P2 y ADR-068 decisión 10. |
| **R5** | **La coreografía reutiliza la del consumo, y hay que extenderla de forma explícita (S1.3, F1 §5).** MOD11 escribe `InventoryConsumptionReversalRequestedV1` en su outbox. El worker lo coteja con el outbox, lo firma y lo reencola en `inventory-execution-requests`. El consumidor de MOD12 lo distingue por tipo y responde con `InventoryReversalConfirmedV1` o `InventoryReversalRejectedV1`. Puntos de extensión obligatorios: <br>• el contrato y la unión de eventos; <br>• los esquemas Zod; <br>• las listas de tipos de inventario del worker (`INVENTORY_EVENT_TYPES` y los tipos exentos de la guarda `aggregateVersion`); <br>• el cotejo con el outbox antes de firmar; <br>• el despachador del consumidor de MOD12; <br>• la transición en MOD11 al recibir la respuesta; <br>• **la clasificación como inventario en el relay**, para que el job reciba las 24 horas de D11 y no los 30 días genéricos; <br>• la DLQ diagnóstica y la limpieza. <br>**Ninguna garantía se hereda sola.** | Sin infraestructura nueva. S1 demostró que omitir un punto, por ejemplo la clasificación del relay, degrada la retención sin que nada falle. |
| **R6** | **El movimiento contrario lo decide MOD12 con una operación de reverso nueva y explícita en el ledger** (F1 §1: hoy no existe). Parte del **movimiento original** (`stock_movement_id` de la línea). Deriva las ubicaciones físicas de las líneas del original, y el activo del evento de ciclo de vida ligado a ese movimiento. **MOD11 nunca envía ubicaciones físicas.** `technicianCustodyId` sigue en el evento y MOD12 lo coteja con el `responsibleRefId` de la custodia de la línea negativa original. **Enlace persistido:** el movimiento contrario lleva `isReversal = true` y origen `EXECUTION_ORDER_REVERSAL`, y en la **misma transacción** se fija `original.reversedByMovementId = contrario.id`; el recibo guarda los dos ids. Casos: <br>• destino `INSTALLED_AT_CUSTOMER`: el serial vuelve del sitio del cliente a la custodia móvil del técnico, su estado vuelve a `ASSIGNED_TO_TECHNICIAN` y se cierra **el comodato abierto con el `stockMovementId` original**, cotejado y actualizado con bloqueo en la misma transacción (no «cualquier comodato abierto del activo», como hace hoy `closeOpenLoanWithManager`); <br>• consumo por cantidad: la cantidad vuelve a la custodia de origen. <br>La clave de idempotencia es `reversalRequestId`. | P3 y ADR-048. MOD11 solo identifica qué consumo revertir. |
| **R7** | **MOD12 rechaza el reverso cuando el mundo cambió**, con motivo tipado: <br>• `REVERSAL_ASSET_MOVED`: el serial ya no está donde lo dejó el consumo, o el original ya tiene `reversedByMovementId`; <br>• `REVERSAL_CUSTODY_INACTIVE`: el técnico ya no tiene custodia activa; <br>• `REVERSAL_ORIGINAL_NOT_FOUND`: el movimiento original no existe, no es un movimiento de OT de esta solicitud o la custodia no coincide; <br>• **`REVERSAL_LOAN_MISMATCH`** *(v1.1)*: un consumo de instalación no tiene abierto el comodato ligado al movimiento original. **Nunca se confirma un reverso sin cerrar el comodato correcto.** <br>Un rechazo deja recibo, no reintenta y se ve en la consola con su copy. | Mismo principio que la D5 hermana: un rechazo de negocio es un resultado, no un error técnico. |
| **R8** | **El gate de cierre deja de contar el consumo revertido.** El evaluador excluye las líneas con reverso `CONFIRMED` **en los dos caminos que lo invocan: `getCompletion` (progreso) y el comando de cierre** (F1 §6). El estado del reverso llega cargado a ambos. Sobre una OT abierta, el requisito `MATERIAL` puede volver a pendiente. Sobre una OT terminal también, pero el resultado **no cambia** (R4). | Que el checklist diga la verdad sin reabrir la OT. Es el mismo modo de fallo que documentó la spec de acta de instalación. |
| **R9** | **Motivo y auditoría (S1).** El motivo **se queda en MOD11**: no viaja en el evento, ni en el job, ni en los logs, ni en la DLQ. Se valida con `safeTextField` (no vacío, máximo 2.000 caracteres, filtro `noColombianPII`), **declarado como defensa en profundidad y no como detección exhaustiva**. La UI pide un motivo operativo sin datos personales (copy de U1). El reverso deja **asiento de auditoría durable** con el actor y la correlación, con el patrón de `finishCommand` de la anulación, y **no** falsea una transición de estado de la OT. `originalStockMovementId` **se deriva de la línea persistida**; el endpoint no lo acepta del cliente. | S1.1, S1.2 y S1.4. **Decisión sobre la consulta de S1:** el filtro de patrones, la minimización (el motivo nunca sale de MOD11), la guía en la UI y la retención ligada al registro de la OT **bastan para la finalidad de auditoría**. No se añade detección de PII adicional. |
| **R10** | **Re-solicitud D7 de reversos** (F1, cambio 3). Igual que en los consumos: el scanner de MOD11 reemite los reversos `PENDING` con un `eventId` nuevo y el mismo `reversalRequestId`, con `SKIP LOCKED`, `SAVEPOINT` por fila y tope de intentos. Es seguro por el recibo. | El reverso usa la misma cola y puede perder la respuesta igual que el consumo. |

**Observabilidad (S1.4, apoyo):** una métrica de reversos por supervisor y por sede, con alerta ante frecuencia anómala, **sin bloquear** la corrección legítima. No se impone una cuota dura.

**Fuera de alcance:**

- reversos parciales;
- reverso de un reverso;
- reabrir una OT cerrada;
- reversos de cuadrilla (no existen en la v1, según el plan de deuda G7 §3);
- ajustes de inventario que no vengan de una OT.

## 3. Contrato (se congela al aprobar)

Archivo: `packages/shared/src/contracts/operations/execution-orders.ts`, contrato **v1.7**, con su esquema Zod de runtime.

```ts
export interface ReverseItemUsageCommand {
  reason: string;            // obligatorio; safeTextField; se queda en MOD11 (R9)
}

export interface InventoryConsumptionReversalRequestedV1 extends EventPayloadBase {
  reversalRequestId: string;        // idempotencia extremo a extremo
  inventoryRequestId: string;       // el consumo original
  originalStockMovementId: string;  // derivado de la línea persistida (R9)
  technicianCustodyId: string;      // responsibleRefId del técnico; MOD12 lo coteja (R6)
  actorUserId: string;              // el supervisor; atribución, no autorización
}
export interface InventoryReversalConfirmedV1 extends EventPayloadBase {
  reversalRequestId: string;
  stockMovementId: string;          // el movimiento contrario
}
export interface InventoryReversalRejectedV1 extends EventPayloadBase {
  reversalRequestId: string;
  reasonCode:
    | 'REVERSAL_ASSET_MOVED'
    | 'REVERSAL_CUSTODY_INACTIVE'
    | 'REVERSAL_ORIGINAL_NOT_FOUND'
    | 'REVERSAL_LOAN_MISMATCH';
}
// El motivo (reason) NO viaja en ningún evento (R9).
// ExecutionOrderItemUsage: + reversal?: { status: 'PENDING'|'CONFIRMED'|'REJECTED';
//   requestedAt: string; rejectionReasonCode: string | null } | null
// ExecutionOrderAllowedAction: + 'REVERSE_ITEM_USAGE' (solo supervisión; línea CONFIRMED sin reverso activo)
```

## 4. Datos

- **Migración 140 (MOD11):** tabla `execution_order_item_usage_reversals`, con un índice único **parcial** sobre `item_usage_id` para `status IN ('PENDING', 'CONFIRMED')` y un índice único sobre `(tenant_id, reversal_request_id)`. El `down` se bloquea si hay filas.
- **Migración 141 (MOD12), decidida a partir de F1 §4:** **se reutiliza `inventory_execution_request_receipts`** con una columna `kind` (`CONSUMPTION` o `REVERSAL`). Los recibos existentes pasan a `CONSUMPTION`. La clave lógica es `(tenant_id, kind, request_id)`: el `inventory_request_id` actual se documenta o se renombra como id genérico de solicitud. La misma migración añade el valor **`EXECUTION_ORDER_REVERSAL` al enum de PostgreSQL** del origen del movimiento. **Política del `down`:** revierte `kind` y se bloquea si existen recibos `REVERSAL` o movimientos con ese origen. El valor del enum se declara **no reversible**, porque PostgreSQL no permite quitarlo sin recrear el tipo, y se documenta.

## 5. Criterios de aceptación

- **RA-01** — Un supervisor revierte un CPE serial `CONFIRMED` de una OT abierta. El serial vuelve a la custodia móvil del técnico en estado `ASSIGNED_TO_TECHNICIAN`, **el comodato ligado al movimiento original** se cierra, queda un movimiento `EXECUTION_ORDER_REVERSAL` enlazado con `reversedByMovementId`, y la línea muestra el reverso `CONFIRMED`.
- **RA-02** — Revertir un consumo por cantidad devuelve el saldo a la custodia de origen.
- **RA-03** — El consumo original **no cambia**: ni su estado, ni su recibo, ni sus líneas de movimiento. En la fila del movimiento original solo se fija `reversedByMovementId`, y la metadata técnica `updated_at` registra ese cambio (v1.2). Ningún campo de negocio cambia.
- **RA-04** — Sobre una OT **terminal**, el reverso se aplica y el resultado, el cierre y la evidencia quedan intactos. La consola muestra «Corrección posterior al cierre».
- **RA-05** — Un técnico, aunque sea el asignado, **no puede** revertir: `403` y la acción no aparece en `allowedActions`. Un supervisor fuera de su sede, tampoco: recibe `404`, como en los demás comandos de supervisión, porque `assertSupervisionScope` no revela que la OT existe (v1.2).
- **RA-06** — Sin motivo, o con un motivo que contenga patrones de PII conocidos, el comando responde `400` antes de abrir la transacción, como toda validación de esquema del repositorio (`ZodValidationPipe`). El `422` queda para las reglas de negocio (v1.2).
- **RA-07** — Una segunda solicitud con un reverso `PENDING` o `CONFIRMED` sobre la misma línea responde `409`. El replay de la misma solicitud es idempotente: un solo movimiento contrario y un solo recibo, también en una **carrera real**.
- **RA-08** — Los **cuatro** motivos de R7 terminan `REJECTED`, con recibo, sin reintentos y con su copy visible. **Test integrado por motivo**, contra Postgres y Redis reales (norma del CTO del 2026-10-08).
- **RA-09** — Tras un reverso `CONFIRMED`, el requisito `MATERIAL` que ese consumo satisfacía vuelve a pendiente **en el progreso y en el comando de cierre**. En la OT terminal, el resultado no cambia.
- **RA-10** — Una línea `PENDING` o `REJECTED` no ofrece la acción de reverso.
- **RA-11** — Los nuevos tipos de evento tienen las garantías de la spec hermana: cotejo con el outbox antes de firmar, firma HMAC, DLQ sin PII y **retención de 24 horas como inventario en el relay**. Se verifica cada punto de extensión de R5.
- **RA-12** — Después de un reverso `REJECTED`, el supervisor puede pedir uno nuevo sobre la misma línea. Con un reverso `PENDING` o `CONFIRMED`, no.
- **RA-13** — El motivo no aparece en el outbox, en el job, en los logs ni en la DLQ. Se verifica inspeccionando cada uno.
- **RA-14** — Una respuesta de reverso perdida se recupera con D7 (R10) y deja un solo movimiento contrario.

## 6. Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | Igual que el consumo: el esquema se deriva de `public.tenants`, y el job va firmado y cotejado con el outbox. |
| **Seguridad** | Mutación de inventario iniciada por un supervisor, con `SUPERVISE` y alcance de sede. El movimiento original se deriva de la línea persistida y nunca lo aporta el cliente. Hay auditoría durable. La procedencia la cubren el cotejo, la firma HMAC y Redis autenticado. |
| **Datos** | Migraciones 140 y 141, aditivas, con `down` bloqueado si hay datos. Un valor nuevo de enum, declarado no reversible. |
| **Escala** | Un job por reverso; el volumen es bajo porque el reverso es excepcional. |
| **Regulación** | El motivo es texto libre que nunca sale de MOD11 (R9). `actorUserId` es solo atribución. |
| **Boundaries** | Igual que el consumo. MOD11 no le dice a MOD12 cómo mover el stock. |

## 7. Bloques (detalle en el plan)

| Bloque | Qué entrega | Dueño |
| --- | --- | --- |
| **V1** | MOD11: contrato v1.7, comando, migración 140, `allowedActions`, emisión al outbox, R8 en los dos caminos, aplicación de la respuesta, R10 y auditoría (R9) | `sr-backend` |
| **V2** | MOD12: operación de reverso del ledger, enlace con el original, comodato ligado, migración 141, consumidor del nuevo tipo y los cuatro motivos de R7 | `sr-backend` |
| **V3** | Consola: acción de reverso para supervisión, diálogo con motivo, estados y marca posterior al cierre. **Incluye los ajustes de copy de U1 ratificados por `prod-ux`** (§9) | `fe-platform` + `prod-ux` |
| **V4** | RA-01 a RA-14 integrados contra Postgres y Redis reales | `sr-qa` |
| **V5** | Revisión de seguridad de V1 y V2, incluido cada punto de extensión de R5 | `sec-eng` |

## 8. Deuda que esta spec registra

1. **El evento de la anulación por error (ADR-090 §D3) lleva el `reason` en el payload del outbox** (`execution-orders.service.ts:~2037-2039` y `~3848-3853`, citado por S1.2). Es el mismo riesgo que R9 evita en el reverso. Queda para revisión propia de `sec-eng`, fuera de esta spec.

## 9. Resolución de la revisión cruzada G1 (2026-10-10)

| Origen | Consulta o condición | Resolución en v1.1 |
| --- | --- | --- |
| F1 §1 | El ledger no tiene una operación para contrarrestar un movimiento | **R6:** operación nueva y explícita; las ubicaciones se derivan del original |
| F1, consulta 1 | ¿`technicianCustodyId` sigue en el evento? ¿Se coteja? | **Sigue, y MOD12 lo coteja** con el `responsibleRefId` de la línea negativa original. Si no coincide, `REVERSAL_ORIGINAL_NOT_FOUND`. Los ids físicos los deriva MOD12 |
| F1 §1 | Enlace entre el movimiento contrario y el original | **R6:** `isReversal` y `reversedByMovementId` en la misma transacción; el recibo guarda los dos |
| F1, consulta 2 | Comodato ausente o ya cerrado | **R7:** motivo nuevo **`REVERSAL_LOAN_MISMATCH`**; nunca se confirma sin cerrar el comodato ligado al original |
| F1, cambio 3 | D7 para reversos | **R10** |
| F1 §4 | Recibo con `kind` o en tabla propia | **Con `kind`** en la tabla existente (§4) |
| F1 §5 | Puntos de extensión del pipeline | **R5**, enumerados |
| F1 §6 | Los dos caminos del evaluador | **R8**, nombrados |
| F1 §7 | El enum en la base de datos | **§4:** va en la 141 y se declara no reversible |
| S1.1 y S1.4 | Auditoría durable; original derivado y nunca aportado por el cliente | **R9** |
| S1.2, consulta | ¿Basta `safeTextField` frente a la PII? | **R9:** filtro como defensa en profundidad, minimización y guía en la UI. **No se añade detección adicional** |
| S1.3 | Las garantías no se heredan solas | **R5** y RA-11 |
| S1.4 | Abuso por reversos en cadena | Índice parcial (R3) y original derivado (R9); métrica con alerta, sin cuota dura |
| U1 | Tabla de copy cerrada | **Adoptada, con dos ajustes que ratifica `prod-ux` en V3:** (a) la frase «Esta línea no admite otra solicitud de reverso» de los tres motivos ya no es cierta con el índice parcial (R3); se propone «Cuando resuelvas la causa, puedes solicitar un nuevo reverso»; (b) falta el copy de `REVERSAL_LOAN_MISMATCH`. Propuesta: «**Qué pasó:** El comodato del equipo no está abierto como se esperaba. **Qué hacer:** Revisa el estado del comodato en el inventario antes de corregir la orden.» |

## 9b. Fe de erratas v1.2 (2026-10-10)

V4-R conservó las expectativas literales de RA-03, RA-05 y RA-06, y fallaron. Lo correcto es que fallaran mientras la spec dijera eso. AI-EM-ARCH revisó el código contra las convenciones vigentes y corrige la spec, no el código:

| Criterio | Decía | Dice | Motivo |
| --- | --- | --- | --- |
| RA-03 | Solo se fija `reversedByMovementId` | También cambia `updated_at`, que es metadata técnica | `StockMovement.updatedAt` es `@UpdateDateColumn`. Que refleje el enlace es honesto con la auditoría, y ningún campo de negocio cambia. |
| RA-05 | Supervisor fuera de sede: implícitamente `403` | `404` | `assertSupervisionScope` responde `404` en los ocho comandos de supervisión, para no revelar que la OT existe. Hacer distinto solo el reverso abriría un oráculo de existencia. |
| RA-06 | `422` | `400` | El motivo se valida en el esquema (`safeTextField` con `ZodValidationPipe`), que en todo el repositorio responde `400`. El servicio reserva el `422` para las reglas de negocio, como el gate de cierre. |

Es una errata de criterios de aceptación: no cambia ninguna decisión de producto ni el contrato. El CTO puede revertirla; en ese caso se corrige el código con un bloque propio.
