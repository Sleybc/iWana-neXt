# INFORME — MOD05 · Deuda de código · V2 · Revisión de seguridad (ASVS L2)

**Versión:** 1.0 · **Fecha:** 2026-10-17 · **Emisor:** AI-SEC-ENG (`sec-eng`) · **Gate:** G4
**Alcance:** diff `09af7f60^..e2348a42` en `main` (migraciones 153–157, backend `crm/subscribers`, `crm/contracts`, `crm/expedientes`, utilidad de cifrado fiscal, CLI `backfill-fiscal-document`, supresión y portal en lo que toca PII).
**Contrato:** [PROMPT v1.0](../prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.0.md) §2.3–§2.4 y §5 V2, [delta v1.1](../prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.1.md) R13, fila V2 de [LAUNCH v1.1](../prompts/PROMPT-MOD05-DEUDA-CODIGO-LAUNCH-v1.1.md).
**Skills leídas:** `security-auditor`, `backend-security-coder`.
**Modo:** solo lectura sobre el código. No se corrigió nada y no se hizo commit.

## 1. Veredicto

**GO (G4 seguridad), con condiciones.** No hay hallazgos Críticos ni Altos. Hay 1 hallazgo Medio y 4 Bajos, que no bloquean el merge. El Medio (M-1) debe quedar resuelto o decidido antes de G7 o de la producción.

| Severidad | Cantidad | ¿Bloquea? |
| --- | --- | --- |
| Crítica | 0 | — |
| Alta | 0 | — |
| Media | 1 | No bloquea G4; se resuelve antes de G7 |
| Baja | 4 | No |
| Informativa | 6 | No |

## 2. Verificación por control

| # | Control pedido | Resultado | Evidencia (archivo:línea) |
| --- | --- | --- | --- |
| C1 | Las escrituras nuevas del documento fiscal no dejan texto plano | **Cumple** | `fiscal-document.util.ts:77-98` (`fiscalDocument = null` y cifrado/HMAC no enumerables), `:136-138` (impide reescribir el valor descifrado). Contratos: `contracts.service.ts:176,181` (alta), `:294,299` (desde expediente), `:741-742` (edición), `:1129` (transición). Expedientes: `expediente.service.ts:1135-1147` (sección), `:1259`, `:1343`, `:1754`. El alta de expediente (`:595-620`) no recibe documento fiscal. Las rutas que cargan sin hidratar (`contracts.service.ts:787,895,933`; `expediente.service.ts:858`) no reescriben la columna: reciben `NULL` de la base |
| C2 | Cifrado AES-256-GCM y HMAC sobre el valor normalizado | **Cumple** | `fiscal-document.util.ts:61-68`: `encryptAes256Gcm(valor)` y `hmacPiiValue(normalizeDocumentNumber(OTHER, valor))`. Columnas con `select: false`: `contract.entity.ts:113-129` y `expediente-record.entity.ts:260-276` |
| C3 | Lectura compatible (R7) | **Cumple** | `fiscal-document.util.ts:127-133`; hidratación en `contracts.service.ts:525-576`, `expediente.service.ts:911-936` y `subscriber-creation.service.ts:83-104,260-264` |
| C4 | Claves desde `ConfigService` | **Cumple** | `fiscal-document.util.ts:30-39` (`loadPiiAesGcmKeyPair(config)`, `resolvePiiHashKey(config)`); `contracts.service.ts:109`; `expediente.service.ts:296-300`; `subscriber-creation.service.ts:50`; CLI `backfill-fiscal-document.ts:234` (`new ConfigService(process.env)`, igual que `anonymize-titular`). No hay `process.env.PII_*` ni `MFA_*` en el diff |
| C5 | CLI de backfill: simulación por defecto y solo conteos | **Cumple** | Simulación por defecto en `backfill-fiscal-document.ts:162`; los modos son excluyentes (`:168`); la salida es solo el reporte de conteos (`:245`); los errores pasan por `summarizeErrorForLog` (`:254`), que no lee mensaje, detail ni parámetros (`summarize-error-for-log.ts:37-57`); un argumento desconocido muestra solo el nombre de la bandera (`:175`); schema validado (`:150,209`); es idempotente (`:95,115`) y la verificación posterior cuenta las filas en claro (`:127-130`, `exitCode = 1` en `:246`). Ver B-1 |
| C6 | Ningún log con PII | **Cumple** | La guardia `pii-log-guard` pasa en 23 de 23 archivos backend del diff (salida 0). La revisión manual de los `logger`/`console`/`stdout` agregados encuentra solo conteos, nombres de migración, nombres de schema y UUIDs: `154:36-38,78-80`, `157:194`, `156:24-34` (ids, patrón de la 143), `revert.ts`, CLI. La auditoría guarda solo los nombres de campo: `subscribers.service.ts:917`, `contracts.service.ts:751-758`, `expediente.service.ts:1157-1163`; el alta usa `@SkipAudit` (`subscribers.controller.ts:113-114`); `audit-sanitize.policy.ts:96` cubre `fiscal_document`, `fullName`, `documentNumber` y `displayName`. Ver B-3 |
| C7 | La proyección del representante legal no lleva su documento | **Cumple** | Solo `{ partyId, displayName }`: `subscriber-projection.ts:103-109`, `subscribers.controller.ts:716-722`. Con el titular bloqueado vale `null` (`subscriber-projection.ts:132`, lista blanca en `subscribers.controller.ts:760-790`). El documento solo se envía a `ensurePartyWithRole` (`subscribers.service.ts:459-477,888-909`). El snapshot completo del Party (`subscribers.service.ts:1059`) se usa solo para tomar el `displayName`. Ver M-1 |
| C8 | El 422 no lleva PII | **Cumple** | `subscriber-fiscal-completeness.service.ts:56-63`: `{ code, message fija, missing: enum[] }`. El 400 del alta manual (`subscribers.service.ts:286-301,323-338`) usa mensajes fijos |
| C9 | La supresión cubre las columnas nuevas | **Cumple** | Participante CRM: expediente `crm-titular-erasure.participant.ts:66-67` y contratos `:139-140`, categoría `FISCAL` (`:425`). El CLI `anonymize-titular.ts:183-184` delega los contratos en el participante (`:1026`). La verificación compara los valores residuales contra esas reglas (`titular-erasure-sql.ts:291-305`). Integración: `privacy-erasure-api.postgres.integration.spec.ts`, donde las tres columnas quedan en `NULL` |
| C10 | Tenancy | **Cumple** | Todo pasa por `runInTenantSchema` con `SET LOCAL search_path`; el CLI resuelve un tenant `ACTIVE` y valida el schema (`backfill-fiscal-document.ts:195-212`); `PartyReadAdapter.getByIds` resuelve el schema desde `TenantContext` (`party-read.adapter.ts:44-51`). No hay SQL interpolado con datos externos: las tablas salen de una lista cerrada (`backfill:43`) |
| C11 | Autorización | **Cumple** | Las rutas `PATCH` de suscriptor llevan `@GuardBlockedTitular()` y `@Roles` (`subscribers.controller.ts:423-425,444-446,483-485`): un titular bloqueado no cambia de representante (409) |

**Pruebas ejecutadas (sin caché):** `jest --no-cache` sobre `fiscal-document.util.spec`, `backfill-fiscal-document.spec`, `subscriber-fiscal-completeness.service.spec` y `subscriber-projection.spec` → **4 suites y 29 tests en verde**. La suite completa y las integraciones Postgres corresponden a V4.

## 3. Hallazgos

### Media

**M-1 · El nombre del representante legal se muestra aunque su propio Party esté bloqueado**
- **Dónde:**
  - `apps/api/src/modules/crm/subscribers/subscribers.service.ts:1046-1066`: `hydrateLegalRepresentativeDisplayNames` no consulta las marcas del Party del representante;
  - `subscriber-projection.ts:103-109`;
  - `subscribers.controller.ts:716-722`.
- **Problema:** la restricción `privacyRestricted` solo mira las marcas del Party de la empresa (`subscriber-projection.ts:82-85`, `subscribers.controller.ts:697-698`). Si el representante, que es un titular propio (contrato §2.3), tiene `DATOS_BLOQUEADOS`, su nombre igual aparece en el listado y en el detalle de la empresa, a todos los roles con lectura (NOC y SALES incluidos).
- **Riesgo:** se trata un dato bloqueado de un titular (Ley 1581, bloqueo de la Fase 1b). El encaje regulatorio exacto **requiere verificación con fuente oficial**.
- **Corrección guiada (sr-backend):** al hidratar, consultar `privacyMarksReadPort.activeMarks` de los `legalRepresentativePartyId`. Si el representante está bloqueado y el rol no tiene `canSeeBlocked`, devolver `displayName` redactado (por ejemplo «Datos bloqueados») o `legalRepresentative: null`. Agregar un test.
- **SLA:** antes de G7 o de la producción. No bloquea G4.

### Baja

**B-1 · El backfill aborta todo el tenant por un valor heredado que no se normaliza, y la simulación no lo detecta**
- **Dónde:** `fiscal-document.util.ts:61-64` lanza `BadRequestException` si el valor normalizado queda vacío. `backfill-fiscal-document.ts:95` selecciona `fiscal_document IS NOT NULL`, lo que incluye `''` y valores hechos solo de signos. Toda la corrida es una sola transacción (`:151`, `runInTenantSchema`). La simulación cuenta esas filas como cifrables (`:104`).
- **Por qué es posible:** el DTO de contratos acepta `''` (`create-contract.dto.ts:139-142`, sin `MinLength`), así que puede haber filas heredadas así.
- **Efecto:** el texto plano sigue en su lugar y el corte de G7 se bloquea. El error no expone el valor; la salida es solo `class=BadRequestException`, lo cual está bien. El alta o edición de contrato con `''` ahora responde 400, un cambio de comportamiento para el portal.
- **Corrección guiada:**
  - la simulación reporta un conteo `invalid`;
  - en `--apply`, las filas vacías o no normalizables pasan a `NULL` sin cifrar y se cuentan aparte;
  - el DTO agrega `MinLength(1)` o normaliza `''` a `null`.

**B-2 · El documento fiscal del expediente no tiene cota de longitud de entrada**
- **Dónde:** `expediente.service.ts:2407` (`String(data.fiscalDocument)`) y `update-section.dto.ts:24-36` (`z.record(z.string(), z.unknown())`).
- **Antes:** la DDL `varchar(30)` acotaba el valor.
- **Ahora:**
  - se cifra hacia `varchar(500)`, así que acepta hasta ~221 caracteres que antes se rechazaban;
  - por encima de eso responde 500 por error de base.
- **Referencia:** ASVS V5.1.3 y V5.1.4.
- **Corrección guiada:** `max(30)`, igual que `create-contract.dto.ts:141`, en la validación de la sección BILLING.

**B-3 · La guardia `pii-log-guard` no reconoce los campos nuevos**
- **Dónde:** `.claude/hooks/pii-log-guard.mjs:16-17`. La expresión `PII` no incluye `fiscal`, `nit`, `legalRepresentative`, `displayName`, `businessName` ni `legalName`, y el análisis es línea por línea.
- **Estado actual:** pasa en los 23 archivos y la revisión manual no encontró PII en logs (C6). Una regresión futura del tipo `${dto.fiscalDocument}` pasaría sin aviso.
- **Corrección guiada (plat-ops o tooling):** ampliar la expresión y agregar un caso que bloquea en `scripts/claude-hooks.test.mjs`.

**B-4 · Faltan pruebas de integración del cifrado en la escritura del expediente y en el contrato desde el expediente**
- **Lo que existe:** la integración Postgres de cifrado cubre la creación y edición de contratos (`contracts.service.postgres.integration.spec.ts:497-546`), el backfill y la supresión.
- **Lo que falta:** la edición de la sección BILLING del expediente y `createFromExpediente` solo tienen pruebas unitarias con mocks (`expediente.service.spec.ts`). R5 pedía integración «tras crear o editar» en ambos.
- **Mitigación:** la utilidad y el mecanismo (propiedades no enumerables leídas por TypeORM) son los mismos que ya se probaron en contratos.
- **Corrección guiada (sr-qa o sr-backend):** una integración que edite la sección BILLING y cree un contrato desde el expediente, y luego verifique `fiscal_document IS NULL` y que el cifrado se descifra al valor original.

### Informativa

- **I-1:** `subscriber-creation.service.ts:93-100,260-264` repite el descifrado en vez de usar `fiscal-document.util` y asigna `fiscalDocumentEncrypted/Hmac` como propiedades enumerables. El objeto es interno y no se serializa ni se guarda. Se deriva a V3.
- **I-2:** `ContractsService` carga las claves de forma perezosa (`fiscal-document.util.ts:31-41`). El arranque igual falla rápido porque `ExpedienteService` las carga en su constructor (`expediente.service.ts:291-300`).
- **I-3:** `fiscal_document_hmac` usa la misma `PII_HASH_KEY` que los demás HMAC, sin separación de dominio. Es coherente con ADR-078 D3 y con la búsqueda por documento.
- **I-4:** AES-GCM sin AAD: alguien con escritura en la base podría intercambiar el cifrado entre filas. El patrón ya existía (ADR-058) y no es nuevo de esta fase.
- **I-5:** el CLI solo acepta tenants `ACTIVE` (`backfill-fiscal-document.ts:209`). Los tenants `SUSPENDED` conservarían el texto plano, y el plan de G7 debe contemplarlos.
- **I-6 (R11):** `subscribers.nit` sigue en claro por decisión D-FIS (NIT de empresa, fuera de ADR-058). Se registra como observación.

## 4. Riesgo residual y condiciones

- **Merge (G4):** GO. Ningún hallazgo Crítico ni Alto.
- **Antes de G7 o de la producción:**
  - resolver M-1, o que el CTO decida por escrito que el nombre del representante bloqueado puede mostrarse en la ficha de la empresa;
  - resolver B-1 antes de correr `--apply` por tenant.
- **Deuda conocida (sin cambios):**
  - eliminar `fiscal_document`, `tax_regime` y `legal_representative_id` tras el backfill;
  - el alcance de la supresión sobre el representante de una empresa anonimizada (Fase 2).
- No se requiere `[ESCALACIÓN DE SEGURIDAD]`.
