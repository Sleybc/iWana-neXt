# PROMPT DE EJECUCIÓN — Módulo `privacy` · Habeas Data · Fase 1 (ADR-094)

**Version:** 1.1 — sucede a [v1.0](PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.0.md) (superado). La v1.0 sigue siendo fuente de lo que esta versión no cambia
**Estado:** Superado el 2026-10-14 por [v1.2](PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.2.md) (adenda A10–A21). Sigue siendo fuente de lo que v1.2 no cambia
**Fecha:** 2026-10-14
**Plantilla:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) (en revisión)
**Emisor:** AI-EM-ARCH (modo Orchestrator)
**Plan:** [2026-10-14-privacy-habeas-data-fase-1.md](../plans/2026-10-14-privacy-habeas-data-fase-1.md) v1.1

## 0. Estado de la Ola 1 y causa de esta versión

| Bloque | Estado | Disposición |
| --- | --- | --- |
| Q1 | Migraciones y entidades listas; la integración no corrió (`ECONNREFUSED 127.0.0.1:5433`) | **PostgreSQL no está levantado**: es un problema de entorno, no del nombre de la base. Se relanza con los cambios de DDL de §1 una vez el CTO levante el servicio |
| Q2 | Calendario, schemas, autorizaciones, textos, marcas, retención, incidentes y OpenAPI listos; API 342 suites / 4.804 tests, 0 en caché | Se completa con §1 (A6, A7, A8, A9) |
| Q3 | `[BLOQUEO]` sin implementar | **Legítimo.** Se relanza contra v1.1 |
| Q4 | `[BLOQUEO]`; spec no emitida | **Legítimo.** Se relanza contra v1.1 |

**Causa: defecto del emisor.** C-PRIV-DDL, C-PRIV-PORT y C-PRIV-API v1.0 nombraban datos que no definían: la evidencia del solicitante, la tarea de R5, la finalidad de la revocatoria, la lectura contractual de R3, los cuerpos de las transiciones, `RequestSummary`, el inventario y el seguimiento de incidentes. Es el mismo patrón de las fases anteriores: contrato congelado sin leer al consumidor.

**Dato nuevo aceptado:** el calendario de Q2 incluye el festivo del **9 de julio (Ley 2578 de 2026)**. Las fechas de 2027 se calcularon desde la ley y la Pascua, porque no hay lista oficial publicada. Contrastar cuando se publique (deuda P2).

## 1. Adenda: contratos v1.1

### A1. Solicitante y evidencia de identidad (C-PRIV-DDL v1.1, tabla `data_subject_requests`)

Se añaden estos campos:

| Columna | Tipo | Regla |
| --- | --- | --- |
| `requester_name_encrypted` | varchar(500) | AES-256-GCM (ADR-058) |
| `requester_document_type` | varchar(20) | Mismo enum que `DocumentTypeParty` |
| `requester_document_encrypted` | varchar(500) | Cifrado; el HMAC `requester_document_hmac` ya existe (C-NORM-1) |
| `requester_contact_encrypted` | varchar(500) | Correo o dirección para responder |
| `requester_evidence_media_id` | uuid NULL | Asset de Media con uso **`privacy_evidence`** (A9) |
| `identity_verification_method` | varchar(30) | `DOCUMENTO_PRESENCIAL`, `COPIA_DOCUMENTO`, `PODER_O_REPRESENTACION`, `DECLARACION_CAUSAHABIENTE` |
| `identity_verified_at`, `identity_verified_by` | — | Obligatorios para pasar de `RADICADA` a `EN_TRAMITE` |

El DTO de radicación los recibe; la respuesta los devuelve **solo** a quien tiene `privacy.manage`, y los listados nunca.

### A2. Suplantación: plazos y tareas (R5)

- **Columnas nuevas en `data_subject_requests`:**
  - `impersonation_complaint_due_at`: 20 días hábiles desde `received_at`. Se calcula desde la radicación, que es la lectura **conservadora** mientras el dictamen ⚠ de ADR-094 §7.3 no diga otra cosa. La UI lo rotula «fecha estimada».
  - `suspended_contract_ids uuid[]`: lo que devolvió el puerto.
- **Tabla nueva `data_subject_request_tasks`:** `id, request_id, kind, due_at, done_at, done_by, note`.
  - Solo-anexar para el cierre: `done_at` se fija una vez y un trigger impide reabrir.
  - `kind` ∈ `SUSPENDER_COBRO_EXTERNO` (`due_at` = `received_at`: inmediata) y `ENTREGAR_COPIA_DOCUMENTOS` (`due_at` = el de la solicitud; Ley 2573: entregar copia de los documentos con que se aprobó el producto).
- **Endpoint:** `POST /privacy/requests/:id/tasks/:taskId/complete` con `{ note }` (`privacy.manage`).
- **Respuesta de la radicación de suplantación:** `{ request, suspendedContractIds, tasks }`.

### A3. Finalidad en la revocatoria

- Nueva columna `purpose` NULL en `data_subject_requests`.
- El Zod exige `purpose` cuando `right = REVOCAR` y lo prohíbe en los demás casos.
- Al resolver una revocatoria procedente se inserta la fila `REVOCATION` en `data_authorizations`, en la misma transacción.

### A4. Lectura contractual para R3 (C-PRIV-PORT v1.1)

```ts
// Declarado en privacy (requests/ports), IMPLEMENTADO por CRM en Q5; stub de pruebas hasta entonces
abstract class IContractStandingReadPort {
  standing(partyId: string): Promise<{ openContractIds: string[]; lastTerminatedAt: string | null }>; // 'abierto' = no TERMINATED ni ARCHIVED
}
```

R3 y R4 se resuelven así:
- **No procede** si `openContractIds` no está vacío.
- **No procede** si `lastTerminatedAt + retention_policies[SUSCRIPTOR].years` es mayor que hoy.

En ambos casos el fundamento queda en `legal_basis`.

### A5. Cuerpos de las transiciones (C-PRIV-API v1.1)

| Acción | Cuerpo | Efecto |
| --- | --- | --- |
| `require-info` | `{ missingItems: string ≤ 1000, channel: ResponseChannel }` | → `INCOMPLETA`; fija `info_required_at`; valida el plazo ≤ 5 días hábiles desde `received_at` |
| `complete` | `{ completedAt?: fecha civil }` (por defecto, hoy) | → `EN_TRAMITE` si la identidad está verificada (A1); recalcula `due_at`; abre `RECLAMO_EN_TRAMITE` (R1) |
| `extend` | `{ reason: string ≤ 1000 }` | → `PRORROGADA`; `extended_until` = `due_at` + 5 (consulta) u 8 (reclamo) días hábiles; una sola vez |
| `resolve` | `{ responseText ≤ 4000, responseChannel, dataChangeReference?: string ≤ 200 }` | → `RESUELTA`. `dataChangeReference` documenta la corrección hecha por el operador en CRM, en ACTUALIZAR y RECTIFICAR |
| `reject` | `{ responseText, responseChannel, legalBasis }` | → `NO_PROCEDENTE` |
| `transfer` | `{ transferredTo: string ≤ 200, reason ≤ 1000, channel }` | → `TRASLADADA`; valida ≤ 2 días hábiles |

**Enums:**
- `ResponseChannel` = `EMAIL`, `CORREO_FISICO`, `PRESENCIAL`, `PORTAL_ISP`.
- `legalBasis` = `DEBER_LEGAL_CONSERVACION`, `DEBER_CONTRACTUAL`, `SOLICITANTE_NO_LEGITIMADO`, `OTRO` (este último exige el detalle en `responseText`).

### A6. `RequestSummary` (vista 360°, sin PII)

```ts
type RequestSummary = { id: string; kind: RequestKind; right: RequestRight; purpose: DataPurpose | null;
  status: RequestStatus; receivedAt: string; dueAt: string; extendedUntil: string | null; isOverdue: boolean };
```

`IPrivacyRequestsReadPort` se **declara e implementa en Q3** (`privacy/requests/ports`), no en Q2.

### A7. Inventario RNBD declarativo en la Fase 1

`GET /privacy/inventory` responde:

```ts
{ generatedAt: string; databases: Array<{ key: 'CLIENTES'|'PROSPECTOS'|'PROVEEDORES'|'USUARIOS_SISTEMA';
  categories: string[]; purposes: DataPurpose[]; retention: { category: string; years: number }[];
  hasSensitiveData: boolean; internationalTransfer: 'NO_DECLARADA'; securityMeasures: string[] }> }
```

- Se construye desde el catálogo de retención y las finalidades, **sin conteos**: contar registros exigiría leer tablas de otros módulos.
- Los conteos llegan en la Fase 2, por puertos.

### A8. Seguimiento de incidentes

`POST /privacy/incidents/:id/reported` con `{ reportedAt: fecha civil, externalReference: string ≤ 100 }` (`privacy.manage`). Se fija una sola vez y queda auditado.

### A9. Uso de Media `privacy_evidence`

- Nuevo `MediaUsage.PRIVACY_EVIDENCE = 'privacy_evidence'`: PDF, JPEG, PNG o WEBP; 10 MiB; bytes mágicos validados.
- Mismo aislamiento que `stratum_evidence`: los endpoints genéricos lo rechazan o devuelven 404, y la URL firmada dura ≤ 300 s y sale solo por `/privacy/...`.
- Lo usan `data_authorizations.evidence_media_id` y `requester_evidence_media_id`.
- Requiere la migración **pública 027**, que amplía `chk_media_assets_usage` con el patrón de la 026.

## 2. Bloques de la Ola 1-bis (en paralelo, contra v1.1)

**Precondición de entorno:** PostgreSQL levantado en `127.0.0.1:5433`. Lo hace el CTO: Docker Desktop estaba detenido.

### Q1 · `data-eng` — DDL v1.1

**Propiedad:** igual que en v1.0, más `packages/database/src/migrations/public/027_media_usage_privacy_evidence.ts` y el valor del enum en `media-asset.entity.ts`.

- Modifica la **146** (no está commiteada) con A1, A2 y A3.
- Crea la 027.
- Ajusta las entidades de `privacy/entities/**`.

**Integración:**
- Las migraciones **tenant** (146, 147) pueden correr en `dbiw` con schema efímero, como hicieron la 143 y la 144.
- La **pública 027** exige `test` o `iwana_it_*`, o queda para CI en G6.5, como la 026.

**Stop/go:**
- `up/down/up` de la 146 y la 147 contra Postgres real;
- triggers probados, incluido el de tareas;
- reporte de backfill;
- integración de la 027 en CI o en una base de integración.

### Q2 · `sr-backend` — Completar el núcleo

**Propiedad:** la de v1.0 más `apps/api/src/modules/media/**` (solo A9).

Implementa:
- A7: inventario y su schema;
- A8: incidentes reportados;
- A9: restricciones del uso, rechazo en los endpoints genéricos y URL firmada de evidencia, igual que P2 de D-PDF;
- la proof de autorización con la evidencia nueva.

**No** declara `IPrivacyRequestsReadPort` (es de Q3).
**Stop/go:** turbo `api` + `shared` `--force`; tests de A7, A8 y A9.

### Q3 · `sr-backend` — Solicitudes (relanzamiento)

**Propiedad:** `privacy/requests/**` (incluido `requests/ports`) y `schemas/privacy/requests*`.

Implementa el v1.0 §3 Q3 más A1 a A6. Declara `IContractStandingReadPort` e `IPrivacyRequestsReadPort`; `IContractImpersonationPort` ya estaba. Los puertos que implementa CRM llevan *stub* de pruebas.

**Stop/go:**
- tabla de plazos con fechas que crucen festivos, incluidos Semana Santa y el 9 de julio;
- las seis transiciones con sus cuerpos;
- R1 a R6 y A2 a A4;
- integración contra Postgres real de R5 (tareas y fecha de denuncia) y de R3 (con el *stub* de standing).

### Q4 · `prod-ux` — Spec UX (relanzamiento)

El v1.0 §3 Q4 contra C-PRIV-API v1.1. Los cinco bloqueos (Q4-BL-01 a 05) y las brechas Q4-D-01/02 quedan resueltos por A1 a A8.

El plazo de denuncia se muestra como «fecha estimada» (A2). El inventario es declarativo, sin conteos (A7).

## 3. Excepción documental registrada

No hay PRD ni HLD propios de `privacy` (P2 de Q3). **Excepción para la Fase 1:** ADR-094 (contexto, decisión, fases y regulación) junto con este prompt (contratos) cumplen el papel de definición funcional y técnica.

**AI-EM-ARCH emite `HLD-PRIVACY-v1.0` antes del G7 de la fase.** Queda como deuda documental con dueño; no bloquea la construcción ni el G6.

## 4. Sin cambios

v1.0 §3 de las Olas 2 a 4, §4 (restricciones), §5 y §6. Matiz en la Ola 2: Q5 implementa además `IContractStandingReadPort` (A4).
