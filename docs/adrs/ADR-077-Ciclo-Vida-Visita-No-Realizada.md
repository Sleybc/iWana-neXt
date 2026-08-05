# ADR-077: Ciclo de vida de la visita agendada que no se realiza

**Version:** 1.0
**Estado:** Propuesto
**Fecha:** 2026-08-04
**Autor:** AI-EM-ARCH
**Modo activo:** Mixto
**Modulo principal:** MOD09 Programacion / WFM
**Modulos relacionados:** MOD11 Ejecucion Operativa, MOD10 Service Assurance, MOD05 CRM
**PRD relacionado:** docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md
**HLD relacionado:** docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md
**Spec relacionada:** [UX visita no realizada](../specs/2026-08-04-mod09-visita-no-realizada-ux-spec.md)
**ADRs antecedentes:** ADR-037, ADR-039, ADR-046, ADR-047, ADR-068
**ADR hermano:** [ADR-076 (propuesto)](ADR-076-Unicidad-Trabajo-Campo-Activo-Por-Origen.md)

---

## Contexto

ADR-068 ya definio la matriz de convergencia entre la orden de ejecucion y las
proyecciones operativas, y el worker la aplica
(`apps/worker/src/processors/execution-order-events.processor.ts:300-338`):

| Cierre de la orden | `ScheduleEvent` | `VisitRequest` | Tarea |
| --- | --- | --- | --- |
| Ejecutada / con observaciones | `COMPLETED` | `CLOSED` | `RESOLVED` |
| **No ejecutada** | `CANCELLED` | **`REQUIRES_RESCHEDULE`** | `READY` |
| Cancelada | `CANCELLED` | `CANCELLED` | `CANCELLED` |
| Requiere seguimiento | `COMPLETED` | `REQUIRES_RESCHEDULE` | `PENDING_INTERNAL` |

La direccion es correcta: la visita no realizada **vuelve a la bandeja con estado
propio** ("Requiere reagendar") en lugar de mezclarse con las solicitudes nuevas.

La auditoria del 2026-08-04 encontro tres huecos que dejan esa decision sin efecto real.

### H1 — El estado de retorno es inagendable

`visit-requests.service.ts:590` exige que el estado efectivo sea `READY_TO_SCHEDULE`
para agendar, y `getEffectiveVisitRequestStatus:1139-1146` solo normaliza
`READY_TO_SCHEDULE` y `NEEDS_CONTEXT`: devuelve `REQUIRES_RESCHEDULE` sin transformar.
Resultado: *"La solicitud no esta lista para agendar"*.

`updateVisitRequestContext:395-403` tampoco admite ese estado, de modo que la solicitud
no puede corregirse. La unica salida del operador es cancelarla y recrearla desde el
origen — **que es exactamente el vector V1 de duplicacion documentado en
INFORME-MOD09-DUPLICACION-AGENDAMIENTO-VISITAS-v1.0**. El flujo de no ejecucion
desemboca en el defecto de duplicacion. Con la guarda de ADR-076 (propuesto) implantada y H1 sin
corregir, el operador quedaria directamente bloqueado.

### H2 — El caso mas frecuente no activa nada

Toda la matriz depende de que alguien **cierre** la orden de ejecucion. Si el tecnico no
pasa, no reporta y el dia termina, no ocurre nada: no existe barrido de eventos
vencidos. Los jobs repetibles del worker son deteccion de evidencia huerfana (cada 6 h),
tombstone de ordenes (04:00), purga de refresh tokens (03:00) y purga de schemas
(03:30). Ninguno mira la agenda.

`VisitRequestStatus.EXPIRED` **no se asigna en ningun punto del codigo**: solo se lee en
filtros. Un evento agendado para ayer sigue reportando "Agendada" indefinidamente.

### H3 — El intento fallido no deja rastro

`moveToPending` (`schedule-events.service.ts:597`) hace `softDelete` del evento. La
evidencia de que hubo un intento desaparece. No existe contador de intentos ni registro
de causa, de modo que una solicitud puede rebotar sin limite sin que nadie lo detecte, y
no hay forma de medir causa raiz.

### Definiciones de negocio confirmadas con el CTO (2026-08-04)

1. **Maximo 3 intentos** imputables al cliente.
2. **Clasificacion en dos niveles**: la registra el tecnico y la confirma el coordinador.
3. La politica de SLA queda a propuesta de arquitectura (ver D5).

---

## Decision

### D1. La no realizacion se clasifica por causa, no como un generico

Se introduce una taxonomia de causa que gobierna todo el comportamiento posterior:

| Causa | Significado | Consume intento | Efecto sobre el trabajo |
| --- | --- | --- | --- |
| `CUSTOMER_ABSENT` | El cliente no estaba | **Si** | Vuelve a pendientes |
| `CUSTOMER_NO_ACCESS` | No hubo acceso al sitio o al punto de instalacion | **Si** | Vuelve a pendientes |
| `CUSTOMER_DECLINED` | El cliente rechazo o pidio aplazar | **Si** | Vuelve a pendientes |
| `OPERATION_NO_SHOW` | El tecnico o la cuadrilla no llego | No | Vuelve a pendientes con prioridad elevada |
| `OPERATION_MISSING_MATERIAL` | Falto material, equipo o vehiculo | No | Vuelve a pendientes con prioridad elevada |
| `FORCE_MAJEURE` | Clima, orden publico, via cerrada | No | Vuelve a pendientes sin penalizar |
| `NO_LONGER_APPLICABLE` | El caso se resolvio por otra via o el cliente desistio | No | **No vuelve**: se cierra |
| `PARTIAL_EXECUTION` | Se avanzo, falta rematar | No | Segunda visita legitima (ver D8) |

Las causas de operacion y de fuerza mayor **no consumen intento**. Es deliberado: si la
ineficiencia propia agotara la paciencia contractual del cliente, el limite de 3
castigaria a quien no fallo.

### D2. Clasificacion en dos niveles con autoridad asimetrica

- **El tecnico registra el hecho.** Al cerrar la orden como no ejecutada debe elegir
  causa — es obligatorio — y adjuntar la evidencia que corresponda. Registra lo que
  paso en campo, no decide destino ni SLA.
- **El coordinador confirma o reclasifica, y decide el destino** (reagendar, cerrar,
  escalar). **Su clasificacion es la autoritativa** para el contador de intentos, la
  politica de SLA y las metricas de causa raiz.
- Ambas clasificaciones se conservan. La divergencia entre lo que reporto el tecnico y
  lo que concluyo el coordinador es señal operativa de primer orden y no debe perderse.
- Los eventos vencidos sin reporte (H2) entran a la bandeja del coordinador **sin
  causa**; el la asigna.

### D3. `REQUIRES_RESCHEDULE` es un estado agendable

Se corrige H1: el estado de retorno admite agendamiento directo y correccion de
contexto, conservando la marca de que ya hubo un intento previo. No se degrada a
`READY_TO_SCHEDULE`: perder esa distincion equivaldria a tratar el reintento como una
solicitud nueva, que es justo lo que este ADR evita.

### D4. Limite de 3 intentos imputables al cliente

- La solicitud lleva contador de intentos y registro de causa por intento.
- Al agotarse el tercer intento imputable al cliente, la solicitud **no se cancela
  automaticamente**: pasa a requerir decision explicita. Para instalaciones esa decision
  es comercial y se devuelve al expediente; para tickets, al responsable del caso.
- Cancelar el trabajo de un cliente sin que una persona lo decida es una accion
  irreversible de cara al negocio y queda prohibida.

### D5. Politica de SLA por causa — propuesta de arquitectura

**El reloj de SLA nunca se reinicia.** Reiniciarlo oculta el incumplimiento y hunde una
solicitud antigua en una bandeja ordenada por `sla_due_at`, haciendola parecer nueva.
El comportamiento se diferencia por causa:

| Causa | Reloj de SLA | Justificacion |
| --- | --- | --- |
| Causas de cliente | **Se pausa** desde el intento fallido hasta el nuevo agendamiento | La operacion cumplio: llego. El tiempo perdido no le es imputable |
| Causas de operacion | **Sigue corriendo**, sin pausa ni reinicio | La ineficiencia propia no puede comprar tiempo |
| Fuerza mayor | **Se pausa** | No es imputable a ninguna de las partes |
| Ya no aplica | Se cierra | El trabajo dejo de existir |
| Ejecucion parcial | El SLA original **se cumple** (hubo atencion); el seguimiento abre su propio plazo | Evita penalizar dos veces por un trabajo atendido |

La pausa por causa de cliente **exige evidencia del intento** registrada por el tecnico.
Sin evidencia no hay pausa: el reloj sigue corriendo. Esta condicion es la que sostiene
la pausa frente a una reclamacion o ante el regulador en casos PQR.

En la bandeja, el trabajo que vuelve por causa de operacion **sube** en el orden: es
deuda propia, no debe competir en igualdad con solicitudes nuevas.

### D6. El intento fallido se conserva

El evento de un intento fallido deja de eliminarse y pasa a conservarse con estado
terminal explicito (`NO_SHOW` cuando la causa es del cliente, `CANCELLED` cuando es de
la operacion), enlazado a la solicitud. El historial de intentos es visible en el detalle
de la solicitud, con fecha, tecnico, causa registrada y causa confirmada.

### D7. El barrido no decide: obliga a decidir

Se introduce un job repetible que detecta eventos cuya franja vencio sin cierre y los
marca como pendientes de reporte, concentrandolos en una vista de revision.

Reglas duras del barrido:

- **No cancela, no cierra, no reagenda nada por su cuenta.** Cancelar automaticamente un
  trabajo que quiza si se realizo — y el tecnico no reporto — es peor que dejarlo
  visible y pendiente de aclarar.
- No consume intentos ni altera el SLA: solo hace visible el silencio.
- Es idempotente y tolerante a reejecucion.
- Respeta el timezone del tenant para decidir que franja "ya vencio", con margen de
  gracia configurable.

### D8. Reagendar tras no ejecucion no es duplicado

La guarda de unicidad de ADR-076 (propuesto) debe tratar el reagendamiento posterior a una no
ejecucion como el caso legitimo por excelencia: el trabajo previo termino, la unidad de
origen es la misma, y volver a agendarla es precisamente lo que debe ocurrir. **No
requiere la marca de visita adicional ni motivo de excepcion.**

`PARTIAL_EXECUTION` es el unico caso de esta taxonomia que si constituye segunda visita
sobre trabajo vivo, y se canaliza por la marca explicita de ADR-076 (propuesto) D3.

---

## Consecuencias

### Positivas

- La visita no realizada deja de ser un limbo y vuelve a ser trabajo operable.
- Se corta la via por la que el flujo de no ejecucion alimentaba el defecto de
  duplicacion (vector V1).
- El silencio operativo — el caso mas frecuente — deja de ser invisible.
- Se puede medir causa raiz: cuantas instalaciones fallan por cliente ausente frente a
  falta de material. Hoy es imposible.
- El limite de intentos protege al negocio sin castigar al cliente por fallos propios.
- La politica de SLA queda defendible ante una reclamacion, porque la pausa se sostiene
  en evidencia.

### Costos y tradeoffs

- Nueva taxonomia, contador y registro de intentos: migracion tenant reversible.
- Nuevo job repetible en el worker y una vista de revision en el portal.
- El tecnico gana un paso obligatorio al cerrar como no ejecutada. Es fricción
  deliberada: sin causa registrada, nada de lo demas funciona.
- La doble clasificacion duplica el dato de causa. Se acepta: la divergencia es
  informacion, no redundancia.

### Riesgos aceptados

- El tecnico puede clasificar mal por rapidez. Lo mitiga la autoridad del coordinador,
  no una validacion automatica.
- La pausa de SLA por causa de cliente es susceptible de abuso si la evidencia es laxa.
  Se mitiga exigiendo evidencia como condicion de la pausa.
- Mientras el barrido no exista, los vencidos historicos siguen acumulados: la primera
  ejecucion puede producir un volumen alto en la vista de revision. Debe anticiparse.

---

## Reglas de implementacion

1. La causa es obligatoria para cerrar una orden como no ejecutada. Sin causa no hay
   cierre.
2. La clasificacion del coordinador es la autoritativa; la del tecnico se conserva sin
   sobrescribirse.
3. El contador de intentos solo lo incrementan las causas imputables al cliente.
4. Agotado el tercer intento, **prohibida** la cancelacion automatica: se exige decision
   explicita de una persona.
5. El reloj de SLA nunca se reinicia. La pausa exige evidencia del intento.
6. El evento del intento fallido se conserva con estado terminal explicito; prohibido
   eliminarlo.
7. El barrido de vencidos no modifica el destino del trabajo: solo marca y hace visible.
8. Reagendar tras no ejecucion no activa la guarda de duplicado de ADR-076 (propuesto).
9. La comunicacion entre MOD11 y MOD09 mantiene el patron de eventos y puertos vigente
   (ADR-047, ADR-068). Prohibida la lectura cruzada de tablas.
10. Migraciones reversibles, OpenAPI actualizado, pruebas y evidencia documental
    obligatorias.

---

## Alternativas consideradas

### A1: Devolver la visita no realizada a `READY_TO_SCHEDULE` sin distincion

Descartada. Trata el reintento como solicitud nueva: se pierde el contador, la causa y
la trazabilidad, y la solicitud se hunde en la bandeja como si nunca hubiera fallado.

### A2: Auto-cancelar los eventos vencidos sin reporte

Descartada. Cancela trabajo que pudo realizarse sin reportarse. Genera perdida de
ingreso, reclamaciones y desconfianza en el sistema. El silencio se resuelve preguntando,
no decidiendo por el operador.

### A3: Que el tecnico sea la unica autoridad de clasificacion

Descartada. Cargaria al tecnico con decisiones de SLA y de negocio que no le
corresponden, y dejaria sin correccion los errores de clasificacion en campo.

### A4: Que solo el coordinador clasifique

Descartada. El coordinador no estuvo en el sitio. Sin el reporte del tecnico, la
clasificacion es una conjetura.

### A5: Reiniciar el SLA en cada reagendamiento

Descartada explicitamente. Oculta el incumplimiento acumulado y rompe la priorizacion de
la bandeja.

---

## Aprobacion requerida

Si.

Motivo:

- Introduce taxonomia de causa y politica de SLA con efecto contractual y regulatorio.
- Fija un limite de intentos con consecuencia comercial.
- Introduce un job repetible nuevo en el worker.
- Modifica el comportamiento de estados definidos en ADR-068.

**Estado de aprobacion:** el CTO fijo el 2026-08-04 el limite de 3 intentos (D4) y la
clasificacion en dos niveles (D2), y delego en arquitectura la politica de SLA (D5).
Pendiente de aprobacion explicita el resto del cuerpo del ADR.

---

## Referencias

- AGENTS.md
- docs/adrs/ADR-039-Bandeja-Visitas-Pendientes-WFM.md
- docs/adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md
- docs/adrs/ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md
- [ADR-076 (propuesto)](ADR-076-Unicidad-Trabajo-Campo-Activo-Por-Origen.md)
- docs/informes/INFORME-MOD09-DUPLICACION-AGENDAMIENTO-VISITAS-v1.0.md
- [UX visita no realizada](../specs/2026-08-04-mod09-visita-no-realizada-ux-spec.md)
