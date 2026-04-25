# PROMPT — F2: Scaffold MOD08 Parties + Gap F1

**Versión:** 1.0
**Fecha:** 2026-04-21
**Fase:** F2 del programa Taxation + Parties + Commercial Redesign
**Destinatario:** Sr. Dev Fullstack
**Contexto:** F1 (MOD07 Taxation) completada y aprobada. Ver informe `docs/informes/INFORME-TAXATION-PARTIES-PROGRAMA-v1.0.md`.

---

## 0. Antes de empezar

Lee estos artefactos en este orden — no asumas nada sin leerlos:

1. `docs/hlds/HLD-MOD08-PARTIES-v1.0.md` — fuente de verdad de F2
2. `docs/adrs/ADR-030-Modelo-Party-Multi-Rol.md`
3. `docs/adrs/ADR-025-Subscriber-Modelo-Dos-Dimensiones.md`
4. `AGENTS.md`, `CLAUDE.md`

---

## 1. Gap F1 — Cerrar antes de arrancar F2

**Problema:** `TaxPresetsSeeder` está exportado de `TaxationModule` pero `TenantProvisioningProcessor` no lo llama. Los tenants creados después de F1 no reciben los 6 presets Colombia.

**Solución aprobada (en dos pasos):**

### 1a — Extraer constantes a `@iwana/shared`

En `packages/shared/src/taxation/` (crear si no existe):
- Nuevo archivo `tax-colombia-presets.ts` que exporta `TAX_COLOMBIA_PRESETS: readonly TaxPresetDefinition[]` con los mismos 6 presets que están hardcodeados en `TaxPresetsSeeder.COLOMBIA_PRESETS`.
- Exportar desde el barrel `packages/shared/src/index.ts`.

En `apps/api`, actualizar `TaxPresetsSeeder` para importar la constante desde `@iwana/shared` en vez de definirla inline.

### 1b — Llamar seeder desde el worker

En `apps/worker/src/services/tenant-seed.service.ts`:
- Añadir método `seedTaxPresets(schemaName: string): Promise<void>`.
- Implementación: `runInTenantSchema(dataSource, schemaName, async (qr) => { /* upsert presets usando TAX_COLOMBIA_PRESETS */ })`.
- Patrón idéntico al que usa `TaxPresetsSeeder` en la api.

En `apps/worker/src/processors/tenant-provisioning.processor.ts`:
- Llamar `await this.tenantSeedService.seedTaxPresets(schemaName)` inmediatamente después de `runMigrationsForSchema(schemaName)`.
- Log antes y después siguiendo el estilo del processor.

**Tests del gap:**
- Unit en `tenant-seed.service.spec.ts`: `seedTaxPresets` hace upsert idempotente de 6 presets.
- Actualizar mock de `tenantSeedService` en `tenant-provisioning.processor.spec.ts` para incluir `seedTaxPresets`.

---

## 2. F2 — Scaffold MOD08 Parties

### 2a — Migraciones (ejecutar PRIMERO)

Archivo: `packages/database/src/migrations/tenant/022_create_parties_module.ts`

DDL a incluir (reversible — implementar `up` y `down`):

```sql
-- up
CREATE TYPE party_type AS ENUM ('NATURAL', 'ORGANIZATION');
CREATE TYPE document_type_party AS ENUM ('CC', 'CE', 'NIT', 'PASAPORTE', 'TI', 'RUT', 'OTHER');
CREATE TYPE party_status AS ENUM ('ACTIVE', 'INACTIVE', 'MERGED');
CREATE TYPE party_role_type AS ENUM ('CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'CONTRACTOR', 'SALES_AGENT');
CREATE TYPE party_role_status AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE party_contact_type AS ENUM ('EMAIL', 'PHONE', 'ADDRESS');

CREATE TABLE party (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_type party_type NOT NULL,
  document_type document_type_party NOT NULL,
  document_number VARCHAR(32) NOT NULL,
  verification_digit VARCHAR(2),
  display_name VARCHAR(160) NOT NULL,
  legal_name VARCHAR(200),
  birth_date DATE,
  incorporation_date DATE,
  status party_status NOT NULL DEFAULT 'ACTIVE',
  merged_into_party_id UUID REFERENCES party(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_party_document_active
  ON party(document_type, document_number)
  WHERE deleted_at IS NULL AND status != 'MERGED';

CREATE TABLE party_contact (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id UUID NOT NULL REFERENCES party(id) ON DELETE CASCADE,
  type party_contact_type NOT NULL,
  value VARCHAR(255) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_party_contact_primary
  ON party_contact(party_id, type)
  WHERE is_primary = TRUE;

CREATE TABLE party_role (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id UUID NOT NULL REFERENCES party(id) ON DELETE CASCADE,
  role party_role_type NOT NULL,
  status party_role_status NOT NULL DEFAULT 'ACTIVE',
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_party_role_active
  ON party_role(party_id, role)
  WHERE status = 'ACTIVE';

-- Añadir party_id a users (nullable en v1)
ALTER TABLE users ADD COLUMN party_id UUID REFERENCES party(id);

-- down
ALTER TABLE users DROP COLUMN IF EXISTS party_id;
DROP TABLE IF EXISTS party_role;
DROP TABLE IF EXISTS party_contact;
DROP TABLE IF EXISTS party;
DROP TYPE IF EXISTS party_contact_type;
DROP TYPE IF EXISTS party_role_status;
DROP TYPE IF EXISTS party_role_type;
DROP TYPE IF EXISTS party_status;
DROP TYPE IF EXISTS document_type_party;
DROP TYPE IF EXISTS party_type;
```

### 2b — Entidades TypeORM

Ubicación: `apps/api/src/modules/parties/entities/`

Tres entidades (`party.entity.ts`, `party-contact.entity.ts`, `party-role.entity.ts`) con columnas exactas del HLD §4. Seguir la convención camelCase en TS / snake_case en BD.

No usar `synchronize: true`. Las columnas deben coincidir exactamente con la migración.

### 2c — DTOs

Ubicación: `apps/api/src/modules/parties/dto/`

Con `class-validator` + comentario en español cuando la validación no sea obvia:

- `create-party.dto.ts`: `partyType`, `documentType`, `documentNumber`, `displayName`, campos opcionales del HLD.
- `update-party.dto.ts`: `PartialType(CreatePartyDto)`.
- `assign-role.dto.ts`: `role` (enum `PartyRoleType`), `validFrom?`, `validTo?`.
- `upsert-contact.dto.ts`: `type`, `value`, `isPrimary`, `metadata?`.
- `list-parties.dto.ts`: filtros `role?`, `status?`, `documentType?`, `search?` (displayName contains), paginación `page`/`limit`.

### 2d — Servicios

Ubicación: `apps/api/src/modules/parties/services/`

**`PartyService`:**
- `create(dto, schemaName)`: verifica unicidad `(documentType, documentNumber)` activo antes de insertar. Lanza `ConflictException` si ya existe.
- `findAll(dto, schemaName)`: listado paginado con filtros.
- `findOne(id, schemaName)`: retorna `PartySnapshot` o `NotFoundException`.
- `update(id, dto, schemaName)`: no permite cambiar `documentType`/`documentNumber` si status=ACTIVE y tiene roles activos.
- `softDelete(id, schemaName)`: `status → INACTIVE`, `deletedAt`.

**`PartyRoleService`:**
- `assign(partyId, dto, schemaName)`: si el rol ya existe con status=ACTIVE, lanza `ConflictException`. Si existe con status=INACTIVE, lo reactiva.
- `deactivate(partyId, roleId, schemaName)`: pone `status=INACTIVE`, `validTo=NOW()`.

**`PartyContactService`:**
- `upsert(partyId, dto, schemaName)`: si `isPrimary=true`, primero limpia `isPrimary` en los demás contactos del mismo tipo.
- `list(partyId, schemaName)`: todos los contactos.
- `delete(partyId, contactId, schemaName)`: elimina directamente.

Todos los métodos usan `runInTenantSchema()`. Nunca `TenantContext.getOrThrow()` en servicios sin request.

**PII:** `documentNumber` y `contact.value` no deben aparecer en logs (`Logger.log/debug`). Loguear solo IDs y tipos.

### 2e — Puerto de lectura

`apps/api/src/modules/parties/ports/party-read.port.ts`

```ts
export interface PartySnapshot {
  id: string;
  partyType: PartyType;
  documentType: DocumentType;
  documentNumber: string;
  displayName: string;
  legalName: string | null;
  status: PartyStatus;
}

export interface PartyRoleSnapshot {
  id: string;
  role: PartyRoleType;
  status: PartyRoleStatus;
  validFrom: Date;
  validTo: Date | null;
}

export interface PartyContactSnapshot {
  id: string;
  type: PartyContactType;
  value: string;
  isPrimary: boolean;
}

export abstract class IPartyReadPort {
  abstract getById(id: string): Promise<PartySnapshot | null>;
  abstract findByDocument(documentType: DocumentType, documentNumber: string): Promise<PartySnapshot | null>;
  abstract listRoles(partyId: string): Promise<PartyRoleSnapshot[]>;
  abstract listContacts(partyId: string): Promise<PartyContactSnapshot[]>;
}
```

Adaptador en `apps/api/src/modules/parties/adapters/party-read.adapter.ts` que implementa la clase abstracta usando `DataSource + runInTenantSchema()`.

### 2f — Controller

`apps/api/src/modules/parties/parties.controller.ts`

Endpoints (todos con `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserRole.TENANT_ADMIN)`):

```
GET    /api/v1/parties                       → listado paginado
POST   /api/v1/parties                       → crear party
GET    /api/v1/parties/:id                   → detalle
PATCH  /api/v1/parties/:id                   → actualizar
DELETE /api/v1/parties/:id                   → soft delete

POST   /api/v1/parties/:id/roles             → asignar rol
PATCH  /api/v1/parties/:id/roles/:roleId     → desactivar rol

POST   /api/v1/parties/:id/contacts          → upsert contacto
GET    /api/v1/parties/:id/contacts          → listar contactos
DELETE /api/v1/parties/:id/contacts/:contactId → eliminar contacto
```

Decorar todos con `@ApiTags('Parties')` y `@ApiBearerAuth()`. Respuestas `@ApiResponse` básicas.

### 2g — Módulo y wiring

`apps/api/src/modules/parties/parties.module.ts`:
- Importa `TypeOrmModule.forFeature([Party, PartyContact, PartyRole])`.
- Provee los tres servicios.
- Exporta `IPartyReadPort` (usando el adaptador como proveedor).

Registrar `PartiesModule` en `apps/api/src/app.module.ts`.

---

## 3. Tests

### Unit (`apps/api/src/modules/parties/tests/`)

**`party.service.spec.ts`:**
- `create` lanza `ConflictException` si ya existe documento activo.
- `create` inserta correctamente con datos mínimos válidos.
- `findOne` lanza `NotFoundException` si id no existe.

**`party-role.service.spec.ts`:**
- `assign` lanza `ConflictException` si rol ya está activo.
- `assign` reactiva rol inactivo en vez de duplicar.
- `deactivate` pone `status=INACTIVE` y `validTo`.

**`party-contact.service.spec.ts`:**
- `upsert` con `isPrimary=true` limpia el `isPrimary` anterior del mismo tipo.

**Test negativo PII:**
- Un spy sobre `Logger.debug` verifica que `documentNumber` y `contact.value` nunca aparecen en los mensajes de log durante un `create`.

### HTTP (`parties.controller.http.spec.ts`):
- `POST /api/v1/parties` → 201 con body correcto.
- `POST /api/v1/parties` duplicado → 409.
- Sin token → 401. Con rol incorrecto → 403.
- Aislamiento tenant: party creada en schema A no aparece en query de schema B.

### Meta
≥ 80% cobertura en `party.service.ts`, `party-role.service.ts`, `party-contact.service.ts`, `parties.controller.ts`.

---

## 4. Verificación de calidad antes de cerrar F2

```bash
pnpm lint
pnpm typecheck
pnpm --filter @iwana/api test
pnpm --filter @iwana/worker test   # valida que el gap F1 está cerrado
```

Todos deben pasar sin errores. Los 2 tests rojos de `tax-classification.service.spec.ts` son deuda de F3 — no bloquean F2 si no están en la suite de parties.

---

## 5. Entregable documental

Actualizar `docs/informes/INFORME-TAXATION-PARTIES-PROGRAMA-v1.0.md`:
- Gap F1 → cerrado (sección F1, bloque Gaps).
- F2 → completada con tabla de entregables y commits clave.

---

## 6. Gate de salida F2

| Check | Criterio |
|---|---|
| Migración 022 | `up` y `down` ejecutables sin error |
| Entidades | Columnas exactas HLD §4 |
| Puerto | `IPartyReadPort` exportado y funcional |
| Worker gap | `seedTaxPresets` llamado en processor, tests verdes |
| Tests | ≥ 80% cobertura servicios + controller |
| Lint + typecheck | Sin errores |
| PII | `documentNumber`/`value` no aparecen en logs |
| Informe | F2 completada, gap F1 cerrado |

Una vez el gate está en verde: **notificar al EM para abrir F3**.
