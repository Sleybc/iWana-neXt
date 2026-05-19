---
title: "HLD — Módulo Parties: Maestro de terceros multi-rol"
version: "1.0"
owner: "Arquitectura de Soluciones"
date: "2026-04-21"
status: "Aprobado"
approvedAt: "2026-04-21"
approvedBy: "CTO Humano"
classification: "Confidencial — Uso Interno"
module: "MOD08"
codeName: "PartiesModule"
author: "AI-EM-ARCH (Modo Architect)"
references:
  - docs/adrs/ADR-030-Modelo-Party-Multi-Rol.md
  - docs/adrs/ADR-025-Subscriber-Modelo-Dos-Dimensiones.md
  - docs/adrs/ADR-024-Migracion-CRM-Expediente-Unico.md
  - docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md
  - docs/specs/2026-04-21-parties-multi-rol-design.md
---

# HLD: Módulo Parties — Arquitectura v1.0 (MOD08)

## 1. Contexto de negocio

Parties centraliza la **identidad de negocio** de personas naturales y organizaciones dentro del tenant. Resuelve el problema de que una misma persona u organización pueda jugar múltiples roles al mismo tiempo: cliente, proveedor, empleado, contratista, vendedor.

Responsabilidad explícita:

- Identidad maestra por tercero (documento, nombre, tipo).
- Contactos del tercero (email, teléfono, dirección).
- Asignación tipada de roles de negocio con vigencia.
- Vínculo opcional con cuentas autenticadas (`UserAccount`).

Responsabilidad fuera de alcance:

- Reglas tributarias, laborales o comerciales por rol (propiedad del módulo dueño del rol).
- Autenticación, sesiones, MFA (propiedad de AuthModule).
- Fusión automática avanzada con servicios externos (fuera de v1).

## 2. Bounded contexts afectados

| Contexto | Rol | Impacto |
|---|---|---|
| PartiesModule (nuevo) | Owner | Maestro `Party`, `party_contact`, `party_role` |
| AuthModule | Upstream | `UserAccount` se vincula a `Party` vía `partyId` |
| CrmModule | Downstream (migración) | `Subscriber` pasa a perfil especializado sobre `Party` |
| PurchasingModule (futuro) | Downstream | `SupplierProfile` cuelga de `Party` + rol SUPPLIER |
| HrModule (futuro) | Downstream | `EmployeeProfile` cuelga de `Party` + rol EMPLOYEE |
| AuditModule | Transversal | Auditoría CUD |

## 3. Estructura del módulo

```
apps/api/src/modules/parties/
├── parties.module.ts
├── parties.controller.ts
├── entities/
│   ├── party.entity.ts
│   ├── party-contact.entity.ts
│   └── party-role.entity.ts
├── dto/
│   ├── create-party.dto.ts
│   ├── update-party.dto.ts
│   ├── assign-role.dto.ts
│   └── upsert-contact.dto.ts
├── services/
│   ├── party.service.ts
│   ├── party-role.service.ts
│   └── party-contact.service.ts
├── ports/
│   └── party-read.port.ts               # IPartyReadPort expuesto a otros BCs
├── adapters/
│   └── party-read.adapter.ts
└── tests/
    ├── party.service.spec.ts
    ├── party-role.service.spec.ts
    └── party.controller.http.spec.ts
```

## 4. Modelo de datos

### Tabla `party` (schema del tenant)

| Columna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| partyType | enum | `NATURAL` \| `ORGANIZATION` |
| documentType | enum | CC, CE, NIT, PASAPORTE, TI, RUT, OTHER |
| documentNumber | varchar(32) | |
| verificationDigit | varchar(2) nullable | Para NIT |
| displayName | varchar(160) | |
| legalName | varchar(200) nullable | Razón social (org) |
| birthDate | date nullable | Persona natural |
| incorporationDate | date nullable | Organización |
| status | enum | `ACTIVE` \| `INACTIVE` \| `MERGED` |
| mergedIntoPartyId | UUID nullable | Si status=MERGED |
| notes | text nullable | |
| createdAt / updatedAt / deletedAt | timestamptz | |

Unique: `(documentType, documentNumber)` activo.

### Tabla `party_contact`

| Columna | Tipo | Notas |
|---|---|---|
| id | UUID | |
| partyId | UUID FK | |
| type | enum | EMAIL, PHONE, ADDRESS |
| value | varchar(255) | cifrado si aplica política PII |
| isPrimary | boolean | |
| verifiedAt | timestamptz nullable | |
| metadata | jsonb nullable | country code, label, etc. |

Regla: un `isPrimary = true` por `(partyId, type)`.

### Tabla `party_role`

| Columna | Tipo | Notas |
|---|---|---|
| id | UUID | |
| partyId | UUID FK | |
| role | enum | `CUSTOMER` \| `SUPPLIER` \| `EMPLOYEE` \| `CONTRACTOR` \| `SALES_AGENT` |
| status | enum | `ACTIVE` \| `INACTIVE` |
| validFrom | timestamptz | |
| validTo | timestamptz nullable | |
| createdBy | UUID nullable | UserAccount.id |

Unique: `(partyId, role)` cuando `status = ACTIVE`. Un tercero puede tener varios roles activos distintos.

### Cambios sobre `users` (schema del tenant)

Se añade `partyId: UUID | null`. Un `UserAccount` puede tener o no un `Party` asociado. Cuentas operativas de plataforma (`SYSTEM_ADMIN`, `IWANA_SUPPORT`) no requieren `Party`.

## 5. Contratos expuestos

### `IPartyReadPort`

```ts
interface IPartyReadPort {
  getById(id: string): Promise<PartySnapshot | null>;
  findByDocument(documentType: DocumentType, documentNumber: string): Promise<PartySnapshot | null>;
  listRoles(partyId: string): Promise<PartyRoleSnapshot[]>;
  listContacts(partyId: string): Promise<PartyContactSnapshot[]>;
}
```

Los snapshots son DTOs inmutables; no se exponen entidades.

### REST (admin tenant)

- `GET /api/v1/parties` (listado, filtros por rol y estado)
- `POST /api/v1/parties`
- `GET /api/v1/parties/:id`
- `PATCH /api/v1/parties/:id`
- `POST /api/v1/parties/:id/roles` (asignar o reactivar rol)
- `PATCH /api/v1/parties/:id/roles/:roleId` (desactivar con `validTo`)
- `POST /api/v1/parties/:id/contacts`

## 6. Multi-tenant

- Todas las tablas viven en el schema del tenant.
- `Subscriber` y `UserAccount` conviven con `Party` durante la migración.
- Resolución de schema vía `search_path` estándar.

## 7. Migración aditiva desde Subscriber y User

Fase 1 — esquema: crear tablas `party`, `party_contact`, `party_role`; añadir columna `users.party_id`.

Fase 2 — backfill CRM:

- Por cada `Subscriber` activo crear un `Party` preservando el vínculo (`subscribers.party_id`).
- Crear `party_role` con `role = CUSTOMER`.
- Portar contactos primarios a `party_contact`.

Fase 3 — backfill Users: para cada `User` con datos de tercero (nombre, documento), enlazarlo a un `Party` existente o crearlo. Cuentas operativas conservan `partyId = null`.

Fase 4 — nueva escritura: endpoints de alta de cliente pasan por `Party`. `Subscriber` reduce su responsabilidad a perfil especializado.

Fase 5 — corte: Purchasing y RRHH nacen directamente contra Parties.

La migración sigue el patrón ADR-024: aditiva, reversible, con ventana controlada. Cada fase tiene su ADR operativo o su entrada en informe vivo.

## 8. Seguridad, auditoría y PII

- `documentNumber` y contactos pueden ser PII. Se aplica cifrado/redacción según política PRD §13.
- Todas las operaciones CUD son auditadas por interceptor.
- Endpoints restringidos por rol (TENANT_ADMIN para CUD, TENANT_USER con permisos para lectura).

## 9. Testing

- Unit en servicios (unicidad por documento, vigencia de roles, primary único por tipo de contacto).
- HTTP spec para controller con aislamiento tenant.
- Integración de migración: backfill reproducible en test DB.
- Meta ≥80% en servicios core.

## 10. Riesgos y pendientes

- Deduplicación automática no entra en v1: se registra merge manual con `mergedIntoPartyId`.
- Integración con RUES/DIAN queda para fase posterior.
- Renombre físico de tabla `users` → `user_accounts` se evalúa en ADR operativo posterior; en v1 basta con el renombre semántico.

## 11. Referencias

- docs/adrs/ADR-030-Modelo-Party-Multi-Rol.md
- docs/adrs/ADR-025-Subscriber-Modelo-Dos-Dimensiones.md
- docs/adrs/ADR-024-Migracion-CRM-Expediente-Unico.md
- docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md
