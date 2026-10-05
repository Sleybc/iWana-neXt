# PROMPT DE EJECUCIÓN — MOD11 · Origen de la OT · E3: remediación de la auditoría

**Versión:** 1.0
**Fecha:** 2026-10-05
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-SR-FULL** (`sr-backend`)
**Origen:** auditoría de AI-EM-ARCH sobre `6ca86c30` y sobre `INFORME-MOD11-ORIGEN-OT-E3-v1.0.md`

## Vínculos de trazabilidad

- Encargo original: `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E3-v1.0.md`
- [ADR-090](../adrs/ADR-090-Correccion-de-OT-Dueno-del-Dato-y-Anulacion-por-Error.md) (Aprobado), **§D4**: *una OT en ejecución no se corrige en silencio*. Lee también la enmienda de alcance de §D1.
- Spec de corrección: `docs/specs/2026-09-14-mod11-correccion-ot-design.md`, §4 y CA-07
- Contrato congelado: `packages/shared/src/contracts/operations/execution-orders.ts` v1.4. Sin cambios.

## 1. Hallazgo

Al implementar CA-11, E3 añadió `rescheduleFromSchedulingWithManager` y lo invoca desde `ScheduleEventsService.reschedule()` para **cualquier** evento con `executionOrderId`, tanto el de una OT despachada como el de una nacida por agenda.

La única guarda es `assertMutable`, que solo rechaza estados terminales (`execution-orders.service.ts:3515-3528`). En consecuencia, **una OT `IN_PROGRESS` o `BLOCKED` recibe la nueva ventana en silencio**, con el técnico trabajando. Eso es exactamente lo que ADR-090 §D4 prohíbe.

`linkFromSchedulingWithManager` arrastra el mismo hueco: vincula ventana a una OT ya iniciada.

**La causa está en el encargo, no en la ejecución.** El §5 del encargo E3 afirmaba que «una reprogramación […] se propaga a la OT vinculada igual que en una OT nacida por agenda». Esa afirmación era falsa: según la spec de corrección §2, la reprogramación **no se propagaba** a ninguna OT, y era trabajo de T1. El agente lo implementó para cumplir el criterio tal como estaba escrito.

**Se conserva el mecanismo.** El puerto síncrono dentro de la misma transacción tiene precedente en `cancelFromSchedulingWithManager` y da atomicidad al chequeo de conflicto junto con la propagación. Lo que falta es la guarda.

## 2. Alcance exacto

1. **Guarda D4 en la reprogramación.** `rescheduleFromSchedulingWithManager` rechaza con `ConflictException`, código `EXECUTION_ORDER_IN_EXECUTION`, cuando la OT está en `IN_PROGRESS` o `BLOCKED`. Como la propagación ocurre dentro de la transacción de WFM, **el rollback revierte también el cambio del evento**: la agenda no queda desincronizada y el rechazo llega a quien reprograma (CA-07 de la spec de corrección). El mensaje es de producto y dice qué hacer: coordinar con el técnico antes de mover una orden en curso.
2. **La misma guarda al vincular.** `linkFromSchedulingWithManager` solo vincula una OT en estado previo al inicio (`CREATED`, `ASSIGNED`, `EN_ROUTE`). Ante una OT iniciada responde con el mismo código.
3. **Tests por negación**, unitarios y en la integración contra Postgres:
   - reprogramar el evento de una OT `IN_PROGRESS` **se rechaza**, y tanto el evento como la OT conservan su ventana anterior;
   - lo mismo para `BLOCKED`;
   - CA-11 sigue en verde para una OT en estado previo al inicio.
4. **Informe v1.1** que supera al v1.0, con dos cosas declaradas:
   - el cambio de comportamiento para las OT **nacidas por agenda**: antes no se propagaba nada y ahora se propaga la ventana antes del inicio;
   - qué parte de T1 quedó absorbida (la propagación de la ventana) y cuál sigue pendiente (sitio, recurso, handlers no-op del worker, `VisitWindowChangedV1`, reconciliador).

**Fuera de alcance:**

- sitio y técnico;
- los handlers del worker;
- la prueba de carrera (P2) y el índice único (P3), que siguen como deuda registrada;
- el portal.

## 3. Skills

| Tipo | Skills |
| --- | --- |
| **Obligatorias** | `nestjs-expert`, `testing-patterns` |
| **De apoyo** | `postgresql`, si la integración necesita fixture de estados |
| **Descartadas** | `bullmq-specialist`, porque no hay cola; `database-migration`, porque no hay DDL; `system-vocabulary-review`, porque el único texto nuevo es un mensaje de error que sigue el patrón vigente |

## 4. Gates y stop/go

**Gates:**

- `pnpm typecheck`;
- jest de `tasks` y de `wfm` con `Cached: 0`. **`tasks` ≥ 706 y `wfm` ≥ 242**, más los nuevos casos;
- la integración contra Postgres, con su número de tests.

**GO:** la reprogramación y el vínculo se rechazan sobre una OT iniciada, probado por negación, con rollback verificado del evento, y CA-09, CA-10 y CA-11 siguen en verde.

**NO-GO:**

- el rechazo deja el evento movido y la OT intacta, porque falló el rollback;
- se toca algo fuera de los dos métodos y sus tests.
