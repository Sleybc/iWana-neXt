# PROMPT DE EJECUCIÓN — MOD11 · Origen de la OT · E3: agendar una OT existente

**Versión:** 1.0
**Fecha:** 2026-10-05
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-SR-FULL** (`sr-backend`)
**Estado:** despachable. E1 y E2 están cerrados en GO (`INFORME-MOD11-ORIGEN-OT-E2-v1.0.md`).

## Vínculos de trazabilidad

- Spec: `docs/specs/2026-09-14-mod11-origen-ot-design.md` (Aprobada). Son de lectura obligatoria **§3.1, §3.4 y §3.7**, además de **CA-09, CA-10 y CA-11**.
- ADRs:
  - [ADR-091](../adrs/ADR-091-Origen-de-la-OT-Despacho-y-Agenda-Actos-Separados.md) (Aprobado), **§D4**: el conflicto se chequea sin excepción.
  - ADR-068 (Aprobado): la propagación agenda → OT.
  - ADR-090 (Aprobado): la corrección y la anulación.
  - ADR-076 (Aprobado): el eje de unicidad.
- Plan: `docs/plans/2026-09-14-mod11-origen-ot.md` v1.1
- Handoff recibido: informe E2 §7 (P1) y §8
- Contrato congelado: `packages/shared/src/contracts/operations/execution-orders.ts` **v1.4**. `ExecutionOrderScheduleView.eventId` y `window` son nulables. Cualquier campo nuevo se añade de forma aditiva, con bump a v1.5 y aviso a AI-EM-ARCH.

## 1. Objetivo

Una OT despachada sin cita (`CREATED`, `schedule_event_id IS NULL`) **recibe ventana desde MOD09**:

- MOD09 crea el `ScheduleEvent`, corre el chequeo de conflicto **sin excepción ni atajo** y **vincula** el evento a la OT existente.
- No se crea una segunda OT.
- A partir del vínculo, la propagación de ADR-068 opera exactamente igual que sobre una OT que nació por agenda.

## 2. Restricciones no negociables

- **Boundary.** MOD09 no escribe tablas de MOD11. El vínculo entra por el puerto tipado existente, o por uno nuevo declarado en `ports/`, o por un evento BullMQ. Elige uno y **justifícalo**. No hay acceso directo cruzado.
- **El conflicto corre siempre** (`schedule-conflict.service.ts`). Ninguna bandera, rama ni parámetro puede saltarlo cuando el evento nace para una OT existente. Es la razón de ser de ADR-091 §D4.
- **La unicidad no se debilita.** Vincular no pasa por la creación de OT. La guarda de origen de la migración 135 no se toca.
- **Idempotencia.** Reintentar el acto de agendar con la misma clave no crea dos eventos ni dos vínculos.
- **Una OT ya vinculada no se re-vincula en silencio.** El re-agendamiento sigue su camino actual de ADR-068.
- **Estados.** Solo se vincula una OT no terminal y no anulada. Lo demás se rechaza con un código de error de producto.
- **Sin DDL**, salvo que el vínculo exija una proyección nueva. En ese caso se aplica `postgresql`, se ejercita el `down()` y se avisa a AI-EM-ARCH antes de escribirla.
- **Fuera de alcance:**
  - la parte de datos de E4 (handlers y reconciliador ante `NULL`, CA-13; el orden `DESC NULLS FIRST`);
  - T1 de corrección;
  - cualquier pantalla de portal.

## 3. Secuencia con los demás tramos

**E3 y T1 de corrección tocan `execution-orders.service.ts`, así que no corren a la vez.** E3 va primero porque está en la ruta crítica de la Ola 2b. T1 se lanza después de que E3 cierre en GO.

## 4. Skills

| Tipo | Skills |
| --- | --- |
| **Obligatorias** | `nestjs-expert`, `bullmq-specialist`, `typescript-expert`, `testing-patterns` |
| **De apoyo** | `postgresql`, solo si el vínculo exige una proyección nueva; `architect-review`, si eliges un puerto nuevo frente a uno existente |
| **Descartadas** | `system-vocabulary-review`, porque E3 no entrega copy; `ui-ux-pro-max`, porque no hay superficie; `database-migration`, porque el DDL se agotó en E1 salvo que surja la excepción anterior |

## 5. Verificación

- **CA-09 por negación.** Agendar una OT existente en una ventana ocupada por el mismo técnico **se rechaza**. Un test que solo compruebe que el vínculo se creó no prueba nada (plan de origen §6).
- **CA-10.** Después de agendar, la cuenta de OT de ese origen sigue siendo una.
- **CA-11.** Una reprogramación y una cancelación desde la agenda se propagan a la OT vinculada igual que en una OT nacida por agenda.
- **Contra Postgres real:** OT despachada → agendada → reprogramada.

**Gates:**

- `pnpm typecheck`;
- jest de `tasks` y de `wfm` con `Cached: 0`. **`tasks` no baja de 676** (piso de E2);
- la suite completa termina sola.

## 6. Entregable y stop/go

**Entregable:** `docs/informes/INFORME-MOD11-ORIGEN-OT-E3-v1.0.md`, con el mecanismo de vínculo y su justificación, los conteos reales y la deuda por severidad.

**GO:** CA-09, CA-10 y CA-11 en verde con conteo real, el conflicto sin atajo verificado por negación, sin DDL o con DDL avisado y reversible.

**NO-GO:**
- existe cualquier vía que vincule sin correr el chequeo de conflicto;
- MOD09 escribe tablas de MOD11.
