# Spec — `privacy` · Barrido de texto libre en la supresión (H-3, H-4 y siguientes)

**Versión:** 1.1
**Cambio v1.0 → v1.1 (2026-11-04, revisión de B1 y B2 contra Postgres real):** dos errores de esta spec. R-14 mandaba `installation_stratum` a `NULL`, lo que viola `chk_contract_residential_stratum` y aborta la supresión de todo contrato residencial. C-1 daba por filtrado un tercer escritor que no lo está. Se añaden D-BT-13 y CA-BT-17 a 19.
**Estado:** Propuesta. Pendiente del G0 del CTO sobre §13. Amplía el alcance de la supresión; no se implementa nada antes de ese G0. **B1 y B2 se ejecutaron sin ese G0 y sin H-2 aplicado. Decisión del 2026-11-04 (§13, punto 9): se regularizan con B1c.** Eso habilita solo B1c. Los demás puntos de §13 siguen pendientes, y el diff no se publica hasta cerrarlos.
**Fecha:** 2026-11-03, revisada el 2026-11-04
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Prioridad:** alta para G7, sin fecha legal propia. La supresión viene de la Ley 1581 y ya rige, pero no hay producción hasta la beta ([ADR-095](../adrs/ADR-095-Topologia-Productiva-Dominio-TLS-Hosting.md)), así que no hay titulares reales afectados.
**Origen:** hallazgos H-3 y H-4 de la [spec de historial de ciclo de vida](2026-11-03-privacy-supresion-historial-ciclo-vida-spec.md) §9, y la `[CONSULTA]` que dejó abierta el [informe D1](../informes/INFORME-PRIVACY-FASE-1B-D1-v1.0.md) §4.
**Artefactos base:** [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) D7 · [HLD Privacy v1.4](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.4.md) §2 y §6.6 · [prompt Fase 1b v1.0](../prompts/PROMPT-PRIVACY-FASE-1B-v1.0.md) R6 y R13 · [runbook de supresión manual](../runbooks/RUNBOOK-PRIVACY-BLOQUEO-SUPRESION-MANUAL-v1.0.md) Anexo A.1
**Plan:** [2026-11-03-privacy-barrido-texto-libre-orquestacion.md](../plans/2026-11-03-privacy-barrido-texto-libre-orquestacion.md) · **Lanzador:** [PROMPT-PRIVACY-BARRIDO-TEXTO-LIBRE-LAUNCH-v1.0](../prompts/PROMPT-PRIVACY-BARRIDO-TEXTO-LIBRE-LAUNCH-v1.0.md)
**Evidencia:** [`docs/informes/evidence/privacy-barrido-texto-libre-2026-11-03/`](../informes/evidence/privacy-barrido-texto-libre-2026-11-03/)

> Define comportamiento. No contiene código de producción. Las rutas se leyeron en `main` (`45046b56`) con diffs ajenos sin commitear, incluidas las migraciones 173 a 175 de MOD14; se revalidan al implementar.

## 1. Resultado en una línea

H-3 y H-4 son residuos reales, pero son los menores. **Toda la familia de tickets queda fuera de la supresión, y `support_tickets.subject` guarda el nombre completo del titular de forma automática.** Además, cuatro caminos dejan filas sin alcanzar aunque sus columnas tengan regla, y tres escritores de auditoría copian texto libre a una tabla inmutable.

## 2. Método

| Paso | Qué se hizo |
| --- | --- |
| Esquema | PostgreSQL 18.6 desechable, roles como CI, migraciones reales: 170 de tenant aplicadas, 153 tablas. Sin tocar `iwana_postgres_dev` ni `tenant_iwana` |
| Universo | Las **703** columnas `text`, `varchar`, `char`, `json`, `jsonb`, enum, arreglo e `inet` de **134** tablas, leídas del catálogo y no de los nombres en migraciones |
| Reglas | Las 177 reglas de campo de seis participantes, cruzadas con el catálogo. Media no tiene reglas de campo: hace borrado lógico. Solo `party.document_number_hash` no existe en el esquema, y es una regla legada inocua |
| Corrida | **261 canarios** sintéticos, uno por columna textual y por fila, en 44 tablas ligadas al titular. Después, la supresión real por `PrivacyRequestsService.transition('resolve')` con los siete participantes. Por último, búsqueda de cada canario |
| Código | Escritor y lectura de cada superviviente, para separar texto libre de código del sistema |

**Control positivo:** de las 118 columnas con regla sembradas en filas alcanzables, **118 desaparecen**. Ninguna columna sin regla desaparece. El detector distingue bien.

**Límites de la evidencia:**

- Las filas se sembraron con SQL y `session_replication_role = replica`, no por los servicios. Prueba que el borrado no las alcanza, no que un flujo concreto las produzca; eso lo prueba la lectura del escritor citada en cada fila.
- Las lecturas tras la supresión son **lectura de código, no se ejecutaron**. Las cierran CA-BT-04 y CA-BT-05.
- `AuditService` estaba simulado: C-1 sale del código y de ejecutar `sanitizeAuditPayload`, no de leer `audit_logs`.
- La cuenta de `users` y la evidencia de Media no se sembraron. Sus reglas no tienen texto libre.
- **La siembra omitió columnas por `CHECK`.** `service_usage` quedó fuera (la corrida lo registró en `skipped`), así que el contrato no era residencial y v1.0 no vio `chk_contract_residential_stratum`. Un canario que desaparece no prueba que la regla valga para toda fila válida (D-BT-13).
- Solo se barrió el esquema tenant. `public` no entra, salvo `media_assets`, que ya tiene participante.

## 3. Cifras

| Clase | Columnas | Dónde |
| --- | --- | --- |
| Cubierta por un participante | 158 | [`clasificacion-columnas.csv`](../informes/evidence/privacy-barrido-texto-libre-2026-11-03/clasificacion-columnas.csv) |
| **Residuo** | **22**: 17 de este barrido, 4 condicionales (R-15) y `note_encrypted`, que ya es H-2 | §4 |
| Excluida con motivo | 487 | §7 |
| `billing_*` y respaldos de MOD14, solo listadas | 36 | §12 |

`contracts.installation_stratum` es `smallint`, queda fuera de las 703 y se suma a R-14.

## 4. Residuos

Todos sobrevivieron a la supresión en la corrida. R-15 se sembró como sonda, y `installation_stratum` no se sembró: es numérico y su ausencia de regla sale del código.

| # | Columna | Qué guarda, y prueba de escritura | Tras suprimir | Tratamiento | Dueño |
| --- | --- | --- | --- | --- | --- |
| **R-1** (H-3) | `operational_responsibility_history.notes` | Texto libre hasta 255. `update-responsibility.dto.ts:5`, `responsibilities.service.ts:135` | Legible: `GET expedientes/:id/timeline` (`expediente.service.ts:2047`). `isBlocked` da falso con el expediente anonimizado (`expedientes.controller.ts:844-846`) | `NULL` | CRM |
| **R-2** (H-4) | `service_provisionings.regularization_reason` | Texto libre de 10 a 500. `network.bodies.ts:47,117`, `service-provisioning.service.ts:690` | Legible: `GET network/subscribers/:subscriberId` (`:1424`) y el portal lo muestra (`SubscriberTechnicalServiceSection.tsx:176`) | Marca `ANONIMIZADO`. **`NULL` violaría `ck_sp_regularized`** (161:58) | `network`, nuevo |
| **R-3** | `support_tickets.subject`, `.description` | **Nombre completo seguro:** `Instalación — ${expedienteFullName}` (`tickets.service.ts:816`), enviado por el portal al agendar (`SchedulingClient.tsx:501`). Además, texto libre sin tope en `description` (`assurance/dto/index.ts:24-25`) | Legible para quien lea tickets. Sin guarda de `anonymized_at` en `assurance` | `subject` es `NOT NULL`: marca. `description`: `NULL` | `assurance`, nuevo |
| **R-4** | `ticket_comments.body` | Texto libre sin tope (`dto/index.ts:69`, `comments.service.ts:45`) | Igual | Marca, por `NOT NULL` | `assurance` |
| **R-5** | `ticket_timeline_events.payload` | Copia `notes` de la transición (`tickets.service.ts:641-644`, `:704`, `:762`) | Igual | `{}`, como `task_timeline_events` | `assurance` |
| **R-6** | `ticket_work_order_links.notes` | Texto libre (`tickets.service.ts:682`, `:715`, `:745`) | Igual | `NULL` | `assurance` |
| **R-7** | `status_changes.reason` | **Copia del motivo de descarte:** `dto.reason` va a `discard_reason` (`:1277`), que sí se anula, y a esta columna (`:1310`) | Legible en el historial del expediente | `NULL` | CRM |
| **R-8** | `sales_attributions.notes`, `.revoked_reason` | Texto libre (`attributions.service.ts:45`, `:59`, `:134`) | Legible en el timeline | `NULL` | CRM |
| **R-9** | `expediente_records.source` | **Copia de `source_detail`** (`expediente.service.ts:615-620`). El propio sanitizador lo describe como texto que «puede identificar a un tercero» (`audit-sanitize.policy.ts:86`) | Legible | Marca `OTRO`, su `DEFAULT`, por `NOT NULL` | CRM |
| **R-10** | `crm_contract_alias_backup_168.alias` | **Ciudad y dirección:** el alias se arma con ellas (`contracts.service.ts:2016-2026`), y la 168 respaldó los valores anteriores | Sin lectura, pero el `down` de la 168 los restauraría | Borrar la fila: es un respaldo, no un registro (D-BT-3) | CRM |
| **R-11** | `subscriber_tax_assignments.reason` | «Motivo auditable del ajuste», texto hasta 300 (`subscriber-tax-profile.service.ts:159,172,239`) | Legible en la ficha tributaria | `NULL`, ⚠ §13 | CRM |
| **R-12** | `execution_order_item_usage_reversals.reason` | Texto hasta 2.000. `noColombianPII` frena documentos y teléfonos, no nombres (`execution-orders.dto.ts:42,166`, `.service.ts:2028`) | Fila de una OT ya en alcance | Marca, por `NOT NULL` | `tasks` |
| **R-13** | `schedule_reschedule_logs.reason` | Texto libre hasta 120, un `Input` sin catálogo (`reschedule-event.dto.ts:9`, `RescheduleEventDialog.tsx:454`). **El Anexo lo conserva como «motivo corto operativo»: no es catálogo** | Legible en agenda | Marca, por `NOT NULL`. Reabre la decisión de D1 | `wfm` |
| **R-14** | `contracts.installation_city`, `.installation_department`, `.installation_stratum` | No es texto libre, pero sí dato de ubicación del titular. Lo nombró la `[CONSULTA]` de D1. `subscribers`, `party` y `expediente_records` sí anulan los equivalentes | Legible en el contrato | Ciudad y departamento: `NULL`. Estrato: `integer-marker`, como `subscribers.stratum`. **`NULL` violaría `chk_contract_residential_stratum`** (144:98-99) | CRM |
| **R-15** | `supplier_profiles.purchasing_contact_name`, `_email`, `_phone`, `.notes` | **Condicional:** solo si el titular es además proveedor (`party_ref_id`). Ni el adaptador ni el participante de Party miran `party_role` | Legible en compras | D-BT-8 | §13 |

## 5. Filas con regla que el alcance no alcanza

Aquí las columnas sí tienen regla: lo que falla es la selección de filas. **La corrida lo confirma: 32 canarios de columnas cubiertas sobrevivieron en estas sondas.**

| # | Fila que escapa | Por qué es alcanzable | Causa | Corrección |
| --- | --- | --- | --- | --- |
| **A-1** | `execution_orders` directa, con `subscriber_id` y sin visita ni agenda. Arrastra sus actividades, evidencias y transiciones | `dispatchFromCoordination` (`execution-orders.service.ts:1110`) crea la OT con `visitRequestId: null`, `scheduleEventId: null` y `subscriberId` (`:1155-1169`) | `resolveScope` solo sigue visita, agenda e id (`execution-order-titular-erasure.participant.ts:54`) | Añadir `subscriber_id::text = ANY($n::text[])`. La columna es `varchar(160)` |
| **A-2** | `visit_requests` y `schedule_events` ligadas solo por `contract_id` | Los DTO dejan todo opcional y no hay `refine` que lo impida (`create-visit-request.dto.ts:39,41`, `create-schedule-event.dto.ts:49,51`) | `resolveScope` solo sigue `expediente_id` y `subscriber_id` (`wfm-titular-erasure.participant.ts:85`) | Añadir `contract_id` y `ticket_id` |
| **A-3** | `work_orders` y sus tareas ligadas por ticket | `ticket_work_order_links` y `support_tickets.work_order_id` (`tickets.service.ts:739-755`) | Solo sigue `source_context = 'CRM'` (`wfm-titular-erasure.participant.ts:186-187`) | Añadir los `work_order_id` de los tickets del alcance y `source_context = 'ASSURANCE'` |
| **A-4** | `operational_tasks` con origen `ASSURANCE` | `originContext` y `ticketId` son libres (`tasks/dto/index.ts:22-24`) | Solo sigue `CRM`, destinatario, agenda, OT y origen `TASKS` (`operational-task-titular-erasure.participant.ts:54`) | Añadir `ticket_id` |

A-2 a A-4 necesitan los ids de contratos y de tickets en `relatedIds`, por lo que el orden de participantes importa (D-BT-2). La evidencia de OT que quede en A-1 entra sola en Media por `executionEvidenceMediaIds`.

## 6. Copias fuera de las columnas

| # | Hallazgo | Prueba | Tratamiento |
| --- | --- | --- | --- |
| **C-1** | **`audit_logs` recibe texto libre**, y es inmutable (`trg_audit_logs_immutable`). Contradice «no contiene PII por diseño» de D7 en tres escritores: `expediente.service.ts:1321` (motivo de transición), `:1720` (motivo de rechazo del consentimiento) y `subscriber-status-transition.service.ts:188-191` (motivo de transición del suscriptor, hasta 255). **`reasonIsPrivate` solo cubre `LEAD → PROSPECT`:** v1.0 lo dio por filtrado y no lo está. Suspender y cancelar exigen motivo, y lo escriben | `sanitizeAuditPayload`, ejecutado, deja pasar `reason`, `notes`, `note`, `body`, `subject`, `comment` y `summary`, y omite solo `description` y `title`. Los demás `newValue` con `reason` son constantes o catálogo | Dejar de escribirlo (D-BT-5). El trigger impide corregir después |
| **C-2** | Dos logs imprimen motivo libre: `execution-orders.service.ts:1639` y `subscriber-status-transition.service.ts:195-198` | Lectura de código | Quitarlo (D-BT-6) |
| **C-3** | El Anexo dice que el outbox y afines «se incluyen en la verificación de residuales». **Ningún participante los lee.** `execution_order_outbox_events.payload` lleva motivo libre (`:1626`, `:3147`) | Canario sobrevive. Purga real a 30 días de publicado, solo de lo publicado (migración 095) | Sigue excluido por efímero. Se corrige el texto del Anexo (D-BT-11) |

Precedente que ya resuelve C-1: `reasonProvided` (`service-provisioning.service.ts:490,739`).

`--verify-only` y `residualFields: 0` solo comprueban las reglas existentes. **Un cero no significa que no queden datos personales**, y A.3 no lo aclara.

## 7. Exclusiones

Conteo por motivo en la columna `motivo_o_dueno` del CSV.

| Motivo | Columnas | Por qué se excluye |
| --- | --- | --- |
| Catálogo o configuración del ISP | 144 | Sin vínculo con un titular |
| Código, referencia o dominio del sistema | 114 | Sin entrada libre: números, llaves, catálogos, códigos DIAN |
| Inventario | 63 | Ver abajo |
| Enum | 51 | Dominio cerrado |
| Compras y proveedores | 40 | Otro titular, otro régimen; lo personal va en R-15 |
| Prueba de cumplimiento | 34 | `data_subject_*`, `data_authorizations`, `party_privacy_marks` y `privacy_incidents`. R6 y D7 conservan la solicitud y la autorización |
| Envoltorios de confiabilidad | 18 | Efímeros, con purga (C-3) |
| Personal del ISP | 15 | Nombre del asesor o del actor, no del titular. Mismo criterio que `changed_by` en el Anexo |
| Sin escritor | 2 | `ticket_pqr_records.notes` (`pqr.service.ts:29` siempre escribe `NULL`) y `status_changes.metadata_json`. Se anulan igual por defensa: la regla no cuesta nada |
| Otros | 6 | `audit_logs.old_value` y `new_value` (C-1), `control_params` (esquema estricto), `cpe_*` (equipo del ISP) e `ip_assignments.ip` (⚠ dictamen de logs de IP, D7) |

**Inventario, excluido con reserva.** `asset_lifecycle_events.notes`, `stock_movements.notes`, `stock_issues.reason`, `.handoff_notes`, `.handoff_attachments` e `inventory_write_offs.notes`, `.rejection_notes` sobreviven y son texto libre. Se excluyen porque hablan del equipo, y su vínculo es indirecto o una referencia sin validar (`commercial_ref_id`, `origin_ref_id`): no hay forma fiable de atribuirlos. Si una nota nombra al cliente es el mismo límite de terceros de H-2 §6. Decisión en §13.

**Texto libre conservado por R6:** `data_subject_requests.response_text` y `.transferred_to`, y `data_subject_request_tasks.note`. Se conservan como prueba, y `privacy_incidents.description` no tiene vínculo con un titular. Ver ⚠ en §13.

## 8. Comparación con el Anexo A.1

| Discrepancia | Efecto |
| --- | --- |
| `contracts` y `quotes` tienen reglas, pero no aparecen en el Anexo | R13 exige paridad: faltan filas |
| «No se toca … otros módulos» | Cambia: entran `assurance` y `network` |
| `schedule_reschedule_logs.reason` «se conserva» | R-13 lo contradice |
| Outbox «en la verificación de residuales» | Falso (C-3) |
| `execution_order_activities.description` → `NULL` o centinela | El código usa la marca. Dejar solo esa |
| §5.2: «`audit_logs`, que no contienen PII por diseño» | Falso hasta aplicar D-BT-5 |
| Alcance de `execution_orders` «con `visit_request_id` o `schedule_event_id`» | A-1 lo amplía |

La `[CONSULTA]` de D1 §4 sobre `contracts` quedó resuelta en parte (se añadieron reglas), pero `support_tickets` nunca se resolvió. Esta spec la cierra.

## 9. Decisiones

### D-BT-1. Regla general

Igual que D-HN-1: el evento se conserva y el texto se va. `NULL` si la columna lo admite; marca `ANONIMIZADO` si es `NOT NULL` o si un `CHECK` lo exige; `{}` en `payload`. Se trata todo texto libre ligado al titular como dato personal, sin clasificar fila por fila.

### D-BT-2. Dos participantes nuevos, y orden

HLD §2: «cada módulo anonimiza sus tablas». Tickets y aprovisionamiento no son de CRM.

- `AssuranceTitularErasureParticipant`, en `modules/assurance/privacy/`: R-3 a R-6 y `ticket_pqr_records.notes`.
- `NetworkTitularErasureParticipant`, en `modules/network/privacy/`: R-2.

Orden nuevo: `crm`, `party`, `users`, **`assurance`**, `wfm`, `execution-orders`, `operational-tasks`, **`network`**, `media`. `crm` publica `relatedIds.contractIds`; `assurance`, `ticketIds` y `ticketWorkOrderIds`. Sin ese orden, A-2 a A-4 ven listas vacías.

**Alcance de tickets**, comparando como texto porque `*_ref_id` es `varchar(160)`:

| Condición | Lista |
| --- | --- |
| `requester_type = 'SUBSCRIBER'` y `requester_ref_id` | `subscriberIds` |
| `subject_type = 'SUBSCRIBER'` y `subject_ref_id` | `subscriberIds` |
| `subject_type = 'CONTRACT'` y `subject_ref_id` | `contractIds` |
| `subject_type = 'EXPEDIENTE'` y `subject_ref_id` | `expedienteIds` |

Se conservan `ticket_number`, tipo, estado, SLA, fechas y vínculos. Las hijas se alcanzan por `ticket_id`.

**`apps/api/src/cli/anonymize-titular.ts:1058` construye el adaptador a mano**, y hay que añadirle los dos participantes (R13). Ese archivo no es uno de los cuatro con diff en `cli/`.

### D-BT-3. Reglas nuevas en CRM

- `CRM_RULES`: R-1, R-7 y R-8, con alcance por `expediente_id`. R-9 en `expediente_records`, con `{ column: 'source', kind: 'marker', marker: 'OTRO' }`. R-11, por `profile_id` de los perfiles del alcance.
- En R-1, R-7, R-8 y R-11, la selección filtra por texto no nulo, como D-HN-2: `selected` cuenta textos y no eventos, y una segunda pasada da cero.
- `CONTRACT_LOCATION_RULES`: R-14, con `{ column: 'installation_stratum', kind: 'integer-marker' }`. El valor `1` es una marca, no un dato, igual que en `subscribers.stratum`. Pasar `service_usage` a `NON_RESIDENTIAL` para poder anular se descarta: falsearía el contrato.
- R-10: `DELETE` por `contract_id`. La tabla no tiene columna `id`, así que `anonymizeConfiguredTable` no sirve. No es un registro: solo alimenta el `down` de la 168, y sin fila ese `down` deja la marca del contrato.

### D-BT-4. Alcance de `wfm` y `tasks`

A-1 a A-4, con R-12 y R-13. En R-13 se conserva el asiento con sus fechas, y el texto pasa a marca.

### D-BT-5. C-1: la auditoría deja de recibir el texto

`expediente.service.ts:1321` y `:1720`, y `subscriber-status-transition.service.ts:188-191`, pasan a `reasonProvided: boolean`, como `network`. Desaparece `reasonIsPrivate`. Se amplía `audit-direct-log-pii-keys.arch.spec.ts` a `reason`, `notes`, `note`, `body`, `subject`, `comment` y `summary`, con excepción explícita para constantes y catálogos, y debe detectar también la forma abreviada `{ reason }` y el spread condicional, que hoy se le escapan. **No se añade `reason` al sanitizador:** borraría motivos de catálogo útiles. No se reescribe `audit_logs`: no hay filas de producción y el trigger lo impide. Tampoco se abre una excepción, que ampliaría la superficie de H-1.

### D-BT-6. C-2

Los dos logs conservan id y evento, y dejan de imprimir el motivo.

### D-BT-7. Sin escritura tras la supresión

`assurance` y `network` no consultan `anonymized_at`: una fila nueva después del borrado quedaría fuera para siempre. Se aplica `titularAnonymizedConflict` al crear ticket, comentario y regularización contra un suscriptor o expediente anonimizado, por el puerto de lectura de CRM, como en `responsibilities.service.ts:89`. Sin trigger nuevo, por el mismo motivo que D-HN-8.

### D-BT-8. Titular que también es proveedor

Recomendación: **bloqueante en la vista previa** si el Party tiene `supplier_profiles`, con resolución manual. Compras tiene su propio deber contable, y un participante de `inventory` para un caso raro no compensa hoy. Se revisa si aparece el primer caso.

### D-BT-9. Categorías sin migración

`assurance` y `network` informan `OPERACION_CAMPO`. Se cambia solo la etiqueta del portal (`privacy-labels.ts:69`) a «Operación y soporte»: `ck_data_subject_requests_erasure_categories_known` no cambia y no se compite por el número de migración con MOD14.

### D-BT-10. Invariante de clasificación y corrida en CI

Sustituye al límite que reconoce D-HN-10 («no detecta texto libre en claro»):

- **Manifiesto:** toda columna textual del esquema tenant queda declarada como cubierta o excluida con motivo. Se parte del CSV.
- **Prueba sobre esquema migrado:** igualdad exacta con el catálogo. Una columna nueva sin clasificar la pone en rojo, también para MOD14 y cualquier módulo futuro.
- **Prueba de canarios:** el runner de la evidencia pasa a integración Postgres, con sus sondas. Sin omisión esperada: si no corre en CI, no protege.

### D-BT-11. Enmiendas documentales

Sin ADR nuevo: esto aplica D7. Sí se corrige su frase sobre `audit_logs` si el CTO lo pide, tras D-BT-5.

- **Anexo A.1:** filas nuevas, las discrepancias de §8 y una nota en A.3 sobre el alcance de `residualFields: 0`.
- **HLD, siguiente versión libre:** §2 y §6.6, nueve participantes. H-2 y K2 también piden versión: quien llegue después toma la siguiente.
- **Spec H-2:** §9 enlaza aquí, y D-HN-3 deja de decir «siete».
- **Informe D1 §4:** `[CONSULTA]` cerrada.

### D-BT-12. Filas previas

Como D-HN-7: sin migración. `--verify-only` delata lo anterior con las reglas nuevas y `--apply` lo remedia. Sin filas de producción, un borrado irreversible por migración no compensa. La reejecución sobre una solicitud resuelta sigue **sin verificar**; depende de CA-HN-04.

### D-BT-13. Toda regla nueva se prueba contra las restricciones reales

La unitaria simula la base y no ve un `CHECK`. Por eso:

- Antes de fijar `NULL` en una columna se leen sus `CHECK` de tabla, no solo su `NOT NULL`.
- El fixture de canarios cubre cada valor de `service_usage` y falla si la siembra omite una columna: `skipped` debe quedar vacío o justificado una a una.
- La vista previa no detecta esta clase de fallo: dio `eligible: true` y `--apply` abortó. Solo la integración lo cubre.

## 10. Límites conocidos

- **Terceros:** una nota de otro titular que nombre al suprimido es indetectable. Igual que H-2 §6.
- **Tickets sin vínculo:** `requester_type = 'EXTERNAL'` o `'ANONYMOUS'` sin referencia, o `subject_type = 'SERVICE'`, `'DEVICE'` y `'WORK_ORDER'`, no se atribuyen. Solo se alcanzan si además tienen otro vínculo.
- **Copias de seguridad:** igual que D7.
- **Ticket abierto al suprimir:** se anonimiza sin cerrarlo. La supresión ya exige no tener contratos abiertos.

## 11. Criterios de aceptación

| CA | Criterio | Prueba |
| --- | --- | --- |
| CA-BT-01 | Con el fixture de canarios, tras suprimir por la API, ningún canario de R-1 a R-14 sobrevive. Eventos y filas conservan su número y sus demás columnas | Integración Postgres, sobre migraciones reales |
| CA-BT-02 | Las sondas de A-1 a A-4 quedan anonimizadas, incluidas las hijas de la OT directa | Misma |
| CA-BT-03 | Otro titular del mismo tenant, con ticket, OT, visita y aprovisionamiento, no cambia | Misma |
| CA-BT-04 | `GET expedientes/:id/timeline` de un anonimizado responde sin notas de R-1, R-7 y R-8. Con 200, no 500, por los `NULL` | HTTP o integración |
| CA-BT-05 | `GET network/subscribers/:id` de un anonimizado muestra `ANONIMIZADO`, y la lista de tickets no muestra el nombre | HTTP o integración |
| CA-BT-06 | R-2 respeta `ck_sp_regularized`. La idempotencia de `:587` no rompe un reintento tras la supresión | Integración |
| CA-BT-07 | Una transición y un rechazo de consentimiento con motivo no dejan ese texto en `audit_logs` | Integración con `AuditService` real |
| CA-BT-08 | La prueba de arquitectura falla al reintroducir `reason: dto.reason` | Unitaria, comprobando que muerde |
| CA-BT-09 | Crear ticket, comentario o regularización contra un anonimizado da 409 `PRIVACY_TITULAR_ANONYMIZED` | Integración |
| CA-BT-10 | Paridad API y CLI (R13): mismo resultado sobre el mismo fixture, con los nueve participantes | Integración |
| CA-BT-11 | `--verify-only` delata canarios previos; `--apply` los limpia; otro `--verify-only` da 0 | Integración |
| CA-BT-12 | El invariante falla con una columna textual nueva sin clasificar, y con una clasificada que ya no existe | Integración, comprobando que muerde |
| CA-BT-13 | La vista previa suma las filas nuevas; `erasure_categories` no sale de la lista cerrada; D-BT-8 bloquea con proveedor | Unitaria e integración |
| CA-BT-14 | Concurrencia: un comentario que bloqueó antes queda anonimizado; uno que llega después recibe 409 | Integración con dos conexiones |
| CA-BT-15 | Ninguna aserción existente cambia sin justificación. `test-change-reviewer` lo confirma | Revisión |
| CA-BT-16 | Conteo real sin caché, cero PII en logs y fixtures sintéticos. Nunca `tenant_iwana` | `gate-verifier` |
| CA-BT-17 | La supresión de un titular con contrato `RESIDENTIAL` y con otro `NON_RESIDENTIAL` termina sin error, y el estrato real no sobrevive | Integración Postgres sobre migraciones reales |
| CA-BT-18 | Una transición de suscriptor a `SUSPENDED` y a `CANCELLED` no deja el motivo en `audit_logs` ni en el log | Unitaria e integración |
| CA-BT-19 | La prueba de arquitectura falla con `{ reason }` y con `...(cond ? { reason } : {})` | Unitaria, comprobando que muerde |

## 12. MOD14, solo listado (H-5)

Sin revisar y sin tocar. MOD14 debe clasificarlas antes de su G7: D-BT-10 lo forzará.

`billing_documents.buyer_snapshot`, `.issuer_snapshot`, `.buyer_document_encrypted`, `.void_note`, `.blocking_reason` · `billing_document_lines.description` · `billing_payments.note`, `.void_note`, `.reference` · `billing_periods.effective_policy` · `crm_contract_price_backup_175.plan_snapshot_json`, que copia un JSON con los datos ya vistos en `contracts`.

## 13. Puntos para el G0 del CTO

1. **Alcance:** aprobar R-1 a R-14 y A-1 a A-4 con D-BT-1. Es bastante más que H-3 y H-4.
2. **Dos participantes nuevos**, y nueve en total (D-BT-2).
3. **R-13:** reabrir la decisión de D1 sobre `schedule_reschedule_logs.reason`.
4. **C-1:** dejar de auditar el texto, sin tocar las filas existentes (D-BT-5).
5. **Inventario:** confirmar la exclusión de §7. Si no, necesita un participante más y una regla de atribución que hoy no existe.
6. **Proveedor:** bloqueante en la vista previa (D-BT-8).
7. **Invariante en CI** (D-BT-10). Se recomienda como condición, no como mejora: H-2, H-3 y H-4 existen por no tenerlo.
8. **Bloqueante de G7:** registrar R-1 a R-14, A-1 a A-4 y C-1 como condición de salida.
9. **Ejecución adelantada. Decidido el 2026-11-04: regularizar con B1c, sin revertir.** No aprueba los puntos 1 a 8. Actualizado el 2026-11-04: la regla de H-2 (`crm_lifecycle_changes.note_encrypted`) está en el árbol: el CTO confirmó que lanzó H-2 B1. Sigue sin commit. Su G0 quedó registrado el 2026-11-04 en la spec H-2.
10. **⚠ Preguntas para el abogado**, que no bloquean la construcción y sí producción. Esta spec no es una conclusión jurídica:
   - ¿El contenido de una PQR o de un ticket tiene deber de conservación propio en el régimen de usuarios de telecomunicaciones? No se verificó. D7 no tiene categoría para ello, así que aquí se anula.
   - ¿`subscriber_tax_assignments.reason` es soporte contable, con 10 años? Es «motivo auditable».
   - ¿Basta conservar en claro `response_text` y `transferred_to` como prueba, o deben reducirse?
   - ¿Conservar ciudad, departamento y estrato cabe en «agregados sin identificación» si se quisiera mantenerlos? Aquí se anulan (R-14).
