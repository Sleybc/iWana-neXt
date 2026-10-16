# PROMPT — `privacy` Fase 1b · Bloqueo, anonimización y plazo de traslado

**Versión:** 1.0 · **Fecha:** 2026-10-16 · **Emisor:** AI-EM-ARCH · **Estado:** Contrato congelado, sujeto a las decisiones D-1B-1 a D-1B-4 del [plan](../plans/2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md) §1
**Autoridad:**
- [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) (supresión, bloqueo, H5);
- [HLD-PRIVACY-HABEAS-DATA-v1.0](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.0.md) §§ puertos y defectos conocidos;
- [prompt Fase 1 v1.3](PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md) D-F1A (cinco puntos abiertos de Q8);
- [runbook manual](../runbooks/RUNBOOK-PRIVACY-BLOQUEO-SUPRESION-MANUAL-v1.0.md) y su Anexo A (inventario base).

**Base:** `main` en `aeedeffc` o posterior. Última migración tenant: `148`. Se trabaja sobre `main`, sin ramas.

## 0. Hechos verificados en el código (2026-10-16)

| # | Hecho | Fuente |
| --- | --- | --- |
| H1 | CRM ya lee las marcas por lote: `IPrivacyMarksReadPort.activeMarks(partyIds)`, y los listados de suscriptores y expedientes ya devuelven `privacyMarks` | `subscribers.service.ts:606`, `expediente.service.ts:771` |
| H2 | `IPersonalDataBlockPort` e `IPersonalDataErasurePort` solo tienen adaptadores `Unavailable`; **nadie los llama** | `unavailable-privacy-ports.adapters.ts`, `privacy.module.ts:110-120` |
| H3 | Patrón vigente para puertos de `privacy` implementados por CRM: `CrmPrivacyAdaptersModule` (importado con `forwardRef`), con `ctx: { manager }` para compartir la transacción | `crm-privacy-adapters.module.ts`, `contract-impersonation.port.ts` |
| H4 | El CLI `anonymize-titular.ts` (1 298 líneas) ya anonimiza en una transacción con verificación de residuales; tiene integración contra Postgres | `apps/api/src/cli/anonymize-titular.ts:943`, `anonymize-titular.postgres.integration.spec.ts` |
| H5 | `resolve` de SUPRIMIR **sin** `party_id` lanza 409: hoy un prospecto sin Party no puede obtener supresión | `requests.service.ts:712-716` |
| H6 | `reject` de SUPRIMIR abre `DATOS_BLOQUEADOS` también con `DEBER_CONTRACTUAL` | `requests.service.ts:801-804` |
| H7 | **Brecha nueva:** WFM y `tasks` copian ubicación y etiqueta del cliente, y ni el CLI ni el Anexo A las anonimizan | `visit_requests` (034), `schedule_events` (030), `execution_orders.customer_display_label`/`service_address` (046) |
| H8 | Typesense indexa solo `tenants`, `users` y `navigationModules`: no hay PII de CRM en el índice | `search-indexer.service.ts` |
| H9 | `potential_leads` no tiene migración (D-POT) | TA1 |
| H10 | La tabla de solicitudes no guarda el resultado de la supresión ni el plazo de traslado | `146_privacy_module.ts` |

## 1. Reglas (R) de la Fase 1b

| R | Regla |
| --- | --- |
| R1 | `reject` de SUPRIMIR abre `DATOS_BLOQUEADOS` **solo** con `DEBER_LEGAL_CONSERVACION`. Con `DEBER_CONTRACTUAL` responde sin marca (D-1B-1) |
| R2 | `resolve` de SUPRIMIR **exige** `erasure.confirm = true` y ejecuta la anonimización en la **misma transacción**; si la verificación de residuales falla, nada se confirma |
| R3 | Un prospecto sin Party obtiene supresión: sus expedientes se ubican por `document_number_hmac = requester_document_hmac`. Si ese HMAC coincide con algún `subscribers` y la solicitud no tiene Party, es 409 hasta conciliar |
| R4 | Los expedientes a anonimizar los calcula el servidor; el cuerpo de `resolve` los repite y deben **coincidir exactamente** (concurrencia optimista). En la app no existe `--confirm-unmatched` (D-1B-4) |
| R5 | Una cuenta de usuario enlazada y **activa** (`deleted_at IS NULL`) impide la supresión; una dada de baja se anonimiza |
| R6 | Se conservan: la solicitud y sus eventos, `data_authorizations`, `party_privacy_marks`, `audit_logs`, y los registros (no sus campos personales) |
| R7 | La supresión cubre también WFM y `tasks` (D-1B-2) |
| R8 | Un titular con `DATOS_BLOQUEADOS` activo se ve **redactado** en listados, detalle y 360° para quien no tenga `privacy.read`; con `privacy.read` se ve completo y la lectura se audita |
| R9 | Un titular bloqueado **no aparece** en búsquedas por texto o documento para quien no tenga `privacy.read` |
| R10 | Un titular bloqueado no admite mutaciones por endpoints de CRM (409) |
| R11 | `transferDueAt` = radicación + 2 días hábiles colombianos; `transferredLate` se deriva del evento de traslado. No bloquea el traslado |
| R12 | El bloqueo se aplica en la lectura, desde las marcas: se retira `IPersonalDataBlockPort` (D-1B-3) |
| R13 | El CLI pasa a ser envoltorio de los mismos participantes: una sola lógica de anonimización |

## 2. Contratos congelados

### 2.1 Migración tenant `149_privacy_erasure_record.ts` (B1)

```sql
ALTER TABLE data_subject_requests
  ADD COLUMN IF NOT EXISTS erased_at timestamptz,
  ADD COLUMN IF NOT EXISTS erasure_categories text[] NOT NULL DEFAULT '{}';
ALTER TABLE data_subject_requests
  ADD CONSTRAINT ck_data_subject_requests_erasure_scope
    CHECK (erased_at IS NULL OR ("right" = 'SUPRIMIR' AND status = 'RESUELTA')),
  ADD CONSTRAINT ck_data_subject_requests_erasure_categories_pair
    CHECK (erased_at IS NOT NULL OR cardinality(erasure_categories) = 0),
  ADD CONSTRAINT ck_data_subject_requests_erasure_categories_known
    CHECK (erasure_categories <@ ARRAY['IDENTIFICACION','CONTACTO','UBICACION','FISCAL',
      'COMERCIAL','EVIDENCIA_CONSENTIMIENTO','CUENTA_USUARIO','EVIDENCIA_DOCUMENTAL',
      'OPERACION_CAMPO']::text[]);
```

Más un trigger `privacy_prevent_erasure_rewrite` (patrón de `privacy_prevent_verified_identity_change`, `ERRCODE 55000`): si `OLD.erased_at IS NOT NULL`, `erased_at` y `erasure_categories` no cambian. `down` simétrico. Integración y spec como las de la 146. Sin otras tablas.

### 2.2 `@iwana/shared` — `packages/shared/src/schemas/privacy/requests.ts` (B1)

```ts
export const erasureCategorySchema = z.enum(['IDENTIFICACION','CONTACTO','UBICACION','FISCAL',
  'COMERCIAL','EVIDENCIA_CONSENTIMIENTO','CUENTA_USUARIO','EVIDENCIA_DOCUMENTAL','OPERACION_CAMPO']);
export const erasureBlockerSchema = z.enum(['IDENTITY_NOT_VERIFIED','INVALID_STATUS',
  'CONSERVATION_DUTY','UNRECONCILED_TITULAR','ACTIVE_USER_ACCOUNT']);

// resolveRequestSchema gana un campo opcional; .strict() se mantiene
erasure: z.object({
  confirm: z.literal(true),
  expedienteIds: z.array(z.string().uuid()).max(50),
}).strict().optional(),

export const erasurePreviewSchema = z.object({
  eligible: z.boolean(),
  blockers: z.array(erasureBlockerSchema),
  candidateExpedienteIds: z.array(z.string().uuid()),
  counts: z.record(erasureCategorySchema, z.number().int().nonnegative()),
  categories: z.array(erasureCategorySchema),
}).strict();
```

El detalle (`dataSubjectRequestDetailSchema`) y el resumen ganan:
- `transferDueAt: civilDateSchema`;
- `transferredLate: z.boolean().nullable()` (`null` salvo en `TRASLADADA`);
- `erasedAt: z.string().datetime().nullable()`;
- `erasureCategories: z.array(erasureCategorySchema)`.

`packages/shared/src/schemas/subscriber.schema.ts` (B3): el ítem y el detalle ganan `privacyRestricted: boolean` (siempre presente).

### 2.3 Endpoints de `privacy` (B1)

| Método y ruta | Permiso y roles | Cuerpo y respuesta | Errores |
| --- | --- | --- | --- |
| `GET /privacy/requests/:id/erasure-preview` | `PRIVACY_MANAGE`, los mismos roles que `POST …/resolve` | `{ data: ErasurePreview }`; no devuelve PII ni HMAC | 404; 422 si `right ≠ SUPRIMIR` (`PRIVACY_ERASURE_NOT_APPLICABLE`) |
| `POST /privacy/requests/:id/resolve` (existente) | sin cambio | `erasure` obligatorio si `right = SUPRIMIR`, prohibido si no | 422 `PRIVACY_ERASURE_CONFIRMATION_REQUIRED` · 422 `PRIVACY_ERASURE_NOT_APPLICABLE` · 409 `PRIVACY_ERASURE_CANDIDATES_CHANGED` · 409 `PRIVACY_ERASURE_UNRECONCILED_TITULAR` · 409 `PRIVACY_ERASURE_ACTIVE_ACCOUNT` · 409 deber de conservación (mensaje vigente) |

Todo error de dominio lleva `code` con el patrón `^[A-Z][A-Z0-9_]{2,63}$`. `preview` calcula los bloqueos sin escribir; `eligible = blockers.length === 0`.

### 2.4 Puerto de anonimización — `privacy/ports/personal-data-erasure.port.ts` (lo reescribe B1 en su primer paso)

```ts
import type { EntityManager } from 'typeorm';
import type { ErasureBlocker, ErasureCategory } from '@iwana/shared';

export interface PersonalDataErasureTarget {
  requestId: string;
  partyId: string | null;
  requesterDocumentHmac: string | null;
}
export interface PersonalDataErasurePlan {
  candidateExpedienteIds: string[];
  blockers: Extract<ErasureBlocker, 'UNRECONCILED_TITULAR' | 'ACTIVE_USER_ACCOUNT'>[];
  counts: Record<ErasureCategory, number>;
}
export abstract class IPersonalDataErasurePort {
  abstract plan(target: PersonalDataErasureTarget, ctx: { manager: EntityManager }): Promise<PersonalDataErasurePlan>;
  abstract anonymize(
    input: PersonalDataErasureTarget & { expedienteIds: string[]; actorId: string },
    ctx: { manager: EntityManager },
  ): Promise<{ categories: ErasureCategory[]; changedRows: number }>;
}
```

- `anonymize` vuelve a calcular el plan dentro de la transacción y lanza `PRIVACY_ERASURE_CANDIDATES_CHANGED` si `expedienteIds` difiere como conjunto. También lanza `PRIVACY_ERASURE_VERIFICATION_FAILED` si queda algún residual. Las dos excepciones revierten todo.
- `categories` incluye una categoría solo si cambió al menos una fila.
- **Se elimina** `IPersonalDataBlockPort` con su adaptador `Unavailable`, sus exports y sus specs (R12).

### 2.5 Participantes por módulo dueño (B2)

Cada módulo anonimiza **sus** tablas. Interfaz común, en `apps/api/src/modules/crm/privacy-adapters/titular-erasure/titular-erasure.types.ts`:

```ts
export interface TitularErasureScope {
  partyId: string | null; subscriberIds: string[]; expedienteIds: string[]; userIds: string[];
}
export interface TitularErasureTableResult {
  table: string; category: ErasureCategory; selected: number; changed: number; residual: number;
}
export interface TitularErasureParticipant {
  plan(scope: TitularErasureScope, qr: QueryRunner): Promise<TitularErasureTableResult[]>;     // sin escribir
  apply(scope: TitularErasureScope, qr: QueryRunner, mode: 'dry-run' | 'apply'): Promise<TitularErasureTableResult[]>;
}
```

| Participante (archivo nuevo) | Módulo | Tablas y reglas de campo |
| --- | --- | --- |
| `CrmTitularErasureParticipant` | `crm` | `expediente_records`, `contact_attempts`, `consent_records`, `coverage_checks`, `subscribers`: las reglas del Anexo A, **movidas** desde el CLI, sin cambiar su semántica |
| `PartyTitularErasureParticipant` | `parties` | `party`, `party_contact`: Anexo A |
| `UserAccountErasureParticipant` | `users` | `users` enlazados por `subscribers.user_id` **o** `users.party_id`; R5; `email = anon+<uuid>@anon.invalid` y HMAC recalculado (Anexo A) |
| `MediaErasureParticipant` | `media` | `public.media_assets`: soft-delete con las reglas del Anexo A, más la evidencia de `execution_order_evidence` de las órdenes del alcance que no esté compartida |
| `WfmTitularErasureParticipant` | `wfm` | `visit_requests` y `schedule_events` con `expediente_id` en el alcance o `subscriber_id` en el alcance: `address`, `municipality`, `sector` (si existe), `latitude`, `longitude`, `description`, `origin_label` → `NULL`; `title` → `ANONIMIZADO` |
| `ExecutionOrderTitularErasureParticipant` | `tasks` | `execution_orders` con `visit_request_id` o `schedule_event_id` del alcance: `customer_display_label` → `ANONIMIZADO`; `service_address`, `municipality`, `sector`, `work_instructions`, `close_notes` → `NULL`. `work_summary` según D1 |

- Los participantes solo dependen de `ConfigService` (claves PII y HMAC, siempre desde `ConfigService`: lección R8/L1). Así el CLI puede construirlos sin Nest.
- Cada módulo exporta su participante; `CrmPrivacyAdaptersModule` importa esos módulos y arma `CrmPersonalDataErasureAdapter implements IPersonalDataErasurePort`. Usa `ctx.manager.queryRunner`; si no hay `queryRunner`, lanza un error.
- Las columnas se leen con `information_schema`, igual que hoy en el CLI (tenants con DDL distinto).

**Mapa tabla → categoría:**
- `IDENTIFICACION`: documentos, nombres y nacimiento de `party`, `subscribers` y `expediente_records`.
- `CONTACTO`: `party_contact`, contacto de `subscribers` y `expediente_records`, `contact_attempts`.
- `UBICACION`: direcciones y coordenadas de `expediente_records`, `subscribers`, `party` y `coverage_checks`.
- `FISCAL`: los campos fiscales de `expediente_records` y el NIT de `subscribers`.
- `COMERCIAL`: notas, presupuesto, campaña y `source_detail` de `expediente_records`.
- `EVIDENCIA_CONSENTIMIENTO`: `consent_records`.
- `CUENTA_USUARIO`: `users`.
- `EVIDENCIA_DOCUMENTAL`: `media_assets`.
- `OPERACION_CAMPO`: WFM y `tasks`.

### 2.6 CLI (B2, R13)

`anonymize-titular.ts` conserva sus flags, su salida y `--confirm-unmatched` como vía de emergencia. Por dentro arma los seis participantes. Su integración vigente tiene que pasar **sin editar sus aserciones**; se agrega un caso con WFM y `tasks`. El informe del CLI gana `visitRequests`, `scheduleEvents` y `executionOrders` en `totals` y en `changed`.

### 2.7 Flujo de `resolve` de SUPRIMIR (B1)

En la transacción de `transition`, después de `FOR UPDATE`:
1. Se mantienen la identidad verificada y el estado `EN_TRAMITE` o `PRORROGADA`.
2. **Deber de conservación:** con `partyId`, es la regla vigente (`conservationDuty`). Sin `partyId`, la decide el plan del puerto: `UNRECONCILED_TITULAR` → 409. Sin coincidencias no hay deber, y la supresión procede aunque no haya datos (`categories = []`).
3. `plan` → si hay `ACTIVE_USER_ACCOUNT` o `UNRECONCILED_TITULAR`, 409 con su código.
4. `anonymize(…, { manager })`.
5. `UPDATE data_subject_requests SET status, response_text, response_channel, resolved_at, resolved_by, erased_at = now(), erasure_categories = $categories`.
6. Cierre de `RECLAMO_EN_TRAMITE` como hoy. Evento con `reason = 'RESOLVE'`.
7. Auditoría: `AuditAction.UPDATE` sobre `data_subject_request`, con metadata `{ erasure: { categories, changedRows } }`, sin PII ni HMAC.

### 2.8 Rechazo (B1, R1)

En `requests.service.ts:801`, la marca se abre si `right === 'SUPRIMIR' && basis === 'DEBER_LEGAL_CONSERVACION'`. Con `DEBER_CONTRACTUAL` no se escribe marca. Test de las dos ramas.

### 2.9 Traslado (B1, R11)

- `transferDueAt = addColombiaBusinessDays(bogotaCivilDate(received_at), 2)`, calculado en la lectura; sin columna.
- `transferredLate` = la fecha civil de Bogotá del evento cuyo `to_status = 'TRASLADADA'` > `transferDueAt`.
- `transfer` fuera de plazo procede igual, y su auditoría lleva `late: true`.

### 2.10 Marcas: lectura nueva (B1)

`IPrivacyMarksReadPort` gana `partyIdsWithActiveMark(mark: PrivacyMark): Promise<string[]>`, implementado en `PrivacyMarksAdapter` con la misma regla de «marca activa» que `activeMarks` (el último evento es `OPEN`).

### 2.11 Proyecciones de CRM bloqueadas (B3, R8 a R10)

- **Cómo se evalúa:** `privacyRestricted = marks.includes('DATOS_BLOQUEADOS') && !permisos.has(PRIVACY_READ)`. Los permisos se leen con `EffectivePermissionsService.getEffectivePermissionsForUser(actorId)`, una sola vez por request (patrón de `requests.service.ts:429`).
- **Suscriptores** (`sanitizeResponse` y el listado), con lista blanca: `id`, `tenantId`, `partyId`, `userId`, `personType`, `customerSegment`, `documentType`, los campos de estado, `vatTreatment`, `taxRegime`, `expedienteId`, `convertedAt`, `activatedAt`, `createdAt`, `updatedAt`, `privacyMarks` y `privacyRestricted`. **Todo otro campo sale `null`**; `contactPending` sale `false`.
- **Expedientes** (listado y detalle): la misma regla. El agente fija la lista blanca en su informe, con identificadores, etapa, estado, fechas, asignaciones, `privacyMarks` y `privacyRestricted`.
- **360°:** suscriptor redactado; en `contracts`, los campos de dirección, coordenadas y evidencia de estrato → `null`. `habeasData` y `arcoRequests` no cambian.
- **Con `privacy.read`:** proyección completa y `RECORD_ACCESS` con metadata `{ privacyMark: 'DATOS_BLOQUEADOS' }`.
- **Búsqueda (R9):** en `GET /crm/subscribers` con `search` o criterios exactos, en `GET /crm/subscribers/search` y en la búsqueda de expedientes, sin `privacy.read` se agrega `party_id <> ALL($blocked)` con `partyIdsWithActiveMark('DATOS_BLOQUEADOS')`. Un listado sin búsqueda **sí** incluye la fila, redactada.
- **Mutaciones (R10):** `PATCH` del suscriptor y de sus contactos, edición de expediente y conversión sobre un titular bloqueado → 409 `PRIVACY_DATA_BLOCKED`.

### 2.12 Portal (B4)

| Superficie | Cambio |
| --- | --- |
| `PrivacyRequestDetail.tsx`, acción «Resolver» de SUPRIMIR | Abre un diálogo con `GET …/erasure-preview`. Muestra los conteos por categoría, el número de expedientes y los bloqueos con texto en español. Una casilla **sin marcar** dice «Entiendo que los datos personales se anonimizarán de forma irreversible». «Resolver y anonimizar» solo se habilita con `eligible` y la casilla marcada. Envía `erasure: { confirm: true, expedienteIds: candidateExpedienteIds }`. Si llega 409 `PRIVACY_ERASURE_CANDIDATES_CHANGED`, recarga la vista previa |
| Detalle de solicitud | `transferDueAt` como «Plazo de traslado»; insignia «Traslado extemporáneo» si `transferredLate`; bloque «Supresión ejecutada» con `erasedAt` y las categorías en español |
| `SubscribersListClient`, `SubscriberDetailClient`, `ExpedientesLandingClient` | Con `privacyRestricted`, los campos se muestran como «Datos bloqueados», sin acciones de edición. Nunca se muestra «null» ni «undefined» |
| `api-client.ts` | Tipos desde `@iwana/shared`; sin tipos duplicados |

Componentes existentes de `@iwana/ui` (diálogo de confirmación, insignia). No hay tokens nuevos.

## 3. Pasada regla → campo

| Regla | Campo, endpoint o puerto | Bloque | Test que la prueba |
| --- | --- | --- | --- |
| R1 | `requests.service.ts:801`, condición `basis` | B1 | Unidad: dos ramas. Integración: sin fila en `party_privacy_marks` con `DEBER_CONTRACTUAL` |
| R2 | `resolveRequestSchema.erasure`, §2.7, `erased_at`, `erasure_categories` | B1 + B2 | Integración: fallo provocado en un participante → la solicitud sigue `EN_TRAMITE` y ninguna fila cambió |
| R3 | `PersonalDataErasureTarget.requesterDocumentHmac`, `plan().candidateExpedienteIds`, `UNRECONCILED_TITULAR` | B1 + B2 | Integración: prospecto sin Party resuelto; HMAC con `subscribers` → 409 |
| R4 | `erasure.expedienteIds` frente a `plan` dentro de la transacción | B1 + B2 | Integración: un expediente creado entre la vista previa y `resolve` → 409 `PRIVACY_ERASURE_CANDIDATES_CHANGED` |
| R5 | `UserAccountErasureParticipant`, `ACTIVE_USER_ACCOUNT` | B2 | Integración: cuenta activa → 409; dada de baja → `anon+…@anon.invalid` |
| R6 | La lista de tablas de §2.5 **no** incluye `data_subject_requests`, eventos, autorizaciones, marcas ni auditoría | B2 | Integración: conteos de esas tablas iguales antes y después |
| R7 | `WfmTitularErasureParticipant`, `ExecutionOrderTitularErasureParticipant` | B2 (+ D1) | Integración: visita, evento y orden del expediente anonimizados |
| R8 | `privacyRestricted`, lista blanca, `RECORD_ACCESS` | B3 | Unidad: recorre **todas** las claves de la respuesta; HTTP: con y sin `privacy.read` |
| R9 | `partyIdsWithActiveMark`, filtro `<> ALL` | B1 (puerto) + B3 | Integración: la búsqueda por documento no devuelve al bloqueado sin `privacy.read` |
| R10 | 409 `PRIVACY_DATA_BLOCKED` | B3 | HTTP por endpoint |
| R11 | `transferDueAt`, `transferredLate` | B1 | Unidad con festivos: radicación un viernes antes de un lunes festivo |
| R12 | Retiro de `IPersonalDataBlockPort` | B1 | `privacy.module.spec.ts` sin el token; `rg IPersonalDataBlockPort` vacío |
| R13 | El CLI usa los participantes | B2 | La integración vigente del CLI pasa sin cambiar sus aserciones |
| UI | §2.12 | B4 | E2E (Ola 2) |

**Cruce de precondiciones con cada estado destino (lección A22):**
- `erasure` solo aplica a `resolve` de SUPRIMIR.
- `reject`, `transfer` y `require-info` de SUPRIMIR **no** anonimizan.
- `reject` por `SOLICITANTE_NO_LEGITIMADO` no exige identidad, como hoy.

## 4. Bloques

### B1 · `sr-backend` · núcleo `privacy`

- **Propiedad:**
  - `apps/api/src/modules/privacy/**`;
  - `packages/shared/src/schemas/privacy/**`;
  - `packages/database/src/migrations/tenant/149_*` y su registro en el runner.
- **Primer paso, antes de todo:** escribir §2.2 (sin `subscriber.schema.ts`), §2.4 y §2.10, tal cual. B2 y B3 importan de ahí.
- **Después:** §2.1, §2.3, §2.7 a §2.9, el retiro de R12 y OpenAPI (`privacy-openapi.schemas.ts`, spec de swagger). Retira el provider `Unavailable` de anonimización **solo** cuando B2 reporte su paso 2; mientras tanto, sus tests usan un doble del puerto.
- **Tests:**
  - unidad y HTTP de cada código de error;
  - integración Postgres de la 149 (`up`, `down` y trigger);
  - `resolve` con un adaptador de anonimización falso que lanza → rollback;
  - cobertura de `apps/api/src/modules/privacy/**` ≥ 80 % en statements y branches.

### B2 · `sr-backend` · participantes y adaptador

- **Propiedad:**
  - `apps/api/src/modules/crm/privacy-adapters/**`;
  - `apps/api/src/cli/anonymize-titular*`;
  - un archivo de participante, más su export en el módulo, en `parties`, `users`, `media`, `wfm` y `tasks`.
- **Orden:**
  1. Extraer los participantes CRM, Party, Users y Media desde el CLI. El CLI pasa a ser envoltorio y su integración debe quedar verde **sin cambiar sus aserciones**.
  2. `CrmPersonalDataErasureAdapter`, registrado y exportado como `IPersonalDataErasurePort` en `CrmPrivacyAdaptersModule`, igual que `IContractImpersonationPort`. B2 **no** toca `privacy/`. Cuando B2 reporte este paso, B1 retira de `privacy.module.ts` el `PersonalDataErasureUnavailableAdapter` y su provider; el token llega por el re-export de `CrmPrivacyAdaptersModule`.
  3. WFM y `tasks`, **después** del informe de D1.
- **Tests:**
  - integración Postgres por participante;
  - integración del adaptador completo con un tenant sembrado: prospecto, ex suscriptor con usuario dado de baja, WFM y `tasks`;
  - `residual = 0` verificado.

### B3 · `sr-backend` · proyecciones de CRM

- **Propiedad:**
  - `apps/api/src/modules/crm/subscribers/**`;
  - `apps/api/src/modules/crm/expedientes/**`;
  - `packages/shared/src/schemas/subscriber.schema.ts`.
- **Alcance:** §2.11. No toca `privacy/`; usa `partyIdsWithActiveMark` desde el puerto (B1, primer paso).
- **Tests:**
  - unidad que recorre las claves;
  - HTTP con y sin `privacy.read`;
  - integración de la búsqueda con exclusión;
  - 409 en las mutaciones.
- **Cobertura:** medir primero la línea base de `crm/subscribers` en `main` y reportarla; el umbral es **no bajar de esa línea**, y ≥ 80 % en los archivos nuevos (lección D1).

### D1 · `data-eng` · inventario WFM y `tasks` (Ola 1, en paralelo)

1. Recorrer **todas** las migraciones (`ADD COLUMN` posteriores) de `visit_requests`, `schedule_events`, `work_orders`, `execution_orders`, `execution_order_activities`, `execution_order_evidence` y cualquier otra tabla con `expediente_id`, `subscriber_id` o `contract_id`. Listar cada columna con dato del titular.
2. Decidir `work_summary` con muestras del seed de desarrollo y los productores (`visit-requests.service.ts:929`, `schedule-events.service.ts:377`).
3. **Actualizar el Anexo A del runbook manual** con esas filas: el runbook sigue vigente hasta que B2 se integre.
4. Informe con la tabla final columna → regla. B2 la aplica sin reinterpretar; si difiere de §2.5, prevalece D1 y AI-EM-ARCH emite el delta.

### B4 · `fe-platform` · portal

- **Propiedad:**
  - `apps/portal/src/components/privacy/**`;
  - `apps/portal/src/components/crm/subscribers/**`;
  - `apps/portal/src/components/crm/expedientes/ExpedientesLandingClient.tsx`;
  - `apps/portal/src/lib/api-client.ts`, solo en los tipos tocados.
- **Arranque:** contra los esquemas de B1 y B3, en cuanto estén escritos.
- **Alcance:** §2.12; tests de componente con estados `eligible` y no `eligible`, bloqueos, 409 de candidatos y redacción.

## 5. Ola 2 · Verificación (nadie corrige)

| # | Agente | Alcance |
| --- | --- | --- |
| V1 | `sr-qa` | E2E de Playwright **contra la API real** sobre `dbiw` migrada hasta la 149, con las precondiciones de dominio escritas en el encargo (texto legal publicado, consentimiento, identidad verificada): (1) prospecto → SUPRIMIR → vista previa → resolver → expediente y visita anonimizados; (2) ex suscriptor dentro de retención → `reject` con `DEBER_LEGAL_CONSERVACION` → listado redactado y búsqueda sin el titular; con `privacy.read`, completo; (3) contrato vigente → `reject` con `DEBER_CONTRACTUAL` → sin bloqueo; (4) traslado fuera de plazo → insignia. Matriz R ↔ test verificada test por test. Conteos reales sin caché |
| V2 | `sec-eng` | ASVS L2: irreversibilidad y atomicidad, ausencia de PII y HMAC en respuestas, logs, auditoría y errores; evaluación de permisos de R8 y R9; enumeración por búsqueda; inyección en el filtro `<> ALL`; claves desde `ConfigService` |
| V3 | `boundary-reviewer` ∥ `contract-drift-reviewer` | Participantes por módulo dueño; ningún módulo escribe tablas ajenas; `forwardRef` sin ciclos nuevos; esquemas de shared frente a productores y consumidores |
| V4 | `gate-verifier` | «Gates Before Merge» de `api`, `shared`, `db` y `portal`, con `--force` y 0 cache hits |
| V5 | `docs-governance` | Los `docs/` de la fase |

V1, V2 y V3 corren en paralelo; V4 y V5 al final. Los hallazgos vuelven a su dueño con un delta de AI-EM-ARCH.

## 6. Reglas comunes

- Leer `AGENTS.md` y los `SKILL.md` de la matriz del plan §3, como documentación.
- No modificar contratos: si falta algo, `[BLOQUEO]` y parar.
- Ninguna PII, ciphertext, HMAC ni clave real en el repo, los informes, los logs ni los mensajes de error.
- No commitear. Verificar que la ruta del informe esté libre antes de escribirlo.
- Informes: `docs/informes/INFORME-PRIVACY-FASE-1B-{bloque}-v1.0.md`, con el conteo real de tests (sin caché, sin `--passWithNoTests`) y la deuda nueva por severidad.
- **Fuera de alcance:**
  - el cierre de `DATOS_BLOQUEADOS` al vencer la retención (Fase 2, purga por retención);
  - el reporte a centrales de riesgo;
  - la facturación, que aún no existe como módulo.
