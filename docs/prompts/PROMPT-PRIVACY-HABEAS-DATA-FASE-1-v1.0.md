# PROMPT DE EJECUCIÓN — Módulo `privacy` · Habeas Data · Fase 1 (ADR-094)

**Version:** 1.0 — **superado** el 2026-10-14 por [v1.1](PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.1.md) (adenda A1–A9); sus secciones no modificadas siguen siendo fuente
**Estado:** Emitido — G4 se firma cuando el CTO lanza la Ola 1
**Fecha:** 2026-10-14
**Plantilla:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) (en revisión)
**Emisor:** AI-EM-ARCH (modo Orchestrator)
**Decisión:** [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) — Aprobado 2026-10-14
**Plan:** [2026-10-14-privacy-habeas-data-fase-1.md](../plans/2026-10-14-privacy-habeas-data-fase-1.md)
**Fecha límite externa:** la Ley 2573 de 2026 (suplantación) rige desde el **19-nov-2026** ⚠. La ruta de suplantación va en la ruta crítica

---

## 0. Cómo se usa

Cada agente ejecuta solo su bloque, dentro de su **propiedad exclusiva**. Los bloques de una ola corren en paralelo contra los contratos de §2. Un cambio de contrato se versiona en este prompt vía AI-EM-ARCH. Ante un bloqueo, emite `[BLOQUEO]` antes de cerrar la sesión.

**Precondición cumplida:** las fases IVA y D-PDF están commiteadas (`4a1b437a`, `9d227eaf`).
**Regla de despacho:** un bloque = una sesión. Antes de relanzar un bloque, cierra la sesión anterior del mismo bloque. Verifica que la ruta del informe esté libre antes de escribirlo.

## 1. Alcance de la Fase 1

ADR-094 D1–D7 y el gobierno de D8 (permiso `privacy.manage`, inventario RNBD y registro de incidentes):
- autorizaciones por finalidad;
- solicitudes con reloj legal, suplantación incluida;
- marcas;
- calendario hábil;
- textos legales;
- catálogo de retención;
- bloqueo y supresión (anonimización) ejecutada a pedido;
- migración de los tres orígenes heredados (`consent_records`, `habeas_data_consents`, `arco_requests`);
- integración con CRM (alta, 360° y suspensión de contratos).

**Fuera:**
- jobs automáticos de anonimización por vencimiento (Fase 2);
- formulario público (Fase 2);
- centrales de riesgo y Ley 2300 (Fase 3);
- empleados;
- corregir `assurance/sla.service.ts` (deuda de `assurance`, en su turno; usará C-CAL-1).

## 2. Contratos congelados

### C-CAL-1 v1.0 — Calendario hábil (`packages/shared/src/calendar/colombia-business-calendar.ts`)

```ts
export function colombiaHolidays(year: number): ReadonlyArray<string>; // 'YYYY-MM-DD', America/Bogota
export function isColombiaBusinessDay(date: string): boolean;          // L–V y no festivo
export function addColombiaBusinessDays(fromDate: string, days: number): string; // cuenta desde el día SIGUIENTE
export function addCalendarMonths(fromDate: string, months: number): string;
```

- Festivos: fijos, Ley 51 de 1983 (traslado al lunes) y móviles por Pascua.
- Las fechas son civiles (`YYYY-MM-DD`) en America/Bogota; nunca un `Date` UTC.
- Tests de 2026 y 2027 contra la lista oficial.

### C-PRIV-DDL v1.0 — Migración tenant `146_privacy_module.ts`

| Tabla | Columnas clave | Reglas |
| --- | --- | --- |
| `legal_texts` | `id, type ('POLITICA_TRATAMIENTO'\|'AVISO_PRIVACIDAD'\|'AUTORIZACION'), version, sha256, content, published_at, url` | Único `(type, version)`; **inmutable** (trigger que rechaza UPDATE y DELETE) |
| `data_authorizations` | `id, party_id, purpose, kind ('GRANT'\|'REVOCATION'\|'LEGACY_IMPORT'), granted, channel, evidence_media_id, legal_text_id, ip, user_agent, captured_by, captured_at, source_ref` | **Solo-anexar** (trigger); índice `(party_id, purpose, captured_at DESC)`; `purpose` ∈ `TRATAMIENTO_CONTRACTUAL, CONTACTO_COMERCIAL, REPORTE_CENTRALES_RIESGO, DATOS_BIOMETRICOS` |
| `data_subject_requests` | `id, party_id NULL, requester_document_hmac, requester_kind, kind, right, status, received_at, complete_at, due_at, extended_until, info_required_at, desist_at, response_text, response_channel, resolved_at, resolved_by, transferred_to, legal_basis` | `party_id` es nulo si el solicitante no es titular conocido; fechas civiles; índice `(status, due_at)` |
| `data_subject_request_events` | `id, request_id, from_status, to_status, actor_id, reason, occurred_at` | **Solo-anexar** |
| `party_privacy_marks` | `id, party_id, mark ('RECLAMO_EN_TRAMITE'\|'VICTIMA_FALSEDAD_PERSONAL'\|'DATOS_BLOQUEADOS'), event ('OPEN'\|'CLOSE'), request_id, occurred_at, actor_id` | **Solo-anexar**; vigencia = último evento por `(party_id, mark)` |
| `retention_policies` | `category, years, start_event, legal_basis, is_legal_minimum` | Sembrada con ADR-094 §D7, incluido `PROSPECTO_SIN_CONTRATO = 2 años` (24 meses, aprobado). Un trigger impide **reducir** por debajo del mínimo legal |
| `privacy_incidents` | `id, detected_at, description, affected_categories, sic_report_due_at, reported_at, actor_id` | `sic_report_due_at` = 15 días hábiles ⚠ |

- **Migración `147_seed_privacy_permissions.ts`:** claves `privacy.read` y `privacy.manage` con el patrón de convergencia RBAC de ADR-083 (migración 119), y la plantilla «Oficial de protección de datos».
- **Backfill (en la 146, idempotente, con reporte):**
  - `consent_records` (expediente o prospecto) y `habeas_data_consents` → `data_authorizations` (`kind = LEGACY_IMPORT`), con el `party_id` resuelto por expediente → suscriptor → party. Lo que no se resuelva va al reporte, no se descarta.
  - Mapeo de finalidades: `TRATAMIENTO_DATOS` → `TRATAMIENTO_CONTRACTUAL`; `CONTACTO_OPERATIVO` → `TRATAMIENTO_CONTRACTUAL` (la preferencia de canal se conserva en `source_ref`); `CONTACTO_COMERCIAL` sin cambio.
  - Las revocatorias de `consent_records` (`revoked_at`) → filas `REVOCATION`.
  - `arco_requests` → `data_subject_requests`. `ACCESS` → `CONSULTA/CONOCER`; `RECTIFICATION` → `RECLAMO/RECTIFICAR`; `DELETION` → `RECLAMO/SUPRIMIR`; `PORTABILITY` → `CONSULTA/CONOCER`, marcado en `legal_basis`. `due_at` se calcula con C-CAL-1 desde `created_at`.
  - **Las tablas heredadas no se eliminan en esta fase.**

### C-PRIV-PORT v1.0 — Puertos (declarados en `privacy`, consumidos por CRM)

```ts
abstract class IPrivacyAuthorizationReadPort {
  hasActive(partyId: string, purpose: DataPurpose): Promise<{ active: boolean; authorizationId: string | null; legalTextVersion: string | null; legacyUnverified: boolean }>;
  listForParty(partyId: string): Promise<AuthorizationView[]>;   // vista 360°; sin evidencia binaria
}
abstract class IPrivacyAuthorizationWritePort {                    // captura desde expediente o alta
  record(input: { partyId; purpose; granted; channel; legalTextId; evidenceMediaId?; actorId }, ctx: { ip; userAgent; manager }): Promise<{ authorizationId }>;
}
abstract class IPrivacyMarksReadPort {
  activeMarks(partyIds: string[]): Promise<Record<string, PrivacyMark[]>>;  // en lote, para listados
}
abstract class IPrivacyRequestsReadPort {
  listForParty(partyId: string): Promise<RequestSummary[]>;   // vista 360°
}
// Declarado en privacy, IMPLEMENTADO por CRM (D4):
abstract class IContractImpersonationPort {
  suspendForImpersonation(input: { partyId; contractIds?: string[]; requestId; actorId }): Promise<{ suspendedContractIds: string[] }>;
}
// Declarados en privacy, IMPLEMENTADOS por CRM y Parties (D7), en la Ola 3:
abstract class IPersonalDataBlockPort { block(partyId, requestId): Promise<void>; unblock(partyId, requestId): Promise<void>; }
abstract class IPersonalDataErasurePort { anonymize(partyId, requestId): Promise<{ categories: string[] }>; }
```

- `ip` y `userAgent` los toma el **controlador del servidor**, nunca un DTO.
- Ningún puerto devuelve el texto de una respuesta ni la evidencia.

### C-PRIV-API v1.0 — REST y DTOs Zod en `@iwana/shared` (`packages/shared/src/schemas/privacy/`)

| Método y ruta | Permiso | Notas |
| --- | --- | --- |
| `POST /privacy/requests` | `privacy.manage` | Radicar: `kind`, `right`, solicitante y su evidencia, `partyId?`, `receivedAt` (por defecto, hoy). Calcula `due_at` y fija `complete_at` si ya está completo |
| `GET /privacy/requests?status&dueWithinDays&kind` | `privacy.read` | Paginado (ADR-065); sin PII del solicitante en el listado |
| `GET /privacy/requests/:id` | `privacy.read` | Detalle con eventos |
| `POST /privacy/requests/:id/{require-info,complete,extend,resolve,reject,transfer}` | `privacy.manage` | Una transición por acción; `extend` exige motivo y no supera +5 o +8; `resolve`/`reject` exigen `responseText` y `responseChannel` |
| `POST /privacy/authorizations` · `GET /privacy/parties/:partyId/authorizations` · `GET .../authorizations/:id/proof` | `privacy.manage` · `privacy.read` | `proof` = la versión del texto, su hash y la URL firmada de la evidencia (≤ 300 s) |
| `GET/POST /privacy/legal-texts` | `privacy.read` / `privacy.manage` | `POST` crea una versión nueva; nunca edita |
| `GET /privacy/parties/:partyId/marks` | `privacy.read` y roles de lectura de CRM | — |
| `GET /privacy/retention-policies` · `PATCH` (solo alargar) | `privacy.read` / `privacy.manage` | — |
| `POST /privacy/incidents` · `GET` | `privacy.manage` | — |
| `GET /privacy/inventory` | `privacy.read` | Inventario de bases y categorías para el RNBD; sin datos personales |

**Reglas de negocio obligatorias:**
- **R1.** Leyenda `RECLAMO_EN_TRAMITE`: se abre en ≤ 2 días hábiles desde `complete_at`. El sistema la abre **al completar** y la cierra al resolver.
- **R2.** `INCOMPLETA` → `DESISTIDA` a los 2 meses calendario desde `info_required_at` sin subsanar.
- **R3.** `REVOCAR TRATAMIENTO_CONTRACTUAL` con un contrato no terminado o con retención vigente → `NO_PROCEDENTE`, con el fundamento de Decreto 1377 art. 9. `REVOCAR CONTACTO_COMERCIAL` → siempre procede.
- **R4.** `SUPRIMIR` con deber de conservación → `NO_PROCEDENTE` para la supresión, y **se abre `DATOS_BLOQUEADOS`** (Ola 3 aplica el bloqueo).
- **R5.** `SUPLANTACION`: al radicar se abre `VICTIMA_FALSEDAD_PERSONAL` y se invoca `IContractImpersonationPort.suspendForImpersonation` **en la misma operación**. Se crea la tarea manual «suspender el cobro en el sistema de facturación del ISP», con fecha. `due_at` = 10 días hábiles. Se registra el plazo de denuncia del titular (20 días hábiles ⚠).
- **R6.** Toda transición registra un evento y una auditoría explícita **sin PII** (`@SkipAudit`, patrón SWEEP-01/T11).

### C-PRIV-JOB v1.0 — Alerta diaria (`apps/worker`)

- Cola `privacy-due-alerts`, repeatable diario a las 07:00 America/Bogota, por tenant.
- Selecciona solicitudes abiertas con `due_at ≤ hoy + 2 días hábiles`, y las vencidas.
- No existe un módulo de notificaciones internas (verificado: solo hay `mailer`). El aviso va **por correo vía `mailer`** a los usuarios con `privacy.manage`, con **conteos y el enlace a la bandeja**: nunca datos del titular. La bandeja (Q7) muestra el mismo semáforo.
- Patrón de repetición: `repeat: { pattern }` con `jobId` fijo, como `execution-order-tombstone.processor.ts:81`.
- Aplica R2 (desistimiento).
- Idempotente por `(tenant, fecha)`; payload sin PII.

## 3. Bloques

### Ola 1 (en paralelo)

#### Q1 · `data-eng` — DDL, backfill y permisos

**Propiedad:** migraciones 146 y 147, su registro en el runner y las entidades TypeORM en `apps/api/src/modules/privacy/entities/**` (solo mapeo).
**Stop/go:**
- `up/down/up` contra Postgres real, con un fixture de cada origen heredado;
- triggers de solo-anexar probados (UPDATE y DELETE rechazados);
- reporte de backfill (resueltos y no resueltos por origen).

#### Q2 · `sr-backend` — Calendario, autorizaciones, textos, marcas y puertos

**Propiedad:**
- `packages/shared/src/calendar/**`;
- `packages/shared/src/schemas/privacy/**`, salvo `requests*`;
- `apps/api/src/modules/privacy/{privacy.module.ts,authorizations,legal-texts,marks,retention,incidents,inventory,ports}/**`.

Publica primero C-CAL-1 y los DTOs. Q3 los consume.
**Stop/go:** turbo `api` + `shared` `--force` con conteo real; calendario con tests de 2026–2027; triggers vistos desde el servicio (un intento de editar falla); `ip` y `user agent` del servidor.

#### Q3 · `sr-backend` — Solicitudes, reloj legal y suplantación

**Propiedad:** `apps/api/src/modules/privacy/requests/**` y `packages/shared/src/schemas/privacy/requests*`.
- Consume C-CAL-1 y los puertos de Q2.
- Declara `IContractImpersonationPort`; hasta la Ola 2 lo implementa un *stub* de pruebas.

**Stop/go:**
- tabla de plazos de ADR-094 §D3 con fechas que crucen festivos;
- las 6 transiciones;
- R1 a R6;
- integración contra Postgres real para R5 con el puerto simulado.

#### Q4 · `prod-ux` — Spec UX de la Fase 1

Salida: `docs/specs/2026-10-14-privacy-fase-1-ux-spec.md`, con criterios `CA-UX-PRIV-nn`. Cubre:
1. **Bandeja de solicitudes**, con semáforo de vencimiento en días hábiles y filtros.
2. **Radicación** de los tres tipos, con validación del solicitante.
3. **Transiciones**, con plantillas de respuesta y prórroga motivada.
4. **Autorizaciones** del titular en la ficha 360° y **captura** en el alta y el expediente (casilla no premarcada y texto legal versionado visible).
5. **Marcas** visibles en la ficha 360° y en los listados de suscriptores y expedientes.
6. **Suplantación**: radicación, suspensión inmediata visible y tarea de cobro.
7. Administración de **textos legales**, **incidentes** e **inventario RNBD**.

Vocabulario en lenguaje del ISP: nada de «ARCO» ni de enums.

### Ola 2 (tras Q2 y Q3 cerrados y Q1 en el árbol)

#### Q5 · `sr-backend` — Integración CRM

**Propiedad:** `apps/api/src/modules/crm/{subscribers,contracts,expedientes,potentials}/**` y la retirada de `crm/habeas-data/**`.
1. El alta de suscriptor y contrato exige `TRATAMIENTO_CONTRACTUAL` vigente vía puerto (cierra SUB-A07). Un `LEGACY_IMPORT` sin evidencia **cuenta como vigente** y se marca para recolectar la prueba.
2. Expedientes y potenciales capturan el consentimiento **solo** vía `IPrivacyAuthorizationWritePort` y dejan de escribir `consent_records`.
3. La vista 360° llena `habeasData`, `arcoRequests` y las marcas vía puertos; hoy son vacíos fijos (`subscribers.service.ts:946-947`).
4. CRM implementa `IContractImpersonationPort` (contratos → `SUSPENDED`, motivo `SUPLANTACION`, auditado).
5. Se retira `crm/habeas-data`: sus endpoints responden 410 y apuntan a `/privacy`.

**Stop/go:** turbo API `--force`; integración de R5 de punta a punta con CRM real; alta sin autorización → 422.

#### Q6 · `sr-backend` — Job de alertas (C-PRIV-JOB)

**Propiedad:** `apps/worker/src/processors/privacy-*` y su registro.
**Stop/go:** test del procesador con fechas que crucen festivos; idempotencia; payload sin PII.

#### Q7 · `fe-platform` — Portal según la spec Q4 ratificada

**Propiedad:**
- `apps/portal/src/components/privacy/**` (nuevo);
- la ruta `/dashboard/privacy`;
- en la ficha 360°, solo los bloques de autorizaciones, solicitudes y marcas;
- el banner de marcas en los listados de suscriptores y expedientes;
- la sección `privacy` de `api-client.ts`.

**No arranca hasta la ratificación de la spec.**
**Stop/go:** turbo portal `--force`; `audit-ui.mjs` sin reglas duras violadas; un test por CA.

### Ola 3 (tras Q5)

#### Q8 · `sr-backend` — Bloqueo y supresión (R4)

**Propiedad:** los adaptadores de `IPersonalDataBlockPort` e `IPersonalDataErasurePort` en `crm/**` y `parties/**`, y la ejecución en `privacy/requests`.
- **Bloqueo:** el titular sale de toda proyección operativa (listados de ADR-067, búsqueda y 360° salvo con `privacy.read`), y cada acceso legal se audita.
- **Anonimización:** sobrescribe las columnas personales y los HMAC del suscriptor, el Party y los contactos, y elimina de forma lógica la evidencia de Media. Es idempotente.

**Stop/go:** integración contra Postgres real: el titular bloqueado no aparece en el listado ni en la búsqueda; tras anonimizar no queda ningún valor personal ni HMAC; los agregados se conservan.

### Ola 4 — cierre

- `sec-eng`: ASVS L2, solo-anexar, evidencia, bloqueo y suplantación.
- `sr-qa`: matriz CA ↔ test; tabla de plazos; cobertura ≥ 80 % en statements y branches de `privacy`.
- Auxiliares: `boundary-reviewer`, `contract-drift-reviewer`, `gate-verifier` y `docs-governance`.

## 4. Restricciones no negociables

1. `privacy` **no** lee ni escribe tablas de otros módulos; los efectos van por los puertos de §2.
2. Las tablas de evidencia legal son de **solo-anexar** a nivel de base de datos.
3. Plazos en días hábiles con C-CAL-1; prohibido sumar días calendario donde la ley dice hábiles.
4. Sin PII en logs, auditoría, URLs ni payloads de colas.
5. Las migraciones son reversibles. El backfill no descarta datos heredados.
6. Gate: `pnpm exec turbo run test --filter=<paquete> --force`, con conteo real. Las integraciones de migraciones públicas, si las hay, corren en CI.

## 5. Entregables documentales

`docs/informes/INFORME-PRIVACY-FASE-1-{Q#}-v1.0.md` por bloque, con ruta, conteo real y deuda por severidad.

## 6. Criterio de salida (G6 de la Fase 1)

- Plazos correctos con festivos.
- Suplantación con suspensión inmediata de punta a punta.
- Alta sin autorización rechazada.
- Autorizaciones y marcas visibles en la ficha 360°.
- Bloqueo y anonimización probados contra Postgres real.
- `sec-eng` y `sr-qa` en GO.

Con eso se cierran **SUB-A06, SUB-A07 y SUB-B03**. La producción sigue condicionada a los dictámenes ⚠ de ADR-094 §7.3.
