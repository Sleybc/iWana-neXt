# INFORME MOD09 — Duplicacion de agendamiento en la bandeja de visitas pendientes

**Version:** 1.0
**Fecha:** 2026-08-04
**Autor:** AI-EM-ARCH
**Colaboracion:** AI-SR-FULL (backend), AI-PROD-UX (experiencia)
**Modo activo:** Mixto — auditoria, sin cambios de codigo
**Modulo principal:** MOD09 Programacion / WFM
**Modulos implicados:** MOD10 Service Assurance, MOD11 Ejecucion Operativa, MOD05 CRM
**Superficie:** `/dashboard/scheduling/pending-visits` (apps/portal)
**ADR resultante:** docs/adrs/ADR-076-Unicidad-Trabajo-Campo-Activo-Por-Origen.md
**Spec resultante:** docs/specs/2026-08-04-mod09-antiduplicacion-visitas-ux-spec.md

---

## 1. Motivo

La operacion reporto que la bandeja de visitas pendientes permite agendar dos veces el
mismo trabajo real. Caso concreto: una instalacion despachada dos veces.

Este informe documenta el comportamiento observado, la causa raiz, los vectores
verificados y el estado de la cobertura de pruebas. No se modifico codigo.

---

## 2. Veredicto

El defecto **no es un doble clic ni una carrera de interfaz**. Agendar dos veces la
*misma* solicitud si es idempotente
(`apps/api/src/modules/wfm/services/visit-requests.service.ts:578`). El duplicado
ocurre un nivel mas arriba: **se crean dos solicitudes distintas para la misma unidad
de trabajo**, y ninguna capa del sistema las relaciona.

Es un hueco de modelo, no un bug puntual: la unicidad del trabajo de campo se anclo en
`visit_requests`, un artefacto **previo** a la agenda, que abandona el predicado de
unicidad justo cuando el trabajo empieza a existir.

### Contraste con el contrato vigente (ADR-039)

| Regla ADR-039 | Estado | Evidencia |
| --- | --- | --- |
| Regla 5 — agendamiento idempotente frente a doble submit | **Incumplida** | Idempotencia logica sin lock ni clave; se rompe bajo concurrencia real (V5) |
| Regla 6 — solicitud terminal no genera otro evento activo | **Cumplida en la letra, incumplida en la intencion** | La *misma* solicitud no duplica; una solicitud **nueva** del mismo origen si |

---

## 3. Causa raiz

`apps/api/src/modules/wfm/services/visit-requests.service.ts:66-71` trata `SCHEDULED`
como estado terminal, y el indice unico parcial replica la exclusion:

```sql
-- packages/database/src/migrations/tenant/035_harden_visit_requests_indexes.ts:23-28
CREATE UNIQUE INDEX IF NOT EXISTS "idx_visit_requests_active_origin_unique"
ON "visit_requests" ("tenant_id", "origin_context", "origin_ref", "work_type")
WHERE "origin_ref" IS NOT NULL
  AND "deleted_at" IS NULL
  AND "status" NOT IN ('SCHEDULED', 'CANCELLED', 'REJECTED', 'EXPIRED')
```

Traducido a producto: **en cuanto la instalacion queda agendada, el sistema vuelve a
considerar que ese expediente no tiene ninguna solicitud activa.**

La exclusion de `SCHEDULED` no es un error de escritura: es consecuencia inevitable de
anclar la unicidad en la tabla equivocada. Si `SCHEDULED` entrara en el predicado,
jamas podria existir una reinstalacion ni una segunda visita legitima.

Ademas, `origin_ref IS NULL` deja el trabajo manual e interno fuera de toda
deduplicacion, tanto en base como en servicio
(`visit-requests.service.ts:1085-1087` retorna `null` sin consultar).

---

## 4. Vectores verificados

### V1 — CRITICO · CTA "Coordinar visita" del expediente CRM, sin guarda

Existe una **asimetria real** entre las dos rutas de creacion desde CRM:

- `apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx:526-542` — la
  ruta de bootstrap `?expedienteId=` **si** consulta `wfmApi.events.list({ expedienteId })`
  y bloquea con el mensaje *"Este expediente ya tiene un evento activo en Programacion"*.
- `apps/portal/src/components/scheduling/visit-request-origin-orchestration.ts:39-77` —
  `createCrmVisitRequestAndRoute`, que es **el CTA que el asesor usa a diario**, no
  tiene esa verificacion.

La guarda existe, esta escrita, y esta solo en el camino que casi nadie usa. Ademas es
de cliente: evadible con una llamada directa a la API y sin proteccion frente a
concurrencia.

### V2 — CRITICO · Fallo silencioso del sync de expediente

El unico freno indirecto es que el CTA se oculta cuando el expediente pasa a
`INSTALACION_AGENDADA`. Esa transicion es best-effort y su fallo se degrada a texto
**dentro del mensaje de exito**:

`apps/portal/src/components/scheduling/scheduling-visit-request-sync.ts:58-70`

El operador lee un mensaje que empieza por "quedo agendada correctamente", el CTA
reaparece habilitado y sin marca alguna, y vuelve a pulsarlo. Cualquier retroceso
manual de pipeline reproduce el mismo estado.

### V3 — ALTO · `DELETE /wfm/events/:id` es un callejon sin salida que fuerza el duplicado

`apps/api/src/modules/wfm/services/schedule-events.service.ts:657-669` solo hace
`softDelete` del evento. No toca la `VisitRequest`, ni la `WorkOrder`, ni la orden de
ejecucion MOD11.

Estado resultante:

- La solicitud queda `SCHEDULED` apuntando a un evento borrado.
- Reagendarla es imposible: `visit-requests.service.ts:578-580` hace retorno temprano y
  responde exito sin crear nada — el operador lo interpreta como fallo de la interfaz.
- Cancelarla es imposible: `visit-requests.service.ts:814-816` rechaza cancelar una
  solicitud agendada.
- **Unica salida operativa: volver al expediente y pulsar el CTA otra vez** (V1), con
  la orden anterior todavia activa.

Es la hipotesis principal sobre el incidente reportado si el operador intento "borrar
y rehacer".

### V4 — ALTO · `moveToPending` deja ordenes vivas y duplica al reagendar

`apps/api/src/modules/wfm/services/schedule-events.service.ts:551-601`: desvincula la
`WorkOrder` del evento pero **no la cancela**, y **no cancela la orden de ejecucion**,
que queda activa apuntando a un evento borrado.

Al reagendar, `visit-requests.service.ts:683-722` invoca el puerto con el **nuevo**
`scheduleEventId`. La idempotencia de MOD11 es estrictamente por evento
(`uq_execution_orders_tenant_schedule_event`), de modo que se crea una segunda orden de
ejecucion; y `visit-requests.service.ts:660-681` crea ademas una segunda `WorkOrder`.

Contradice ADR-068 §63 ("cancelar antes de iniciar cancela la OT").

### V5 — MEDIO-ALTO · Carrera de doble submit en `scheduleVisitRequest`

`visit-requests.service.ts:568-570` lee sin `FOR UPDATE`. Bajo READ COMMITTED
—`packages/database/src/data-source.ts:204` inicia transaccion sin nivel explicito—
ninguna transaccion ve el `ScheduleEvent` no comprometido de la otra, de modo que
**ambas pasan la deteccion de conflicto**.

Los advisory locks existentes no salvan el caso: se toman *despues* del `save` del
evento y su clave es `(tenant, fecha)` para proteger el consecutivo, no la unicidad de
negocio. Serializan sin deduplicar.

Resultado: dos eventos, dos ordenes de trabajo, dos ordenes de ejecucion y **tecnico
doble-agendado en la misma franja**.

### V6 — MEDIO · Origenes sin `origin_ref` sin control alguno

Confirmado en servicio y en base. Ademas `origin_ref` es `VARCHAR(160)` sin
normalizacion: `"abc"` y `" abc"` no colisionan.

### V7 — MEDIO · La clave incluye `work_type` y `origin_context`

La misma instalacion real se duplica cambiando cualquiera de los dos: CRM/`INSTALLATION`
frente a TASKS sobre el mismo trabajo fisico, o frente a CRM/`TECHNICAL_VISIT` creada a
mano desde la bandeja. Ninguna guarda cruza contextos ni tipos.

### V8 — NUEVO · Visita viva para un ticket ya resuelto por canal remoto

Detectado tras precisar el dominio con el CTO (2026-08-04): un ticket puede resolverse
por WhatsApp, correo o telefono. El modelo ya lo representa con `TicketFieldDecision`
(`NOT_REQUIRED` / `NEEDS_DIAGNOSIS` / `FIELD_SERVICE_REQUIRED`).

No existe ningun mecanismo que cierre la solicitud de visita cuando el ticket vuelve a
`NOT_REQUIRED` o se cierra sin visita. La solicitud **sigue viva en la bandeja**,
alguien la agenda, y se despacha una cuadrilla a un trabajo que ya no existe.

Ademas, `apps/api/src/modules/assurance/services/tickets.service.ts:613-621` crea un
`TicketWorkOrderLink` **append-only en cada llamada**, sin verificar si ya existe un
vinculo vivo. La unica proteccion es el filtro de estado de
`tickets.service.ts:607-611`, que se evade en cuanto el ticket regresa a `IN_PROGRESS`.

### V9 — Observacion colateral (fuera de alcance)

`apps/api/src/modules/assurance/services/tickets.service.ts:727-734` — el `findOne` de
`findOrCreateInstallationTicket` no filtra por `tenant_id`; depende exclusivamente del
`search_path`. El aislamiento por schema lo cubre hoy, pero se desvia de la disciplina
del resto del repositorio. Merece correccion independiente.

---

## 5. Ausencia de garantia en el modelo de datos

Ninguna tabla del flujo impide un segundo trabajo activo para la misma unidad de origen:

| Tabla | Restricciones reales | ¿Impide segundo trabajo activo? |
| --- | --- | --- |
| `schedule_events` | indices por tenant/fecha/asignado/expediente/ticket, **todos no unicos** | **No** |
| `work_orders` | `uq_work_orders_tenant_code` | No — protege el consecutivo |
| `execution_orders` | `uq_execution_orders_tenant_number`, `uq_execution_orders_tenant_schedule_event` | **No** — impide dos ordenes para el **mismo evento**, no dos eventos para el mismo trabajo. `visit_request_id` sin indice ni unicidad |
| `visit_requests` | `idx_visit_requests_active_origin_unique` con las exclusiones descritas | Solo entre solicitudes pendientes |

La unica guarda de dominio en ejecucion es el solape horario por tecnico
(`schedule-conflict.service.ts:37-53`): dos tecnicos distintos, o el mismo tecnico en
franjas distintas, pasan sin obstaculo.

`execution_order_idempotency_records` cubre unicamente comandos de ejecucion; **la
creacion desde agenda no pasa por ese mecanismo**.

---

## 6. Aislamiento transaccional

`packages/database/src/data-source.ts:192-217`. `startTransaction()` se invoca sin
nivel explicito, luego hereda **READ COMMITTED**.

Garantiza atomicidad, rollback y `SET LOCAL search_path` compatible con pgBouncer. No
garantiza ningun bloqueo de lectura.

No hay perdida de actualizacion sobre la fila de `visit_requests` (el `UPDATE` final
toma lock de fila), pero si **insercion duplicada de filas nuevas** en
`schedule_events`, `work_orders` y `execution_orders`, que READ COMMITTED no puede
prevenir por definicion: no existe predicado bloqueado sobre filas que aun no existen.

Elevar a SERIALIZABLE se descarta (ver ADR-076 A4). La solucion correcta es un punto de
serializacion explicito.

---

## 7. Informacion ausente en la superficie

| Punto de decision | Archivo | Que falta |
| --- | --- | --- |
| Fila de la bandeja | `PendingVisitRequestInbox.tsx:461-465`, `:471-481` (movil `:207-218`) | Ninguna señal de que ese cliente o nodo ya tiene trabajo de campo activo |
| Dialogo de confirmacion | `ScheduleVisitRequestConfirmDialog.tsx:121-130` | El contenedor de "Advertencias operativas" **ya existe** y solo se alimenta de riesgos de franja; nunca de riesgos de origen |
| Panel de despacho | `PendingVisitRequestDetailPanel.tsx:184-214` | Estado del origen; la unica pista (`:433-441`) aparece *despues* de agendar |
| CTA del expediente | `ExpedienteSchedulingActions.tsx:8-45` | No recibe nada sobre visitas existentes; `isSubmitting` protege milisegundos, no dias |
| Filtros de la bandeja | `pending-visits-ui.ts:14-22` | No hay eje "ya tiene trabajo activo"; `ListWfmVisitRequestsParams` no admite `expedienteId` ni `subscriberId` |

Hallazgo colateral: el estado vacio de `PendingVisitRequestInbox.tsx:403-406` es unico y
se muestra tanto para "primera vez" como para "sin resultados al filtrar".

---

## 8. Cobertura de pruebas

### Existente y que prueba realmente

- `visit-requests.service.spec.ts:313-357` — "retorna el duplicado activo cuando el
  indice unico detecta carrera": prueba **solo el manejo del error 23505 con el driver
  simulado**. El indice real nunca se ejecuta; el predicado nunca se valida.
- `tests/visit-requests.controller.http.spec.ts:356-384`, `:609-629` — contrato HTTP con
  servicio simulado.
- `schedule-events.service.spec.ts:615-681` — **el mas problematico**: afirma que
  `moveToPending` conserva `workOrderId` y borra el evento. **Congela el comportamiento
  defectuoso de V4 como si fuera el contrato**, y no comprueba nada sobre la orden de
  ejecucion. Cualquier correccion lo rompera, y eso es correcto.
- `091_execution_order_schedule_unique.spec.ts` — verifica el **texto SQL** del indice,
  no su efecto.
- **No existe ningun spec** para `035_harden_visit_requests_indexes.ts`.

### Escenarios ausentes

1. Integracion contra PostgreSQL real: crear solicitud CRM/`INSTALLATION`, agendar, crear
   otra identica. Hoy pasa limpiamente.
2. Concurrencia: dos agendamientos simultaneos sobre la misma solicitud → exactamente un
   evento, una orden de trabajo, una orden de ejecucion, y tecnico no doble-agendado.
3. `moveToPending` → reagendar: no mas de una orden activa; ninguna orden huerfana.
4. `DELETE /wfm/events/:id` sobre evento originado en solicitud: estado resultante de
   solicitud, orden de trabajo y orden de ejecucion. Hoy indefinido y sin test.
5. Predicado del indice contra base real, incluida su inaplicabilidad tras `SCHEDULED`.
6. `origin_ref: null`: comportamiento esperado por decidir y fijar.
7. **No regresion de trabajo legitimo** (prioritario, debe escribirse **antes** de
   cualquier guarda): reinstalar tras cancelar; dos tickets simultaneos del mismo
   suscriptor; dos tickets sobre el mismo nodo.
8. Ticket resuelto por canal remoto (V8): la solicitud de visita no debe quedar viva.
9. E2E de portal: doble activacion del CTA del expediente; navegacion atras y reintento
   tras agendar.

---

## 9. Conclusion

Cuatro rutas independientes (V1, V3, V4, V5) desembocan en el mismo estado final: dos
eventos de agenda, dos ordenes de trabajo y dos ordenes de ejecucion para un solo
trabajo real. V3 es ademas un callejon sin salida que **empuja activamente** al operador
hacia V1. V8 aporta una quinta via de desperdicio operativo: visita viva para un trabajo
ya resuelto por canal remoto.

Ninguna de las tres tablas implicadas tiene restriccion que lo impida, y READ COMMITTED
sin bloqueos no puede cerrar el caso concurrente.

La decision arquitectonica resultante queda registrada en
`docs/adrs/ADR-076-Unicidad-Trabajo-Campo-Activo-Por-Origen.md`, y el contrato de
experiencia en `docs/specs/2026-08-04-mod09-antiduplicacion-visitas-ux-spec.md`.

---

## 10. Referencias

- AGENTS.md
- docs/adrs/ADR-039-Bandeja-Visitas-Pendientes-WFM.md
- docs/adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md
- docs/adrs/ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md
- docs/adrs/ADR-076-Unicidad-Trabajo-Campo-Activo-Por-Origen.md
- docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md
- docs/specs/SPEC-WFM-PENDING-VISITS-ACTO-OPERATIVO-v1.0.md
- docs/specs/2026-08-04-mod09-antiduplicacion-visitas-ux-spec.md
