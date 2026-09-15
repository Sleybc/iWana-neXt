# Diseño — MOD11: el origen de la OT

**Versión:** 1.0
**Estado:** Aprobada
**Aprobada por:** CTO — 2026-09-14, junto con [ADR-091](../adrs/ADR-091-Origen-de-la-OT-Despacho-y-Agenda-Actos-Separados.md) (Aprobado) y las tres condiciones del dictamen de `sec-eng`.
**Fecha:** 2026-09-14
**Modo activo:** Mixto (Product Architect + Architect)
**Autor:** AI-EM-ARCH
**Origen:** el CTO objeta que la OT nazca de la agenda; debe nacer de la necesidad de despachar técnicos y resolver un problema.

**ADR que desarrolla:** [ADR-091](../adrs/ADR-091-Origen-de-la-OT-Despacho-y-Agenda-Actos-Separados.md) (Aprobado)
**ADRs relacionados:** [ADR-047](../adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md) (Aprobado), [ADR-076](../adrs/ADR-076-Unicidad-Trabajo-Campo-Activo-Por-Origen.md) (Aprobado), [ADR-068](../adrs/ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md) (Aprobado), [ADR-089](../adrs/ADR-089-Linea-de-Tiempo-de-la-OT-de-Ejecucion.md) (Aprobado), ADR-090 (Aprobado)
**Spec hermana:** `2026-09-14-mod11-correccion-ot-design.md` — **no se supera**; su §4.1 queda acotada al caso de la OT agendada.
**Plan de orquestación:** `docs/plans/2026-09-14-mod11-origen-ot.md`

---

## 1. Objetivo

Que una orden de trabajo pueda existir desde el momento en que se decide despachar, con o sin cita, sin debilitar el control de capacidad de la agenda ni reabrir la duplicación de trabajo de campo.

## 2. Problema

### 2.1 El circuito real

```
Necesidad (llamada, WhatsApp, ticket, CRM, proceso interno)
   └─► VisitRequest        MOD09 — la necesidad: ventana y técnico opcionales
        └─► ScheduleEvent   MOD09 — exige fecha, hora y técnico concreto
             └─► OT         MOD11 — efecto colateral, dentro de la transacción de MOD09
```

| # | Hallazgo | Evidencia |
| --- | --- | --- |
| **F1** | La OT no tiene puerta propia: 21 rutas en el controlador y ninguna la crea | `execution-orders.controller.ts` · `ports/execution-order-scheduling.port.ts` |
| **F2** | La dependencia está en el esquema: `schedule_event_id NOT NULL`, `planned_window_*` `NOT NULL`, índice único `(tenant_id, schedule_event_id)`, que además es la clave de idempotencia de la creación | migraciones 046 y 091 · `execution-orders.service.ts` (`findOne` por `scheduleEventId`) |
| **F3** | `CREATED` es inalcanzable: `assignedUserId` es obligatorio en el DTO de agenda, así que toda OT nace `ASSIGNED` | `create-schedule-event.dto.ts` |
| **F4** | Duración mínima, prohibición de fecha pasada y chequeo de conflicto se evalúan antes de que la OT pueda existir | `schedule-events.service.ts` · `schedule-past-guard.ts` |
| **F5** | `createFollowUp` no crea OT: devuelve la `VisitRequest` a `REQUIRES_RESCHEDULE` | `execution-orders.service.ts` · `execution-order-events.processor.ts` |
| **F6** | El orden por defecto de la consola es `planned_window_start_at DESC` | migración 130 |
| **F7** | El PRD de MOD11 §3.1 separa las dos condiciones y luego las fusiona; el HLD repite la fusión | PRD MOD11 §3.1 · HLD MOD11 |

### 2.2 Lo que produce en operación

1. Una falla urgente no se registra si el técnico disponible ya tiene evento en ese rango.
2. Una emergencia atendida de madrugada no se registra después.
3. No existe bolsa de trabajo por despachar.

### 2.4 Los cinco orígenes declarados y los cuatro reales

| Etiqueta en la UI | `WorkOrderSourceContext` | Camino real hoy |
| --- | --- | --- |
| Oportunidades | `CRM` | Desde el expediente; crea o reutiliza primero un ticket de instalación |
| Mesa de ayuda | `ASSURANCE` | Desde el ticket, `workType = SUPPORT`. **Dos vías**: el portal y `AssuranceFieldServiceProcessor` en el worker |
| Tareas | `TASKS` | Desde una tarea de MOD11, con un mapeo que **rechaza los tipos que no requieren campo** |
| Manual | `MANUAL` | Evento de agenda directo. **Valor por defecto** de todo lo demás |
| Provisionamiento | `PROVISIONING` | **Ninguno.** Solo mapa de etiquetas y datos de demo |

**No son cuatro puertas, son dos.** `CRM`, `ASSURANCE` y `TASKS` nacen como `VisitRequest` —la necesidad— y la OT aparece al agendarse. `MANUAL` **se salta la solicitud**: el evento nace con `visitRequestId: null` y la OT detrás. Es la única puerta que no deja rastro de la necesidad previa, y es además el default silencioso.

**El origen se declara, no se deriva.** `ticketId` en la solicitud es `z.string().max(160)`: texto libre, ni UUID ni validado contra MOD10. La excepción es el procesador del worker, que sí nace de un evento de MOD10 y deduplica por `(origin_context, origin_ref)`.

**Dos taxonomías que no coinciden.** `TaskOriginContext` tiene `ASSURANCE`, `CRM`, `WFM`, `BILLING`, `MANUAL`, `SYSTEM`; `WorkOrderSourceContext` tiene otros cinco. Una tarea nacida de facturación o del sistema que acabe en campo llega a la OT como `TASKS`: **el origen real se pierde un salto atrás.**

**Precedente que E1 aprovecha:** el eje de origen ya está respaldado en base para la solicitud con el índice único parcial `idx_visit_requests_active_origin_unique` (migración 035). E1 no inventa el patrón, lo replica en la OT.

### 2.3 Lo que no es el problema

**La necesidad sí está modelada** —`VisitRequest`, con ventana y técnico opcionales—. El problema no es su ausencia: es que vive en agenda y no es la OT sobre la que ADR-047 (Aprobado) manda trabajar al técnico.

## 3. Diseño

### 3.1 Dos actos, dos momentos

| Acto | Quién decide | Qué produce | Obligatorio |
| --- | --- | --- | --- |
| **Despachar** | Coordinación / operaciones | La OT existe: origen, tipo de trabajo, sitio | Sí |
| **Agendar** | Programación (MOD09) | Ventana, técnico, reserva de capacidad | **No, o no todavía** |

### 3.2 Qué deja de ser obligatorio

| Campo | Hoy | Después | Consecuencia |
| --- | --- | --- | --- |
| `schedule_event_id` | `NOT NULL` + único | Nullable, **vínculo no identidad** | La clave de idempotencia se muda al eje de origen |
| `planned_window_start_at` / `_end_at` | `NOT NULL` | Nullable | El orden y la presentación de la consola cambian (§3.5) |
| Técnico en el nacimiento | Obligatorio vía DTO de agenda | Opcional en el despacho | `CREATED` se vuelve alcanzable |

### 3.3 La identidad se muda al eje ya aprobado

ADR-076 (Aprobado) §D1 fijó `(tenant_id, origin_context, origin_ref, work_type)` como eje de unicidad del trabajo de campo. **La creación de la OT adopta ese eje**, con el mismo `pg_advisory_xact_lock` y la misma normalización de `origin_ref` que la guarda de `VisitRequest` ya usa.

**Ambos caminos de nacimiento —agenda y despacho— pasan por la misma guarda.** Un camino que no la respete convierte el despacho directo en la vía para duplicar.

`origin_ref IS NULL` ya estaba fuera de deduplicación por ADR-076 (Aprobado) §D4: esta spec **no amplía** esa excepción.

### 3.4 La agenda no pierde nada

Una OT despachada sin cita **no reserva capacidad y no la consume**. Cuando reciba ventana, MOD09 crea el evento y vuelve a correr el chequeo de conflicto **sin excepción ni atajo** (ADR-091 (Aprobado) §D4).

El vínculo se establece entonces, y a partir de ahí la propagación de ADR-068 (Aprobado) y de ADR-090 (Aprobado) aplica igual que hoy.

### 3.5 Una OT sin cita se lee como trabajo por programar

Condición de entrega, no mejora posterior (ADR-091 (Aprobado) §D5). La consola debe distinguir *sin ventana* de *con ventana*, y el orden por defecto debe dejar de asumir que `planned_window_start_at` existe.

### 3.6 Quién ve una OT en `CREATED`

**Es la pregunta de seguridad de esta spec, y no es abierta: hay una regla ya escrita que hoy duerme.**

El control de acceso contempla `CREATED` y lo **excluye** del pool reclamable por técnicos, en dos sitios que se replican:

- `assertActorAccess`: `isUnassignedPool = isUnassigned && isTechnician && status !== CREATED`
- el `WHERE` de `list()`: `assigned_technician_id IS NULL AND assigned_crew_id IS NULL AND status <> 'CREATED'`

Como `CREATED` es hoy inalcanzable (F3), esa exclusión **no protege nada**. Al volverlo alcanzable despierta.

**Dictamen de `sec-eng` (2026-09-14, `docs/informes/INFORME-MOD11-ORIGEN-OT-SEC-ENG-DICTAMEN-v1.0.md`): se mantiene la exclusión.** `CREATED` queda fuera del pool reclamable. La bolsa de despacho es **de supervisión**: coordinación empuja la asignación.

Incluirlo exigiría acotar el pool por sede, y eso **no es configuración**: `organization_site_id` es hoy un filtro opcional de la consulta, y la única fuente server-owned de pertenencia actor↔sede (`canSuperviseExecutionOrder`) sirve solo a la rama de supervisión. Para técnicos no existe.

### 3.6.1 La sede es obligatoria al despachar

Consecuencia directa del fail-closed de `assertSupervisionScope`, que rechaza con 404 cuando falta `organizationSiteId`. Los tres comandos de coordinación —`assign`, `follow-ups`, `reconciliation`— pasan por él; las rutas de lectura no.

**Una OT despachada sin sede se lista y se abre, pero no se puede asignar a nadie.** Un supervisor la ve y ningún comando la mueve: no es una OT incompleta, es una OT muerta. El sitio entra como dato obligatorio del despacho, no como campo opcional.

### 3.6.2 La regla vive en cinco sitios

Tres de producción —`assertActorAccess`, el `WHERE` de `list()` y `computeAllowedActions`—, más el guard como enforcement y un oracle de test. **Cualquier cambio debe tocarlos a la vez**, o produce la divergencia que este diseño no puede permitirse: filas que se listan y dan 404 al abrirse, o filas ocultas accesibles por id.

### 3.8 El despacho declara su origen

La puerta de despacho (E2) **exige `originContext` explícito**: no hereda el default `MANUAL`, porque ese default es hoy lo que hace indistinguible «se creó a mano» de «nadie declaró nada».

Dos decisiones que E2 toma y no hereda:

- **`PROVISIONING` no tiene camino.** O se le da uno, o se retira del enum: una etiqueta que la UI ofrece y nada produce es deuda que se arrastra.
- **El salto que pierde el origen real.** Una tarea nacida de `BILLING` o `SYSTEM` llega a la OT como `TASKS`. El despacho directo puede conservar el origen de primer nivel en `originRefId`, o aceptar explícitamente la pérdida. Lo que no puede es dejarlo sin decidir.

### 3.7 Los handlers ante una OT sin evento

Cada proyección y cada handler del worker que hoy asume `schedule_event_id` debe declarar su comportamiento cuando es nulo. **El fallo silencioso no es aceptable**: o se omite explícitamente, o se registra.

Alcanza al reconciliador, que hoy compara estados contra el evento.

## 4. Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | Sin cambio. |
| **Seguridad** | **Dictaminado por `sec-eng` y resuelto en §3.6**: se mantiene la exclusión de `CREATED` y la sede pasa a ser obligatoria. La bolsa es de supervisión, no reclamable. |
| **Escala** | Sin consultas nuevas por lectura; el índice único cambia de columna. |
| **Regulación** | Sin cambio; la retención de ADR-089 (Aprobado) no se altera. |
| **Boundaries** | **Ninguno nuevo.** MOD09 conserva agenda, capacidad y conflictos. |
| **Migración** | Relajar `NOT NULL` y sustituir un índice único sobre datos existentes. **No reversible por simple `down`** una vez existan OT sin evento: el `down` debe declararlo. |

## 5. Criterios de aceptación

**E1 — Esquema e identidad**

- **CA-01** — `schedule_event_id` y `planned_window_*` admiten nulo; las OT existentes no cambian de contenido.
- **CA-02** — La unicidad activa por `(tenant_id, origin_context, origin_ref, work_type)` se cumple **sea cual sea el camino de nacimiento**.
- **CA-03** — Crear dos OT concurrentes para el mismo origen produce una sola, con la segunda rechazada, no una fila duplicada.
- **CA-04** — El `down` de la migración declara su límite ante OT sin evento; no falla en silencio.

**E2 — Despacho**

- **CA-05** — Se crea una OT con **`originContext` explícito** —sin heredar el default `MANUAL`—, tipo de trabajo y **sitio obligatorio**, sin ventana y sin técnico, y nace en `CREATED`. Despachar **sin sitio se rechaza**: sin él la OT es inasignable por el fail-closed de supervisión (§3.6.1).
- **CA-06** — Esa OT **no reserva ni consume capacidad** de agenda.
- **CA-07** — Asignarle técnico después la lleva a `ASSIGNED` y **persiste de verdad** (depende de T0 de la spec hermana).
- **CA-08** — Una OT en `CREATED` **no aparece en el pool reclamable** de técnicos ni contratistas, verificado en **los cinco sitios de §3.6.2** y por negación: quien no debe verla, no la ve, y los cinco coinciden.
- **CA-08b** — Una OT en `CREATED` **con sitio** es asignable por un supervisor con alcance sobre esa sede, y no por uno sin él.
- **CA-08c** — El despacho **rechaza** un origen sin camino y conserva la trazabilidad decidida en §3.8; la decisión queda escrita en el informe de fase.

**E3 — Agendar después**

- **CA-09** — Agendar una OT existente crea el evento, lo vincula, y **el chequeo de conflicto se ejecuta sin excepción**.
- **CA-10** — Agendar no crea una segunda OT: la existente se vincula.
- **CA-11** — Tras el vínculo, la propagación de ADR-068 (Aprobado) opera igual que sobre una OT nacida por agenda.

**E4 — Superficie y proyecciones**

- **CA-12** — La consola distingue *sin ventana* de *con ventana*; el orden por defecto no asume ventana existente.
- **CA-13** — Ningún handler ni el reconciliador falla en silencio ante `schedule_event_id IS NULL`.

## 6. Lo que esta spec declara fuera de alcance

- **No se implementa el seguimiento como OT vinculada** (F5), aunque el HLD lo prometa: es alcance propio y merece su propio tramo.
- **No se retira el camino de nacimiento por agenda.** Sigue siendo legítimo y mayoritario; deja de ser el único.
- **No se resuelve la bandeja única.** Si `VisitRequest` y la OT en `CREATED` deben convivir como dos bandejas, o una absorbe a la otra, es decisión de producto pendiente (§7.1).

## 7. Decisiones que esta spec traía abiertas

### 7.1 La bandeja operativa — RESUELTA

Con `CREATED` alcanzable, una `VisitRequest` en `READY_TO_SCHEDULE` y una OT en `CREATED` describen el mismo hecho: trabajo reconocido sin programar.

**Decisión del CTO (2026-09-14): la bolsa de `CREATED` es solo de supervisión.** Coordinación empuja la asignación; no es una bandeja que los técnicos reclamen. No hay, por tanto, dos bandejas compitiendo por el mismo actor: la de agenda sigue siendo de programación y la de `CREATED` es de coordinación.

El pool acotado por sede queda **fuera de alcance**. Si algún día la bolsa debe ser reclamable, será decisión propia y exigirá primero una fuente server-owned de pertenencia técnico↔sede, que hoy no existe.

### 7.2 La alternativa A3 — RESUELTA

El CTO descartó el 2026-09-14 promover `VisitRequest` a bandeja única. ADR-047 (Aprobado) queda vigente sin cambios y su regla 3 se cumple: el técnico trabaja sobre la OT.

## 8. Deuda que esta spec registra

1. El PRD de MOD11 §3.1 y el HLD deben corregirse tras la aprobación: hoy dan cobertura documental a lo que ADR-091 (Aprobado) cambia.
2. `createFollowUp` promete en el HLD una OT vinculada que no crea.
3. **`PROVISIONING` es una etiqueta sin camino** y **`TaskOriginContext` no coincide con `WorkOrderSourceContext`**: una tarea de `BILLING` o `SYSTEM` llega a la OT como `TASKS`. Se decide en E2 (§3.8).
4. **`ticketId` de la solicitud es texto libre** (`z.string().max(160)`), sin validar contra MOD10: el vínculo con la mesa de ayuda es declarativo salvo por la vía del worker.
5. **`CONTRACTOR` puede bloquear una OT y no puede desbloquearla**: `POST :id/block` admite `CONTRACTOR` y `POST :id/unblock` lo excluye en `@Roles`. Defecto vivo hoy, independiente de esta spec: un contratista puede dejar varado su propio trabajo.
6. El chequeo de conflicto vive solo en MOD09: una OT despachada y nunca agendada **nunca pasa por él**, y eso es intencional pero debe ser visible.

## 9. Artefactos que esta spec NO supera

Ninguno. Acota §4.1 de la spec hermana de corrección y §D1 de ADR-090 (Aprobado); no los contradice.
