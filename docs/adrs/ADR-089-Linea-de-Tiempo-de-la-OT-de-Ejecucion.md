# ADR-089: La OT de ejecución registra su línea de tiempo, no sus duraciones

**Versión:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-09-14
**Aprobado por:** CTO Humano — 2026-09-14
**Modo activo:** Product Architect + Architect
**Autor:** AI-EM-ARCH
**Módulos:** MOD11 Ejecución Operativa · MOD09 Programación (proyección)
**Relacionado:** [ADR-046](ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md) (Aprobado) · [ADR-068](ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md) (Aprobado) · [ADR-067](ADR-067-Proyeccion-PII-Listados-Operativos.md) (Aprobado) · [ADR-088](ADR-088-Cierre-OT-y-Culminacion-Instalacion-Hitos-Separados.md) (Aprobado) — eje distinto: aquel define *qué* exige el cierre, este *cuándo* ocurrió cada cosa

---

## Contexto

El CTO planteó el 2026-09-14 la necesidad de determinar el comienzo de la ejecución de la OT, con dos usos: **control horario** y **estadísticas de productividad**.

La verificación mostró que **el dato de inicio ya existe**: `start()` fija `order.startedAt ?? new Date()` de forma idempetente y emite `ExecutionOrderStartedV1` con ese instante (`apps/api/src/modules/tasks/services/execution-orders.service.ts`). También existen `closedAt` y la ventana planificada `plannedWindowStartAt/EndAt`, de modo que comparar planificado contra real es posible hoy.

El problema no es el dato: es que **no es interpretable**.

1. **No existe historial de transiciones.** No hay tabla de cambios de estado de la OT, y `block()` cambia el estado **sin registrar cuándo**. En consecuencia, `closedAt − startedAt` es **tiempo transcurrido, no tiempo trabajado**: un técnico bloqueado tres horas esperando material figura como si las hubiera trabajado.
2. **`EN_ROUTE` está muerto en MOD11.** El estado existe en el enum y los `switch` lo tratan como estado de entrada, pero **ningún endpoint ni servicio lo asigna**. El desplazamiento sí se registra, pero en la agenda de MOD09 (`ScheduleEventStatus.EN_ROUTE`, con su endpoint de transición). Desde la OT no se puede separar viaje de ejecución.
3. **`startedAt` es autodeclarado e irreversible.** El técnico pulsa cuando quiere, y el `?? new Date()` impide corregir un inicio pulsado por error. Sin verificación de ningún tipo.
4. **No hay concepto de pausa.**
5. **El outbox no sirve de historial.** Guarda `occurred_at`, pero es infraestructura de entrega con proceso de *tombstone*: no es una fuente estable sobre la que construir métricas.

El CTO fijó tres decisiones el mismo día: el propósito es **productividad primero y control de jornada después, por fases**; el **desplazamiento cuenta pero medido aparte**; y el tiempo bloqueado **se registra, y qué se descuenta se decide al analizar**.

Las tres apuntan al mismo artefacto: lo que falta no es un campo, es una **línea de tiempo**.

---

## Decisión

### D1. La OT registra sus transiciones de estado como hechos

MOD11 persiste, por cada cambio de estado de una `ExecutionOrder`, un asiento con: estado de origen, estado de destino, instante, actor y motivo cuando lo haya.

Precedente del repo a replicar: `StatusChange` del expediente en MOD05 (`apps/api/src/modules/crm/expedientes/entities/status-change.entity.ts`), con `from_status`, `to_status`, `changed_at` y el ámbito de tenant.

Ese registro —no `startedAt`— es la fuente de la que se derivan el inicio, el fin, el desplazamiento, los bloqueos y cualquier estadística posterior. `startedAt` y `closedAt` **se conservan**: son proyección conveniente del mismo hecho, y su retirada rompería consumidores vivos.

### D2. Se persisten hechos; las duraciones se derivan

**No se persiste ninguna duración calculada** —ni «tiempo efectivo», ni «tiempo productivo», ni «horas trabajadas»—.

Es la consecuencia directa de la tercera decisión del CTO: qué se descuenta se decide al analizar. Si la política de cómputo se persistiera, cambiarla exigiría migrar datos históricos y reinterpretar el pasado. Derivándola, la misma línea de tiempo admite varias lecturas sin tocar un solo registro.

### D3. El registro es inmutable y la corrección es aditiva

Un asiento **nunca se edita ni se borra**. Una corrección —un inicio pulsado por error, un bloqueo mal cerrado— se registra como un asiento nuevo que referencia al corregido, con su actor y su motivo.

Esta es la decisión que hace posible la fase 2 sin rehacer nada: un registro editable no sirve como soporte de nada que tenga consecuencias laborales, y convertirlo en inmutable después obliga a descartar todo lo acumulado antes.

### D4. MOD11 es dueño del hecho de desplazamiento de la orden

Que el técnico se ponga en camino **a ejecutar esta orden** es un hecho de ejecución, no de agenda. MOD11 lo registra en su línea de tiempo y `EN_ROUTE` deja de ser un estado inalcanzable.

No se duplica con MOD09: la agenda conserva su propio estado para coordinar la programación, y la sincronización entre ambos usa el mecanismo de proyecciones ya aprobado en ADR-068. Lo que se prohíbe es que MOD11 mida el desplazamiento leyendo la tabla de la agenda.

### D5. El uso para control de jornada laboral no se habilita en la fase 1

El dato de la fase 1 es **autodeclarado y sin verificación**. Presentarlo como soporte de jornada laboral, horas extra o cualquier efecto sobre la relación laboral **no está autorizado por este ADR**.

La jornada laboral en Colombia cae bajo MinTrabajo, y **este ADR no afirma qué exige esa normativa: requiere verificación con fuente oficial** antes de habilitar la fase 2. Lo que sí decide es que el modelo de D1–D3 no impedirá esa habilitación.

---

## Consecuencias

**Positivas**

- El tiempo bloqueado deja de contarse como trabajo, y las estadísticas de productividad pasan a significar algo.
- Desplazamiento y ejecución quedan separables, de modo que un técnico lento y una zona lejana dejan de parecer lo mismo.
- La política de cómputo puede cambiar sin migrar datos ni reinterpretar el pasado.
- El camino a la fase 2 queda abierto sin rehacer el modelo.

**Negativas y costes**

- **Volumen**: una fila por transición y por OT. A la escala objetivo del programa es la tabla que más crece de MOD11 y necesita índice por orden y por instante desde el primer día.
- Las transiciones existentes **no tienen historial retroactivo**: las OT anteriores al cambio tendrán `startedAt` pero ninguna línea de tiempo. Cualquier informe debe distinguir ambas poblaciones o arrancar desde una fecha.
- Hacer `EN_ROUTE` alcanzable añade un paso al flujo del técnico. Si no aporta valor visible, se saltará — y un estado que se salta produce datos peores que su ausencia.

**Impacto declarado**

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | Tabla por schema de tenant, como el resto de MOD11. Índice aplicado por schema (ADR-066). |
| **Seguridad y PII** | **Es el punto delicado.** La línea de tiempo describe cuándo y durante cuánto trabajó una persona identificable: es dato personal del trabajador, no solo dato operativo. Ley 1581 aplica a empleados igual que a suscriptores. Exige finalidad declarada por campo (ADR-067), política de retención y **revisión de AI-SEC-ENG antes de publicar cualquier superficie de consulta**. |
| **Escala** | Ver volumen arriba. Las métricas se calculan por agregación, nunca recorriendo la línea de tiempo por fila en una pantalla. |
| **Regulación** | MinTrabajo para la fase 2 — **requiere verificación con fuente oficial**, no afirmada aquí. |
| **Boundaries** | Ninguno cruzado. MOD11 registra sus propias transiciones; MOD09 conserva las suyas; la sincronización es la de ADR-068. |

---

## Riesgos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| R1 | Un informe presenta tiempo transcurrido como tiempo trabajado, que es el defecto que este ADR corrige | D2: la duración se deriva y el consumidor declara su política; ningún informe publica «tiempo trabajado» sin decir qué descontó |
| R2 | El dato de fase 1 se usa para decisiones laborales antes de la fase 2 | D5 lo prohíbe explícitamente; la superficie de consulta debe declarar su alcance |
| R3 | `EN_ROUTE` se añade al flujo, el técnico lo omite, y el desplazamiento queda medido a medias — peor que no medirlo | Antes de exigirlo, decidir qué gana el técnico al marcarlo; si no gana nada, no se exige y se deriva de la agenda |
| R4 | La tabla crece sin política de retención y arrastra dato personal indefinidamente | La política de retención es entregable de la fase 1, no de la 2 |
| R5 | Se persiste una duración «para no calcularla cada vez» y se pierde la reversibilidad de D2 | Una caché de agregados es legítima; una duración persistida como verdad, no |

---

## Alternativas descartadas

**A1 — Añadir campos de timestamp a la OT (`blockedAt`, `enRouteAt`, `resumedAt`).** Es lo más barato y cubre el caso simple. Se descarta porque una OT puede bloquearse y reanudarse varias veces: un campo único solo guarda la última vez, y el resto del historial se pierde sin que nadie lo note.

**A2 — Derivar el historial del outbox de eventos.** Los eventos ya llevan `occurred_at`. Se descarta porque el outbox es infraestructura de entrega con proceso de *tombstone*: ni está pensado para consulta histórica ni garantiza permanencia.

**A3 — Leer el desplazamiento desde la tabla de la agenda de MOD09.** Evitaría tocar `EN_ROUTE` en la OT. Se descarta por boundary: obligaría a MOD11 a consultar tablas de otro módulo para calcular sus propias métricas.

**A4 — Persistir el tiempo efectivo calculado en cada cierre.** Daría consultas triviales. Se descarta por D2: congela la política de cómputo en el dato, y cambiarla obligaría a recalcular el histórico.
