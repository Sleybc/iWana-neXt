# PROMPT — MOD05 · Deuda de código: responsabilidad tributaria, persona jurídica, documento fiscal cifrado e integridad

**Versión:** 1.0 · **Fecha:** 2026-10-17 · **Emisor:** AI-EM-ARCH · **Estado:** Contrato congelado; D-M03, D-M04 (A) y D-FIS aprobadas por el CTO el 2026-10-17 ([plan](../plans/2026-10-17-mod05-deuda-codigo.md) §1)
**Autoridad:**
- [ADR-093](../adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md) D6;
- [ADR-058](../adrs/ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md) (cédulas, teléfonos y correos cifrados en reposo);
- [ADR-030](../adrs/ADR-030-Modelo-Party-Multi-Rol.md) (Party como identidad);
- [PRD-MOD05](../prds/PRD-MOD05-CRM-SUBSCRIBERS-v1.0.md) RF-SUB-03;
- [re-auditoría MOD05](../informes/INFORME-MOD05-SUBSCRIBERS-REAUDITORIA-v1.0.md) §2.3, §2.4 y §8.

**Base:** `main` en `48529fd0`. Última migración tenant: `152`. Se trabaja en `main`, sin ramas.

## 0. Hechos verificados en el código (2026-10-17)

| # | Hecho | Fuente |
| --- | --- | --- |
| H1 | `tax_regime tax_regime_enum NOT NULL` (`SIMPLIFIED`, `COMMON`) en `subscribers`. Lo usan la API (8 archivos), el portal (5) y `@iwana/shared` (`enums/tax-regime.enum.ts`) | `012_add_subscribers.ts:33,77` |
| H2 | ADR-093 D6 decide reemplazarlo por `vatResponsibility` (`RESPONSABLE \| NO_RESPONSABLE`) y `rutResponsibilities[]`. **El catálogo de responsabilidades está pendiente** del contador (pregunta 7) | `ADR-093:99`; [cuestionario](../informes/INFORME-CONSULTA-CONTADOR-IVA-FACTURACION-v1.0.md) |
| H3 | El DV del NIT se valida **solo si llega** (`calculateNitVerificationDigit`); en el schema es opcional | `subscribers.service.ts:279-288`; `subscriber.schema.ts:157, 222` |
| H4 | `legal_representative_id uuid NULL` **sin FK** y **sin validación**: se guarda lo que llegue. El portal lo captura en un input de texto donde hay que escribir un UUID | `012:68`; `subscribers.service.ts:325, 767`; `JuridicaPersonFields.tsx:43-45` |
| H5 | El PRD (RF-SUB-03) dice «FK a otro subscriber NATURAL». ADR-030 hace del **Party** la identidad. `IPartyWritePort.ensurePartyWithRole` ya existe (ADR-052) | PRD:166; `party-write.port.ts:73` |
| H6 | `party_role_type` = `CUSTOMER`, `SUPPLIER`, `EMPLOYEE`, `CONTRACTOR`, `SALES_AGENT` | `022_create_parties_module.ts:35` |
| H7 | `contracts.fiscal_document varchar(30)` y `expediente_records.fiscal_document varchar(30)` se guardan **en claro**. La conversión deriva el NIT de `expediente.fiscalDocument` | `029:65`; `001:75`; `subscriber-creation.service.ts:103, 234` |
| H8 | `subscribers.nit` también está en claro y se busca por igualdad, pero solo existe para personas jurídicas (NIT de empresa): no es dato personal | `subscribers.service.ts:321, 896` |
| H9 | `subscribers.expediente_id` **sin FK** | `015_add_subscriber_conversion_fields.ts:13` |
| H10 | La entidad declara `varchar` donde la DDL usa `enum` (`person_type`, `customer_segment` y otros) | `subscriber.entity.ts:50-61` |
| H11 | La supresión (Fase 1b) anonimiza `fiscal_document` y `fiscal_name` de contratos y expedientes | `crm-titular-erasure.participant.ts`; CLI `anonymize-titular.ts:182` |
| H12 | Patrón de expansión de PII: migración que agrega columnas cifradas y HMAC, CLI de backfill con simulación por defecto, y corte posterior | `143_subscriber_party_pii_hmac.ts`; `cli/backfill-party-pii.ts` |

## 1. Reglas (R)

| R | Regla |
| --- | --- |
| R1 | `tax_regime` deja de escribirse. Toda alta y edición usa `vatResponsibility` (obligatorio) y `rutResponsibilities` (al menos uno, del catálogo de §2.2) |
| R2 | Migración de datos: `SIMPLIFIED → NO_RESPONSABLE` y `COMMON → RESPONSABLE` (Ley 1943 de 2018). Las responsabilidades del RUT de las filas existentes quedan **vacías** y la UI las muestra como «Pendientes de completar»; se exigen al editar |
| R3 | Persona jurídica: NIT y DV **obligatorios** al crear; el DV debe coincidir con `calculateNitVerificationDigit`. En la edición, si cambia el NIT, se exige el DV |
| R4 | Persona jurídica: representante legal **obligatorio** al crear, según D-M04 (§2.3) |
| R5 | `fiscal_document` de contratos y expedientes se cifra (AES-256-GCM) y lleva HMAC; las filas nuevas nunca se escriben en claro |
| R6 | Las filas existentes se cifran con un CLI de backfill (simulación por defecto). El texto plano se elimina en una migración posterior, ejecutada por tenant en G7 |
| R7 | La lectura descifra; mientras una fila no tenga backfill, se lee el texto plano (compatibilidad) |
| R8 | La supresión anonimiza las columnas nuevas (cifrado y HMAC) además de la vieja |
| R9 | `subscribers.expediente_id` gana FK hacia `expediente_records(id)`. La migración se aborta con un reporte si hay huérfanos |
| R10 | La entidad `Subscriber` declara como `enum` cada columna que es `enum` en la DDL (sin migración) |
| R11 | `subscribers.nit` (empresa) queda en claro: está fuera de ADR-058 (D-FIS). Se registra como observación |

## 2. Contratos congelados

### 2.1 Migraciones tenant (B0, el único que edita `runner.ts`)

**153 `subscriber_vat_responsibility`**
```sql
CREATE TYPE vat_responsibility_enum AS ENUM ('RESPONSABLE', 'NO_RESPONSABLE');
ALTER TABLE subscribers
  ADD COLUMN vat_responsibility vat_responsibility_enum,
  ADD COLUMN rut_responsibilities text[] NOT NULL DEFAULT '{}';
UPDATE subscribers SET vat_responsibility = CASE tax_regime
  WHEN 'SIMPLIFIED' THEN 'NO_RESPONSABLE'::vat_responsibility_enum
  ELSE 'RESPONSABLE'::vat_responsibility_enum END;
ALTER TABLE subscribers
  ALTER COLUMN vat_responsibility SET NOT NULL,
  ALTER COLUMN tax_regime DROP NOT NULL,
  ADD CONSTRAINT ck_subscribers_rut_responsibilities_known
    CHECK (rut_responsibilities <@ ARRAY['O-13','O-15','O-23','O-47','R-99-PN']::text[]);
```
`down` simétrico; restaura `NOT NULL` en `tax_regime` solo si ninguna fila quedó en `NULL` y, si no, lo informa con conteos. `tax_regime` queda **deprecado**, como `vat_treatment` (ADR-093 D6).

**154 `subscriber_legal_representative_party`** (solo si D-M04 = A)
- `ALTER TYPE party_role_type ADD VALUE 'LEGAL_REPRESENTATIVE'`, idempotente y con la guarda por `current_schema()` (patrón de la 058 y la 152).
- `subscribers.legal_representative_party_id uuid NULL REFERENCES party(id) ON DELETE RESTRICT`.
- `CHECK (person_type <> 'JURIDICA' OR legal_representative_party_id IS NOT NULL) NOT VALID`: obliga en altas y ediciones nuevas, sin romper las filas viejas.
- `legal_representative_id` queda deprecado. La migración informa cuántas filas lo tienen, sin valores; se elimina en una migración posterior.

**155 `fiscal_document_encryption`**
- `contracts` y `expediente_records`: `fiscal_document_encrypted varchar(500)` y `fiscal_document_hmac varchar(64)`, con índice sobre el HMAC.
- `fiscal_document` se conserva durante la expansión (R6).

**156 `subscriber_expediente_fk`**
- Antes, cuenta `subscribers.expediente_id` sin expediente; si hay alguno, **aborta** con el reporte de ids (patrón de la 143).
- Después, `FOREIGN KEY (expediente_id) REFERENCES expediente_records(id) ON DELETE RESTRICT`.

Cada migración lleva spec e integración (`up`, `down` y re-`up`) con **dos schemas tenant**, creados con las migraciones reales.

### 2.2 `@iwana/shared` (B1)

```ts
export enum VatResponsibility { RESPONSABLE = 'RESPONSABLE', NO_RESPONSABLE = 'NO_RESPONSABLE' }
// Catálogo de responsabilidades fiscales de la factura electrónica DIAN (TaxLevelCode).
// Provisional hasta el dictamen del contador (pregunta 7): ampliarlo es un cambio de contrato.
export const RUT_RESPONSIBILITIES = ['O-13', 'O-15', 'O-23', 'O-47', 'R-99-PN'] as const;
export type RutResponsibility = (typeof RUT_RESPONSIBILITIES)[number];
```
- **Altas (natural y jurídica):** `vatResponsibility` obligatorio; `rutResponsibilities: z.array(z.enum(RUT_RESPONSIBILITIES)).min(1)`, sin repetidos.
- **Edición:** los dos campos son opcionales, pero si la fila tiene `rutResponsibilities` vacío, la edición lo exige (`.superRefine` en el servicio).
- **Persona jurídica:** `nitVerificationDigit` obligatorio (`/^\d$/`).
- **Persona jurídica, con D-M04 = A:** el alta pide `legalRepresentative: { fullName, documentType, documentNumber }` y deja de aceptar `legalRepresentativeId`.
- **Respuesta:** agrega `vatResponsibility`, `rutResponsibilities` y, con D-M04 = A, `legalRepresentative: { partyId, displayName } | null`. `taxRegime` se mantiene nullable y deprecado; `legalRepresentativeId` se retira de la respuesta.
- `TaxRegime` queda `@deprecated`.
- **`PartyRoleType`:** agrega `LEGAL_REPRESENTATIVE`.

### 2.3 Representante legal (D-M04 = A recomendada)

- **Alta de persona jurídica:** en la **misma transacción**, `IPartyWritePort.ensurePartyWithRole({ personType: NATURAL, fullName, documentType, documentNumber }, LEGAL_REPRESENTATIVE, ctx)`. El Party se deduplica por HMAC de documento. Se guarda `legal_representative_party_id`.
- **Edición:** cambiar de representante crea o reutiliza otro Party; el anterior no se borra.
- **Proyección (ADR-067):** `legalRepresentative.displayName` aparece en el mapa campo × rol con el mismo alcance que `businessName`. El documento del representante **no** va en la respuesta del suscriptor.
- **Privacidad:** el representante es un titular más (Party).
  - El bloqueo y la supresión de la Fase 1b lo alcanzan por su propio Party.
  - Al anonimizar a la **empresa** no se toca al representante: lo registra la deuda de §5.

### 2.4 Documento fiscal cifrado (B2)

- **Escritura (contratos, expedientes y la conversión):**
  - `fiscal_document_encrypted = encrypt(valor)`;
  - `fiscal_document_hmac = hmacPiiValue(normalizeDocumentNumber(valor))`;
  - `fiscal_document = NULL`.
  - Claves desde `ConfigService` (lección R8/L1).
- **Lectura:** se descifra; si `fiscal_document_encrypted` es `NULL`, se lee `fiscal_document` (R7). Los DTO y la proyección no cambian de forma.
- **Conversión:** `subscriber-creation.service.ts:103, 234` usa el valor descifrado.
- **CLI `backfill-fiscal-document.ts`:**
  - simulación por defecto y `--apply`, por tenant;
  - cifra y pone a `NULL` el texto plano, en lotes;
  - informa solo conteos; verificación posterior con 0 filas en claro;
  - es idempotente.
- **Supresión (R8):** el participante CRM y el CLI de anonimización ponen a `NULL` `fiscal_document_encrypted` y `fiscal_document_hmac` (categoría `FISCAL`), y la verificación de residuales los incluye.

### 2.5 Entidad (B1, R10)

En `subscriber.entity.ts`, cada columna con tipo `enum` en la DDL se declara `@Column({ type: 'enum', enum: X, enumName: '<nombre_en_ddl>' })`. Un test compara la metadata de TypeORM con `pg_type` en un schema migrado.

### 2.6 Portal (B3)

| Superficie | Cambio |
| --- | --- |
| `SubscriberForm`, `SubscriberSections` | `taxRegime` se reemplaza por «Responsabilidad de IVA» (obligatorio) y «Responsabilidades del RUT» (selección múltiple con el catálogo y sus etiquetas en español) |
| `JuridicaPersonFields` | DV obligatorio, validado en vivo con la misma función que la API (o un espejo en shared). Con D-M04 = A, el representante legal se captura con nombre completo, tipo y número de documento, en vez del input de UUID |
| `SubscriberHeader`, `VatTreatmentBanner`, `subscriber-ui` | Dejan de mostrar `taxRegime` y muestran `vatResponsibility`. Si las responsabilidades del RUT están vacías: «Responsabilidades del RUT pendientes de completar» |
| `api-client.ts` | Tipos desde `@iwana/shared` |

## 3. Pasada regla → campo

| Regla | Campo, endpoint o puerto | Bloque | Test |
| --- | --- | --- | --- |
| R1 | `vatResponsibility`, `rutResponsibilities` (§2.2); servicio sin escribir `tax_regime` | B1 | Unidad y HTTP: alta sin los campos → 400; alta válida no escribe `tax_regime` |
| R2 | Migración 153 | B0 | Integración: filas `SIMPLIFIED` y `COMMON` mapeadas; `down` y re-`up` |
| R3 | `nitVerificationDigit` obligatorio; `calculateNitVerificationDigit` | B1 | HTTP: DV ausente → 400; DV erróneo → 400; DV correcto → 201 |
| R4 | `legalRepresentative` y `ensurePartyWithRole` (§2.3); migración 154 | B0 + B1 | Integración: alta jurídica crea o reutiliza el Party con el rol; sin representante → 400; CHECK `NOT VALID` deja pasar las filas viejas y rechaza una edición que lo quite |
| R5 | §2.4 escritura | B2 | Integración: tras crear o editar, `fiscal_document` es `NULL` y el cifrado se descifra al valor |
| R6 | CLI de backfill | B2 | Integración: simulación sin cambios; `--apply` deja 0 filas en claro; segunda corrida con 0 cambios |
| R7 | Lectura con compatibilidad | B2 | Unidad: fila heredada en claro se lee igual |
| R8 | Participante CRM y CLI de supresión | B2 | Integración de supresión (`privacy-erasure-api…`) ampliada: residuales 0 en las columnas nuevas |
| R9 | Migración 156 | B0 | Integración: con un huérfano aborta con reporte; sin huérfanos crea la FK |
| R10 | Entidad | B1 | Test de paridad entre la metadata de la entidad y `pg_type` |
| R11 | Sin cambio | — | Observación en el informe de cierre |

**Cruce con estados (lección A22):**
- un suscriptor `JURIDICA` **bloqueado** (Fase 1b) no puede cambiar de representante: R10 de la Fase 1b → 409;
- un titular **anonimizado** conserva `vatResponsibility` y `rutResponsibilities`, porque no identifican a nadie.

## 4. Bloques

### B0 · `sr-backend` · migraciones (primero)

- **Propiedad:** `packages/database/src/migrations/tenant/153_*` a `156_*`, `runner.ts` y sus tests.
- **Entrega:** §2.1 tal cual; avisa **S1** al terminar. La 154 solo si D-M04 = A.

### B1 · `sr-backend` · suscriptores (tras S1)

- **Propiedad:**
  - `apps/api/src/modules/crm/subscribers/**`;
  - `packages/shared/src/schemas/subscriber.schema.ts`;
  - `packages/shared/src/enums/tax-regime.enum.ts`, el enum nuevo de IVA y `RUT_RESPONSIBILITIES`;
  - `packages/shared/src/enums/parties/party-role-type.enum.ts`.
- **Alcance:** R1 a R4 y R10. Publica primero los esquemas de §2.2 y avisa **S2**.

### B2 · `sr-backend` · documento fiscal (tras S1, en paralelo con B1)

- **Propiedad:**
  - `apps/api/src/modules/crm/contracts/**` y `crm/expedientes/**`, solo en lo fiscal;
  - `subscriber-creation.service.ts`, **solo** las líneas de §2.4, en coordinación con B1: lo toca B2 y B1 no edita esas líneas;
  - `apps/api/src/cli/backfill-fiscal-document*`;
  - `crm/privacy-adapters/titular-erasure/`;
  - `cli/anonymize-titular.ts`.
- **Alcance:** R5 a R8.

### B3 · `fe-platform` · portal (tras S2)

- **Propiedad:** `apps/portal/src/components/crm/subscribers/**` y `apps/portal/src/lib/api-client.ts`, solo los tipos tocados.
- **Alcance:** §2.6.

### Evidencia obligatoria para B0 a B3 (lecciones del 2026-10-16)

- La suite **completa** del paquete sin caché, con 0 fallos.
- `pnpm exec turbo run test --force --continue` con los totales por paquete.
- `test:integration` de db y api contra una base **desechable** (`iwana_it_g7_ci`), nunca `dbiw`, con el schema creado por las migraciones reales.
- Para backend, la API arrancada hasta `/health`.
- Un informe con tests en rojo no se acepta.

## 5. Ola 2 · Verificación (los revisores no corrigen; V1 sí escribe tests)

| # | Agente | Alcance |
| --- | --- | --- |
| V1 | `sr-qa` | **Escribe y ejecuta** E2E contra la API real, sobre el tenant de E2E ACTIVE: (1) alta jurídica sin DV o con DV erróneo → rechazo, y con DV correcto y representante → alta y Party con el rol; (2) alta con responsabilidad de IVA y del RUT, y suscriptor heredado con «pendientes de completar»; (3) contrato con documento fiscal: la base guarda solo el cifrado y la pantalla muestra el valor. `--retries=0` y matriz R1–R11 ↔ test |
| V2 | `sec-eng` | Cifrado y HMAC del documento fiscal, sin texto plano nuevo; el CLI de backfill; claves desde `ConfigService`; PII en logs; la proyección del representante legal |
| V3 | `boundary-reviewer` ∥ `contract-drift-reviewer` | CRM → `parties` solo por `IPartyWritePort`; esquemas de shared frente a productores y consumidores |
| V4 | `gate-verifier` | «Gates Before Merge» con `--force --continue` y las integraciones Postgres |
| V5 | `docs-governance` | Los `docs/` de la fase |

## 6. Reglas comunes

- Leer `AGENTS.md` y los `SKILL.md` de la matriz del plan §3, como documentación.
- No modificar contratos: si falta algo, `[BLOQUEO]` y parar.
- Ninguna PII, ciphertext, HMAC ni clave real en el repo, los informes o los logs. No commitear.
- No migrar `dbiw`: lo decide el CTO después del commit, con `pnpm db:backup` antes.
- Informes: `docs/informes/INFORME-MOD05-DEUDA-{bloque}-v1.0.md`, con la ruta verificada como libre.
- **Deuda conocida que esta fase no cubre:**
  - eliminar `fiscal_document`, `tax_regime` y `legal_representative_id` (migración posterior, después del backfill por tenant en G7);
  - el alcance de la supresión sobre el representante legal de una empresa anonimizada (Fase 2 de privacidad);
  - `subscribers.nit` en claro (R11).
