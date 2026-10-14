# PROMPT DE EJECUCIÓN — Módulo `privacy` · Habeas Data · Fase 1 (ADR-094)

**Version:** 1.2 — sucede a [v1.1](PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.1.md) (superado). Cadena de fuentes: v1.2 → v1.1 → [v1.0](PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.0.md); cada versión rige en lo que la siguiente no cambia
**Estado:** Superado el 2026-10-14 por [v1.3](PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md) (A22, D-POT). Sigue siendo fuente de lo que v1.3 no cambia
**Fecha:** 2026-10-14
**Emisor:** AI-EM-ARCH (modo Orchestrator)
**Plan:** [2026-10-14-privacy-habeas-data-fase-1.md](../plans/2026-10-14-privacy-habeas-data-fase-1.md) v1.2

## 0. Estado de la Ola 1-bis y causa de esta versión

| Bloque | Estado | Disposición |
| --- | --- | --- |
| Q1 | ✅ 146 y 147 `up/down/up` contra Postgres real; triggers y backfill probados. 027 pública diferida a G6.5 | Cerrado. Delta DDL de §1 (A10, A12, A13, A17) |
| Q2 | A7 y A9 ✅; API 345 suites / 4.826 tests y shared 18 / 162, 0 en caché. A8 `[BLOQUEO]` | **Legítimo** (falta columna). Delta: A12, A14, A15, A16 |
| Q3 | Parcial: radicación, 5 de 6 transiciones, R1–R6, A2–A4, A6 ✅; integración real 5/5. `transfer` en 503 y sin lectura de evidencia | **Ambos bloqueos legítimos.** Delta: A10, A11, A13, A17, A19 |
| Q4 | Spec v1.1 con 46 CA | **Ratificada con condiciones** (§3). Delta v1.2 antes de Q7 |

**Causa: defecto del emisor, otra vez.** v1.1 congeló un DTO de traslado sin cruzarlo con la DDL, prometió la URL firmada sin nombrar la ruta, pidió `externalReference` sin columna y declaró el uso `privacy_evidence` sin endpoint de carga. Al trazar Q5 a Q7 antes de lanzarlos aparecieron seis huecos más, que esta versión cierra **antes** de que un agente los encuentre:
1. radicar exige identidad verificada, pero la ley obliga a radicar lo recibido aunque esté incompleto;
2. la suplantación suspendería **todos** los contratos del Party, incluidos los legítimos de la víctima;
3. los expedientes no tienen Party y el puerto de autorizaciones lo exige;
4. el worker no tiene `mailer`;
5. no hay forma de listar a quién avisar;
6. el texto legal «vigente» no tenía regla.

§2 es la pasada regla → campo completa de la Fase 1.

## 1. Adenda: contratos v1.2

### A10. Traslado (Ley 1581 art. 15: «dará traslado a quien corresponda»)

- **DDL:** `transferred_to` pasa de `uuid` a `varchar(200)`. Es el **nombre de la entidad receptora**, externa al ISP.
- El `reason` va a `data_subject_request_events.reason` y el `channel` a `response_channel`.
- El DTO de v1.1 A5 no cambia.

### A11. Lectura de la evidencia del solicitante

`GET /privacy/requests/:id/evidence` → `{ url, expiresAt }`.

| Aspecto | Regla |
| --- | --- |
| Permiso | `privacy.manage`, porque es un documento de identidad |
| Firma | `MediaService.getPrivacyEvidenceSignedUrl`, 300 s fijos; `Cache-Control: no-store` |
| Errores | 404 `PRIVACY_REQUEST_EVIDENCE_NOT_FOUND` si no hay evidencia |
| Auditoría | Explícita: `operation: 'REQUEST_EVIDENCE_VIEWED'`, con `requestId`, sin PII |
| Restricción | El firmador genérico sigue cerrado |

### A12. Incidente reportado (cierra A8)

**DDL de `privacy_incidents`:**
- `reported_at` pasa a `date` (fecha civil);
- columna nueva `external_reference varchar(100) NULL`;
- `CHECK ((reported_at IS NULL) = (external_reference IS NULL))`.

**Trigger `trg_privacy_incidents_report_once`:**
- la única `UPDATE` permitida fija `reported_at` y `external_reference` desde `NULL`;
- cualquier otra `UPDATE` y todo `DELETE` se rechazan.

**API:**
- `POST /privacy/incidents/:id/reported` con `{ reportedAt, externalReference }`.
- Valida `detected_at` (fecha civil en Bogotá) ≤ `reportedAt` ≤ hoy.
- Errores: 409 `PRIVACY_INCIDENT_ALREADY_REPORTED` y 404.
- Auditoría sin PII.
- La vista de incidente expone `reportedAt` y `externalReference`.

### A13. Verificación de identidad diferida

**Radicación:**
- `identityVerificationMethod` es **opcional** para `CONSULTA` y `RECLAMO`.
- Sin método, `identity_verified_*` quedan nulos y la solicitud se radica igual: el plazo corre desde `received_at`.
- La evidencia exige el método.
- `SUPLANTACION` exige el método en la radicación (A17).

**Endpoint nuevo `POST /privacy/requests/:id/verify-identity`:**

| Aspecto | Regla |
| --- | --- |
| Cuerpo | `{ identityVerificationMethod, requesterEvidenceMediaId? }`, con las mismas reglas que la radicación según `requester_kind` |
| Estados permitidos | Solo `RADICADA` o `INCOMPLETA` |
| Errores | 409 `PRIVACY_REQUEST_IDENTITY_ALREADY_VERIFIED`; 409 `PRIVACY_REQUEST_INVALID_TRANSITION` en otro estado |
| Efecto | Fija `identity_verified_at = now()` e `identity_verified_by = actor` |
| Evento | `to_status` = el estado actual, `reason = 'IDENTIDAD_VERIFICADA'` |
| Auditoría | Sin PII |

**DDL:** un trigger impide cambiar `identity_verified_at`, `identity_verified_by`, `identity_verification_method` y `requester_evidence_media_id` una vez fijado `identity_verified_at`.

### A14. Texto legal vigente

- **Regla:** la versión vigente de cada `type` es la de `published_at` más reciente. `published_at` lo fija el servidor y no admite fechas futuras.
- **Lectura:** `GET /privacy/legal-texts/current?type=` (`privacy.read`) → el texto, o 404 `PRIVACY_LEGAL_TEXT_NOT_PUBLISHED`. El listado añade `isCurrent: boolean`, derivado.
- **Puerto nuevo** (lo declara e implementa Q2 en `privacy/ports`):

```ts
abstract class IPrivacyLegalTextReadPort {
  current(type: LegalTextType): Promise<{ id: string; version: string; sha256: string } | null>;
  findByVersion(type: LegalTextType, version: string): Promise<{ id: string } | null>;
}
```

- `POST /privacy/authorizations` exige que `legalTextId` sea de tipo `AUTORIZACION`; si no, 422 `PRIVACY_LEGAL_TEXT_TYPE_INVALID`.
- **No** exige que la versión sea la vigente. La prueba es la versión exacta que vio el titular.

### A15. Puerto de escritura de autorizaciones v1.2 (traspaso desde el prospecto)

```ts
abstract class IPrivacyAuthorizationWritePort {
  record(input: { partyId: string; purpose: DataPurpose; granted: boolean; channel: string;
      legalTextId: string | null;        // null SOLO con kind LEGACY_IMPORT
      kind?: 'GRANT' | 'REVOCATION' | 'LEGACY_IMPORT'; // por defecto, derivado de granted
      capturedAt?: string;               // por defecto, now(); el traspaso conserva la fecha original
      sourceRef?: string;                // idempotencia: uq_data_authorizations_source_ref
      evidenceMediaId?: string; actorId: string },
    ctx: { ip: string | null; userAgent: string | null; manager: EntityManager }): Promise<{ authorizationId: string; created: boolean }>;
}
```

- Con el mismo `sourceRef`, devuelve la fila existente con `created: false` y no lanza error.
- `capturedAt` no puede ser futuro.

### A16. Carga de evidencia de privacidad

- `POST /privacy/evidence` (multipart, campo `file`), con `privacy.manage` y throttle → `{ mediaId, mimeType, sizeBytes }`.
- Usa `MediaService` con uso `privacy_evidence`.
- Su `mediaId` alimenta A1, A13 y `POST /privacy/authorizations`.
- Los assets huérfanos se limpian en la Fase 2 (deuda P3).
- **En la Fase 1, la captura dentro de alta y expediente no adjunta archivo.** La prueba es el registro del sistema: texto y hash, IP, agente, actor y fecha (Decreto 1377 art. 7). Adjuntar evidencia es una acción de la ficha 360° con `privacy.manage`.

### A17. Suplantación: contratos impugnados y atomicidad

**Radicación de `SUPLANTACION`:**
- exige `partyId` y `identityVerificationMethod`;
- exige `disputedContractIds: uuid[]` (de 1 a 20), elegidos en la ficha 360° del titular;
- sin contratos impugnados, se radica como `RECLAMO`.

**DDL:**
- columna `disputed_contract_ids uuid[] NOT NULL DEFAULT '{}'`;
- `CHECK (kind <> 'SUPLANTACION' OR (cardinality(disputed_contract_ids) >= 1 AND party_id IS NOT NULL AND identity_verified_at IS NOT NULL))`;
- `CHECK (kind = 'SUPLANTACION' OR cardinality(disputed_contract_ids) = 0)`.

**Puerto (pasa a propiedad de Q3):**

```ts
abstract class IContractImpersonationPort {
  suspendForImpersonation(input: { partyId: string; contractIds: string[]; requestId: string; actorId: string },
    ctx: { manager: EntityManager }): Promise<{ suspendedContractIds: string[] }>;
}
```

**CRM:**
- Corre en la **misma transacción** del `manager`.
- Un contrato que no es del Party da 422 `IMPERSONATION_CONTRACT_NOT_OWNED` y revierte toda la radicación.
- `ACTIVE` pasa a `SUSPENDED` con las reglas de transición de `ContractsService`. El motivo `SUPLANTACION` queda en la auditoría del contrato.
- Un contrato ya `SUSPENDED` se incluye en el resultado; uno `TERMINATED` o `ARCHIVED` se omite.
- Los eventos de dominio salen **después del commit**.

### A18. Captura de la autorización a lo largo del ciclo (CRM, Q5)

| Momento | Hay Party | Regla |
| --- | --- | --- |
| Expediente o potencial (prospecto) | No | Se sigue capturando en sus tablas locales (`consent_records` y el `ConsentRecord` de `reviews`), que son el registro del prospecto: 24 meses de retención. `legal_text_version` = `IPrivacyLegalTextReadPort.current('AUTORIZACION').version`; se elimina el valor fijo `'Ley 1581 de 2012'`. Sin texto publicado: 422 `PRIVACY_LEGAL_TEXT_NOT_PUBLISHED` |
| Conversión (`createFromExpediente`) | Se crea en la transacción | Tras `ensurePartyWithRole`, cada registro del expediente se traspasa con A15 (`capturedAt` original, `sourceRef = 'consent_records:<id>'` y `':revocation'` para la retirada; `legalTextId` por `findByVersion`, o `LEGACY_IMPORT` si la versión no resuelve). Después se exige `TRATAMIENTO_CONTRACTUAL` vigente; si no, 422 `SUBSCRIBER_DATA_AUTHORIZATION_REQUIRED` y se revierte |
| Alta directa (`POST /subscribers`) | Se crea en la transacción | `CreateSubscriberSchema` añade `authorizations: Array<{ purpose; granted; legalTextId }>`, con `TRATAMIENTO_CONTRACTUAL` concedida como obligatoria (si falta, 422 con el mismo código). Se registra con A15 tras `ensurePartyWithRole`, en la misma transacción |
| Alta de contrato a un suscriptor existente | Sí | Exige `TRATAMIENTO_CONTRACTUAL` vigente vía `IPrivacyAuthorizationReadPort.hasActive`; si no, 422 `CONTRACT_DATA_AUTHORIZATION_REQUIRED`. `LEGACY_IMPORT` cuenta como vigente y se marca para recolectar la prueba |

**`channel`:** lo fija el servidor según la superficie: `CRM_ALTA`, `CRM_CONVERSION`, `CRM_EXPEDIENTE`, `CRM_POTENCIAL` o `FICHA_360`. Nunca viene del DTO de CRM.

### A19. Alertas (sustituye C-PRIV-JOB v1.0 en cuanto a ubicación)

**Ubicación:** el procesador vive en la **API**: `apps/api/src/modules/privacy/alerts/**`, con el patrón de `users-bulk-create.processor.ts`.
- Motivo: el worker no tiene `mailer` (verificado).
- La API ya aloja procesadores BullMQ.

**Programación:**
- Un repeatable global `privacy-due-alerts` con `jobId` fijo, a las 07:00 America/Bogota.
- Recorre los tenants activos con la misma consulta de `expired-schedule-events.processor.ts:79`.
- Encola un hijo por tenant con `jobId = privacy-due-alerts:<schema>:<yyyy-mm-dd>`, que da la idempotencia.

**Q3 expone (en su propiedad):**
- `IPrivacyRequestsReadPort.dueCounts(today) → { overdue, dueSoon, overdueTasks }`, donde `dueSoon` = vence en ≤ 2 días hábiles y `overdueTasks` = tareas de suplantación sin cerrar y vencidas.
- `PrivacyRequestsService.markDesisted(today, manager) → { count }` (R2), idempotente. Pasa a `DESISTIDA` cuando `desist_at ≤ today`, con evento, `actor_id` nulo y auditoría de sistema.

**Destinatarios:**
- Puerto nuevo en `access-control/ports`: `IPermissionHoldersReadPort.holders(permission, manager) → Array<{ userId; email }>`, con los usuarios activos que tienen el permiso efectivo.
- Si no hay destinatarios, se registra la métrica y el job no falla.
- El correo lleva conteos y el enlace a la bandeja, nunca datos del titular. El payload del job no lleva PII.

### A20. Vista 360° y listados (CRM, Q5)

**Respuesta de la 360°:**
- `habeasData: DataAuthorizationView[]`, vía `listForParty`;
- `arcoRequests: RequestSummary[]`, vía `IPrivacyRequestsReadPort`;
- nuevo `privacyMarks: PrivacyMark[]`.

Los nombres `habeasData` y `arcoRequests` se conservan por compatibilidad. Son internos y nunca se muestran.

**Listados:**
- Listado de suscriptores: `privacyMarks` por fila, con **una** llamada `activeMarks(partyIds)` por página.
- Listado de expedientes: solo las filas vinculadas a un Party (convertidas); un prospecto sin Party no tiene marcas.

### A21. Enlace de los puertos que implementa CRM

**Módulo:** CRM crea `crm/privacy-adapters/crm-privacy-adapters.module.ts`, que provee `IContractImpersonationPort` e `IContractStandingReadPort` (este último sin cambios respecto a v1.1 A4).

**`privacy.module.ts`:**
- importa ese módulo con `forwardRef` en **una sola arista** (precedente: `assurance.module.ts:29`);
- retira los dos adaptadores `Unavailable` de esos puertos.

**Reglas de edición:**
- `privacy.module.ts` lo editan Q2 (A16), Q5 (este enlace) y Q6 (registro de alertas) **solo con ediciones puntuales**: nunca se reescribe el archivo entero.
- Si la edición falla porque el archivo cambió, se relee y se reaplica.

## 2. Pasada regla → campo (Fase 1 completa)

| Regla, CA o puerto | Soporte en el contrato | Dueño |
| --- | --- | --- |
| R1 marca de reclamo | `complete`/`resolve`/`reject` + `party_privacy_marks` | Q3 ✅ |
| R2 desistimiento | `desist_at` + `markDesisted` (A19) | Q3 (método) · Q6 (disparo) |
| R3/R4 no procedencia | `IContractStandingReadPort` + `retention_policies` + `legal_basis` | Q3 ✅ · Q5 (adapter) |
| R5 suplantación | `disputed_contract_ids`, puerto con `manager` (A17), tareas y fecha estimada (A2) | Q1 · Q3 · Q5 |
| R6 evento y auditoría | `data_subject_request_events` + auditoría explícita | Q3 ✅ |
| Traslado | `transferred_to varchar(200)` (A10) | Q1 · Q3 |
| Identidad diferida | `verify-identity` + trigger (A13) | Q1 · Q3 |
| Evidencia: carga, lectura y prueba | A16 · A11 · `proof` (v1.0) | Q2 · Q3 · Q2 ✅ |
| Incidente reportado | `external_reference` + trigger + endpoint (A12) | Q1 · Q2 |
| Texto vigente | `current` + `isCurrent` + puerto (A14) | Q2 |
| Captura en alta, conversión, expediente y contrato | A15 + A18 | Q2 (puerto) · Q5 |
| 360° y marcas en listados | A20 | Q5 · Q7 |
| Alerta diaria | A19 | Q3 (lecturas) · Q6 |
| Spec CA-UX-PRIV-17, 31, 34, 39 | A11 · A14 y A18 · A20 · A12 | Q4 v1.2 · Q7 |

## 3. Ratificación de la spec Q4 v1.1 (AI-EM-ARCH)

**Ratificada** en estructura, vocabulario (§13), estados, accesibilidad y CA-01 a CA-46, con estas **condiciones**, que Q4 incorpora en la v1.2 de la spec:

1. **CA-17 se reemplaza.** El detalle ofrece **Ver evidencia** con `privacy.manage` (A11). Pide el enlace bajo demanda y nunca lo persiste.
2. **Identidad diferida (A13).**
   - La radicación de consulta y reclamo permite «verificar después».
   - El detalle muestra **Verificar identidad** en los estados Recibida y Necesita información.
   - «Registrar información recibida» sigue exigiendo identidad verificada.
3. **Suplantación (A17).**
   - Se radica desde la ficha 360° del titular, con la selección de 1 a 20 contratos impugnados de su lista de contratos.
   - El detalle muestra la cantidad y enlaza a la pestaña de contratos de la ficha. Los nombres de contrato en el detalle quedan como deuda P3 de la Fase 2.
4. **Texto vigente (A14).**
   - El listado de textos muestra **Vigente** cuando `isCurrent`.
   - La captura usa `current('AUTORIZACION')` y muestra versión y contenido.
   - Si no hay texto publicado, la captura se bloquea con un mensaje que lleva a Administración.
5. **Captura por superficie (A18).**
   - En el expediente se captura en su panel actual (`ConsentsPanel`) y la conversión la traspasa sin pedirla de nuevo.
   - El alta directa la pide en el formulario.
   - Ninguna captura de CRM adjunta archivo en la Fase 1 (A16).
6. **Carga de evidencia (A16)** en la radicación y en la ficha 360°.
7. **Marcas en listados de expedientes (A20):** solo en filas vinculadas a un Party.

## 4. Bloques

### Ola 2-bis — deltas (en paralelo)

**Q1Δ · `data-eng`**
- **Propiedad:** la 146 (no commiteada) y las entidades de `privacy/entities/**`.
- **Cambios:** A10, A12 (columna, CHECK y trigger), A13 (trigger de identidad) y A17 (columna y CHECKs).
- **Stop/go:** `up/down/up` contra Postgres real, con un test por trigger y por CHECK nuevo.

**Q2Δ · `sr-backend`**
- **Propiedad:** la de v1.1 Q2, más `privacy/evidence/**`.
- **Primer paso:** publicar las firmas de A14 y A15; Q5 las consume.
- **Implementa:** A12 (endpoint y vista), A14, A15 (incluida la idempotencia por `sourceRef`) y A16.
- **Stop/go:** turbo `api` + `shared` `--force`, con tests de cada adenda. La idempotencia de A15 y el trigger de A12 se prueban contra Postgres real.

**Q3Δ · `sr-backend`**
- **Propiedad:** la de v1.1 Q3, más `privacy/ports/contract-impersonation.port.ts`.
- **Implementa:**
  - A10 (`transfer` operativo);
  - A11;
  - A13 (radicación opcional y `verify-identity`);
  - A17 (DTO, puerto con `manager` y stub actualizado);
  - A19 (`dueCounts` y `markDesisted`).
- **Stop/go:** turbo API `--force`; integración real de traslado, `verify-identity`, suplantación con contratos impugnados (stub) y `markDesisted` cruzando festivos.

**Q4Δ · `prod-ux`**
- **Entrega:** spec v1.2 con las condiciones de §3, numeración estable y CA nuevos a partir de CA-47.
- **Stop/go:** ratificación de AI-EM-ARCH.

### Ola 2 — en paralelo con la Ola 2-bis (decisión por calendario: Ley 2573 rige el 19-nov)

**Q5 · `sr-backend` — Integración CRM**

Q5 consume las firmas que Q2Δ y Q3Δ publican primero.

**Propiedad:**
- `crm/{subscribers,contracts,expedientes,potentials,reviews,privacy-adapters}/**` y la retirada de `crm/habeas-data/**`;
- `packages/shared/src/schemas/subscriber.schema.ts`;
- el enlace de A21 en `privacy.module.ts`.

**Implementa:**
- A17 (lado CRM);
- A18;
- A20;
- A21;
- `IContractStandingReadPort`;
- la retirada de `crm/habeas-data`: 410 con un puntero a `/privacy`.

**Stop/go:**
- turbo API `--force`;
- integración real de R5 de punta a punta: contrato ajeno → 422 y rollback; `ACTIVE` → `SUSPENDED`;
- conversión con traspaso idempotente (dos ejecuciones = mismas filas);
- alta sin `TRATAMIENTO_CONTRACTUAL` → 422;
- el listado hace una sola llamada de marcas por página;
- `boundary-reviewer` sin hallazgos sobre el `forwardRef`.

**Q6 · `sr-backend` — Alertas (A19)**

**Propiedad:**
- `apps/api/src/modules/privacy/alerts/**`;
- `IPermissionHoldersReadPort` y su adapter en `access-control/ports/**`, más su export;
- el registro en `privacy.module.ts` (edición puntual).

**Stop/go:**
- test del procesador con fechas que cruzan festivos;
- dos ejecuciones en el mismo día dan un solo correo;
- payload y correo sin PII;
- tenant sin destinatarios → métrica y sin fallo;
- turbo API `--force`.

Arranca en paralelo y codifica contra las firmas de `dueCounts` y `markDesisted` de §1, con un stub en el test. **Cierra solo cuando Q3Δ las entrega** y el test corre contra la implementación real.

### Ola 2 — Q7 · `fe-platform`, tras ratificar la spec v1.2

**Propiedad:** la de v1.0, más:
- el panel de consentimientos del expediente (`apps/portal/src/components/crm/expedientes/ConsentsPanel.tsx`), para la versión vigente (A14);
- la sección de autorizaciones del formulario de alta de suscriptor (A18);
- la selección de contratos impugnados en la ficha 360° (A17).

**Stop/go:** turbo portal `--force`, `audit-ui.mjs` y un test por CA.

## 5. Sin cambios

- Ola 3 (Q8) y Ola 4 de v1.0.
- §4 a §6 de v1.0.
- La excepción documental de v1.1 §3: `HLD-PRIVACY-v1.0` antes de G7.
