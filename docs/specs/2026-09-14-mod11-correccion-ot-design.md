# Diseño — MOD11: corregir una OT mal creada

**Versión:** 1.0
**Estado:** Aprobada
**Aprobada por:** CTO — 2026-09-15, junto con ADR-090 (Aprobado).
**Fecha:** 2026-09-14
**Modo activo:** Mixto (Product Architect + Architect)
**Autor:** AI-EM-ARCH
**Origen:** el CTO pide poder eliminar una OT creada por error; sus decisiones redefinen la petición como corregir y, cuando no se pueda, anular.

**ADR que desarrolla:** [ADR-090](../adrs/ADR-090-Correccion-de-OT-Dueno-del-Dato-y-Anulacion-por-Error.md) (propuesto)
**ADRs relacionados:** ADR-046 (Aprobado), ADR-047 (Aprobado), ADR-068 (Aprobado), ADR-089 (Aprobado)
**Specs hermanas:** las tres del 2026-09-14 sobre consola, acta de instalación y línea de tiempo — **ninguna se supera**: esta actúa sobre el dato maestro de la OT, eje distinto.
**Plan de orquestación:** `docs/plans/2026-09-14-mod11-correccion-ot.md`

---

## 1. Objetivo

Que una OT creada con datos equivocados se pueda corregir sin cancelarla y recrearla, y que cuando corregir no sea posible, anularla deje constancia de que fue un error y no una cancelación operativa.

## 2. Problema

### 2.1 Hoy no existe ninguna forma de corregir una OT

Ni por MOD11 ni por su origen:

| Camino | Estado |
| --- | --- |
| Editar la OT | **No existe.** Sin `PATCH` en el controlador, y `persistOrderOptimistically` escribe solo siete columnas: estado, resultado, versión, instantes de inicio y cierre, notas y actor |
| Corregir la agenda y propagar | **Editar sí, propagar no.** `VisitWindowChangedV1` no lo emite nadie; `VisitResourceChangedV1` lo emite MOD11 en vez de MOD09; ambos handlers del worker son `return Promise.resolve()` |
| Detectar la deriva | **No.** El reconciliador compara estados; nunca ventana, recurso ni sitio |
| Único camino real | Cancelar el evento de agenda → la OT pasa a `CANCELLED` → crear evento nuevo → OT nueva con consecutivo nuevo |

MOD09 sí permite editar ventana, sitio y técnico del evento —y registra el cambio en su log de reprogramación—, pero **ninguna de esas rutas toca la OT**: queda con sus datos originales, desincronizada en silencio.

### 2.2 El defecto que ese límite ya está causando

`assign()` muta `assignedTechnicianId` en memoria y llama a `persistOrderOptimistically`, cuyo `UPDATE` **no incluye esa columna**. Devuelve el objeto mutado, así que la respuesta HTTP muestra el técnico nuevo mientras la base conserva el anterior.

**No es cosmético: es un fallo de control de acceso.** `assertActorAccess` y `assertCustodyAssignment` leen `assignedTechnicianId` de la base. El técnico reasignado **no puede iniciar la OT ni registrar consumos**; el técnico original conserva el acceso. Y nadie se entera, porque la operación devuelve 200.

Solo funciona en los specs, gracias al camino alternativo que se activa cuando el manager no tiene `createQueryBuilder` — es decir, con mocks.

### 2.3 Por qué borrar no es la respuesta

Detallado en ADR-090 (Aprobado) §Contexto. En síntesis: no hay ninguna FK que proteja, el borrado tiene éxito silencioso, rompe la anonimización por retención dejando dato personal indefinidamente, y reutiliza un consecutivo ya escrito en auditoría inmutable.

## 3. Decisiones del CTO (2026-09-14)

| # | Decisión | Consecuencia |
| --- | --- | --- |
| **D1** | **Corregir y reutilizar**, no borrar | El trabajo es de propagación, no de supresión |
| **D2** | Error de creación **≠** cancelación operativa | Ambas deben distinguirse en el dato y en la métrica |
| **D3** | Cerrar también los huecos de la cancelación actual | Hoy hay cuatro caminos incoherentes a `CANCELLED` |

## 4. Diseño

### 4.1 La corrección entra por la agenda cuando la OT está agendada

MOD09 es dueño de ventana, recurso y sitio; MOD11, del estado de ejecución (ADR-068, ratificado en ADR-090 (Aprobado) §D1). Editar el evento de agenda emite el evento de dominio correspondiente, y MOD11 lo aplica a la OT de forma idempotente.

**No se abre `PATCH` sobre la OT.** Lo que falta no es una superficie nueva, es implementar la que el ADR ya previó: método de actualización en el puerto, emisión desde MOD09, y handlers reales en el worker donde hoy hay no-ops.

**Alcance (2026-09-14).** Esta sección asume que toda OT tiene evento de agenda. [ADR-091](../adrs/ADR-091-Origen-de-la-OT-Despacho-y-Agenda-Actos-Separados.md) (Aprobado) retiró esa premisa. Lo aquí escrito **rige para la OT agendada**, que sigue siendo el caso mayoritario. Para la OT despachada sin cita la corrección entra por el despacho —no hay evento del cual propagar—, y pasa a regirse por esta sección al agendarse y vincularse. **T1 debe cubrir ambos casos**, no solo el agendado.

### 4.2 Qué se corrige y qué no

| Campo | ¿Corregible? | Motivo |
| --- | --- | --- |
| Ventana planificada | **Sí** | Dato maestro de agenda; el caso más frecuente |
| Sitio, dirección, municipio, sector | **Sí** | Ídem |
| Técnico asignado | **Sí**, por el comando de asignación ya existente | Requiere antes el arreglo de §2.2 |
| Etiqueta de cliente, resumen, instrucciones | **Sí** | Dato descriptivo |
| **Tipo de trabajo** | **No** | Determina el snapshot de plantilla congelado; corregirlo rompería el gate de cierre (ADR-090 (Aprobado) §D2). Se rechaza con mensaje que indique la vía: anular y recrear |
| Consecutivo, estado, resultado, instantes | **No** | Propios de la ejecución, no del origen |

### 4.3 Una OT en ejecución no se corrige en silencio

La propagación **se rechaza** sobre una OT ya iniciada (ADR-090 (Aprobado) §D4). Corregir las condiciones del trabajo mientras alguien lo está haciendo es peor que el dato equivocado: el técnico vería cambiar el sitio o la ventana sin aviso.

El rechazo debe ser **visible en la agenda**, no silencioso: quien edita el evento tiene que saber que la OT no se actualizó y por qué.

### 4.4 Anulación por error

Distinta de la cancelación en el dato y en la métrica (ADR-090 (Aprobado) §D3). Exige **motivo** y rol de supervisión. La OT anulada permanece consultable, sale de la bandeja operativa y se excluye del cálculo.

**El volumen de anulaciones por error es él mismo una métrica**: si crece, el problema está aguas arriba —en la agenda o en el alta de la visita—, no en la ejecución.

### 4.5 Los cuatro huecos de la cancelación

Se cierran en el mismo tramo que §4.4, porque añadir una vía nueva sin cerrarlos dejaría cinco caminos incoherentes:

1. **La única vía de UI es engañosa**: el usuario reclasifica la causa de una visita no realizada y el efecto lateral es cancelar la OT, con una razón literal fija.
2. **Puerta trasera**: `close` con `result=CANCELLED` es aceptado por el API y está abierto a técnicos; además deja la tarea vinculada sin transicionar, divergencia por construcción.
3. **No valida terminalidad**: una OT `COMPLETED` puede reescribirse a `CANCELLED`, pisando su cierre.
4. **No emite evento de dominio**: no existe un `ExecutionOrderCancelledV1`, a diferencia del cierre.

### 4.6 La persistencia es el cuello de botella

Ningún diseño de propagación funciona mientras el `UPDATE` no escriba los campos corregibles. Por eso el arreglo de §2.2 va **primero y por separado**: es a la vez un bug activo y el requisito físico de todo lo demás.

**Al ampliarlo hay que ser explícito sobre qué escribe cada comando.** El `UPDATE` acotado de hoy protege por accidente contra mutaciones no intencionadas; ampliarlo sin criterio abre la puerta a que cualquier cambio en memoria llegue a la base.

## 5. Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | Sin cambio. |
| **Seguridad** | El defecto de §2.2 **es hoy un fallo de control de acceso**: corregirlo restaura la intención del comando. La anulación por error exige rol de supervisión y motivo. |
| **Escala** | Propagación por evento idempotente sobre infraestructura existente; sin consultas nuevas por lectura. |
| **Regulación** | Ninguna corrección destruye rastro (ADR-090 (Aprobado) §D5). |
| **Boundaries** | **Ninguno nuevo.** Se implementa la frontera de ADR-068; el puerto gana un método y sigue siendo interfaz tipada. |

## 6. Criterios de aceptación

**T0 — persistencia y `assign()`**

- **CA-01** — Tras `assign()`, el técnico leído **desde la base** es el nuevo.
- **CA-02** — El técnico reasignado **puede** iniciar la OT y registrar consumos; el anterior **no**.
- **CA-03** — Ningún comando persiste campos que no declara: ampliar el `UPDATE` no habilita mutaciones no intencionadas.

**T1 — propagación**

- **CA-04** — Cambiar la ventana en la agenda actualiza la OT.
- **CA-05** — Cambiar sitio o datos descriptivos actualiza la OT.
- **CA-06** — La propagación es **idempotente**: reaplicar el mismo evento no altera el resultado.
- **CA-07** — Con la OT en ejecución, la propagación **se rechaza y el rechazo es visible** en la agenda.
- **CA-08** — Cambiar el tipo de trabajo **se rechaza** con mensaje que indica anular y recrear.

**T2 — anulación y cancelación**

- **CA-09** — Una OT anulada por error es distinguible de una cancelada, en el dato y en la consulta.
- **CA-10** — La anulación exige motivo y rol de supervisión.
- **CA-11** — `close` con `result=CANCELLED` deja de ser vía de cancelación.
- **CA-12** — Cancelar una OT terminal se rechaza.
- **CA-13** — La cancelación emite evento de dominio.
- **CA-14** — La vía de la UI dice lo que hace: nadie cancela una OT creyendo que reclasifica una causa.

**T3 — observabilidad**

- **CA-15** — Una OT cuya ventana, recurso o sitio no coincide con su evento aparece como discrepancia.

## 7. Lo que esta spec declara pendiente

- **No se construye superficie de portal** para la anulación: el copy y el flujo son de AI-PROD-UX dentro de T2, y la pantalla llega después.
- **No se corrige la ausencia de reverso en inventario.** Si una OT anulada ya consumió material, el ajuste sigue siendo manual: `is_reversal` existe en el esquema y ningún código lo activa. Queda como deuda de MOD12.
- **No se retira la vía de cancelación desde la agenda**, que es legítima: se hace honesta.

## 8. Deuda registrada

1. **`is_reversal` / `reversed_by_movement_id` son infraestructura muerta** en MOD12: el esquema y el servicio los aceptan, ningún llamador los activa. El PRD promete reversos que el código no emite.
2. **`execution_order_audit_intents` se escriben y nadie los entrega ni los purga** — se acumulan indefinidamente, con o sin este trabajo.
3. **El conjunto de estados terminales está duplicado en cuatro sitios** sin constante compartida, mientras tasks y schedule-events sí la tienen.
4. **Las tablas hijas de MOD11 no tienen FK** a `execution_orders`: la integridad referencial vive solo en código.
5. **El PRD de MOD11 §3.1 se contradice a sí mismo** sobre el origen de la OT: separa «la agenda se crea solo cuando la `Task` requiere fecha y hora confirmadas» de «la OT se crea solo cuando la `Task` implica ejecución de campo estructurada», y tres líneas después las fusiona en «la OT se crea o activa al confirmarse agenda». El HLD repite la fusión. Resuelto por ADR-091 (Aprobado): el PRD y el HLD quedan pendientes de corrección documental.
6. **El HLD de MOD11 promete «seguimiento mediante nueva OT vinculada» y el código no la crea**: `createFollowUp` emite `ExecutionOrderFollowUpRequiredV1` y el worker devuelve la `VisitRequest` a `REQUIRES_RESCHEDULE`. La necesidad vuelve a la bandeja de agenda en vez de convertirse en OT.

## 9. Artefactos que esta spec NO supera

Ninguno. Complementa a ADR-068 implementando su frontera, y no contradice a las specs hermanas del 2026-09-14.
