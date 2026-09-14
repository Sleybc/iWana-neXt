# PROMPT DE EJECUCIÓN — MOD11: retención de la línea de tiempo

**Versión:** 1.0
**Fecha:** 2026-09-14
**Generado por:** AI-EM-ARCH
**Bloques:** B1 (`sr-backend`) · B2 (`sr-qa`)
**Estado:** Armado. G1 pendiente de la aprobación del CTO.

## Vínculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` (v1.2, **En revisión**)
- Spec: `docs/specs/2026-09-14-mod11-retencion-linea-tiempo-design.md` v1.0
- Dictamen que cumple: `docs/informes/INFORME-MOD11-B3-FINALIDAD-RETENCION-v1.0.md`, exigencia 3
- Plan: `docs/plans/2026-09-14-mod11-retencion-linea-tiempo.md` v1.0
- ADR marco: [ADR-089](../adrs/ADR-089-Linea-de-Tiempo-de-la-OT-de-Ejecucion.md) (Aprobado)

---

## 1. Objetivo

Que el dato personal de la línea de tiempo deje de acumularse indefinidamente, y que T3 deje de estar bloqueado por su ausencia.

**Lo que no entra:**

- Las **otras tres condiciones de T3**: mapa campo × rol, registro de acceso masivo y cota de paginación. Este tramo cierra solo la cuarta.
- La superficie de consulta y las métricas. Siguen siendo T3.
- Cambiar las reglas de las tablas que la purga ya cubre.
- Tocar `@iwana/shared`.

## 2. Lo que ya existe — empieza leyéndolo

**No construyes una purga: extiendes la que hay.**

- `purge_execution_order_retention_batch(batch_size)` — función SQL creada en la migración `095_create_execution_order_evidence_upload_intents.ts`, que purga por lotes dentro del schema del tenant.
- `ExecutionOrderTombstoneProcessor` (`apps/worker/src/processors/execution-order-tombstone.processor.ts`) — la invoca por cada tenant ACTIVE en cron diario `0 4 * * *` con `jobId` estable.

El recorrido por tenants, el troceado y la programación ya están resueltos y probados. **Si acabas creando un cron nuevo, te has salido del encargo.**

Hoy esa función corta por antigüedad simple (`created_at <= NOW() - INTERVAL`). La regla que añades **no es así**, y ahí está toda la dificultad del bloque.

## 3. B1 — Purga y migración (`sr-backend`)

1. Añadir la tabla de transiciones a la función existente, con la regla del dictamen: **24 meses desde el cierre o cancelación de la OT** — el último asiento de cierre o cancelación, y en su defecto `closedAt` de la orden.

2. **Anonimizar, no borrar.** Al vencer, el asiento pierde el actor y el motivo identificable, y **conserva `from_status`, `to_status` y `changed_at`**. El propósito aprobado de la fase 1 es la productividad, y ese valor vive en la forma temporal, no en quién ejecutó: borrar la fila destruiría las dos cosas cuando la política solo obliga a eliminar una.

3. **Una OT abierta no vence nunca**, por antigua que sea. Es la diferencia de fondo con las purgas existentes, y el error más probable si copias su patrón: ellas miran la antigüedad de la fila; esta mira **el estado de la orden padre**. Prohibido inventar cierres para que el plazo corra.

4. Una corrección aditiva **no reinicia** el plazo de su OT.

5. **Resuelve antes de codificar cómo se representa la ausencia.** `changed_by` es `uuid` no nulo: anonimizar exige columna anulable o valor centinela. No es cosmético — de esa elección depende que T3 pueda distinguir *«no lo sabemos porque venció»* de *«no lo sabemos porque nunca se registró»*, y confundirlas falsearía cualquier métrica por técnico. Declara la elección y su razón en el informe.

6. **La anonimización debe ser irreversible.** Si queda algún campo que permita reconstruir el actor, no cumple el dictamen y el bloque se devuelve.

7. Índice que soporte la condición correlacionada con la OT padre. Si la purga obliga a recorrer la tabla entera cada noche, habrás cambiado un problema por otro.

8. Migración reversible: `down()` ejercitado, sin `throw` incondicional.

9. **Logs sin PII**: identificadores operativos y conteos. Nunca `reason` en claro ni volcado del asiento.

## 4. B2 — Verificación (`sr-qa`)

10. Los diez criterios de la spec §6, con foco en los que distinguen este tramo de una purga por antigüedad:
    - **CA-02** — la forma temporal sobrevive. Una purga que borre la fila falla aquí aunque cumpla CA-01.
    - **CA-03** — una OT **abierta** de hace tres años no se toca.
    - **CA-05** — irreversibilidad.
    - **CA-07** — anonimizado por vencimiento se distingue de nunca registrado.
11. La suite de `tasks` no baja de **617**.
12. Conteo real: jest directo, `--ci --runInBand`, sin turbo y sin `--passWithNoTests`.

## 5. Restricciones no negociables

- **Sin contrato nuevo.** No tocas `@iwana/shared`; si crees necesitarlo, `[BLOQUEO]`.
- **Sin cron nuevo**: corre dentro del procesador existente.
- **Purga por schema**, dentro del recorrido de tenants ACTIVE que ya hace el procesador.
- **Sin PII real** en migraciones, fixtures, tests ni logs.
- Si apartarte del dictamen parece necesario —por ejemplo, conservar el actor «por si acaso»—, **detente y emite `[BLOQUEO]`**: eso es re-dictamen de `sec-eng`, no una decisión del ejecutor.

## 6. Entregables

- Función de purga extendida y migración reversible con su índice.
- Decisión sobre la representación de la ausencia, declarada con su razón.
- Suite de verificación en verde con conteo real.
- Informe de fase en `docs/informes/` con deuda por severidad.

## 7. Stop/go

**GO si y solo si:**

- Un asiento de OT cerrada hace más de 24 meses queda sin actor ni motivo identificable (CA-01) y **conserva** origen, destino e instante (CA-02).
- Una OT abierta no se toca, por antigua que sea (CA-03).
- Una OT cerrada hace menos de 24 meses no se toca (CA-04).
- La anonimización es irreversible (CA-05).
- Anonimizado por vencimiento se distingue de nunca registrado (CA-07).
- No aparece cron nuevo (CA-08) y la migración es reversible (CA-10).

**NO-GO si:** se implementó como borrado de filas, o la regla acabó siendo un corte por antigüedad de la fila en vez de por el estado de la OT padre. En ambos casos el tramo no cumple el dictamen y rompe lo que T3 necesita.
