# PROMPT — `privacy` Fase 1b · Delta v1.1 · Contratos, marca de anonimización y lectura de datos bloqueados

**Versión:** 1.1 (delta sobre [v1.0](PROMPT-PRIVACY-FASE-1B-v1.0.md); lo que este documento no toca sigue vigente) · **Fecha:** 2026-10-16 · **Emisor:** AI-EM-ARCH · **Estado:** Contrato congelado
**Plan:** [2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md](../plans/2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md) v1.1 · **Base:** `main` en `dbdeed79` o posterior (checkpoint de la Ola 1)
**Resuelve:** el `[BLOQUEO]` de B2 (`contracts`), el de B3 (`crm/contacts/**`), la espera de B4 y las diferencias de D1 contra §2.5.

## 0. Decisiones nuevas del CTO (2026-10-16)

| # | Decisión |
| --- | --- |
| D-1B-5 | Los datos personales del contrato se **anonimizan**. El contrato **no se borra**: sigue siendo insumo de las consultas de todo el sistema, y en todas partes debe verse que fue anonimizado |
| D-1B-6 | Los datos de un titular bloqueado los ve quien tiene una finalidad legal: el Oficial de protección de datos (`privacy.read`) y facturación y cobro, con un permiso nuevo y propio (`crm.blocked_data.read`). Ventas y técnicos no los ven en CRM; el técnico conserva la dirección en la orden de WFM |

## 1. Correcciones del emisor sobre v1.0

| # | v1.0 decía | v1.1 dice | Motivo |
| --- | --- | --- | --- |
| E1 | R10: «`PATCH` del suscriptor **y de sus contactos**» | R10 cubre el suscriptor, el expediente, la conversión y las mutaciones de contrato (§5). `crm/contacts/**` queda fuera | `ContactsModule` está desmontado (D-CONT): esas rutas no existen |
| E2 | R8: «sin `privacy.read`» | «sin `privacy.read` **ni** `crm.blocked_data.read`» | D-1B-6 |
| E3 | §2.5: participante CRM con cinco tablas | Suma `contracts` y `quotes` (§2) | D-1B-5 |
| E4 | §2.5: filas de WFM y `tasks` | Reemplazadas por la tabla de D1, que prevalece, con el encadenamiento de §4 | D1 §3 |

## 2. `contracts` y `quotes` en el participante CRM (B2)

**Alcance de filas:** `contracts.subscriber_id ∈ subscriberIds`; `quotes` con `subscriber_id ∈ subscriberIds` o `expediente_id ∈ expedienteIds`. Solo se llega aquí sin deber de conservación (ningún contrato abierto y la retención vencida, §2.7 de v1.0).

| Tabla | Columna | Migración | Regla | Categoría |
| --- | --- | --- | --- | --- |
| `contracts` | `installation_address`, `installation_postal_code`, `installation_notes` | 029 | → `NULL` | `UBICACION` |
| `contracts` | `fiscal_name`, `fiscal_document`, `fiscal_address` | 029 | → `NULL` | `FISCAL` |
| `contracts` | `alias` | 029 | → `ANONIMIZADO` (texto libre que puede llevar el nombre) | `IDENTIFICACION` |
| `contracts` | `stratum_evidence_media_id` | 144 | **se conserva el id**; el asset se borra lógicamente con `MediaErasureParticipant` si no está compartido | `EVIDENCIA_DOCUMENTAL` |
| `contracts` | `vat_snapshot`, `plan_snapshot_json` | 144, 028 | Se recorren las claves; las que coinciden con la lista de claves personales (`name`, `fullName`, `firstName`, `lastName`, `document*`, `email`, `phone*`, `address*`, `latitude`, `longitude`, `fiscal*`) se eliminan. La verificación de residuales recorre las mismas claves | `COMERCIAL` |
| `quotes` | `plan_snapshot_json` | 028 | La misma regla de claves | `COMERCIAL` |
| `contracts` | `installation_city`, `installation_department`, `installation_stratum`, `service_usage`, `customer_segment`, plan, productos, ciclo, medio de pago, estado y fechas | 028, 029, 144 | **Se conservan**: sin dirección no identifican, y son el insumo de las consultas y los reportes | — |

## 3. Marca de anonimización visible en todo el sistema (D-1B-5)

### 3.1 Migración tenant `150_titular_anonymization_marker.ts` (B1)

```sql
ALTER TABLE party
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz,
  ADD COLUMN IF NOT EXISTS anonymized_request_id uuid;
ALTER TABLE subscribers
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz,
  ADD COLUMN IF NOT EXISTS anonymized_request_id uuid;
ALTER TABLE expediente_records
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz,
  ADD COLUMN IF NOT EXISTS anonymized_request_id uuid;
-- en cada tabla:
--   CHECK ((anonymized_at IS NULL) = (anonymized_request_id IS NULL))
```

- Sin FK hacia `data_subject_requests`, para no atar tablas de CRM y `parties` a `privacy`. El id solo sirve de enlace.
- Trigger `titular_prevent_anonymization_rewrite` (`ERRCODE 55000`): una vez puesta, la marca no cambia ni vuelve a `NULL`.
- `down` simétrico; integración Postgres.

### 3.2 Quién la escribe (B2)

`PartyTitularErasureParticipant` y `CrmTitularErasureParticipant` ponen `anonymized_at = now()` y `anonymized_request_id = requestId` en cada fila de `party`, `subscribers` y `expediente_records` del alcance. El CLI hace lo mismo con su `--request`. La verificación exige la marca en el 100 % de esas filas.

### 3.3 Cómo se expone (B3)

| Proyección | Campos nuevos |
| --- | --- |
| Suscriptor: ítem, detalle y 360° | `anonymizedAt: string \| null`, `anonymizedRequestId: string \| null` |
| Contrato: `GET crm/contracts`, `GET crm/contracts/:id`, `GET crm/subscribers/:id/contracts` y los contratos del 360° | `titularAnonymizedAt: string \| null`, tomado del suscriptor |
| Expediente: listado y detalle | `anonymizedAt`, `anonymizedRequestId` |

Los esquemas viven en `packages/shared/src/schemas/subscriber.schema.ts` y `contract.schema.ts` (B3). Los tipos de expediente del portal están en `api-client.ts` (B4).

### 3.4 Cómo se muestra (B4)

- Con `anonymizedAt` (o `titularAnonymizedAt`), cada campo personal vacío se muestra como **«Anonimizado»**, nunca en blanco ni como «null».
- Una insignia «Titular anonimizado · {fecha}» aparece en la cabecera del suscriptor, del expediente y en `ContractCard` / `ContractDetailDrawer`.
- Con `privacy.read`, la insignia enlaza a `/privacy/requests/{anonymizedRequestId}`; sin ese permiso no hay enlace.
- En WFM y `tasks` no cambia la UI: los centinelas `ANONIMIZADO` ya se ven en el texto de la orden.

## 4. WFM y `tasks`: la tabla de D1 con su encadenamiento (B2)

Las reglas columna por columna son las de [D1 §1](../informes/INFORME-PRIVACY-FASE-1B-D1-v1.0.md), sin reinterpretar. Se aceptan:
- **N1:** `execution_order_activities.description` → `ANONIMIZADO`, sin migración;
- **N2:** `task_timeline_events.payload` → `'{}'`.

El alcance de filas se calcula **en este orden**, con ids comparados como texto donde la columna es `VARCHAR`:

| Paso | Conjunto | Regla |
| --- | --- | --- |
| 1 | `VR` (`visit_requests`) | `expediente_id ∈ E` o `subscriber_id ∈ S` |
| 2 | `SE` (`schedule_events`) | `expediente_id ∈ E`, `subscriber_id ∈ S` o `id ∈ VR.schedule_event_id` |
| 3 | `WO` (`work_orders`) | `id ∈ VR.work_order_id ∪ SE.work_order_id`, `scheduled_event_id ∈ SE`, o `source_context = 'CRM'` y `source_ref ∈ E ∪ S` |
| 4 | `EO` (`execution_orders`) | `visit_request_id ∈ VR`, `schedule_event_id ∈ SE`, o `id ∈ VR.execution_order_id ∪ SE.execution_order_id` |
| 5 | Hijas | `work_order_tasks` por `WO`; `schedule_reschedule_logs` por `SE`; `execution_order_activities`, `execution_order_evidence` y `execution_order_status_transitions` por `EO` |
| 6 | `OT` (`operational_tasks`) | `origin_context = 'CRM'` y `origin_ref_id ∈ E ∪ S`; `recipient_type ∈ ('SUBSCRIBER','PROSPECT')` y `recipient_ref_id ∈ E ∪ S`; `schedule_event_id ∈ SE`; o `work_order_id ∈ WO`. Sus hijas, `task_timeline_events` y `task_assignment_history`, por `task_id` |

`E` = expedientes del alcance y `S` = suscriptores del alcance. Los assets de `execution_order_evidence.media_asset_id` van a `MediaErasureParticipant` con la regla de no compartidos.

**Dueños:**
- `WfmTitularErasureParticipant`: pasos 1 a 3, `work_order_tasks` y `schedule_reschedule_logs`.
- `ExecutionOrderTitularErasureParticipant`: paso 4 y las hijas de `EO`.
- `OperationalTaskTitularErasureParticipant` (archivo nuevo en `tasks`): paso 6.

## 5. Lectura de datos bloqueados (D-1B-6)

### 5.1 Permiso (B1)

- `@iwana/shared`: `AccessPermissionKey.CRM_BLOCKED_DATA_READ = 'crm.blocked_data.read'`.
- Migración tenant `151_seed_blocked_data_permission.ts`, con el patrón de la 147:
  - entrada en `access_permission_catalog` (módulo `crm`, acción `blocked_data.read`, `catalog_version = 'ADR-094_PRIVACY_V1B'`);
  - perfil de sistema **«Facturación y cobro»** con `base_role_constraint = 'ACCOUNTANT'` y solo ese permiso.
  - El perfil no se asigna a nadie: lo asigna el administrador del ISP.
- `access-permission-catalog.invariant.spec.ts` debe quedar verde.

### 5.2 Evaluación (B3)

`canSeeBlocked = permisos.has(PRIVACY_READ) || permisos.has(CRM_BLOCKED_DATA_READ)`. Esto reemplaza la condición de §2.11 de v1.0 en la redacción (R8), en la búsqueda (R9) y en la auditoría.

- **Lectura individual** con `canSeeBlocked` sobre un bloqueado: `RECORD_ACCESS` con metadata `{ privacyMark: 'DATOS_BLOQUEADOS', grantedBy: 'PRIVACY_READ' | 'CRM_BLOCKED_DATA_READ' }`.
- **Listado** que sirve filas bloqueadas sin redactar: el `LIST_ACCESS` vigente agrega `blockedServed: <n>`.

### 5.3 Mutaciones (B3, R10 corregida)

409 `PRIVACY_DATA_BLOCKED` sobre un titular bloqueado en:
- `PATCH crm/subscribers/:id`;
- la edición de expediente y la conversión;
- `PATCH crm/contracts/:id`, `PATCH crm/contracts/:id/service-point` y `POST crm/contracts/:id/stratum-evidence`;
- la creación de contratos y de contratos desde expediente para ese titular.

`crm.blocked_data.read` es de **lectura**: no habilita ninguna mutación.

## 6. Pasada regla → campo (solo lo nuevo)

| Regla | Campo, endpoint o puerto | Bloque | Test que la prueba |
| --- | --- | --- | --- |
| R14 (D-1B-5) contrato anonimizado y conservado | §2, filas de `contracts` y `quotes` | B2 | Integración: columnas de §2 en `NULL` o centinela; conservadas iguales; snapshot sin claves personales; conteo de contratos igual antes y después |
| R15 marca visible | 150, §3.2, §3.3, §3.4 | B1, B2, B3, B4 | Integración: marca en el 100 % del alcance; trigger impide reescribirla. HTTP: los campos en cada proyección de §3.3. Componente: «Anonimizado» e insignia, con y sin enlace |
| R16 permiso de facturación | 151, enum, §5.2 | B1, B3 | Invariante del catálogo; HTTP: `ACCOUNTANT` con el perfil ve completo y se audita `grantedBy`; sin el perfil, redactado; `SALES` y `TECHNICIAN`, redactado |
| R10 corregida | §5.3 | B3 | HTTP: 409 por endpoint; con `crm.blocked_data.read`, también 409 |
| R7 ampliada | §4 | B2 | Integración con un tenant sembrado con la cadena completa: visita → evento → orden de trabajo → orden de ejecución → tarea operativa, más sus hijas |

**Cruce con estados (lección A22):**
- Un titular **anonimizado** no está bloqueado: la supresión procedente no abre `DATOS_BLOQUEADOS`. Si el titular **ya estaba bloqueado** y la retención venció, puede volver a pedir la supresión. En ese caso, `resolve` de SUPRIMIR **cierra** (`CLOSE`) la marca `DATOS_BLOQUEADOS` abierta del Party en la misma transacción (B1, §2.7 de v1.0, paso 6). Test de integración: bloqueado → retención vencida → nueva solicitud → anonimizado y sin marca activa.
- Sus proyecciones muestran «Anonimizado» a todos, incluso con `canSeeBlocked`, porque los datos ya no existen.
- R10 no aplica a anonimizados. Editar un contrato anonimizado es válido: un operador puede corregir el estado. Sí aplica el trigger de la marca.

## 7. Propiedad v1.1 (reemplaza §4 de v1.0 donde difiere)

| Bloque | Agente | Suma a su propiedad de v1.0 | Primer paso |
| --- | --- | --- | --- |
| B1 | `sr-backend` | Migraciones 150 y 151 (es **el único** que edita `runner.ts`), `packages/shared/src/enums/access-control/access-permission-key.enum.ts`, el cierre de `DATOS_BLOQUEADOS` al resolver la supresión (§6) | **S1′:** 150, 151 y el enum; avisa. Después, el cierre de la marca y **S3** cuando B2 lo reporte |
| B2 | `sr-backend` | `OperationalTaskTitularErasureParticipant` en `tasks`; las reglas de §2 dentro del participante CRM | Arranca **ya** con la extracción del CLI (no necesita S1′); la marca, tras S1′ |
| B3 | `sr-backend` | `apps/api/src/modules/crm/contracts/**` (proyecciones y guardas de §5.3), `packages/shared/src/schemas/contract.schema.ts` | Tras S1′; publica los esquemas de §3.3 primero y avisa **S2′** |
| B4 | `fe-platform` | `apps/portal/src/components/crm/expedientes/**`; `ContractCard` y `ContractDetailDrawer` ya están en su propiedad | Tras S2′ |

D1 está cerrado. Sin cambios en la Ola 2 de v1.0 §5, salvo:
- V1 agrega los casos de R15 y R16;
- V2 verifica que `apps/api/src/modules/wfm/services/visit-requests.service.spec.ts:785` use un valor sintético (D1, deuda baja).

## 8. Deuda registrada (fuera de la Fase 1b)

| Severidad | Deuda | Dueño |
| --- | --- | --- |
| P2 | `contracts.fiscal_document` (029) se guarda **en claro**, sin cifrado ni HMAC, contra la regla de PII de ADR-058 | MOD05 (backlog, con M04) |
| P2 | Cuando exista facturación, el soporte fiscal (10 años, Ley 962 art. 28) debe entrar en `conservationDuty` como deber propio | Fase de facturación |
| P3 | Cierre de `DATOS_BLOQUEADOS` al vencer la retención | Fase 2 de privacidad |
