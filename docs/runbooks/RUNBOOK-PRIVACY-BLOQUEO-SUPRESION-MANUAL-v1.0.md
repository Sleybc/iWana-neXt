# Runbook — Privacidad: bloqueo y supresión manuales (puente hasta la Fase 1b)

**Versión:** 1.0 · **Fecha:** 2026-10-15 · **Autor:** AI-EM-ARCH
**Estado:** Vigente al aprobarse; es **precondición de G7** del módulo `privacy`. Lo revisa `sec-eng`; el Anexo A lo entrega `data-eng` antes de G7.
**Decisión que lo origina:** D-1B (CTO, 2026-10-15). La Fase 1b, que automatiza el bloqueo y la anonimización, va **después** de producción, y mientras tanto rige este procedimiento manual con SLA.
**Referencias:**

- [ADR-094 §D7](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) (retención, bloqueo y supresión);
- [HLD-PRIVACY-HABEAS-DATA-v1.0](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.0.md) §10;
- [re-auditoría MOD05](../informes/INFORME-MOD05-SUBSCRIBERS-REAUDITORIA-v1.0.md) §5 y §6;
- [rollback y restore](RUNBOOK-RELEASE-ROLLBACK-v1.0.md).

## 1. Alcance, vigencia y riesgo aceptado

**Cubre dos situaciones:**

- **Bloqueo:** la solicitud de supresión no procede por un deber de conservación y el sistema abrió la marca `DATOS_BLOQUEADOS`.
- **Supresión procedente:** la solicitud procede o venció la retención. Corresponde la anonimización.

**Vigencia:** desde la salida a producción del módulo `privacy` hasta el G7 de la Fase 1b (§9).

**Riesgo aceptado por el CTO (D-1B):** en la Fase 1a el bloqueo es **procedimental, no técnico**. Los datos bloqueados siguen visibles para los roles de CRM, y su consulta queda auditada (`RECORD_ACCESS`, `LIST_ACCESS`). Las mitigaciones son las de §4.3, la verificación de §4.4 y el aviso visible «Datos restringidos por conservación».

**Fuera de alcance:**

- las facturas y los soportes contables, que se conservan 10 años y son de Billing;
- las copias de seguridad, que no se reescriben (ADR-094 D7). Su rotación la gobierna `plat-ops`.

## 2. Roles

| Rol                          | Quién                                 | Responsabilidad                                                                                  |
| ---------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Oficial de privacidad**    | Usuario del ISP con `privacy.manage`  | Dueño del caso: decide, ejecuta las medidas funcionales, lleva el registro y responde al titular |
| **Administrador del tenant** | `ADMIN` del ISP                       | Instruye a los equipos y revisa la auditoría (§4.4)                                              |
| **Soporte técnico iWana**    | `plat-ops` ejecuta; `data-eng` revisa | Ejecuta la anonimización (Anexo A) con regla de dos personas                                     |
| **Aprobador**                | CTO o quien designe                   | Aprueba cada anonimización antes de ejecutarla                                                   |

## 3. SLA

| Hito                                   | Plazo                                                                                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Respuesta legal al titular             | **15 días hábiles** desde que el reclamo está completo, prorrogables **8** (Ley 1581 art. 15). El sistema calcula `due_at` y `extended_until`. Es el límite duro  |
| Bloqueo efectivo (§4.3)                | ≤ **2 días hábiles** desde que la solicitud queda «No procede» con `DEBER_LEGAL_CONSERVACION`                                                                     |
| Ticket técnico de anonimización (§5.3) | ≤ **2 días hábiles** desde verificar que la supresión procede                                                                                                     |
| Anonimización ejecutada y verificada   | ≥ **2 días hábiles antes** del `due_at` o del `extended_until` vigente. Si no se alcanza, prorrogar **antes** de que venza el plazo (acción «Solicitar prórroga») |
| Revisión del registro de bloqueos      | **Mensual**, más una revisión al terminar cada contrato de un titular con bloqueo diferido (§4.2)                                                                 |

Los días hábiles siguen el calendario colombiano del sistema (C-CAL-1), con festivos.

## 4. Procedimiento A: bloqueo

### 4.1 Identificar el caso

En la bandeja **Solicitudes de datos personales**, una solicitud de **Eliminar los datos** que queda en **No procede** abre la marca **Datos restringidos por conservación** sobre el titular.

El Oficial abre un renglón en el **registro de casos** (§7). Solo registra el número de la solicitud, la fecha y el fundamento; nunca nombres ni documentos.

### 4.2 Según el fundamento de la decisión

| Fundamento registrado                                     | Qué significa                                                                                                 | Acción                                                                                                                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Obligación contractual vigente** (`DEBER_CONTRACTUAL`)  | El titular tiene un contrato abierto. Sus datos se necesitan para prestar el servicio, facturar y dar soporte | **No restringir la operación** mientras haya contrato. Registrar «bloqueo diferido» y revisar cuando termine el último contrato; desde ese momento rige §4.3 |
| **Deber legal de conservar** (`DEBER_LEGAL_CONSERVACION`) | No hay contrato, pero la retención sigue vigente (5 años desde la terminación)                                | Aplicar §4.3 dentro del SLA                                                                                                                                  |

> **Defecto conocido (P2, corrección en la Fase 1b):** el sistema abre la marca también con el fundamento contractual (`requests.service.ts:776-804`). Hasta que se corrija, la columna «fundamento» del registro es la que manda, no la marca.

### 4.3 Medidas de bloqueo disponibles en la Fase 1a

1. **Retirar las finalidades no necesarias.** En la ficha 360° → Cumplimiento, registrar el retiro de **Ofertas y novedades** y, si existiera, de **Datos biométricos**, con el medio por el que el titular hizo la solicitud. Saca al titular de todo uso comercial.
2. **No iniciar tratamientos nuevos.** No se abren expedientes, contratos ni campañas con este titular sin una nueva solicitud y una autorización vigente.
3. **Excluir de exportaciones y reportes manuales.** Ningún listado exportado fuera del sistema puede incluir al titular.
4. **Instruir a los equipos.** El aviso «Datos restringidos por conservación» se ve en la ficha y en los listados. Solo se consulta el registro con un fin legal (auditoría, requerimiento de autoridad o defensa ante un reclamo), y quien lo consulta deja la razón en las notas del caso del registro (§7).
5. **Responder al titular** con el fundamento legal y el plazo de conservación. El sistema registra la respuesta y el canal al marcar la solicitud como «No procede».

### 4.4 Verificación mensual

- El Administrador revisa en la auditoría del tenant los accesos `RECORD_ACCESS` a los titulares del registro y compara cada uno con una razón registrada.
- Un acceso sin razón es un **incidente**: se registra en **Administración de privacidad → Incidentes** y se analiza si debe reportarse a la SIC.

### 4.5 Fin del bloqueo

Al vencer la retención, el caso pasa al **Procedimiento B** (anonimización), sin que el titular tenga que volver a pedirlo.

## 5. Procedimiento B: supresión procedente (anonimización asistida)

### 5.1 Verificar que procede

| Comprobación                                        | Dónde                                                                                                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identidad verificada                                | Detalle de la solicitud: «Identidad verificada», con método y fecha                                                                                |
| Sin contratos abiertos                              | Ficha 360° → Servicios → Contratos                                                                                                                 |
| Retención vencida, o titular que solo fue prospecto | Catálogo de retención (5 años desde la terminación; prospecto: 24 meses desde el descarte, o de inmediato si lo pide el titular y no hay contrato) |
| Sin una autoridad que haya ordenado conservar       | Registro del caso                                                                                                                                  |

Si alguna falla, la solicitud es **No procede** y aplica el Procedimiento A.

### 5.2 Determinar el alcance

| Tipo de titular                                     | Qué se anonimiza (detalle técnico en el Anexo A)                                                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Prospecto** (expediente o potencial sin contrato) | Los datos personales del expediente o potencial, de sus consentimientos locales, intentos de contacto y verificaciones de cobertura |
| **Ex suscriptor con retención vencida**             | Lo anterior, más el suscriptor, el Party, sus contactos y la evidencia en Media (estrato y privacidad)                              |

**Se conserva siempre:**

- las facturas y los soportes contables (Billing, 10 años);
- los agregados sin identificación;
- `audit_logs`, que no contienen PII por diseño;
- `data_authorizations`, que es la prueba de la autorización mientras corre su plazo (ADR-094 D7);
- la propia solicitud, que es la prueba de cumplimiento.

### 5.3 Ejecutar

1. El Oficial abre un **ticket técnico** con solo el **UUID de `data_subject_requests.id`** y el **tenant**, sin datos personales. La entidad no tiene una columna separada de número de radicado; ese UUID es el valor que recibe el CLI.
2. El Aprobador da su aprobación por escrito en el ticket.
3. **Soporte técnico iWana** ejecuta el Anexo A con regla de dos personas: `plat-ops` ejecuta y `data-eng` revisa, en este orden:
   1. comprobar que existe un backup reciente y restaurable del tenant;
   2. dry-run, con el informe de conteos;
   3. ejecución en una transacción;
   4. verificación: cero valores personales y cero HMAC del titular en las tablas del alcance;
   5. registro del resultado en el ticket, solo con conteos.
4. El Oficial confirma la verificación.

### 5.4 Responder

**Responder y cerrar** la solicitud, con la plantilla de respuesta, el canal y, en la referencia del cambio, el número del ticket. La respuesta informa que las copias de seguridad se eliminan al cumplirse su ciclo de rotación.

## 6. Escalamiento

| Situación                                                   | A quién                                                                                                                                       |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| El SLA de §3 está en riesgo                                 | El Oficial, antes de que venza: prórroga en el sistema y aviso al Aprobador                                                                   |
| La anonimización falla o la verificación encuentra residuos | Se detiene. `plat-ops` y `data-eng` analizan. Si hay daño, se restaura el backup según el runbook de rollback y se reintenta dentro del plazo |
| Acceso indebido a datos bloqueados                          | Incidente (§4.4) y evaluación de reporte a la SIC (15 días hábiles)                                                                           |
| Duda jurídica sobre la procedencia                          | Dictamen jurídico. Mientras tanto, tratar como «No procede» con bloqueo, que es reversible; la anonimización no lo es                         |

## 7. Registro de casos y evidencia

Lo lleva el Oficial en el repositorio operativo restringido del ISP, **sin PII**:

| Campo           | Contenido                                                      |
| --------------- | -------------------------------------------------------------- |
| Solicitud       | Número de la solicitud en iWana                                |
| Tipo            | Bloqueo, bloqueo diferido o anonimización                      |
| Fundamento      | Contractual o legal                                            |
| Fechas          | Decisión, medidas aplicadas o ticket, ejecución y verificación |
| Responsables    | Oficial, Aprobador y ejecutor técnico                          |
| Notas de acceso | Razón de cada consulta a un titular bloqueado                  |

Es la evidencia ante una auditoría o un requerimiento de la SIC.

## 8. Reporte

**Mensual, al CTO:**

- casos abiertos por tipo;
- cumplimiento del SLA;
- accesos revisados e incidentes;
- casos de bloqueo diferido que se activaron.

Sin PII.

## 9. Salida del runbook (al entrar la Fase 1b)

1. Las marcas `DATOS_BLOQUEADOS` ya existen. Con la Fase 1b el sistema aplica el bloqueo técnico a todas, una vez corregido el defecto de §4.2.
2. Las anonimizaciones pendientes pasan al flujo automático.
3. El registro de casos se archiva como evidencia.
4. Este runbook queda **Superado**.

## Anexo A — Procedimiento técnico de anonimización

> **Decisiones de alcance del 2026-10-15** ([prompt E-3 §6.3](../prompts/PROMPT-MOD05-E3-CONTACTO-PENDIENTE-v1.0.md)): `potential_leads` queda fuera, porque no tiene tabla; los expedientes los indica el Oficial con `--expediente`, verificados por HMAC; la cuenta de `users` enlazada se anonimiza solo si ya está dada de baja.

La herramienta es `apps/api/src/cli/anonymize-titular.ts`. Se usa únicamente después de que el Oficial haya confirmado que la supresión procede y el Aprobador haya dejado constancia escrita en el ticket. El UUID de solicitud identifica el caso dentro del tenant; el ticket operativo conserva el número de radicado, tenant, aprobación y conteos, nunca PII.

### A.1 Inventario y alcance de escritura

El CLI toma el `party_id` únicamente de la solicitud. Los expedientes son IDs UUID repetibles indicados por el Oficial; antes de escribir se comparan sus `document_number_hmac` con `requester_document_hmac`. Si falta alguno o difiere, la ejecución se detiene salvo que el Oficial registre el motivo en el ticket y agregue `--confirm-unmatched`. La excepción para repetir un expediente tras su anonimización solo aplica si el HMAC ya es `NULL` y la verificación completa de todos sus campos inventariados confirma cero residuos; un expediente con HMAC ausente y datos personales todavía presentes sigue sujeto a confirmación.

| Tabla                                      | Campos anonimizados                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expediente_records`                       | `full_name`, `document_type`, `document_number_encrypted`, `document_number_hmac`, `document_number_hash` legacy, `gender`, `birth_date`, `person_type`, `company_name`, nombres y roles de contacto, teléfonos y correos, preferencias/horarios de contacto, dirección y ubicación (`address`, `municipality`, `department`, `postal_code`, `stratum`, `neighborhood`, `zone_type`, `latitude`, `longitude`), `access_references`, `source_detail`, `campaign`, `estimated_budget`, notas comerciales/técnicas, equipo/materiales estimados, verificación de identidad, `document_supports`, datos fiscales (`fiscal_name`, `fiscal_document`, `fiscal_address`, `rut_reference`), dirección y contacto de instalación, ventana de disponibilidad, notas de acceso, razones/notas de descarte o reprogramación y referencias de evidencia de conformidad. Las columnas que existan en el schema del tenant se consultan dinámicamente. |
| `contact_attempts`                         | `notes` en los intentos ligados a los expedientes indicados.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `consent_records`                          | `ip_address`, `evidence_ref`, `revoked_reason` en consentimientos locales ligados a esos expedientes. El registro y su estado se conservan.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `coverage_checks`                          | `latitude`, `longitude`, `address_used` y `snapshot_json` (queda `{}`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `party`                                    | `document_number` se reemplaza por el ciphertext de `ANONIMIZADO:<party UUID>`; `document_number_hmac` queda `NULL`; se limpia el hash legacy, dígito de verificación, nombre legal, nacimiento/constitución, notas, dirección, coordenadas y ciudad/departamento. `display_name` queda `ANONIMIZADO`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `party_contact`                            | `value`, `value_encrypted`, `value_hmac`, `metadata` y `verified_at`; `is_primary` pasa a `false` para respetar el índice parcial único.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `subscribers`                              | Documento/HMAC/hash legacy, nombres, fecha de nacimiento, estrato, NIT/dígito, nombres comerciales, vínculo de representante legal, email/teléfono/WhatsApp cifrados y HMAC, contacto alterno, dirección/geografía, razón de override y `external_id`. Columnas nullable pasan a `NULL`; los ciphertexts heredados que el DDL del tenant marque `NOT NULL` se sustituyen por el cifrado AES-GCM de `ANONIMIZADO`; dirección no nullable queda en `ANONIMIZADO`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `users` enlazado por `subscribers.user_id` | Solo se incluye si `deleted_at IS NOT NULL`; una cuenta activa aborta antes de escribir. Se limpian las columnas personales del perfil y los hashes legacy. `email` se cambia a `anon+<user UUID>@anon.invalid`; `email_hmac` se recalcula con `PII_HASH_KEY` para ese valor, porque es `NOT NULL + UNIQUE` desde la migración 108. No se conserva el HMAC del correo real.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `public.media_assets`                      | Soft-delete (`deleted_at`) de evidencia de privacidad enlazada al Party y evidencia de estrato enlazada a sus suscriptores, solo para el tenant/uso correcto y si el asset no está compartido ni es evidencia de identidad de una solicitud. El registro de Media se conserva.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          || `visit_requests` (D1 Fase 1b) | Alcance: `expediente_id` en el alcance o `subscriber_id` en el alcance. `title` → `ANONIMIZADO`; `description`, `origin_label`, `address`, `municipality`, `sector`, `latitude`, `longitude`, `cancel_reason`, `additional_reason` → `NULL`. Se conservan estados, ventanas, SLA, orígenes y vínculos (`origin_context`, `origin_ref`, `ticket_id`, `contract_id`, `schedule_event_id`, `work_order_id`), responsables y fechas. |
| `schedule_events` (D1 Fase 1b) | Mismo alcance. `title` → `ANONIMIZADO`; `description`, `address`, `municipality`, `sector`, `latitude`, `longitude`, `failure_reason`, `review_notes` → `NULL`. Se conservan estados, ventanas, asignaciones, vínculos (`expediente_id`, `subscriber_id`, `ticket_id`, `contract_id`, `work_order_id`, `execution_order_id`) y fechas. |
| `work_orders` (D1 Fase 1b) | Alcance: vinculadas a visitas o eventos del alcance. `summary` → `ANONIMIZADO`; `notes` → `NULL`. Se conservan `code`, type, status, priority, orígenes y fechas. |
| `work_order_tasks` (D1 Fase 1b) | Alcance: tareas de work orders del alcance. `title` → `ANONIMIZADO`; `description`, `result_notes` → `NULL`. Se conservan estado, llegada/salida y fechas. |
| `schedule_reschedule_logs` (D1 Fase 1b) | Alcance: logs de eventos del alcance. `notes` → `NULL`; `reason` se conserva (motivo corto operativo). El registro append-only se conserva. |
| `execution_orders` (D1 Fase 1b) | Alcance: con `visit_request_id` o `schedule_event_id` del alcance (`subscriber_id` es `VARCHAR(160)`: comparar como texto). `customer_display_label`, `work_summary` → `ANONIMIZADO`; `service_address`, `municipality`, `sector`, `work_instructions`, `close_notes`, `template_label` → `NULL`; `template_requirements_snapshot` → `{}`. Se conservan número, estados, ventanas, asignaciones, orígenes (`task_id`, `ticket_id`, `origin_ref_id`), plantilla (`template_id`, `template_version_id`, `template_key`, `template_version_number`), `version`, `is_annulled` y fechas. |
| `execution_order_activities` (D1 Fase 1b) | Alcance: actividades de órdenes del alcance. `description` → `NULL` (es `NOT NULL`: preceder de `ALTER TABLE … ALTER COLUMN description DROP NOT NULL` registrado en el ticket, o centinela `ANONIMIZADO` si `tasks` lo prefiere). Se conservan tipo, actor y fechas. |
| `execution_order_evidence` (D1 Fase 1b) | Alcance: evidencias de órdenes del alcance. `notes`, `file_name` → `NULL`. El vínculo `media_asset_id` lo trata Media (soft-delete si no compartida). Se conservan tipo, `requirement_key`, `asset_status`, `captured_at`, actor y fechas. |
| `execution_order_status_transitions` (D1) | Alcance: asientos de órdenes del alcance. `reason` → `NULL`; `changed_by` se conserva (actor técnico; la purga de retención distingue centinela/NULL). Se conservan estados, instante, `correction_of_id` y fechas. |
| `operational_tasks` (D1 Fase 1b) | Alcance: tareas referenciadas por `execution_orders.task_id` del alcance o por `origin_ref` de visitas del alcance con origen TASKS. `title` → `ANONIMIZADO`; `description`, `recipient_label` → `NULL`. Se conservan `task_number`, type, status, priority, orígenes, destinatario (`recipient_type`, `recipient_ref_id`) y fechas. |
| `task_timeline_events`, `task_assignment_history` (D1) | Alcance: filas de tareas del alcance. `payload` → `'{}'` (su DEFAULT); `reason` → `NULL`. Se conservan tipo, actores y fechas. |

> **Alcance WFM/tasks (D1, Fase 1b):** las claves de vínculo (`expediente_id`, `subscriber_id`, `contract_id`, `ticket_id`, `task_id`, `origin_ref_id`, `visit_request_id`, `schedule_event_id`, `work_order_id`, `execution_order_id`, `organization_site_id`, `recipient_ref_id`) se conservan: son el vínculo operativo, no dato del titular. Evaluadas sin dato del titular y sin regla: `technician_availability`, `execution_order_item_usage` y tablas de confiabilidad/outbox (envoltorios efímeros con purga; se incluyen en la verificación de residuales), `organization_sites` (contacto del ISP) y el catálogo `execution_order_templates`. Detalle y decisiones en `docs/informes/INFORME-PRIVACY-FASE-1B-D1-v1.0.md`; si difieren de la Fase 1b §2.5, prevalece el informe D1 y AI-EM-ARCH emite el delta.

`potential_leads` no se modifica: si la tabla existe y contiene filas, la operación aborta mostrando solo el conteo. `data_subject_requests` y `data_authorizations` se leen únicamente para resolver Party, coincidencia HMAC y evidencia; no reciben `INSERT`, `UPDATE` ni `DELETE`. Se excluye la evidencia adjunta a solicitudes. No se toca `audit_logs`, Billing, otros módulos ni DDL.

Los demás HMAC del alcance se ponen en `NULL`. Si una columna histórica de hash no-HMAC es obligatoria, se escribe SHA-256 de una marca y el UUID de su fila, único por ID y sin conservar el digest anterior. Los secretos cifrados obligatorios se verifican en memoria con la clave activa o la previa; no se imprimen plaintexts ni ciphertexts.

### A.2 Ejecución

La herramienta requiere `PII_HASH_KEY` y `MFA_ENCRYPTION_KEY` cargadas por `ConfigService`; cuando haya valores cifrados con clave anterior también carga `MFA_ENCRYPTION_KEY_PREVIOUS`. Compila el paquete antes de ejecutarla:

```powershell
pnpm --filter @iwana/api build
pnpm --filter @iwana/api exec node dist/cli/anonymize-titular.js --tenant <uuid-o-slug> --request <uuid-data_subject_requests.id> [--expediente <uuid>] [--expediente <uuid>] [--confirm-unmatched]
```

El primer comando del CLI siempre es **dry-run**: no cambia datos y presenta solo modo y conteos; `residualFields: null` indica que todavía no se ejecutó la verificación posterior. `--expediente` puede repetirse. Los conteos `changed` representan filas únicas actualizadas por tabla. Se revisan los conteos contra el inventario y se confirma el motivo de cualquier expediente sin HMAC concordante en el ticket antes de ejecutar:

```powershell
pnpm --filter @iwana/api exec node dist/cli/anonymize-titular.js --tenant <uuid-o-slug> --request <uuid-data_subject_requests.id> [--expediente <uuid>] [--expediente <uuid>] [--confirm-unmatched] --apply
```

El modo `--apply` aplica y verifica en una sola transacción, con `SET LOCAL search_path` al schema tenant. Si la tabla `potential_leads` tiene filas, falta una cuenta enlazada, hay una cuenta activa, la evidencia Media no es resoluble o la verificación posterior encuentra residuos, aborta y revierte. La segunda ejecución es idempotente y debe reportar cero cambios. La salida no repite el UUID de solicitud, el tenant, IDs de expedientes, valores personales, HMAC, ciphertext ni detalles de errores PostgreSQL.

### A.3 Verificación

La verificación completa de columnas personales y ciphertexts es la que ejecuta `--apply`: debe terminar con `residualFields: 0` y `activeMediaAssets: 0`. Como comprobación suplementaria de HMAC, desde `psql` se puede contar residuos sin seleccionar valores. Sustituir `tenant_schema`, `request_id` y la lista CSV de expedientes; si no hay expedientes, usar una cadena vacía. La consulta no modifica tablas y devuelve únicamente conteos:

```sql
BEGIN;
SELECT format('SET LOCAL search_path TO %I', :'tenant_schema') \gexec
WITH request_party AS (
  SELECT party_id FROM data_subject_requests WHERE id = :'request_id'::uuid
), expediente_scope AS (
  SELECT unnest(string_to_array(:'expediente_ids', ',')::uuid[]) AS id
)
SELECT 'expediente_records.document_number_hmac' AS campo, count(*)::int AS residuos
  FROM expediente_records e JOIN expediente_scope s USING (id)
 WHERE e.document_number_hmac IS NOT NULL
UNION ALL
SELECT 'party.document_number_hmac', count(*)::int
  FROM party p JOIN request_party r ON p.id = r.party_id
 WHERE p.document_number_hmac IS NOT NULL
UNION ALL
SELECT 'party_contact.value_hmac', count(*)::int
  FROM party_contact c JOIN request_party r ON c.party_id = r.party_id
 WHERE c.value_hmac IS NOT NULL
UNION ALL
SELECT 'subscribers.*_hmac', count(*)::int
  FROM subscribers s JOIN request_party r ON s.party_id = r.party_id
 WHERE s.document_number_hmac IS NOT NULL OR s.email_hmac IS NOT NULL
    OR s.phone_hmac IS NOT NULL OR s.whatsapp_hmac IS NOT NULL;
ROLLBACK;
```

Cada fila de `residuos` debe ser `0`. La solicitud conserva su `requester_document_hmac` y `data_authorizations` conserva su evidencia según ADR-094 §D7; por eso no se incluyen en esta consulta. `users.email_hmac` se excluye deliberadamente del conteo: debe ser el HMAC del correo sintético único y el CLI valida esa excepción con la clave de configuración.

En el ticket se guardan únicamente tenant, UUID interno de solicitud, aprobación, ejecutor/revisor, fecha y conteos de dry-run/apply/verificación. No se adjuntan logs con PII ni resultados SQL por fila.
