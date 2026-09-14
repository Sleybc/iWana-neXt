# Diseño — MOD11: retención de la línea de tiempo de la OT

**Versión:** 1.0
**Estado:** Propuesto
**Pendiente:** aprobación del CTO. No requiere ADR: la decisión de retención ya está tomada en [ADR-089](../adrs/ADR-089-Linea-de-Tiempo-de-la-OT-de-Ejecucion.md) (Aprobado) §Impacto y en el dictamen B3; esta spec decide **cómo** se ejecuta, no si se hace.
**Fecha:** 2026-09-14
**Modo activo:** Architect
**Autor:** AI-EM-ARCH

**Dictamen que ejecuta:** `docs/informes/INFORME-MOD11-B3-FINALIDAD-RETENCION-v1.0.md` — exigencia 3, deuda Media con SLA
**Spec hermana:** `2026-09-14-mod11-linea-tiempo-ot-design.md` v1.0 (Aprobada) — **no se supera**: esta cumple su CA-07 en la parte que el dictamen dejó como deuda
**Plan:** `docs/plans/2026-09-14-mod11-retencion-linea-tiempo.md`

---

## 1. Objetivo

Que el dato personal de la línea de tiempo deje de acumularse indefinidamente, y que T3 —las métricas de productividad— deje de estar bloqueado por su ausencia.

## 2. Por qué ahora

El dictamen de `sec-eng` aprobó CA-07 con dos partes: la **política** (finalidad por campo y plazo) quedó entregada, y la **ejecución** quedó como exigencia 3, *«deuda Media, SLA próximo ciclo; no bloquea T1, sí cualquier T3»*.

Es decir: **este tramo es el camino crítico hacia las métricas**, no un trabajo de higiene aplazable. Y hacerlo ahora evita que los 24 meses empiecen a correr sobre datos que nadie puede suprimir.

## 3. Lo que ya existe — y por qué esto es una extensión, no una construcción

El repo **ya tiene purga de retención por tenant**, y conviene no reinventarla:

| Pieza | Dónde | Qué hace |
| --- | --- | --- |
| `purge_execution_order_retention_batch(batch_size)` | Función SQL creada en la migración `095_create_execution_order_evidence_upload_intents.ts` | Purga por lotes dentro del schema del tenant |
| `ExecutionOrderTombstoneProcessor` | `apps/worker/src/processors/execution-order-tombstone.processor.ts` | La invoca **por cada tenant ACTIVE**, en cron diario `0 4 * * *` con `jobId` estable |

Hoy esa función cubre registros de idempotencia, eventos de outbox e intents de evidencia: **infraestructura**, con corte por antigüedad simple (`created_at <= NOW() - INTERVAL`).

El trabajo consiste en **añadirle la tabla de transiciones**, no en crear un mecanismo nuevo. El procesador, el cron, el recorrido por tenants y el troceado por lotes ya están resueltos y probados.

## 4. Diseño

### 4.1 Anonimizar, no borrar

**Decisión.** Al vencer la retención, los asientos **no se eliminan**: se les retira el vínculo personal de forma irreversible, conservando la forma temporal.

El dictamen admite ambas vías —*«borrado o anonimización irreversible»*—. Se elige anonimizar porque el propósito aprobado de la fase 1 es la **productividad**, y ese valor vive en `from_status`, `to_status` y `changed_at`, no en quién ejecutó. Borrar la fila destruiría las dos cosas; anonimizar elimina solo la que la retención obliga a eliminar.

Consecuencia: una OT de hace tres años seguirá diciendo cuánto duró y cuánto estuvo bloqueada, pero ya no dirá quién la trabajó — que es exactamente lo que la política pretende.

**Campos que pierden el vínculo:** el actor del asiento y el motivo cuando sea identificable. **Campos que se conservan:** estado de origen, estado de destino e instante.

### 4.2 El plazo se cuenta desde el cierre, y no corre en OT abiertas

Es la parte que distingue esta purga de las existentes: **no es un corte por antigüedad de la fila**, sino una condición correlacionada con el estado de la OT padre.

- Vence a los **24 meses** del cierre o cancelación de la orden: el último asiento de cierre o cancelación, y en su defecto `closedAt`.
- **Una OT abierta nunca vence**, por antigua que sea. Prohibido inventar cierres para que el plazo corra (spec hermana §4.5).
- Una corrección aditiva **no reinicia** el plazo de su OT.
- Las OT huérfanas —abiertas indefinidamente— se revisan una vez al año y se reportan a AI-EM-ARCH. No se cierran solas.

### 4.3 El detalle que hay que resolver antes de codificar

`changed_by` es `uuid` **no nulo** en la entidad. Anonimizar exige decidir cómo se representa la ausencia: columna anulable o valor centinela. No es cosmético — de esa elección depende que las consultas de T3 puedan distinguir *«no lo sabemos porque venció»* de *«no lo sabemos porque nunca se registró»*, y confundir ambas cosas falsearía cualquier métrica por técnico.

## 5. Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | Purga por schema, dentro del recorrido de tenants ACTIVE que el procesador ya hace. Sin cambio de alcance. |
| **Seguridad y PII** | Es el propósito del tramo: cumple la exigencia 3 del dictamen. La anonimización debe ser **irreversible**; un campo que permita reconstruir el vínculo no cumple. |
| **Escala** | La función ya trocea por lotes. La condición correlacionada con la OT padre exige que el índice lo soporte: si obliga a recorrer la tabla entera cada noche, el tramo habrá cambiado un problema por otro. |
| **Regulación** | El plazo es **técnico operativo, no jurídico**. El dictamen lo marca explícitamente: la normativa laboral, la prescripción de acciones y los derechos ARCO **requieren verificación con fuente oficial**, y son de la fase 2 con CTO y legal. |
| **Boundaries** | Ninguno cruzado. |

## 6. Criterios de aceptación

- **CA-01** — Un asiento de una OT cerrada hace más de 24 meses queda anonimizado: sin actor ni motivo identificable.
- **CA-02** — Sus `from_status`, `to_status` y `changed_at` **se conservan**: la forma temporal sobrevive.
- **CA-03** — Un asiento de una OT **abierta** no se toca, por antigua que sea.
- **CA-04** — Un asiento de una OT cerrada hace menos de 24 meses no se toca.
- **CA-05** — La anonimización es **irreversible**: no queda ningún campo que permita reconstruir el actor.
- **CA-06** — Una corrección aditiva no reinicia el plazo de su OT.
- **CA-07** — Es distinguible un asiento anonimizado por vencimiento de uno que nunca tuvo el dato (§4.3).
- **CA-08** — La purga corre dentro del procesador existente, por tenant y por lotes; no aparece cron nuevo.
- **CA-09** — Los logs no vuelcan `reason` en claro ni el contenido del asiento: solo identificadores operativos y conteos.
- **CA-10** — Migración reversible con `down()` ejercitado.

## 7. Lo que este tramo NO hace

- **No autoriza T3.** El dictamen le pone tres condiciones más: mapa campo × rol, registro de acceso masivo en `audit_logs` y cota de paginación, más la distinción de poblaciones sin historial. Este tramo cierra solo la cuarta.
- **No fija el plazo jurídico** (§5).
- **No purga otras tablas de MOD11** ni cambia las reglas de las que la función ya cubre.

## 8. Deuda registrada

1. **Revisión anual de OT huérfanas** (§4.2): el reporte a AI-EM-ARCH no se automatiza en este tramo; queda como procedimiento.
2. **Las tres condiciones restantes de T3**, que siguen abiertas tras este tramo.
