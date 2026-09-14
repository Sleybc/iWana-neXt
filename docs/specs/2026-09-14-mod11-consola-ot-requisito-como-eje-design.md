# Diseño — MOD11: el requisito como eje de la consola de OT de ejecución

**Versión:** 1.1
**Estado:** **Aprobado por el CTO (2026-09-14)** — contratos de §7 congelados desde esta aprobación.
**Fecha:** 2026-09-14
**Cambio v1.0 → v1.1 (2026-09-14), en el mismo acto de aprobación:**
1. **El punto 7 de la auditoría —subsanación del dato o documento faltante de Oportunidades— queda FUERA DE ALCANCE por decisión del CTO.** Se retira la Ola 3 completa y la escalación E1. El diagnóstico técnico que lo sustentaba se conserva como deuda registrada (§5, §10.9), no como trabajo planificado.
2. **E2 aprobada:** ampliación aditiva opcional del contrato con bump de v1 a v1.1 (§7).
3. **E3 retirada por improcedente**, no por decisión: [ADR-080](../adrs/ADR-080-Dependencia-Descubierta-y-Cierre-En-Construccion.md) §5 la disuelve (§9).
**Modo activo:** Mixto (Product Architect + Architect + EM)
**Autor:** AI-EM-ARCH
**Origen:** auditoría de la OT `OTE-20260828-001` sobre `/dashboard/operations/execution-orders?executionOrderId=…` (2026-09-14). Siete observaciones de usuario, verificadas una a una contra el código.

**Trazabilidad principal:** `docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md` (v1.2, En revisión)
**HLD relacionado:** `docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md` (v1.1, En revisión)
**Spec antecesora vigente:** `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` (v1.1, Aprobado) — esta spec **no la supera**. Aquella dejó `ExecutionOrderDrawer.tsx` deliberadamente sin tocar (§4.5, *"No se mueven: ExecutionOrderDrawer.tsx (87 KB) y su spec"*); esta interviene exactamente esa superficie.
**ADRs relacionados:** ADR-046 (Aprobado), ADR-047 (Aprobado), ADR-065 (Aprobado v1.2), ADR-066 (Aprobado), ADR-067 (Aprobado), ADR-068 (Aprobado), ADR-083 (Aprobado), ADR-034 y ADR-035 (Aprobados, almacenamiento)
**Plan de orquestación:** `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md`

---

## 1. Objetivo

Convertir la consola de la OT de ejecución de una **superficie organizada por estructura de datos** en una **superficie organizada por requisito de trabajo**, y cerrar en el camino cuatro defectos funcionales verificados que hoy hacen que la pantalla afirme cosas falsas sobre su propio estado.

## 2. Problema a resolver

Siete observaciones de usuario. La verificación en código muestra **tres causas**, y que la mayor parte del trabajo no es construir capacidades nuevas sino **dejar de descartar información que el backend ya calcula**.

### 2.1 Causa A — El backend sabe lo que la pantalla no muestra

Cuatro defectos, todos de mapeo, ninguno de capacidad ausente.

**A1 · El responsable existe y la pantalla lo niega.** `GET :id` construye el assignee sin resolver la etiqueta (`apps/api/src/modules/tasks/execution-orders.controller.ts:248-250`): emite `{ type: 'TECHNICIAN', id }` y nada más.

El contrato **sí declara** `displayLabel` (`packages/shared/src/contracts/operations/execution-orders.ts:54-58`) y el **listado sí lo resuelve**, con lookup batch por página (`execution-orders.service.ts:2443-2453`, vía `resolveAssigneeLabels`, `:619-634`). El portal hace `order.assignee?.displayLabel ?? 'Sin responsable asignado'` (`ExecutionOrderSummary.tsx:200-204`).

Resultado: la bandeja muestra el nombre y el detalle muestra "Sin responsable asignado" **sobre la misma OT**. La captura de la auditoría lo prueba por partida doble: dice "Sin responsable asignado" arriba y "Solo el técnico **asignado**" abajo — el assignee existe, le falta el nombre.

**A2 · La rama CREW no existe en el detalle.** El ternario de `:248-250` no contempla `assignedCrewId`. Una OT de cuadrilla omite `assignee` entero, y el portal la declara sin responsable. El listado tampoco emite `displayLabel` para CREW (`:2452`).

**A3 · La alerta de inicio aparece sobre órdenes ya iniciadas.** La condición de render es `canInteract && !terminal && !canStart && status !== BLOCKED` (`apps/portal/src/components/operations/ExecutionOrderDrawer.tsx:911-914`).

En `IN_PROGRESS`, `computeAllowedActions` emite `REGISTER_*`, `BLOCK` y `CLOSE` pero nunca `START` (`execution-orders.service.ts:2030-2038`), luego `canStart` es falso y la alerta se pinta. **La condición confunde "no puedes iniciar" con "no necesitas iniciar".**

El copy agrava el defecto en dos frentes más:

- Invoca la sincronización ("cuando la orden está sincronizada"), pero `start()` **no valida `syncState`** en ningún punto (`:815-870`). Y cuando la orden no está sincronizada, `canInteract` es falso y la alerta ni siquiera se renderiza: el mensaje describe un caso que nunca puede verse.
- Un supervisor **jamás** recibe `START` por diseño — la condición es `(isAssigned && !isSupervisor)` (`:2022`) — así que ADMIN, NOC y SUPPORT ven permanentemente un texto que les habla de un permiso de técnico.

**A4 · El estado por requisito se calcula y se tira.** El evaluador devuelve la evaluación completa (`apps/api/src/modules/tasks/services/closure-gate-evaluator.service.ts:109-115`): junto al agregado emite `allEvaluations`, un `RequirementEvaluation[]` con `requirementId`, `label`, `kind`, `satisfied` y `reason` por cada requisito.

`getCompletion` **descarta `allEvaluations` y `missingRequirements`** y devuelve solo el agregado (`execution-orders.service.ts:296-300`).

Por eso el checklist pinta tres ítems idénticos con badge "Requerido" sin decir cuál ya se cumplió. **Ocupa mucho espacio porque no informa**; no informa porque el dato se descartó tres capas antes de la pantalla.

**A4-bis · Tres kinds de requisito son estructuralmente insatisfacibles.** El contexto que `getCompletion` pasa al evaluador omite `fieldData`, `measurements`, `hasCustomerAcceptance` y `complianceArtifacts` (`:288-295`). Las reglas de `FIELD` (`:140-143`), `MEASUREMENT` (`:150-156`) y `COMPLIANCE` (`:175-182`) leen exactamente esas claves.

Consecuencia: **una plantilla con requisitos FIELD o MEASUREMENT requeridos nunca alcanza el 100 %**, y el progreso no sube al firmar. En `OTE-20260828-001`, el 33,33 % corresponde a la única actividad registrada y no se moverá por capturar la firma.

Agravante de contrato: no existe forma de registrar mediciones. `RegisterFieldWorkSchema` acepta solo `activityType` y `description`, en modo estricto (`dto/execution-orders.dto.ts:71-77`), mientras `RegisterActivityCommand` del contrato declara `measurements` (`shared/contracts/operations/execution-orders.ts:156-165`). **El contrato promete más de lo que el API implementa.**

### 2.2 Causa B — La consola es un formulario de captura disfrazado de expediente

Seis secciones planas, unas 940 líneas de JSX, **ninguna colapsable** (no hay `details`, `Accordion` ni `Disclosure` en todo el archivo), todas montadas siempre, ordenadas por estructura de datos y no por el momento de trabajo.

| Sección | Líneas | Defecto de propósito |
| --- | --- | --- |
| Checklist | `:947-1029` | Lista requisitos sin estado de cumplimiento (A4) |
| Trabajo realizado | `:1031-1289` | Mezcla histórico y formulario de captura; ningún ítem declara qué requisito satisface |
| Equipos y materiales | `:1291-1609` | **Dos** listados de origen distinto —custodia del ejecutor y consumos de la OT— más un formulario de 6 campos |
| Evidencia y conformidad | `:1611-1793` | Ver causa C |
| Cierre | `:1795-2086` | Unas 105 líneas del bloque ADR-077 son inalcanzables desde esta ruta: `ExecutionOrdersClient` no pasa `nonRealizationCauses` |

Además, **toda mutación dispara refetch en abanico**: cada handler llama `refreshExecutionOrder()`, que relanza seis promesas —detalle, tres colecciones paginadas completas, 100 ítems de inventario y 100 ubicaciones— (`use-execution-order-console.ts:302-304`). Registrar una actividad recarga todas las páginas de actividades, consumos y evidencias.

La observación del usuario sobre "Trabajo realizado" —*"el trabajo aún no se ha realizado, no es claro para qué es este contenedor"*— es precisa aunque la OT sí tenga una actividad registrada: **el contenedor no dice qué relación tiene con el checklist que está justo encima.**

### 2.3 Causa C — La OT está amputada de su origen comercial

**C1 · El uploader funciona, pero solo puede alimentar un requisito.** La infraestructura es sólida: multipart real contra el API, `FileInterceptor` con tope de 25 MB, validación de magic bytes, cuarentena, análisis asíncrono en BullMQ, claim atómico por asset y descarga por URL firmada con TTL de 900 s (`execution-orders.controller.ts:447-506`; `media/evidence-asset.provider.ts`; `packages/storage`).

Lo que falla es la selección del destino: se toma el **primer** requisito de tipo `EVIDENCE` de la plantilla y **todos** los archivos se atan a esa misma clave (`ExecutionOrderDrawer.tsx:392-396`). Y el tipo se deriva del MIME: imagen produce `PHOTO`, cualquier otra cosa produce `DOCUMENT` (`use-execution-order-console.ts:581`).

Consecuencia encadenada: el cierre exige una evidencia con `evidenceType` igual a `SIGNATURE` y `requirementKey` igual a `CUSTOMER_SIGNATURE`, pero **el uploader nunca puede producir una**. La firma del cliente es incapturable desde el portal, aunque el checklist la exija como requisito.

**C2 · No hay camino de vuelta a la oportunidad.** `ExecutionOrder` no tiene `expedienteId`, `opportunityId` ni `leadId`. El vínculo con MOD05 existe dos saltos atrás (`ExecutionOrder.visitRequestId` hacia `VisitRequest.expedienteId`, o vía `ScheduleEvent.expedienteId`), y ningún endpoint lo expone.

Hoy, cuando el origen es CRM, el código extrae el código de oportunidad **con una expresión regular sobre una etiqueta de texto libre** (`apps/api/src/modules/wfm/services/visit-requests.service.ts:1273-1274`), duplicada en tres sitios del portal (`PendingVisitRequestsView.tsx:171` y `:211`, `PendingVisitRequestInbox.tsx:121-127`). Ese `originLabel` es un campo de display de 160 caracteres opcional, no una clave.

**Nota de nomenclatura, necesaria para evitar trabajo descarriado:** "Oportunidades" en la UI es el **Expediente Único de MOD05** (`/dashboard/crm/expedientes`, `Sidebar.tsx:91-96`). El submódulo backend `apps/api/src/modules/crm/opportunities/` está montado en el Modulith pero **sin migración que cree su tabla, sin UI y sin ningún consumidor en el api-client**. No es el objeto de esta spec.

## 3. Decisiones de alcance

Tomadas por el usuario el 2026-09-14, en sesión de brainstorming sobre la auditoría.

| # | Decisión | Consecuencia |
| --- | --- | --- |
| **D1** | **Técnico y despachador comparten la misma pantalla** | La consola exige **render por rol sobre un contrato único**. El copy contradictorio de A3 nace precisamente de que la pantalla no sabe a quién le habla. |
| ~~**D2**~~ | ~~Subsanación embebida del dato o documento faltante de la oportunidad~~ — **REVERTIDA por el CTO el 2026-09-14** | El punto 7 sale del alcance. Ver §5. |
| **D3** | **Ola de corrección antes que rediseño** | La Ola 1 produce el contrato del que dependen las Olas 2 y 3. |

**Fuera de alcance por boundary:** la `WorkOrder` ligera de MOD09/WFM sigue siendo proyección transitoria bajo ADR-068 §Decisión 12. El submódulo `crm/opportunities` no se toca ni se repara aquí.

**Fuera de alcance por decisión:** la deuda de gobernanza de MOD11 registrada en la spec v1.1 §10.4 (G7 sin veredicto, ADR-078 sin propagar). Se arrastra sin resolver y condiciona la figura de ejecución — ver §9, E3.

## 4. Diseño

### 4.1 El requisito como unidad universal de trabajo pendiente

Es el eje del rediseño y el que produce las sinergias.

Hoy la consola se organiza por **estructura de datos**: actividades aquí, materiales allá, evidencias más abajo. El técnico debe traducir mentalmente "me falta la foto" a "debo bajar a la cuarta sección". Pasa a organizarse por **requisito**, que es la unidad en la que el trabajo realmente se piensa y en la que el gate de cierre ya razona.

Cada requisito expone tres cosas:

| Atributo | Origen | Uso en pantalla |
| --- | --- | --- |
| `satisfied` | `allEvaluations[].satisfied` | Estado visual del ítem (cumplido o pendiente) |
| `reason` | `allEvaluations[].reason` | Por qué no está cumplido, en lenguaje de producto |
| **acción** | derivada de `kind` | Control que abre exactamente el acto que lo satisface |

El mapa de acción por `kind` es determinista y ya está implícito en las reglas del evaluador (`closure-gate-evaluator.service.ts:121-182`):

| `kind` | Acción ofrecida | Satisface porque la regla busca |
| --- | --- | --- |
| `ACTIVITY` | Registrar actividad, con `activityType` preseleccionado | una actividad con ese `activityType` |
| `EVIDENCE` | Subir archivo **con esta `requirementKey` y este `evidenceType`** | una evidencia que coincida en ambos campos |
| `MATERIAL` | Registrar consumo, con la categoría filtrada | un consumo con esa `itemCategory` |
| `COMPLIANCE` | Capturar aceptación del cliente | `hasCustomerAcceptance` |
| `FIELD` y `MEASUREMENT` | *Sin acción en v1* — ver §4.6 | claves que hoy no tienen vía de captura |

**El checklist deja de ser una lista decorativa y se convierte en el índice de navegación de la OT.** Esto resuelve las observaciones 3, 4 y 6 con un solo movimiento y, de paso, desbloquea el selector de `requirementKey` que hoy hace imposible la firma (C1).

**No se construye motor nuevo.** `ClosureGateEvaluatorService` ya produce exactamente esta estructura; el trabajo consiste en publicarla.

### 4.2 Progresividad por estado, no colapsables

La densidad (observaciones 3 y 5) se resuelve **no montando lo que no aplica**, no plegando lo que siempre sobra. Un acordeón sobre seis secciones que siempre están presentes reduce píxeles y conserva el desorden.

| Momento | Qué monta la consola |
| --- | --- |
| **Pre-inicio** (`CREATED`, `ASSIGNED`, `EN_ROUTE`) | Resumen, compromiso y checklist **en lectura**. Nada de captura. |
| **En progreso** (`IN_PROGRESS`) | Checklist-índice activo, captura por requisito, consumos de la OT e histórico. |
| **Bloqueada** (`BLOCKED`) | Motivo del bloqueo y su resolución. El resto, en lectura. |
| **Cierre y terminales** | Resultado, conformidad y evidencia consolidada, en lectura. |

El gate `hasStarted` ya existe (`ExecutionOrderDrawer.tsx:384-390`) y hoy solo se usa para atenuar el checklist con opacidad. Pasa a gobernar qué se monta.

### 4.3 Custodia bajo demanda

"Equipos y materiales" son hoy dos listados de origen distinto. La **custodia del ejecutor** (`GET /inventory/custody`, `inventory.controller.ts:485-511`) no es estado permanente de la OT: es el catálogo disponible para un acto concreto. Pasa a ser **picker dentro del acto de registrar consumo**, filtrado por la categoría del requisito cuando el acto nace de un requisito `MATERIAL`.

Lo permanente es el **consumo registrado en la OT**, que son pocas filas y sí pertenecen al expediente.

**La observación 5 se resuelve retirando un listado, no comprimiéndolo.**

### 4.4 Render por rol sobre contrato único (D1)

La consola no duplica componentes por rol: deriva la superficie de `allowedActions`, que el backend ya calcula con el `sub` del JWT (`computeAllowedActions`, `:1993-2062`).

| Rol | Superficie |
| --- | --- |
| Técnico o contratista asignado, y pool sin asignar | Checklist-índice **con acciones**; captura habilitada. |
| ADMIN, NOC y SUPPORT | Checklist-índice **en lectura**; sus acciones reales (`ASSIGN`, `REASSIGN`, `CREATE_FOLLOW_UP`). **Nunca** el mensaje de inicio de A3. |

**Regla de copy:** la pantalla enuncia lo que el usuario **sí puede hacer**. Una negación solo se muestra cuando existe una acción concreta que el usuario esperaría y no tiene, y en ese caso nombra quién sí puede ejecutarla. Un control deshabilitado sin explicación es peor que su ausencia (criterio ya adoptado en la spec v1.1 §4.3 para las pestañas).

### 4.5 Evidencia: selector de requisito y captura de firma

Dos cambios sobre el flujo existente, sin tocar la infraestructura de almacenamiento:

1. **La subida se origina en el requisito**, no en un botón global. El uploader recibe `requirementKey` y `evidenceType` del requisito que la invoca. Se elimina la búsqueda del primer `EVIDENCE` (`:392-396`).
2. **Captura de firma en navegador.** El lienzo produce un binario que entra por el mismo `POST :id/evidence-assets` y se registra con `evidenceType` igual a `SIGNATURE`, valor que `RegisterEvidenceCommand` ya acepta (`shared/contracts/operations/execution-orders.ts:188-194`) y que el gate de cierre exige.

**Solape a resolver en implementación, con decisión ya tomada:** `close()` crea automáticamente una evidencia `SIGNATURE` con `requirementKey` igual a `CUSTOMER_SIGNATURE` cuando recibe aceptación del cliente (`execution-orders.service.ts:1218-1227`). La captura explícita **no la sustituye**: produce el artefacto que el comando de cierre luego referencia. El registro automático permanece como está; lo que cambia es que ahora existe un artefacto que referenciar.

El copy actual promete arrastrar archivos ("Arrastra fotos o documentos", `:1760`) sin que existan manejadores de arrastre. O se implementa el arrastre o se retira la promesa; se decide en la UX spec de R0.

### 4.6 Lo que esta spec declara pendiente y no resuelve

Honestidad de alcance, para que ninguna fase lo descubra a mitad de camino:

- **`FIELD` y `MEASUREMENT` no reciben acción en v1.** Satisfacerlos exige un contrato de captura que hoy no existe (§2.1, A4-bis). Su estado **sí** se muestra —el técnico ve que están pendientes y por qué—, pero la vía para cumplirlos queda fuera. Si una plantilla productiva los declara requeridos, esa OT **no puede cerrarse**; es deuda activa, registrada en §10.
- **El bloque ADR-077 de "no ejecutada"** sigue inalcanzable desde esta ruta. No se repara aquí.
- **Bloquear y Desbloquear** siguen siendo alertas de "no disponible" por catálogo de motivos ausente.

## 5. Punto 7 — fuera de alcance por decisión del CTO

**Decidido el 2026-09-14.** La subsanación del dato o documento faltante de la oportunidad **no se construye**. La decisión D2 de §3 queda revertida en el mismo acto de aprobación de esta spec, y con ella la Ola 3 completa del plan y la escalación E1.

El diagnóstico que la sustentaba **sigue siendo válido y se conserva como deuda**, para que no haya que volver a descubrirlo:

1. **`ExecutionOrder` no tiene `expedienteId`.** El vínculo con MOD05 existe dos saltos atrás, vía `VisitRequest.expedienteId` o `ScheduleEvent.expedienteId`, y ningún endpoint lo expone (§2.3, C2).
2. **El vínculo se adivina hoy con una expresión regular sobre texto libre**, duplicada en tres sitios del portal. Es deuda activa con o sin este trabajo — ver §10.9.
3. **El bloqueo real era RBAC, no UI.** MOD05 solo declara `crm.expedientes.read` y `crm.expedientes.manage`; el segundo concede escritura sobre PII cifrada del suscriptor. Cualquier retomada futura exige clave granular ASSIGNABLE **más scoping por OT**, y debe respetar [ADR-083](../adrs/ADR-083-Convergencia-RBAC-Granular-Modulos-Operativos.md) §D2 —que reserva la ampliación por permiso a los endpoints de lectura— y §D7, que ya fijó *"scoping por asignación, no lectura global"* para este caso exacto.

**Consecuencia de alcance:** la consola sigue sin camino de vuelta a la oportunidad origen. Es una limitación conocida y aceptada, no un olvido.
## 6. Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | **Sin cambio.** No hay columna, índice ni migración nuevos: el trabajo es de mapeo y de presentación. |
| **Seguridad** | **No se amplía superficie.** `displayLabel` es un nombre de usuario interno ya expuesto en el listado del mismo recurso, para el mismo conjunto de roles y bajo el mismo permiso. El ABAC de `ExecutionOrderAccessGuard`, `assertActorAccess` y `computeAllowedActions` no se tocan. Con el punto 7 fuera de alcance, **no hay ampliación de RBAC en ningún tramo**. |
| **Escala** | R4 retira el refetch en abanico por mutación (seis promesas, dos de ellas de 100 registros). C1 añade **una** resolución de etiqueta por petición de detalle, no N+1. |
| **Regulación** | Ley 1581 vía ADR-067: `displayLabel` no es PII de suscriptor, y la proyección del detalle no gana ningún campo de suscriptor. |
| **Boundaries** | **Ninguno cruzado.** MOD11 sigue siendo owner de `ExecutionOrder`. Al retirarse el puente a MOD05, no hay puerto, evento ni composición entre módulos que declarar. |

## 7. Contratos congelados por esta spec

**Congelados desde la aprobación del CTO del 2026-09-14.**

| Contrato | Artefacto | Dueño |
| --- | --- | --- |
| **API tipado — estado por requisito** | `packages/shared/src/contracts/operations/execution-orders-completion.ts` v1 (§4.1) | AI-SR-FULL |
| **Componente — checklist por requisito** | `RequirementChecklist` y `RequirementActionSheet` (§4.1, §4.2) | AI-DS-OWNER |

**Cómo se toca el contrato congelado — corregido el 2026-09-14.** Una versión previa de esta spec afirmaba que el congelado "no se modifica" y que bastaba con un archivo hermano. **Es inexacto y se corrige aquí:** el punto de anclaje del estado por requisito es `ExecutionOrderCompletionView`, que vive **dentro** del congelado (`execution-orders.ts:115-124`) y es el tipo de `ExecutionOrderDetail.completion` (`:137`). Cualquier campo nuevo en la respuesta del detalle toca ese archivo. El patrón puro de archivo hermano solo era aplicable al listado, que era un contrato **nuevo**; este es una **ampliación de uno existente**.

El procedimiento correcto es el que el propio archivo exige —"no modificar sin versionar"—, ejecutado así:

1. El **tipo del ítem** (`ExecutionOrderRequirementStatus`) nace en el archivo hermano `execution-orders-completion.ts`, que documenta su origen igual que hizo `execution-orders-list.ts`.
2. `ExecutionOrderCompletionView` recibe **un campo opcional y aditivo** que importa ese tipo. Es retrocompatible: ningún consumidor actual se rompe, y la propia interfaz ya tiene precedente de campos opcionales que el backend siempre publica (`completed?`, `total?`, `:118-121`).
3. El congelado **sube de v1 a v1.1** en su docstring, declarando qué se amplió y con qué autoridad.
4. El acto se notifica como re-sync (perfil AI-EM-ARCH §3.5; protocolo §3bis regla 1) — ver §9, E2.

Se descartó el endpoint separado `GET :id/requirements`: evitaría tocar el congelado, pero re-ejecutaría una evaluación que ya corre dentro de `GET :id` (`execution-orders.controller.ts:230`) —tres consultas más la resolución de categorías de inventario— y añadiría una séptima llamada a una consola cuyo plan de trabajo consiste precisamente en reducirlas (R4).

## 8. Criterios de aceptación

- **CA-01** — El detalle de una OT con técnico asignado muestra su nombre. La bandeja y el detalle **nunca discrepan** sobre el mismo responsable.
- **CA-02** — Una OT asignada a cuadrilla muestra la cuadrilla como responsable, no "Sin responsable asignado".
- **CA-03** — Con la OT en `IN_PROGRESS`, la alerta "No puedes iniciar esta orden" **no se renderiza para ningún rol**.
- **CA-04** — Un supervisor nunca ve copy dirigido a técnicos; ve sus acciones reales derivadas de `allowedActions`.
- **CA-05** — El checklist muestra, por requisito, si está cumplido y —si no— por qué, con la evaluación real del gate de cierre.
- **CA-06** — Los requisitos `COMPLIANCE` cuentan en el avance cuando hay aceptación del cliente registrada.
- **CA-07** — Cada requisito accionable ofrece la acción que lo satisface, preconfigurada con su clave.
- **CA-08** — Una evidencia subida desde un requisito queda registrada con **esa** `requirementKey` y **ese** `evidenceType`.
- **CA-09** — Una firma capturada en el navegador produce una evidencia `SIGNATURE` que el gate de cierre acepta.
- **CA-10** — Entrar a una OT pre-inicio no monta la superficie de captura.
- **CA-11** — La custodia del ejecutor no se consulta fuera del acto de registrar consumo.
- **CA-12** — Registrar una actividad no recarga las seis colecciones de la consola.
- **CA-13** — `audit-ui.mjs` limpio sobre los archivos tocados.

*(El CA-13 de la v1.0 —degradación visible de la sección de oportunidad— se retira con el punto 7; la numeración se compacta y no queda hueco.)*

## 9. Registro de decisiones — las tres escalaciones quedan cerradas

Las tres escalaciones que la v1.0 dejaba abiertas se resolvieron el **2026-09-14**. **No queda ningún bloqueo de gobierno: el plan es ejecutable.**

### E1 — Escritura de un rol de campo sobre el expediente de CRM · **RETIRADA por decisión del CTO**

El CTO retiró el punto 7 del alcance. No se evalúan más opciones ni se emite ADR de permiso granular. El diagnóstico se conserva en §5 y la deuda en §10.9.

### E2 — Ampliación del contrato congelado · **APROBADA**

*Decisión:* ampliación **aditiva y opcional** de `ExecutionOrderCompletionView`, con el tipo del ítem en archivo hermano y bump del congelado de v1 a v1.1 (§7).

*Por qué esta y no otra:* es lo que el propio archivo prescribe —permite modificar, exige versionar— y es retrocompatible, con precedente en la misma interfaz (`completed?` y `total?` son opcionales y el backend siempre los publica). Se descartó el endpoint separado `GET :id/requirements`, que evitaba el trámite pero re-ejecutaba una evaluación que `GET :id` ya corre y añadía una llamada a una consola que el plan quiere aligerar; y se descartó una v2 del contrato, desproporcionada al no haber ruptura.

### E3 — Figura bajo la que se interviene MOD11 · **RETIRADA por improcedente**

*No es una decisión del CTO: la escalación estaba mal planteada y se anula.*

La v1.0 afirmaba que MOD11 *"figura cerrado sin informe de cierre y con G7 sin veredicto"* y pedía decidir entre reapertura y fase nueva. **La premisa era falsa.** [ADR-080](../adrs/ADR-080-Dependencia-Descubierta-y-Cierre-En-Construccion.md) §5 (Aprobado por el CTO, 2026-08-09) **enmienda ADR-022 §Decisión punto 3** y separa dos cierres:

| Cierre | Qué exige | Quién aprueba |
| --- | --- | --- |
| **En construcción** | Backend, frontend, base de datos, pruebas y documentación, con **G6 y G6.5** | AI-EM-ARCH — *"es el cierre exigible hoy"* |
| **En producción** | Lo anterior más **G7** | CTO — diferido; *"su ausencia no es deuda"* |

MOD11 tiene **G6 GO y G6.5 GO** con evidencia por SHA (`INFORME-MOD11-FLOW-CABLEADO-v1.0.md` §15.13, CI #112 sobre `1343d6b8`). Está **legítimamente cerrado en construcción**. G7 pertenece al otro cierre y su ausencia no lo invalida.

Aplicar lo que la v1.0 recomendaba habría causado daño: declarar MOD11 `En curso`, con MOD05 `En curso` y MOD09 `Suspendido`, deja **tres módulos funcionales abiertos** y viola la cota de dos de ADR-080 §4, que exige decisión explícita del CTO para el tercero.

**Figura correcta, con precedente inmediato:** este trabajo se ejecuta como **spec propia sobre módulo cerrado en construcción**, exactamente como hizo la spec del 2026-09-13 sobre este mismo módulo. No se toca ningún registro de gobernanza.

*Matiz que sí queda vivo, y que no es de esta spec:* [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) superó a [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md) (superado) el 2026-09-12, de modo que la cláusula *"su ausencia no es deuda"* —que pendía de ADR-070 (superado) vigente— ya no cubre a G7. Los prerrequisitos de producción pasaron de deuda diferida a **deuda activa** sin que nadie lo registrara. Es la deuda de gobernanza que la spec del 2026-09-13 §10.4 ya declaró y que el CTO excluyó del alcance; se reitera aquí en §10.10 para que no se pierda.

## 10. Deuda registrada, fuera de alcance

1. **`FIELD` y `MEASUREMENT` sin vía de cumplimiento** (§4.6). Deuda **activa**, no diferida: una plantilla productiva que los declare requeridos produce una OT incerrable. Exige ampliar `RegisterFieldWorkSchema` y el mapper de actividades.
2. **`RegisterActivityCommand` promete `measurements` y `occurredAt` que el API no implementa** (`dto/execution-orders.dto.ts:71-77` frente a `shared/contracts/operations/execution-orders.ts:156-165`). Contrato que miente.
3. **`ExecutionOrderDetail.site` se construye con el id de la OT**, no el del sitio, y sin `address` (`execution-orders.controller.ts:251`).
4. **`inventoryReconciliation` con valor `REJECTED`** es un valor del contrato que el servicio nunca emite; usa `DIVERGED`.
5. **Duplicación de mapas de copy**: `requirementKindLabel()` (`ExecutionOrderDrawer.tsx:221-238`) frente a `REQUIREMENT_KIND_LABELS` (`execution-order-requirements.ts:78-86`), con textos distintos para los mismos seis kinds; y `syncStateCopy()` frente a `syncCopy()`, que divergen en el caso fallido y pueden verse simultáneamente en pantalla.
6. **Bloque ADR-077 inalcanzable** desde esta ruta, y **Bloqueo y Desbloqueo** sin catálogo de motivos (§4.6).
7. **Documentos del expediente fuera de MinIO**: MOD05 escribe a disco local del contenedor (`expediente.service.ts:305-313`), deuda ya registrada en ADR-034 §138 y diagnosticada por su nombre en ADR-035 §16. Al retirarse el punto 7, **este trabajo ya no la toca ni la agrava**; queda donde estaba, y cualquier retomada futura del puente a Oportunidades debe declararla antes de empezar.
8. **Deuda de gobernanza de MOD11** arrastrada de la spec del 2026-09-13 §10.4.
9. **Trazabilidad OT → oportunidad, sin resolver** *(añadida en v1.1 al retirarse el punto 7)*. `ExecutionOrder` no tiene `expedienteId`; el vínculo se adivina con una expresión regular sobre `originLabel`, un campo de display, **duplicada en tres sitios**: `visit-requests.service.ts:1273-1274`, `PendingVisitRequestsView.tsx:171` y `:211`, y `PendingVisitRequestInbox.tsx:121-127`. Es deuda activa **con independencia de este trabajo**: cualquier consumidor que necesite el origen comercial de una OT hoy depende de parsear texto libre.
10. **G7 pasó de deuda diferida a deuda activa sin registrarse.** La cláusula *"su ausencia no es deuda"* de ADR-080 §5 pendía de que ADR-070 (superado) estuviera vigente; [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) lo superó el 2026-09-12. Los prerrequisitos de producción —dominio, TLS, rollback, restore, RPO/RTO— y QA-34 quedaron sin cobertura formal. **No es de esta spec**, y el CTO ya lo excluyó del alcance en la del 2026-09-13; se reitera para que no se pierda en el traspaso.

## 11. Artefactos que esta spec NO supera

Ninguno. No contradice la spec del 2026-09-13 (interviene la superficie que aquella excluyó por diseño), ni la del 2026-06-24, ni los ADR-046, 047, 065, 066, 067, 068 y 083. Añade un archivo hermano al contrato congelado sin modificarlo.
