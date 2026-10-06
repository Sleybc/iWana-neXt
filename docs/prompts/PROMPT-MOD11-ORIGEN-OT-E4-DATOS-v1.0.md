# PROMPT DE EJECUCIÓN — MOD11 · Origen de la OT · E4, parte de datos

**Versión:** 1.0
**Fecha:** 2026-10-05
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-SR-FULL** (`sr-backend`)
**Estado:** despachable. E3 está en GO (`INFORME-MOD11-ORIGEN-OT-E3-v1.1.md`).

## Vínculos de trazabilidad

- Spec: `docs/specs/2026-09-14-mod11-origen-ot-design.md` (Aprobada), §3.5, §3.7 y **CA-12 (orden) y CA-13**
- [ADR-091](../adrs/ADR-091-Origen-de-la-OT-Despacho-y-Agenda-Actos-Separados.md) (Aprobado), §D5
- Plan: `docs/plans/2026-09-14-mod11-origen-ot.md` v1.1 (E4 dividido en tres partes; esta es la de datos)
- Decisión de orden: encargo R0, adenda A2 punto 2 (`docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2-R0-PROD-UX-v1.0.md`)
- Contrato congelado: `packages/shared/src/contracts/operations/execution-orders.ts` v1.4. Sin cambios.

## 1. Alcance exacto

1. **Orden por defecto explícito.** En `list()` (`execution-orders.service.ts`, alrededor de la línea 628) el orden pasa a ser `planned_window_start_at DESC NULLS FIRST, id DESC`. Hay que **demostrar con `EXPLAIN` contra Postgres real** que el índice `idx_execution_orders_tenant_window_start` (migración 130) sigue sirviendo el orden. Si no lo sirve, emite `[BLOQUEO]` antes de proponer DDL. Actualiza el docstring de `list()`, que hoy declara `DESC` sin la cláusula de nulos.
2. **CA-13: ningún handler ni el reconciliador fallan en silencio ante `schedule_event_id IS NULL`.** Inventaría todos los lectores:
   - los processors de `apps/worker/src/processors/execution-order-*.ts`;
   - `apps/worker/src/services/execution-order-relay.service.ts`;
   - `tasks.service.ts`;
   - toda rama de `execution-orders.service.ts` que asuma un evento.

   Cada uno **declara** su comportamiento ante el nulo, en código y con test: se omite de forma explícita, o se registra. Nunca un `TypeError` ni un no-op silencioso.
3. **Paginación estable:** un test con OT sin ventana mezcladas con OT con ventana demuestra que no hay duplicados ni huecos entre páginas.

**Fuera de alcance:**

- la propagación de sitio y recurso, los handlers no-op del worker y `VisitWindowChangedV1`: son de T1, que se lanza **después** de este bloque porque ambos tocan el worker;
- el portal;
- la deuda P2 y P3 de E3.

## 2. Skills

| Tipo | Skills |
| --- | --- |
| **Obligatorias** | `nestjs-expert`, `postgresql`, `bullmq-specialist`, `testing-patterns` |
| **De apoyo** | `observability-engineer`, si registrar un nulo exige métrica o log estructurado |
| **Descartadas** | `database-migration`, porque se espera cero DDL y si hiciera falta se emite `[BLOQUEO]`; `system-vocabulary-review`, porque no hay copy |

## 3. Gates y stop/go

**Gates:**

- `pnpm typecheck`;
- jest de `tasks` (≥ 712), de `wfm` (≥ 242) y del worker, con `Cached: 0`;
- `EXPLAIN` contra Postgres real adjunto al informe.

**GO:**

- el orden `NULLS FIRST` está servido por el índice existente;
- el inventario de CA-13 está completo, con el comportamiento de cada lector probado;
- la paginación es estable.

**NO-GO:**

- hace falta DDL no autorizada;
- queda algún lector sin declarar.

**Entrega:** el informe `docs/informes/INFORME-MOD11-ORIGEN-OT-E4-DATOS-v1.0.md`.
