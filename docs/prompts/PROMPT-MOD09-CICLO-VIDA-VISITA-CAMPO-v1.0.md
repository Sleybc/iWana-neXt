# PLAN DE EJECUCIÓN ÚNICO — Ciclo de vida del trabajo de campo (unicidad + no realización)

**Módulos:** MOD09 Programación / WFM · MOD11 Ejecución Operativa · MOD10 Assurance · MOD05 CRM
**Código:** MOD09-CICLO-VISITA
**Versión:** 1.0
**Fecha:** 2026-08-04
**Generado por:** AI-EM-ARCH (modo Architect + Orchestrator)
**Agentes destinatarios:** AI-SR-FULL (backend + worker), AI-FE-PLATFORM (portal)
**Revisor obligatorio:** AI-SR-QA
**Consulta:** AI-PROD-UX (copy y estados), AI-DS-OWNER (solo si falta variante de componente)
**ADRs habilitantes:** [ADR-076](../adrs/ADR-076-Unicidad-Trabajo-Campo-Activo-Por-Origen.md) · [ADR-077](../adrs/ADR-077-Ciclo-Vida-Visita-No-Realizada.md)
**Specs de experiencia:** [antiduplicación](../specs/2026-08-04-mod09-antiduplicacion-visitas-ux-spec.md) · [visita no realizada](../specs/2026-08-04-mod09-visita-no-realizada-ux-spec.md)
**Informe de origen:** [INFORME-MOD09-DUPLICACION-AGENDAMIENTO-VISITAS-v1.0.md](../informes/INFORME-MOD09-DUPLICACION-AGENDAMIENTO-VISITAS-v1.0.md)

> **Sustituye a** `PROMPT-MOD09-ANTIDUPLICACION-VISITAS-v1.0.md` y
> `PROMPT-MOD09-VISITA-NO-REALIZADA-v1.0.md`, retirados el 2026-08-04 por decisión del
> CTO. Los ADRs y specs de ambos siguen plenamente vigentes: lo que se unifica es el
> plan, no las decisiones.

---

## 0. Por qué un solo plan

Las dos fases comparten superficie, tablas, tests y — sobre todo — **una dependencia
cruzada que las hace inseparables**:

- Si la guarda de unicidad de ADR-076 entra **antes** de que
  `REQUIRES_RESCHEDULE` sea agendable (ADR-077 D3), el operador queda
  bloqueado por partida doble: no puede reagendar la visita que volvió por no realizarse,
  y la guarda le impide crear una nueva. La operación se detiene.
- Si el ciclo de no realización entra **sin** la guarda, cada visita fallida sigue
  empujando al operador a duplicar desde el origen, que es el vector V1 del informe.

Ejecutarlas por separado, en cualquier orden, produce un intervalo con la operación peor
que hoy. Por eso el plan es uno.

---

## 1. Contexto (ya diagnosticado — no repetir el análisis)

Todo el diagnóstico está en el informe de origen y en el §Contexto de ambos ADRs. **No lo
rehagas.** El resumen ejecutable:

| Ref | Problema | Evidencia |
| --- | --- | --- |
| V1 | El CTA de "coordinar visita" del expediente no verifica trabajo activo; la guarda existe **solo** en la ruta de bootstrap | `visit-request-origin-orchestration.ts:39-77` vs. `PendingVisitRequestsView.tsx:526-542` |
| V2 | El sync del expediente falla en silencio dentro de un mensaje de éxito | `scheduling-visit-request-sync.ts:58-70` |
| V3 | `DELETE /wfm/events/:id` deja la solicitud sin salida y empuja a duplicar | `schedule-events.service.ts:657-669` |
| V4 | `moveToPending` deja órdenes vivas y duplica al reagendar | `schedule-events.service.ts:551-601` |
| V5 | Carrera de doble submit bajo READ COMMITTED | `visit-requests.service.ts:568-570`, `data-source.ts:204` |
| V6 | `origin_ref` nulo o sin normalizar queda fuera de toda deduplicación | `visit-requests.service.ts:1085-1087` |
| V8 | Visita viva para un caso resuelto por canal remoto | `tickets.service.ts:613-621` |
| H1 | `REQUIRES_RESCHEDULE` no se puede agendar ni corregir | `visit-requests.service.ts:590`, `:1139-1146`, `:395-403` |
| H2 | Nadie barre los eventos vencidos sin cierre; `EXPIRED` nunca se asigna | `scheduler.service.ts` |
| H3 | El intento fallido no deja rastro | `schedule-events.service.ts:597` |

**Decisiones de negocio ya tomadas** (no las reabras): eje de unicidad por unidad de
origen —expediente o ticket, nunca el suscriptor ni el nodo—; máximo 3 intentos
imputables al cliente; clasificación en dos niveles; política de SLA de
ADR-077 D5; ampliación de `ExecutionOrderSchedulingPort` aprobada.

---

## 2. Punto de diseño que solo aparece al fusionar

**Reprogramar no es lo mismo que fallar, aunque hoy ambos pasen por `moveToPending`.**

ADR-076 D7 pide conservar el mismo `scheduleEventId` al devolver a
pendientes. ADR-077 D6 pide conservar el evento fallido con estado terminal.
No se contradicen: describen **dos casos distintos** que el código actual mezcla.

| Caso | Qué pasó | Evento | Orden de ejecución | Intento |
| --- | --- | --- | --- | --- |
| **Reprogramación planificada** | Se cambia la cita antes de que nadie se desplace | **Se conserva el mismo evento** y se mueve | Se conserva | **No cuenta** |
| **Intento fallido** | Hubo desplazamiento o la franja venció sin ejecutar | Se cierra en estado terminal (`NO_SHOW` si la causa es del cliente, `CANCELLED` si es de la operación) | Se cierra como no ejecutada | **Cuenta si la causa es del cliente** |

**El discriminador es si hubo intento, no la fecha.** Una visita movida el día anterior
por acuerdo con el cliente es reprogramación; una visita que el técnico fue a hacer y no
pudo es intento fallido, aunque se reagende para esa misma tarde.

Implementarlos como un único camino —lo que hoy ocurre— es la raíz de H3 y de parte de
V4. **Sepáralos explícitamente en el modelo y en la UI.** Si no ves cómo distinguirlos en
algún flujo concreto, detente y consúltalo antes de elegir por defecto.

---

## 3. Fases y puertas

Cada fase tiene una puerta. **No se abre la siguiente sin cerrar la anterior.**

### Fase 0 — Red de seguridad · AI-SR-QA

Tests que se escriben y pasan **antes de tocar código de producción**. Sin esta red, tanto
la guarda como el ciclo de intentos pueden romper trabajo legítimo sin que nadie lo note.

| # | Escenario |
| --- | --- |
| F0.1 | Reinstalar tras cancelar sigue siendo posible |
| F0.2 | Dos tickets simultáneos del mismo suscriptor generan dos visitas sin bloqueo |
| F0.3 | Dos tickets sobre el mismo nodo generan dos trabajos sin bloqueo |
| F0.4 | Un trabajo manual sin ticket no queda bloqueado |
| F0.5 | La matriz de convergencia de ADR-068 sigue produciendo los mismos estados para ejecutada, cancelada y requiere seguimiento |
| F0.6 | Una visita ejecutada normalmente no entra en ninguno de los flujos nuevos |

**Puerta 0:** los seis tests en verde contra el comportamiento actual, con `Cached: 0`.

---

### Fase 1 — Desbloquear y cerrar ciclos · AI-SR-FULL

Va primero porque **sin ella cualquier guarda deja al operador sin salida**.

| # | Alcance | Cierra |
| --- | --- | --- |
| F1.1 | `REQUIRES_RESCHEDULE` agendable y corregible, conservando la marca de reintento | H1 |
| F1.2 | Cancelar evento deja solicitud reprogramable y cancela orden de trabajo y de ejecución | V3 |
| F1.3 | Separar reprogramación planificada de intento fallido (§2), conservando el evento en el primer caso y cerrándolo en terminal en el segundo | V4, H3 |
| F1.4 | Ampliar `ExecutionOrderSchedulingPort` con cancelación desde agenda | V3, V4 |

**Puerta 1:** ninguna ruta de la UI deja a la solicitud en estado sin salida. Test que
recorra cancelar → reagendar y mover a pendientes → reagendar sin producir huérfanos.

---

### Fase 2 — Causa, intentos y SLA · AI-SR-FULL

| # | Alcance |
| --- | --- |
| F2.1 | Taxonomía de causa de no realización y su persistencia (ADR-077 D1) |
| F2.2 | Doble clasificación: la del técnico se conserva, la del coordinador es autoritativa |
| F2.3 | Contador de intentos, incrementado **solo** por causas de cliente |
| F2.4 | Política de SLA por causa: pausa / corre / cierra. **Sin reinicio en ninguna ruta** |
| F2.5 | La pausa de SLA exige evidencia del intento; sin evidencia, el reloj sigue |
| F2.6 | Al tercer intento imputable al cliente, se exige decisión explícita. **Prohibida la cancelación automática** |

**Puerta 2:** test que demuestre que el SLA no se reinicia en ninguna ruta, y que las
causas de operación y fuerza mayor no consumen intento.

---

### Fase 3 — Guarda de unicidad · AI-SR-FULL

Ahora sí, con el ciclo de vida cerrado detrás.

| # | Alcance | Cierra |
| --- | --- | --- |
| F3.1 | Guarda de dominio por unidad de origen en creación y agendamiento, con `pg_advisory_xact_lock` **al inicio** de la transacción, respondiendo `409` con referencia operativa | V1, V5 |
| F3.2 | Bloqueo pesimista en `scheduleVisitRequest` | V5 |
| F3.3 | Marca explícita de visita adicional con motivo obligatorio, persistido y auditado | — |
| F3.4 | Normalización (`trim`) de `origin_ref` en persistencia y comparación | V6 |
| F3.5 | **Reagendar tras no ejecución no activa la guarda** (ADR-077 D8) | — |

**Puerta 3:** los seis tests de la Fase 0 siguen en verde, más test de concurrencia
(exactamente un evento, una orden de trabajo, una orden de ejecución, técnico no
doble-agendado) y test de F3.5.

---

### Fase 4 — Hacer visible el silencio · AI-SR-FULL

| # | Alcance | Cierra |
| --- | --- | --- |
| F4.1 | Job repetible que detecta eventos vencidos sin cierre, los marca y **no decide nada** | H2 |
| F4.2 | Retiro de la solicitud cuando el caso se resuelve sin visita, por puerto MOD10 → MOD09 | V8 |
| F4.3 | `requestFieldService` idempotente respecto a vínculos de campo vivos | V8 |

**Puerta 4:** el barrido es idempotente, respeta el timezone del tenant, no toca eventos
futuros ni cerrados, y no altera destino, intentos ni SLA.

---

### Fase 5 — Portal · AI-FE-PLATFORM

En este orden, porque cada uno depende del anterior para tener datos que mostrar:

| # | Alcance | Spec |
| --- | --- | --- |
| F5.1 | La solicitud que vuelve, en la bandeja: chips de reintento, orden por causa | no realizada §5 |
| F5.2 | Cierre en campo con causa obligatoria y evidencia condicional | no realizada §3 |
| F5.3 | CTA de origen consciente del estado | antiduplicación §4 |
| F5.4 | Advertencia de colisión al confirmar, con salida justificada | antiduplicación §5 |
| F5.5 | Vista de revisión "Visitas sin realizar" | no realizada §4 |
| F5.6 | Historial de intentos en el detalle | no realizada §6 |
| F5.7 | Aviso de intentos agotados, sin acción por defecto | no realizada §7 |

**Puerta 5:** los criterios de aceptación de ambas specs, verificados en navegador a
375 px y escritorio, claro y oscuro.

---

### Fuera de este plan (endurecimiento diferido)

- **Índice único sobre `schedule_events`** (ADR-076 D2.3): condicionado a que
  las fases 1 a 4 estén en producción y exista migración de limpieza por tenant. Un
  `CREATE UNIQUE INDEX` contra datos con duplicados falla, y `CONCURRENTLY` es
  incompatible con el envoltorio transaccional de `runInTenantSchema`.
- Indicador derivado en el listado, filtro "trabajo activo", bloque de trabajos
  relacionados (antiduplicación §6, §7, §9): exigen ampliar el contrato de listado.
- Métricas y tableros de causa raíz. Este plan **captura** el dato; explotarlo es fase
  aparte.

---

## 4. Restricciones duras (aplican a todas las fases)

1. **El sistema no decide.** Ni el barrido, ni el agotamiento de intentos, ni la guarda
   pueden cancelar, cerrar ni reagendar trabajo por su cuenta.
2. **El SLA nunca se reinicia**, y la pausa exige evidencia.
3. **Las causas de operación y fuerza mayor no consumen intento.**
4. **La clasificación del técnico no se sobrescribe**: reclasificar añade.
5. **Prohibido ampliar la clave de unicidad** con `subscriber_id`, `contract_id` o
   `subject_ref_id` (ADR-076 regla 1).
6. **Toda guarda vive en el servidor.** La verificación de cliente es experiencia, no
   control: el `409` debe producirse aunque el cliente la omita.
7. **Boundaries.** Solo tablas propias; comunicación por eventos y puertos aprobados
   (ADR-037, ADR-047).
8. **Nada de UUID como información principal** en texto visible (ADR-039 regla 7).
9. **El técnico no ve información comercial ni de SLA**, aunque el contrato la exponga.
10. Multi-tenant: tenant desde contexto aprobado, `SET LOCAL search_path` por transacción,
    timezone del tenant para toda decisión temporal.
11. Migraciones tenant reversibles, con `down` funcional y numeración correlativa.

---

## 5. Trampas conocidas de este código

- `schedule-events.service.spec.ts:615-681` **congela el comportamiento defectuoso de
  `moveToPending` como si fuera el contrato**. Romperá en F1.3. Es correcto: reescríbelo,
  no lo adaptes para que siga pasando.
- `visit-requests.service.spec.ts:313-357` prueba solo el manejo del `23505` con driver
  simulado. El índice real nunca se ejecuta: no es evidencia de que la deduplicación
  funcione.
- La matriz de ADR-068 vive en **SQL crudo dentro del worker**
  (`execution-order-events.processor.ts:340-395`), no en el servicio. Es parte del
  contrato: si añades estados o causas, hay que tocarla ahí.
- El worker no comparte `AsyncLocalStorage` con la API: el tenant viaja explícito en el
  payload del job.
- `scheduler.service.ts` registra los repetibles al arrancar. `jobId` estable obligatorio o
  BullMQ acumulará repeticiones en cada reinicio — patrón correcto en
  `execution-order-tombstone.processor.ts:34`.
- Los advisory locks existentes (`work-orders.service.ts:77`) usan clave `(tenant, fecha)`
  para proteger el consecutivo y se toman **después** del `save` del evento. No los
  reutilices: necesitas clave por unidad de origen y tomada al inicio.
- `getEffectiveVisitRequestStatus` deriva estado **de la completitud de contexto**. Al
  hacer agendable `REQUIRES_RESCHEDULE`, no lo mezcles con esa derivación: una solicitud
  que vuelve puede tener dirección incompleta, y eso es un caso distinto de "ya se
  intentó".
- La idempotencia de MOD11 es **por `scheduleEventId`**; `execution_order_idempotency_records`
  cubre comandos de ejecución, **no** la creación desde agenda.
- `runInTenantSchema` abre transacción sin nivel explícito: READ COMMITTED. No lo resuelvas
  elevando el aislamiento (ADR-076 A4).
- La primera ejecución del barrido en un tenant con historial puede producir un volumen
  alto de vencidos. Anticípalo: no proceses todo en una tanda.
- El contenedor de "Advertencias operativas" de `ScheduleVisitRequestConfirmDialog.tsx:121-130`
  ya existe y duplica `PortalAlert` con clases `amber` locales. Consolídalo en F5.4 en
  lugar de añadir un tercer patrón.

---

## 6. Evidencia obligatoria de cierre

- Salida de tests con `Cached: 0` visible en los paquetes tocados. Un `pnpm test` verde
  desde caché de turbo **no es evidencia**.
- Los seis tests de la Fase 0, nombrados explícitamente, en verde al final del plan.
- Test de concurrencia con su aserción de conteo.
- Test de que el SLA no se reinicia en ninguna ruta.
- Test de que reagendar tras no ejecución no activa la guarda.
- Traza del `409` con su cuerpo de respuesta.
- Verificación en navegador de F5.2 a 375 px con una mano, y de F5.3–F5.5 en escritorio.
- Cobertura ≥80% en los servicios tocados; OpenAPI actualizado; gates G6.5 de
  [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md).
- Actualización del informe de origen con el estado de cada vector (V1–V8) y hueco
  (H1–H3): cerrado / diferido / abierto.

---

## 7. Cuándo detenerte y consultar

Detente y escala a AI-EM-ARCH si:

- No ves cómo distinguir reprogramación planificada de intento fallido en algún flujo
  concreto (§2). **No elijas por defecto.**
- Concluyes que algo necesita una acción automática que cancele o cierre trabajo.
- La guarda necesita leer tablas de otro bounded context.
- El eje de unicidad por unidad de origen produce falsos positivos sobre un caso operativo
  real no previsto.
- La taxonomía de causa resulta insuficiente: **se amplía por ADR, no por criterio de
  implementación**.
- La política de SLA entra en conflicto con una obligación regulatoria concreta (PQR/CRC).
- Detectas duplicados preexistentes en datos que impidan avanzar sin migración de limpieza.

No inventes causas, vocabulario visible, tokens ni variantes de componente: se solicitan a
AI-PROD-UX y AI-DS-OWNER.
