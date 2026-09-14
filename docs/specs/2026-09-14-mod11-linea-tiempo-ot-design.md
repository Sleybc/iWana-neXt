# Diseño — MOD11: línea de tiempo de la OT de ejecución

**Versión:** 1.0
**Estado:** **Aprobado por el CTO (2026-09-14)** — contratos de §7 congelados desde esta aprobación.
**Fecha:** 2026-09-14
**Modo activo:** Mixto (Product Architect + Architect)
**Autor:** AI-EM-ARCH
**Origen:** el CTO plantea la necesidad de determinar el comienzo de la ejecución de la OT, para control horario y estadísticas de productividad.

**ADR que desarrolla:** [ADR-089](../adrs/ADR-089-Linea-de-Tiempo-de-la-OT-de-Ejecucion.md)
**ADRs relacionados:** ADR-046 (Aprobado), ADR-066 (Aprobado), ADR-067 (Aprobado), ADR-068 (Aprobado)
**Specs hermanas:** `2026-09-14-mod11-consola-ot-requisito-como-eje-design.md` v1.1 (Aprobada) y `2026-09-14-mod11-acta-instalacion-design.md` v1.0 (Propuesto) — **ninguna se supera**: aquellas definen *qué* exige el cierre; esta, *cuándo* ocurrió cada cosa.
**Plan de orquestación:** `docs/plans/2026-09-14-mod11-linea-tiempo-ot.md`

---

## 1. Objetivo

Que la duración de una OT signifique algo: que se pueda decir cuánto se trabajó, cuánto se esperó y cuánto se viajó, en lugar de solo cuánto tiempo pasó.

## 2. Problema

**El inicio ya se registra.** `start()` fija `order.startedAt ?? new Date()` y emite `ExecutionOrderStartedV1` con ese instante; existen `closedAt` y la ventana planificada. Comparar planificado contra real es posible hoy.

**Lo que falta es contexto**, y sin él el dato induce a error:

| Hueco | Evidencia | Consecuencia |
| --- | --- | --- |
| Sin historial de transiciones | No existe entidad de cambios de estado en `packages/database/src/entities/`; `block()` cambia estado, versión y `updatedByUserId`, **sin timestamp** | `closedAt − startedAt` es tiempo **transcurrido**: tres horas esperando material cuentan como trabajo |
| `EN_ROUTE` inalcanzable | Ningún endpoint lo asigna; solo aparece en los `switch` que lo tratan como estado de entrada. MOD09 sí lo tiene con endpoint de transición | Desde la OT no se separa viaje de ejecución |
| Inicio autodeclarado e irreversible | `?? new Date()` no permite corregir un inicio pulsado por error | Sin corrección auditada no hay base para nada con efectos laborales |
| Sin pausas | No existe el concepto | Un salto a otra orden es invisible |
| El outbox no es historial | Lleva `occurred_at`, pero es infraestructura de entrega con proceso de *tombstone* | No es fuente estable para métricas |

## 3. Decisiones del CTO (2026-09-14)

| # | Decisión | Consecuencia de diseño |
| --- | --- | --- |
| **D1** | **Ambos usos, por fases**: productividad primero, control de jornada después | El modelo debe nacer **inmutable y auditable**, aunque la fase 1 no lo explote: convertirlo después obliga a descartar lo acumulado |
| **D2** | Desplazamiento **sí, medido aparte** | `EN_ROUTE` deja de estar muerto en la OT (ADR-089 §D4) |
| **D3** | Bloqueos: **registrar y decidir al analizar** | No se persiste ninguna duración calculada; el cómputo es derivado (ADR-089 §D2) |

## 4. Diseño

### 4.1 Un asiento por transición

Cada cambio de estado de la OT deja un asiento con **estado de origen, estado de destino, instante, actor y motivo cuando lo haya**. Modelo a replicar: `StatusChange` del expediente (`apps/api/src/modules/crm/expedientes/entities/status-change.entity.ts`), adaptado al ámbito de la OT.

De esa línea de tiempo se derivan **todos** los tiempos. `startedAt` y `closedAt` **se conservan** como proyección conveniente: retirarlos rompería consumidores vivos, incluido el `completion` que el portal ya consume.

### 4.2 Qué se deriva y qué no se persiste

| Magnitud | Cómo se obtiene |
| --- | --- |
| Inicio de ejecución | Primer asiento con destino `IN_PROGRESS` |
| Desplazamiento | Tramo `EN_ROUTE` → `IN_PROGRESS` |
| Tiempo bloqueado | Suma de los tramos con origen `BLOCKED`, que pueden ser **varios** |
| Tiempo en sitio | Total entre inicio y cierre, menos los tramos bloqueados |
| Desviación sobre lo planificado | Contra `plannedWindowStartAt/EndAt`, que ya existen |

**Ninguna de estas magnitudes se persiste.** Es la consecuencia de D3: la política de qué cuenta como productivo vive en el consumidor, no en el dato. Una caché de agregados es legítima; una duración almacenada como verdad, no.

### 4.3 Corrección aditiva

Un asiento no se edita ni se borra. Una corrección es **un asiento nuevo** que referencia al corregido, con su actor y su motivo, y el original permanece visible.

Es lo que hace viable la fase 2 sin rehacer el modelo, y lo que distingue este registro de un simple log.

### 4.4 `EN_ROUTE`: alcanzable, pero con una condición

Hacerlo alcanzable es el trabajo menor; el riesgo es de adopción. **Un paso que el técnico no entiende se salta, y un estado que se salta produce datos peores que su ausencia**: mediciones sesgadas hacia los técnicos que sí lo marcan.

Por eso su habilitación exige decidir, antes de exigirlo, **qué gana el técnico al marcarlo**. Si la respuesta es «nada», no se exige: se deja opcional y el desplazamiento se estima desde la agenda, declarando esa limitación. Esa decisión es de AI-PROD-UX y condiciona el valor de todo el tramo.

### 4.5 Población sin historial

Las OT anteriores al cambio tendrán `startedAt` pero **ninguna línea de tiempo**. No se reconstruye retroactivamente: inventar transiciones que nadie registró es peor que no tenerlas.

Toda superficie de consulta debe **distinguir ambas poblaciones o declarar su fecha de inicio**. Un informe que mezcle ambas sin decirlo produce comparaciones falsas entre períodos.

## 5. Lo que esta spec declara pendiente

- **La superficie de consulta y los informes no se diseñan aquí.** Esta spec produce el dato; explotarlo es trabajo posterior, y su publicación exige la revisión de seguridad de §6.
- **El control de jornada laboral no se habilita** (ADR-089 §D5): requiere verificación regulatoria con fuente oficial.
- **Las pausas no se modelan en la fase 1.** Si se necesitan, son transiciones más sobre el mismo modelo, sin rediseño.

## 6. Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | Tabla por schema; índice por orden e instante aplicado por tenant con `CREATE INDEX CONCURRENTLY` bajo ADR-066. |
| **Seguridad y PII** | **El punto delicado.** La línea de tiempo describe cuándo y cuánto trabajó una persona identificable: es **dato personal del trabajador**, no solo dato operativo, y Ley 1581 aplica igual que con un suscriptor. Exige finalidad declarada por campo (ADR-067), política de retención y **revisión de AI-SEC-ENG antes de publicar cualquier superficie de consulta**. |
| **Escala** | Una fila por transición y por OT: a la escala objetivo es la tabla que más crece de MOD11. Las métricas se calculan por agregación, nunca recorriendo la línea de tiempo por fila en una pantalla. |
| **Regulación** | MinTrabajo para la fase 2 — **requiere verificación con fuente oficial**. |
| **Boundaries** | Ninguno cruzado. MOD11 registra sus transiciones; MOD09 conserva las suyas; la sincronización es la de ADR-068. |

## 7. Contratos congelados por esta spec

| Contrato | Artefacto | Dueño |
| --- | --- | --- |
| Asiento de transición | Entidad y contrato tipado en `@iwana/shared`, archivo hermano del contrato congelado de OT | AI-SR-FULL |

El contrato de OT (hoy **v1.1**) **no se modifica**: la línea de tiempo es un recurso propio, no un campo del detalle. Si más adelante el detalle expusiera un resumen, sería ampliación aditiva por el procedimiento habitual.

## 8. Criterios de aceptación

- **CA-01** — Toda transición de estado de la OT deja un asiento con origen, destino, instante y actor.
- **CA-02** — Un bloqueo y su reanudación quedan registrados; **varios ciclos** de bloqueo en la misma OT se registran todos.
- **CA-03** — El tiempo bloqueado es derivable, y el total sin descontar sigue siendo obtenible: ambas lecturas conviven (D3).
- **CA-04** — Ningún asiento se edita ni se borra; una corrección produce un asiento nuevo que referencia al original, y el original sigue visible.
- **CA-05** — `startedAt` y `closedAt` conservan su comportamiento actual: ningún consumidor vivo se rompe.
- **CA-06** — Una OT sin línea de tiempo (anterior al cambio) se distingue de una con historial vacío.
- **CA-07** — La política de retención del dato personal está declarada y aprobada por AI-SEC-ENG.
- **CA-08** — `EN_ROUTE` solo se exige al técnico si la decisión de §4.4 concluyó que aporta valor; si no, queda opcional y la limitación se declara.

## 9. Fases

| Tramo | Alcance | Desbloqueado por |
| --- | --- | --- |
| **T1** | Modelo de asientos, registro en todas las transiciones, corrección aditiva, política de retención | Aprobación de ADR-089 y de esta spec |
| **T2** | `EN_ROUTE` alcanzable en la OT y su proyección hacia MOD09 | Decisión de §4.4 sobre el valor para el técnico |
| **T3** | Superficie de consulta y métricas de productividad | T1 cerrado y revisión de seguridad aprobada |
| **T4** | Control de jornada laboral | **Verificación regulatoria con fuente oficial** (ADR-089 §D5) |

## 10. Deuda registrada, fuera de alcance

1. **`EN_ROUTE` muerto en MOD11** — se resuelve en T2, y hasta entonces el desplazamiento no es medible desde la OT.
2. **`block()` no registra motivo estructurado** más allá del `reasonCode` del comando: la línea de tiempo lo capturará, pero el catálogo de motivos sigue sin estar disponible en el portal (ambos comandos muestran «no disponible»).
3. **Sin concepto de pausa** (§5).
4. **Sin verificación del inicio** — geolocalización o cualquier otra señal. Es lo que hace que el dato de la fase 1 no sirva como prueba, y condiciona T4.
5. **Sin historial retroactivo** para las OT anteriores (§4.5).

## 11. Artefactos que esta spec NO supera

Ninguno. Complementa a las dos specs hermanas del 2026-09-14 en un eje distinto —el tiempo— y no contradice ADR-046, 066, 067 ni 068.
