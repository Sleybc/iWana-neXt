# ADR-091: El origen de la OT — despacho y agenda como actos separados

**Versión:** 1.0
**Estado:** Aprobado
**Aprobado por:** CTO — 2026-09-14
**Condiciones resueltas por el CTO el 2026-09-14** (tras el dictamen de `sec-eng`): bandeja de `CREATED` **solo de supervisión**; paridad del contratista **declarada** y H6 corregido aparte; **sede obligatoria** al despachar. Ver §D6.
**Fecha:** 2026-09-14
**Modo activo:** Product Architect + Architect
**Autor:** AI-EM-ARCH
**Módulos:** MOD11 Ejecución Operativa · MOD09 Programación
**Relacionado:** [ADR-047](ADR-047-Separacion-Programacion-y-OT-Ejecucion.md) (Aprobado) — este ADR **hace efectiva una frase que aquel ya aprobó y el código contradice** · [ADR-076](ADR-076-Unicidad-Trabajo-Campo-Activo-Por-Origen.md) (Aprobado) — aporta el eje de identidad · [ADR-046](ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md) (Aprobado) · [ADR-068](ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md) (Aprobado) · [ADR-090](ADR-090-Correccion-de-OT-Dueno-del-Dato-y-Anulacion-por-Error.md) (propuesto) — este ADR acota su §D1
**Spec que lo desarrolla:** `docs/specs/2026-09-14-mod11-origen-ot-design.md`

---

## Contexto

El CTO observó el 2026-09-14 que **la OT debe nacer de la necesidad de despachar técnicos y resolver un problema, no de un hueco en el calendario**, y pidió analizar cómo funciona hoy.

La observación no contradice la gobernanza vigente: **la ratifica**. ADR-047 (Aprobado) ya lo dice con todas sus letras —«ese alcance convierte a la OT en *owner de ejecución de campo, no en subproducto de agenda*»— y su regla 3 insiste: «el técnico debe trabajar sobre la OT, no sobre el evento de agenda». Lo que este ADR resuelve es que **el código hace hoy exactamente lo contrario**.

### Lo que la exploración encontró

El circuito real es `necesidad → VisitRequest → ScheduleEvent → OT`, y la OT nace como efecto colateral dentro de la transacción de MOD09.

- **La OT no tiene puerta propia.** El controlador de MOD11 expone 21 rutas y ninguna la crea. El único constructor es `ExecutionOrderSchedulingPort.createFromSchedulingWithManager`, invocado desde `schedule-events.service.ts` y `visit-requests.service.ts`.
- **La dependencia está en el esquema, no en el flujo.** La migración 046 declara `schedule_event_id NOT NULL` junto a `planned_window_start_at` y `planned_window_end_at`; la 091 añade un índice único `(tenant_id, schedule_event_id)`. El evento de agenda **es la clave de idempotencia de la creación**: si ya existe OT para ese evento, se devuelve la existente.
- **`CREATED` es un estado inalcanzable.** La OT nace `CREATED` solo si no hay técnico ni cuadrilla, pero `assignedUserId` es obligatorio en el DTO de agenda. Toda OT nace `ASSIGNED`: **no existe bolsa de trabajo pendiente de despacho**.
- **Las reglas del calendario gobiernan la existencia del trabajo**: duración mínima de 15 minutos, prohibición de fechas pasadas y detección de conflicto de agenda se ejecutan *antes* de que la OT pueda existir.
- **El seguimiento tampoco abre una puerta.** `createFollowUp` no crea OT: emite `ExecutionOrderFollowUpRequiredV1` y el worker devuelve la `VisitRequest` a `REQUIRES_RESCHEDULE`. El HLD de MOD11 promete «seguimiento mediante nueva OT vinculada»; el código devuelve la necesidad a la bandeja de agenda.
- **Hasta la consola está ordenada por agenda**: el orden por defecto de la lista es `planned_window_start_at DESC` (migración 130).

### Lo que esto ya produce en operación

1. Una **falla urgente no se puede registrar** si el técnico disponible ya tiene un evento en ese rango: el chequeo de conflicto rechaza el evento y, sin evento, no hay OT.
2. Una **emergencia atendida de madrugada no se puede registrar después**: la guarda de fecha pasada lo impide.
3. **No existe «trabajo por despachar»** en MOD11: para que la OT exista hay que haber decidido ya quién y a qué hora.

### La contradicción también vive dentro de la gobernanza

El PRD de MOD11 §3.1 separa dos condiciones distintas —«la agenda se crea solo cuando la `Task` requiere fecha y hora confirmadas» y «la OT se crea solo cuando la `Task` implica ejecución de campo estructurada»— y tres líneas después las fusiona: «la OT enriquecida se crea o activa **al confirmarse agenda**». El HLD repite la fusión: «cuando la ejecución ya está comprometida».

**No es solo que el código incumpla el ADR: el PRD y el HLD le dieron cobertura.** Este ADR cierra esa ambigüedad.

### El matiz que no se puede omitir

**La necesidad sí está modelada hoy —pero en MOD09 y no se llama OT.** `VisitRequest` exige únicamente `originContext`, `workType` y `title`; ventana y técnico son opcionales, y sus estados `PENDING` → `NEEDS_CONTEXT` → `READY_TO_SCHEDULE` describen exactamente «hay un problema y alguien debe ir». La pregunta no es si la necesidad existe, sino **si el trabajo de campo debe llamarse solicitud de visita y vivir en agenda, o llamarse OT y vivir en ejecución**.

---

## Decisión

### D1. La agenda deja de ser la aduana de la existencia de la OT

La OT nace en el **acto de despacho** —necesidad, tipo de trabajo y sitio—, no en la reserva de una franja. La ventana planificada pasa a ser un **atributo que puede llegar después**, nunca una precondición de existencia.

MOD09 conserva íntegro lo que ADR-047 (Aprobado) le asignó: capacidad, conflictos, ventana y reprogramación. Lo único que pierde es el poder de impedir que el trabajo exista.

**Motivo de fondo:** hoy la agenda hace dos trabajos con una sola pieza —decidir que *hay que despachar* y reservar *una franja concreta*—. No hay forma de expresar «esto debe hacerse, pronto, por alguien» sin expresar a la vez «el martes a las 15:15, por Juan». Son dos decisiones distintas, tomadas por roles distintos y en momentos distintos.

### D2. El eje de identidad de la OT es el de ADR-076, no el evento de agenda

ADR-076 (Aprobado) §D1 ya fijó el eje de unicidad del trabajo de campo:

```
(tenant_id, origin_context, origin_ref, work_type)
```

**Ese eje no es el evento de agenda.** La identidad correcta de la OT ya estaba decidida; lo que el esquema usa hoy como clave de idempotencia —`schedule_event_id`— es otra cosa, y es la causa técnica de D1.

En consecuencia, la clave de idempotencia de la creación de la OT se mueve al eje de origen, y `schedule_event_id` pasa a ser un **vínculo, no una identidad**.

**No se crea una segunda bandeja de trabajo pendiente.** La guarda de unicidad por origen de ADR-076 (Aprobado) se aplica con el mismo rigor al despacho directo: despachar no puede reabrir la duplicación que aquel ADR cerró.

### D3. `CREATED` recupera su significado: despachable y sin asignar

El estado existe en el enum y hoy es inalcanzable. Con D1 pasa a significar **trabajo reconocido, todavía sin responsable**: la bolsa de despacho que la operación necesita y el sistema no tiene.

La asignación de técnico deja de ser condición de nacimiento y vuelve a ser lo que su nombre dice: un acto posterior y registrable.

**Y activa una regla dormida que nadie ha razonado desde que se escribió.** El control de acceso ya contempla `CREATED` y lo **excluye explícitamente** del pool reclamable por técnicos: tanto `assertActorAccess` (`isUnassignedPool = isUnassigned && isTechnician && status !== CREATED`) como el `WHERE` de la lista (`assigned_technician_id IS NULL AND assigned_crew_id IS NULL AND status <> 'CREATED'`) dejan fuera ese estado.

Como hoy `CREATED` es inalcanzable, esa exclusión **no protege nada**: es una guarda para un caso que nunca ocurre. Al volverlo alcanzable, la guarda despierta y fuerza una decisión que nunca se tomó conscientemente:

- **Si `CREATED` sigue excluido**, la OT despachada y sin asignar es **invisible para todo técnico**: nadie puede reclamarla y la bolsa de despacho solo existe para supervisión, que debe empujar la asignación.
- **Si `CREATED` se incluye en el pool**, cualquier técnico o contratista del tenant ve **todo** el trabajo despachado: esa rama **no tiene scoping por sede**. `organization_site_id` existe en la OT y sobrevive sin evento de agenda, pero hoy es solo un **filtro opcional de la consulta, nunca un alcance impuesto**.

**Veredicto de `sec-eng` (2026-09-14, `docs/informes/INFORME-MOD11-ORIGEN-OT-SEC-ENG-DICTAMEN-v1.0.md`): se mantiene la exclusión.** `CREATED` queda fuera del pool reclamable. Incluirlo sin acotar por sede sería fuga horizontal intra-tenant —cualquier técnico vería todo el despacho, y cualquier **contratista**, que es un tercero, lo mismo más `customerDisplayLabel` y `municipality`—. Acotar por sede exige una fuente server-owned de pertenencia actor↔sede que **hoy no existe para técnicos**: la única que hay (`canSuperviseExecutionOrder`) es de la rama de supervisión. Es capacidad nueva, no configuración.

**Consecuencia que el ADR adopta: la sede es obligatoria al despachar.** `assertSupervisionScope` es fail-closed sobre `organizationSiteId`, y los tres comandos de coordinación —`assign`, `follow-ups`, `reconciliation`— pasan por él. Las rutas de lectura no, de modo que una OT despachada sin sede **se lista y se abre, pero no se puede asignar a nadie**: un supervisor la ve y ningún comando la mueve. No es una OT incompleta, es una OT muerta.

**Paridad del contratista, declarada y no heredada:** `CONTRACTOR` comparte todo el pool con `TECHNICIAN` salvo `POST :id/unblock`, del que está excluido por `@Roles`. Hoy eso significa que **un contratista puede bloquear una OT y no puede desbloquearla**. Este ADR lo declara como lo que es —defecto vivo e independiente de esta decisión—, no como endurecimiento intencional.

### D4. Despachar sin agendar no debilita la detección de conflictos

Esta es la guarda que hace la decisión aceptable. Una OT despachada sin cita **no reserva capacidad y no la consume**: precisamente por eso puede existir cuando la agenda está llena.

Cuando esa OT reciba ventana, la creación del evento en MOD09 vuelve a pasar por el chequeo de conflicto **sin excepción ni atajo**. El despacho directo no puede convertirse en la puerta trasera para mandar al mismo técnico a dos sitios a la vez.

### D5. Una OT sin cita es visible como tal, no como una OT incompleta

Si la ventana es opcional, la consola deja de poder ordenar y presentar todo por `planned_window_start_at`. Una OT sin ventana **no es una fila defectuosa**: es trabajo pendiente de programar, y debe leerse así.

Mientras la superficie no distinga ambos casos, abrir la nulabilidad produciría filas que parecen rotas. **La distinción es condición de entrega, no mejora posterior.**

### D6. Las tres condiciones del dictamen, resueltas

| # | Condición | Decisión del CTO (2026-09-14) | Efecto |
| --- | --- | --- | --- |
| 1 | **La bandeja operativa** | La bolsa de `CREATED` es **solo de supervisión**. Coordinación empuja la asignación vía `assign()` | El veredicto se sostiene sin código nuevo. El pool acotado por sede (C2) **no entra en alcance**: si algún día la bolsa debe ser reclamable, será decisión propia y requerirá esa capacidad primero |
| 2 | **Alcance del contratista** | Se **declara** la paridad: el contratista ve lo mismo que el técnico. H6 se corrige como defecto propio | El pool actual no se parte por rol. La paridad deja de ser un accidente heredado y pasa a ser una decisión registrada |
| 3 | **Sede obligatoria** | **Sí.** Despachar sin sitio se rechaza | No se abre rama en `assertSupervisionScope`, que sigue siendo el único alcance impuesto y sigue siendo fail-closed |

**Sobre la condición 3, el ADR deja constancia de por qué no era una preferencia.** Solo tres rutas llevan `SUPERVISE` —`assign`, `follow-ups` y `reconciliation`—; las de lectura llevan `READ` y el supervisor pasa sin alcance de sede. Una OT en `CREATED` sin sede **se lista, se abre y se lee con normalidad, y ningún comando puede moverla**: invisible para técnicos por D3, inmóvil para coordinación por el fail-closed. Es la divergencia lista↔detalle que el dictamen advierte para cambios futuros, producida por el diseño desde el primer día.

**H6 queda declarado como defecto vivo, no como endurecimiento intencional:** `POST :id/block` admite `CONTRACTOR` y `POST :id/unblock` lo excluye en `@Roles`. Hoy un contratista puede bloquear una OT y no puede desbloquearla —puede dejar varado su propio trabajo—, y eso es independiente de este ADR.

---

## Consecuencias

**Positivas**

- El sistema puede registrar lo que la operación ya hace: despachar por urgencia, sin cita previa y con la agenda llena.
- Deja de perderse el trabajo atendido fuera de horario, que hoy simplemente no se puede registrar.
- ADR-047 (Aprobado) deja de estar incumplido en su afirmación central.
- El seguimiento puede convertirse en OT vinculada, como el HLD prometió, en vez de devolver la necesidad a la bandeja de agenda.
- `CREATED` deja de ser código muerto en el enum.

**Inventario de orígenes, levantado el 2026-09-14 y registrado como alcance de E2**

De los cinco orígenes declarados en `WorkOrderSourceContext`, **cuatro tienen camino real**: `CRM` desde el expediente, `ASSURANCE` desde el ticket —por el portal y por `AssuranceFieldServiceProcessor`—, `TASKS` desde una tarea con mapeo que rechaza los tipos sin campo, y `MANUAL` como evento de agenda directo y **default silencioso**. `PROVISIONING` **no tiene ninguno**: existe en el mapa de etiquetas y en datos de demo.

Y no son cuatro puertas sino dos: `CRM`, `ASSURANCE` y `TASKS` nacen como `VisitRequest`; `MANUAL` se salta la solicitud y nace directamente como evento, sin dejar rastro de la necesidad previa.

Este ADR **no resuelve** ese inventario: lo declara y lo asigna a E2, que al abrir la puerta de despacho debe exigir origen explícito, decidir qué pasa con `PROVISIONING` y decidir si conserva el origen de primer nivel de una tarea nacida en `BILLING` o `SYSTEM` —que hoy llega a la OT como `TASKS`, perdiendo el real un salto atrás—.

**Negativas y costes**

- **Es una migración sobre datos existentes**: relajar `NOT NULL` y sustituir un índice único en producción. No es reversible por simple `down` una vez que existan OT sin evento.
- **Dos caminos de nacimiento conviven** —por agenda y por despacho—, y ambos deben respetar la misma guarda de unicidad. Es la superficie donde una implementación a medias produciría duplicados.
- **La consola necesita trabajo de UX antes de poder mostrar OT sin ventana** (D5): el coste no es solo de backend.
- La propagación de ADR-068 (Aprobado) y ADR-090 (Aprobado) gana un caso que antes no existía: la OT que aún no tiene evento del cual propagar.

**Impacto declarado**

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | Sin cambio: toda operación sigue dentro del schema del tenant. |
| **Seguridad** | **Es el impacto principal de este ADR, y está dictaminado** (§D3): se mantiene la exclusión de `CREATED`, y la sede pasa a ser obligatoria al despachar. La regla vive en **tres sitios de producción más el guard y un oracle de test**: cualquier cambio futuro debe tocarlos a la vez o produce divergencia lista↔detalle. |
| **Escala** | Sin consultas nuevas por lectura. El índice único cambia de columna, no de naturaleza. |
| **Regulación** | Sin cambio: no se destruye rastro y la retención de la línea de tiempo (ADR-089 (Aprobado)) no se altera. |
| **Boundaries** | **No se crea ninguno.** MOD09 conserva agenda, capacidad y conflictos; MOD11 gana el acto de creación que ADR-047 (Aprobado) ya le había atribuido. |

---

## Riesgos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| R1 | El despacho directo se usa para saltarse la agenda y se pierde el control de capacidad | D4: la OT sin cita no reserva capacidad; al recibir ventana pasa por el chequeo de conflicto sin excepción |
| R2 | Se duplica el trabajo de campo: una OT por despacho y otra por agenda para el mismo origen | D2: la guarda de unicidad de ADR-076 (Aprobado) se aplica a ambos caminos |
| R3 | La consola muestra OT sin ventana como filas rotas | D5: la distinción es condición de entrega |
| R4 | Se relaja el `NOT NULL` y la propagación de ADR-068 (Aprobado) falla en silencio sobre OT sin evento | La spec debe declarar el comportamiento de cada handler ante `schedule_event_id IS NULL` |
| R5 | Una OT en `CREATED` queda sin dueño y nadie la ve | Impacto de seguridad: el alcance de visibilidad se declara en la spec, no se hereda del caso con técnico |
| R6 | `VisitRequest` y OT en `CREATED` se convierten en dos bandejas del mismo trabajo | Alternativa A3: se decide cuál es la bandeja operativa; no conviven dos sin arbitraje |

---

## Alternativas descartadas

**A1 — Dejarlo como está y documentar que la OT nace de la agenda.** Sería coherente con el código y con el PRD/HLD actuales. Se descarta porque obligaría a **superar la afirmación central de ADR-047 (Aprobado)** y porque deja sin registrar el trabajo de urgencia, que es operación real, no un caso extremo.

**A2 — Permitir crear eventos de agenda en el pasado y sin chequeo de conflicto.** Resolvería los dos síntomas sin tocar el esquema de la OT. Se descarta porque degrada la agenda para arreglar la ejecución: convertiría el calendario en un registro histórico y anularía el control de capacidad que ADR-047 (Aprobado) asignó a MOD09.

**A3 — Promover `VisitRequest` a bandeja única de despacho y dejar la OT como está.** **Descartada por el CTO el 2026-09-14.** Es la alternativa más barata y la más seria de las descartadas: la necesidad ya está modelada ahí. Se descarta porque el técnico trabajaría sobre una solicitud de agenda y no sobre la OT, que es justo lo que la regla 3 de ADR-047 (Aprobado) prohíbe. **Si el CTO prefiere este camino, la decisión correcta no es este ADR sino superar ADR-047 (Aprobado), y debe hacerse explícito.**

**A4 — Crear la OT siempre, con una ventana ficticia cuando no haya cita.** Evitaría la migración. Se descarta porque un dato inventado en una columna `NOT NULL` contamina orden, métricas y la propia línea de tiempo, y porque nadie podría distinguir después qué ventana fue real.

---

## Aprobación requerida

Sí.

Motivo:

- reinterpreta el origen de la OT respecto a lo que PRD y HLD de MOD11 fijaron;
- altera una columna `NOT NULL` y un índice único sobre datos existentes;
- acota el alcance de ADR-090 (Aprobado) §D1;
- la alternativa A3 es una bifurcación de producto, no una variante de implementación.

---

## Referencias

- AGENTS.md
- docs/adrs/ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md
- docs/adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md
- docs/adrs/ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md
- docs/adrs/ADR-076-Unicidad-Trabajo-Campo-Activo-Por-Origen.md
- docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md
- docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md
