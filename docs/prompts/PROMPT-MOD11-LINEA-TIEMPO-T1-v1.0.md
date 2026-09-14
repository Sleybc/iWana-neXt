# PROMPT DE EJECUCIÓN — MOD11 Línea de tiempo de la OT · Tramo 1

**Versión:** 1.0
**Fecha:** 2026-09-14
**Generado por:** AI-EM-ARCH
**Bloques:** B1 y B2 (`sr-backend`) · B3 (`sec-eng`) · B4 (`sr-qa`)
**Estado:** **Ejecutable tras el tramo de acta de instalación.** G1 cerrado el 2026-09-14; ambos tramos tocan el servicio de OT y se secuencian.

## Vínculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` (v1.2, **En revisión**)
- Spec: `docs/specs/2026-09-14-mod11-linea-tiempo-ot-design.md` v1.0 (Aprobado)
- ADR: [ADR-089](../adrs/ADR-089-Linea-de-Tiempo-de-la-OT-de-Ejecucion.md)
- Plan: `docs/plans/2026-09-14-mod11-linea-tiempo-ot.md` v1.0

---

## 1. Objetivo del tramo

Que la duración de una OT signifique algo: que se pueda decir cuánto se trabajó y cuánto se esperó, en lugar de solo cuánto tiempo pasó.

**Lo que sí entra:** B1 a B4 de §3.
**Lo que no entra:**

- **`EN_ROUTE`.** Es T2 y depende de una decisión de producto aún no tomada (spec §4.4): un paso que el técnico no entiende se salta, y un estado que se salta produce datos peores que su ausencia.
- **Superficie de consulta, informes o métricas.** Es T3, y su publicación exige el dictamen de B3 aprobado.
- **Cualquier uso para control de jornada laboral.** ADR-089 §D5 lo prohíbe en esta fase.
- **Reconstruir historial retroactivo** de OT anteriores (spec §4.5).

## 2. Contexto que hay que entender antes de tocar nada

**El inicio ya se registra**: `start()` fija `order.startedAt ?? new Date()` y emite `ExecutionOrderStartedV1`. No hay que crear ese dato ni sustituirlo.

Lo que falta es el resto: **`block()` cambia el estado sin registrar cuándo**, no existe entidad de transiciones, y por eso `closedAt − startedAt` cuenta como trabajo el tiempo que la orden estuvo bloqueada.

## 3. Bloques

### B1 — Modelo y registro (`sr-backend`)

1. Entidad de asientos de transición con **origen, destino, instante, actor y motivo cuando lo haya**, en ámbito de tenant. Modelo a replicar: `StatusChange` del expediente (`apps/api/src/modules/crm/expedientes/entities/status-change.entity.ts`).
2. Contrato tipado en **archivo hermano** dentro de `packages/shared/src/contracts/operations/`. **No modifiques `execution-orders.ts` v1.1**: la línea de tiempo es un recurso propio, no un campo del detalle.
3. Migración con índice por orden e instante, aplicada por schema de tenant con `CREATE INDEX CONCURRENTLY` bajo el runner no transaccional de ADR-066. Reversible: `down()` ejercitado, sin `throw` incondicional.
4. Registrar el asiento en **todas** las transiciones, dentro de la misma transacción que persiste el cambio de estado: inicio, **bloqueo**, **reanudación**, cierre y cancelación.

**El punto donde está el valor del tramo es el bloqueo.** Si solo instrumentas `start()` y `close()`, el tramo no resuelve nada: esos dos instantes ya existen. CA-02 exige además que **varios ciclos** de bloqueo en la misma OT queden todos registrados — es el caso que descarta la alternativa de campos sueltos.

5. `startedAt` y `closedAt` **conservan su comportamiento actual**. Son proyección conveniente del mismo hecho y tienen consumidores vivos, incluido el `completion` que el portal consume.
6. **No persistas ninguna duración calculada** — ni «tiempo efectivo», ni «horas trabajadas». ADR-089 §D2: el cómputo es derivado, y persistirlo congelaría la política de análisis en el dato.

### B2 — Corrección aditiva (`sr-backend`)

7. Un asiento **nunca se edita ni se borra**. Una corrección es un asiento nuevo que referencia al corregido, con su actor y su motivo; el original permanece visible.
8. Es lo que hace viable la fase de jornada laboral sin rehacer el modelo. Un registro editable no sirve como soporte de nada con efectos laborales.

### B3 — Finalidad y retención (`sec-eng`)

9. **Trátalo como dato personal del trabajador, no como dato operativo.** La línea de tiempo describe cuándo y cuánto trabajó una persona identificable: Ley 1581 aplica igual que con un suscriptor.
10. Entrega tabla de **finalidad declarada por campo** (ADR-067) y **política de retención** con plazo.
11. Eres **auditor**: dictaminas, no implementas. Si tu dictamen exige código, dilo y se abrirá bloque para el dueño del área.
12. **No afirmes requisitos regulatorios que no puedas citar.** Lo no confirmado se marca «requiere verificación con fuente oficial».

### B4 — Regresión (`sr-qa`)

13. Los ocho criterios de la spec §8, con foco en CA-02 (ciclos múltiples de bloqueo) y CA-05 (no regresión de `startedAt`/`closedAt`).
14. Conteo real: jest directo, `--ci --runInBand`, sin turbo y sin `--passWithNoTests`.

## 4. Restricciones no negociables

- **Boundaries intactos.** MOD11 registra sus propias transiciones; **no leas la tabla de la agenda de MOD09** para calcular tiempos (ADR-089 §A3).
- **Sin PII real** en migraciones, fixtures ni tests.
- **Sin ampliar `@Roles` ni `@Permissions`.** T1 no publica superficie de consulta.
- **Tenant isolation sin cambios**: todo dentro de `runInTenantSchema`.
- Si el registro del asiento no cabe en la transacción del cambio de estado sin reestructurar el comando, **detente y emite `[BLOQUEO]`**: un asiento fuera de la transacción puede divergir del estado real, y eso vacía de valor el registro.

## 5. Entregables

- Entidad, contrato hermano y migración reversible con su índice.
- Registro en todas las transiciones, incluidos los ciclos de bloqueo.
- Corrección aditiva.
- Dictamen de finalidad y política de retención.
- Suite de regresión en verde con conteo real.
- Informe de fase en `docs/informes/` con deuda por severidad.

## 6. Stop/go

**GO si y solo si:**

- Toda transición deja asiento con origen, destino, instante y actor (CA-01).
- **Varios ciclos** de bloqueo en la misma OT quedan todos registrados (CA-02).
- Tiempo bloqueado y total sin descontar son **ambos** derivables (CA-03).
- Una corrección no borra nada y el original sigue visible (CA-04).
- `startedAt` y `closedAt` intactos, sin romper consumidores (CA-05).
- Una OT sin línea de tiempo se distingue de una con historial vacío (CA-06).
- La política de retención está declarada y aprobada (CA-07).

**NO-GO si:** se persistió alguna duración calculada, o el registro solo cubre `start()` y `close()`. En ambos casos el tramo no entrega lo que motivó el trabajo.
