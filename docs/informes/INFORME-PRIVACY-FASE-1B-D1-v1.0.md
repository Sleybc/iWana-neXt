# INFORME — Privacy Fase 1b · D1 Inventario WFM y `tasks`

**Versión:** 1.0 · **Fecha:** 2026-10-16 · **Estado:** Cerrado · **Autor:** AI-DATA-ENG (`data-eng`)
**Encargo:** `docs/prompts/PROMPT-PRIVACY-FASE-1B-v1.0.md` §4 D1 · **Plan:** `docs/plans/2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md` §1 D-1B-2, §2.5, §4
**Contratos consumidos (no modificados):** H7, R7, §2.5 filas WFM/tasks, §2.6 CLI, runbook `docs/runbooks/RUNBOOK-PRIVACY-BLOQUEO-SUPRESION-MANUAL-v1.0.md` + Anexo A
**Skills aplicadas:** `postgresql`, `docs-architect` (leídas antes de trabajar). Descartada: `database-migration` (D1 inventaría, no migra).
**Propiedad tocada:** solo Anexo A del runbook + este informe. Sin commits.

## 0. DoR y STOP/GO

- `docs/informes/INFORME-PRIVACY-FASE-1B-D1-v1.0.md` libre al iniciar: verificado por glob (sin coincidencias). Sin `[BLOQUEO]`.
- Acceso a migraciones, servicios productores y DTO verificado. Sin `[BLOQUEO]`.
- STOP/GO cumplido: índice completo de migraciones tenant 000–148 verificado contra `packages/database/src/migrations/tenant/runner.ts`; lectura detallada de las 24 migraciones que crean o alteran las tablas del alcance (§5); barrido de `ALTER TABLE` sobre `visit_requests`, `schedule_events`, `work_orders`, `work_order_tasks`, `execution_orders`, `execution_order_activities`, `execution_order_evidence` en todo el directorio; barrido de `expediente_id` / `subscriber_id` / `contract_id` en todo el directorio para "cualquier otra tabla".

## 1. Tabla final columna → regla (categoría `OPERACION_CAMPO`)

Alcance de filas (sin reinterpretación para B2): `visit_requests` y `schedule_events` con `expediente_id` en el alcance o `subscriber_id` en el alcance; `execution_orders` con `visit_request_id` o `schedule_event_id` del alcance; el resto por encadenamiento desde esas filas (detalle por tabla). Claves de alcance (`expediente_id`, `subscriber_id`, `contract_id`, `ticket_id`, `task_id`, `origin_ref_id`, `origin_context`, `visit_request_id`, `schedule_event_id`, `work_order_id`, `execution_order_id`, `organization_site_id`, `recipient_ref_id`) **se conservan**: son el vínculo operativo, no dato del titular. `execution_orders.subscriber_id` es `VARCHAR(160)` (056:16), no UUID: B2 debe comparar como texto.

Regla general: `NULL` donde el DDL lo permite; centinela `ANONIMIZADO` donde hay `NOT NULL`. Verificación por `information_schema` como el CLI vigente.

| Tabla | Columna(s) | Migración:línea | Regla | Se conserva |
| --- | --- | --- | --- | --- |
| `visit_requests` | `title` (VARCHAR(160) NOT NULL) | 034:42 | → `ANONIMIZADO` | estados, ventanas, SLA, orígenes, vínculos, responsables, fechas |
| `visit_requests` | `description` (TEXT) | 034:43 | → `NULL` | — |
| `visit_requests` | `origin_label` (VARCHAR(160)) | 034:39 | → `NULL` | — |
| `visit_requests` | `address` / `municipality` / `sector` / `latitude` / `longitude` | 034:47-51 | → `NULL` | — |
| `visit_requests` | `cancel_reason` (VARCHAR(200)) | 034:63 | → `NULL` | — |
| `visit_requests` | `additional_reason` (TEXT) | 105:17 | → `NULL` | — |
| `visit_requests` | `sla_paused_at`, `retry_count`, resto operativo | 104:30, 102:17 | sin cambio | — |
| `schedule_events` | `title` (VARCHAR(160) NOT NULL) | 030:76 | → `ANONIMIZADO` | estados, ventanas, asignaciones, vínculos, fechas |
| `schedule_events` | `description` (TEXT) | 030:77 | → `NULL` | — |
| `schedule_events` | `address` / `municipality` / `latitude` / `longitude` | 030:82-85 | → `NULL` | — |
| `schedule_events` | `sector` (VARCHAR(120)) | 033:13 | → `NULL` | — |
| `schedule_events` | `failure_reason` (TEXT) | 104:24 | → `NULL` | — |
| `schedule_events` | `review_notes` (TEXT) | 106:16 | → `NULL` | — |
| `schedule_events` | `execution_order_id` (046:165), `organization_site_id` (039:30), causa IDs/flags/fechas (104), resto | — | sin cambio (vínculos y clasificación operativa) | — |
| `work_orders` | `summary` (VARCHAR(200) NOT NULL) | 030:143 | → `ANONIMIZADO` | `code`, type, status, priority, orígenes, fechas |
| `work_orders` | `notes` (TEXT) | 030:144 | → `NULL` | — |
| `work_order_tasks` | `title` (VARCHAR(160) NOT NULL) | 030:181 | → `ANONIMIZADO` | estado, llegada/salida, fechas |
| `work_order_tasks` | `description`, `result_notes` (TEXT) | 030:182-186 | → `NULL` | — |
| `schedule_reschedule_logs` | `notes` (TEXT) | 030:210 | → `NULL` | from/to, `reason`, actor, fecha (append-only conservado) |
| `execution_orders` | `customer_display_label` (VARCHAR(200) NOT NULL) | 046:67 | → `ANONIMIZADO` | número, estados, ventanas, asignaciones, orígenes, fechas |
| `execution_orders` | `work_summary` (VARCHAR(200) NOT NULL) | 046:72 | → `ANONIMIZADO` (decisión §2) | — |
| `execution_orders` | `service_address` / `municipality` / `sector` | 046:68-70 | → `NULL` | — |
| `execution_orders` | `work_instructions`, `close_notes` (TEXT) | 046:73, 046:80 | → `NULL` | — |
| `execution_orders` | `template_label` (094:81), `template_requirements_snapshot` (094:86) | 094 | → `NULL` / `{}` si la orden está en alcance (copia por orden; el catálogo `execution_order_templates` no se toca) | `template_id`, `template_version_id`, `template_key`, `template_version_number` |
| `execution_orders` | `version`, `is_annulled`, resto (090:21, 136:28, 098:17) | — | sin cambio | — |
| `execution_order_activities` | `description` (TEXT NOT NULL) | 046:110 | → `NULL`… ver nota N1 | tipo, actor, fecha |
| `execution_order_evidence` | `notes` (TEXT), `file_name` (VARCHAR(200)) | 046:151-152 | → `NULL` | tipo, `media_asset_id` (lo trata Media), `requirement_key`, `asset_status`, `captured_at`, actor, fecha |
| `execution_order_status_transitions` | `reason` (VARCHAR(255)) | 132:137 | → `NULL` | `from_status`, `to_status`, `changed_at`, `correction_of_id`, fechas |
| `execution_order_status_transitions` | `changed_by` (UUID) | 132:136, 134:161 | sin cambio (actor técnico; la purga 134 distingue centinela/NULL) | — |
| `operational_tasks` | `title` (VARCHAR(200) NOT NULL) | 045:75 | → `ANONIMIZADO` | `task_number`, type, status, priority, orígenes, `recipient_type`, `recipient_ref_id`, fechas |
| `operational_tasks` | `description` (TEXT) | 045:76 | → `NULL` | — |
| `operational_tasks` | `recipient_label` (VARCHAR(160)) | 045:84 | → `NULL` | — |
| `task_timeline_events` | `payload` (JSONB NOT NULL) | 045:136 | → `'{}'` (nota N2) | tipo, actor, fecha |
| `task_assignment_history` | `reason` (VARCHAR(500)) | 045:158 | → `NULL` | responsables, actor, fecha |

**N1:** `execution_order_activities.description` es `TEXT NOT NULL` (046:110). `NULL` exige `SET NOT NULL` previo o centinela. Decisión: B2 la trata como texto libre operativo y la deja en `NULL` relajando el `NOT NULL` solo si el módulo dueño lo aprueba por migración; en el runbook manual se aplica `UPDATE … SET description = NULL` precedido de `ALTER TABLE … ALTER COLUMN description DROP NOT NULL` documentado en el ticket, o centinela `ANONIMIZADO` si `tasks` lo prefiere. AI-EM-ARCH la incluye en el delta a `tasks`.

**N2:** `payload` JSONB puede incrustar copias de título/etiqueta del evento. `'{}'` es su DEFAULT (045:136) y es la única redacción total auditable en el runbook manual; si B2 prefiere cirugía por claves, lo propone como delta sin cambiar esta tabla.

## 2. Decisión `work_summary` con evidencia (sin PII)

**Decisión: `work_summary` → `ANONIMIZADO`.**

- Productores (solo rutas de escritura, sin copiar valores):
  - `apps/api/src/modules/wfm/services/schedule-events.service.ts:377-383`: al crear el evento sin orden de trabajo, `customerDisplayLabel` y `workSummary` se alimentan del título validado del evento; `serviceAddress` y `workInstructions`, de dirección y descripción validadas.
  - `schedule-events.service.ts:424-430`: con orden de trabajo, `workSummary` viene de `validated.workOrder.summary` y `customerDisplayLabel` sigue siendo el título del evento.
  - `apps/api/src/modules/wfm/services/visit-requests.service.ts:929-932`: `customerDisplayLabel` resuelve primero el display name del expediente vía `resolveCustomerDisplayName` (expediente CRM por `originContext CRM`, con fallback a `originLabel` y luego al título); `workSummary` (`:955`) es `workOrderSummary` o el título de la visita. Es decir: `work_summary` **nunca** recibe el display name del CRM, pero sí texto libre del operador.
  - `visit-requests.service.ts:911-912, :956`: `workOrder.notes` y `workInstructions` heredan `workOrderNotes ?? visitRequest.description`.
- Muestras (solo forma, sin valores): no existe seed de desarrollo para WFM/`tasks` en el repo (único seed: `additional-products.seed.ts`; fixtures E2E en `e2e/scripts/seed-mod11-r5-fixtures.mjs` con valores sintéticos genéricos). Las muestras disponibles son specs y fixtures: títulos operativos genéricos (p. ej. patrón `Instalación…`, `Visita de soporte…`, `Bloqueo de agenda E3`) y direcciones sintéticas de prueba. Pero el texto es libre (`z.string().max(160/200)`, `safeTextField`) y hay evidencia de que `origin_label` admite patrón de nombre de persona (`visit-requests.service.spec.ts:785`, valor con forma de nombre propio; se cita ubicación, no valor) y de que `customerDisplayLabel` copia el display name del expediente (H7 + productor `:929-932`).
- Fundamento: `work_summary` es `VARCHAR(200) NOT NULL` (046:72): `NULL` es imposible y el texto libre del operador puede portar dato del titular. Asimetría irreversible + Ley 1581 ⇒ centinela `ANONIMIZADO`, coherente con `title` y `customer_display_label`. Categoría `OPERACION_CAMPO`.

## 3. Diff del Anexo A (runbook vigente hasta que B2 se integre)

Filas agregadas a la tabla de §A.1 tras `public.media_assets` (las reglas del Anexo A preexistentes no cambian):

- `visit_requests`, `schedule_events`: reglas de §2.5 confirmadas contra DDL (incluido `sector` de la 033) + `cancel_reason`, `additional_reason`, `failure_reason`, `review_notes` → `NULL` (columnas posteriores 104/105/106 que §2.5 no nombraba).
- `work_orders`, `work_order_tasks`, `schedule_reschedule_logs`: filas nuevas (alcance por encadenamiento; §2.5 no las listaba).
- `execution_orders`: §2.5 confirmada + `work_summary` → `ANONIMIZADO` (decisión §2) + `template_label`/`template_requirements_snapshot` (094).
- `execution_order_activities`, `execution_order_evidence` (texto), `execution_order_status_transitions` (`reason`; `changed_by` se conserva), `operational_tasks` (+ `task_timeline_events.payload` → `'{}'`, `task_assignment_history.reason` → `NULL`): filas nuevas.
- Nota de alcance añadida: claves de vínculo se conservan; `execution_orders.subscriber_id` se compara como texto (`VARCHAR(160)`); `technician_availability`, `execution_order_item_usage` y tablas de confiabilidad/outbox (090/095/099-101/137-141) evaluadas sin dato del titular → sin regla; `organization_sites.contact_*` es personal del ISP, no del titular → sin regla.

**Diferencias contra §2.5 (prevalece esta tabla; AI-EM-ARCH emite el delta a B2):**

1. `work_summary` decidido: `ANONIMIZADO` (§2.5 lo dejaba en D1).
2. Columnas posteriores no nombradas en §2.5: `cancel_reason`, `additional_reason`, `failure_reason`, `review_notes`, `template_label`, `template_requirements_snapshot`.
3. Tablas no listadas en §2.5 con dato del titular y alcance por encadenamiento: `work_orders`, `work_order_tasks`, `schedule_reschedule_logs`, `execution_order_activities` (texto), `execution_order_evidence` (texto), `execution_order_status_transitions` (`reason`), `operational_tasks` (+ `task_timeline_events`, `task_assignment_history`).
4. `execution_order_activities.description NOT NULL` requiere decisión DDL de `tasks` (nota N1).

## 4. Deuda nueva por severidad

- **Media — [CONSULTA] a AI-EM-ARCH:** `contracts` guarda dato del titular fuera del Anexo A y sin participante asignado en §2.5: `installation_address/city/department/postal_code/notes` y `fiscal_name/document/address` (029:37-67), `installation_stratum` y `stratum_evidence_media_id` (144:88-100), con `subscriber_id` como clave (028:78). El participante CRM de B2 solo mueve "las reglas del Anexo A". Decidir si entran en el participante CRM (con qué retención: fiscal 10 años) o se excluyen con fundamento. `quotes` (028:40-56, `plan_snapshot_json`) y `contracts.plan_snapshot_json` pueden incrustar datos del titular en JSONB: decidir verificación de residuales. `crm_conversion_failures` (143:77-90, `error_code` + `event_name` por expediente) y `support_tickets` (`subject`/`description` con `subject_type='EXPEDIENTE'`, 031:120-133 + 032) quedan igual: propiedad CRM/Assurance, fuera de D1.
- **Baja — verificar:** `apps/api/src/modules/wfm/services/visit-requests.service.spec.ts:785` contiene un `originLabel` con forma de nombre de persona. Si es dato real, reemplazar por sintético (regla: cero PII en tests); si es sintético, sin acción. Se cita ubicación, no valor.
- **Baja — diseño:** `task_timeline_events.payload → '{}'` es redacción total; si `tasks` necesita historia operativa, B2 propone cirugía por claves como delta.
- Sin deuda alta ni crítica nueva de este bloque.

## 5. Migraciones recorridas y tablas cubiertas (sin conteo de tests: no aplica, D1 no escribe código)

- **Índice verificado:** `runner.ts` registra 000–148 (última: `148_subscriber_contact_nullable`).
- **Lectura detallada (24):** 026, 028, 029, 030, 031 (barrido), 032, 033, 034, 036, 039, 043, 045, 046, 056, 090, 093, 094, 096, 098, 102, 104, 105, 106, 132, 133, 134, 135, 136, 143, 144, 145. Resto cubierto por barrido de `ALTER TABLE`/`CREATE TABLE` y de `expediente_id|subscriber_id|contract_id` en todo `migrations/tenant` (incluye 035 índices, 089/091/107/130 solo-índices/enum, 095/097/099-101/137-142 sin dato del titular).
- **Tablas con dato del titular en alcance D1 (12 + 2 hijas):** `visit_requests`, `schedule_events`, `work_orders`, `work_order_tasks`, `schedule_reschedule_logs`, `execution_orders`, `execution_order_activities`, `execution_order_evidence`, `execution_order_status_transitions`, `operational_tasks`, `task_timeline_events`, `task_assignment_history`.
- **Evaluadas sin regla:** `technician_availability` (personal operativo, sin vínculo al titular), `execution_order_item_usage` + tablas 137-141 (inventario técnico), outbox/inbox/idempotencia/auditoría/intents (090/095/099-101: envoltorios efímeros con purga; B2 los incluye en verificación de residuales), `organization_sites` (contacto del ISP), `execution_order_templates` (catálogo).
- **Evaluadas, propiedad de otro módulo ([CONSULTA] §4):** `quotes`, `contracts`, `subscriber_tax_profiles` (sin PII directa), `crm_conversion_failures`, `support_tickets` (+ `ticket_comments`, `ticket_timeline_events`, `ticket_pqr_records` no recorridos en detalle: sin FK literal al titular, vínculo por `subject_ref_id`).
- Cero PII, ciphertext, HMAC o claves en este informe, en el diff del Anexo A y en la sesión.
