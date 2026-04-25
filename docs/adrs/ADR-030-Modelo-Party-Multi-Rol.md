---
title: "ADR-030 — Modelo Party multi-rol y separación de identidad de negocio vs cuenta autenticada (Parties / MOD08)"
status: "Aprobado"
date: "2026-04-21"
approvedAt: "2026-04-21"
approvedBy: "CTO Humano"
author: "AI-EM-ARCH (Modo Architect)"
module: "MOD08"
references:
  - AGENTS.md
  - docs/prds/PRD_Sistema_ISP_Colombia_v2_3.md
  - docs/adrs/ADR-025-Subscriber-Modelo-Dos-Dimensiones.md
  - docs/adrs/ADR-024-Migracion-CRM-Expediente-Unico.md
  - docs/adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md
  - docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md
  - docs/hlds/HLD-MOD08-PARTIES-v1.0.md
  - docs/superpowers/specs/2026-04-21-parties-multi-rol-design.md
---

# ADR-030: Modelo Party multi-rol y separación de identidad de negocio vs cuenta autenticada

## Estado

Aprobado por CTO el 2026-04-21.

## Contexto

En el roadmap existen o se anticipan estos tipos de terceros dentro de un mismo tenant: clientes (Subscriber), proveedores, empleados, contratistas y vendedores o comisionistas. La realidad del negocio es que una misma persona u organización puede cumplir varios de estos roles a la vez. Ejemplos reales en ISPs colombianos:

- Un empleado técnico que también es cliente residencial del mismo ISP.
- Un proveedor de fibra que además contrata servicios corporativos al ISP.
- Un contratista de obra que factura al ISP y además es vendedor externo con comisión.

El modelo actual no soporta este escenario:

- `packages/database/src/entities/user.entity.ts` modela únicamente la cuenta autenticada del tenant, con `role: UserRole` único (`TENANT_ADMIN`, `TENANT_USER`, `SYSTEM_ADMIN`, `IWANA_SUPPORT`). No representa un tercero de negocio.
- `apps/api/src/modules/crm/subscribers/entities/subscriber.entity.ts` modela cliente comercial, con `userId` opcional. Es el único perfil de tercero real que existe.
- No existe entidad `Party`, `ThirdParty`, `Tercero`, `Supplier`, `Employee`, `Contractor` ni `SalesAgent` en el monorepo.

Si se mantiene el modelo actual y entran Purchasing y RRHH, el equipo terminará duplicando identificación, contacto y datos fiscales por cada rol. Eso produce inconsistencia de datos maestros, riesgo de habeas data, dificultad para auditoría y bloqueos reales al consolidar terceros.

## Decisión

Se adopta `PartiesModule` (MOD08) como bounded context propio, con separación explícita entre identidad de negocio, cuenta autenticada y perfiles especializados por módulo.

### D1. Entidad base `Party`

Representa la identidad maestra de una persona natural u organización dentro del tenant. Atributos mínimos:

- `id` UUID
- `partyType` enum `NATURAL | ORGANIZATION`
- `documentType` enum (CC, CE, NIT, PASAPORTE, TI, otros según DANE/DIAN)
- `documentNumber` string
- `displayName` string
- `legalName` string opcional
- `birthDate` / `incorporationDate` opcional
- `status` enum `ACTIVE | INACTIVE | MERGED`
- `createdAt`, `updatedAt`, `deletedAt`

Unique constraint por `(documentType, documentNumber)` dentro del tenant.

### D2. Contactos por Party

Entidad hija `party_contact` con `type` (EMAIL, PHONE, ADDRESS), `value`, `isPrimary`, `verifiedAt`. Múltiples por `Party`. Sustituye contactos dispersos en cada bounded context.

### D3. Roles como relación tipada

Entidad `party_role` con:

- `partyId`
- `role` enum `CUSTOMER | SUPPLIER | EMPLOYEE | CONTRACTOR | SALES_AGENT`
- `status` enum `ACTIVE | INACTIVE`
- `validFrom` / `validTo`

Un mismo `Party` puede tener N roles activos simultáneamente. Un rol desactivado se conserva por historial (soft-disable, no delete).

### D4. Cuenta autenticada = UserAccount

El actual `User` se renombra semánticamente a `UserAccount` y se le añade `partyId: UUID | null`. Si la cuenta representa a una persona de negocio, queda vinculada a su `Party`. Si es una cuenta operativa sin tercero (ej. administrador de plataforma), `partyId = null`. La tabla física puede mantenerse como `users` en esta fase; el renombre físico se trata en HLD-MOD08.

### D5. Perfiles especializados por bounded context

Cada módulo dueño de un rol extiende con su propio perfil:

- `subscriber_profile` (ya existente como `Subscriber` en CRM)
- `supplier_profile` (futuro, en Purchasing)
- `employee_profile` (futuro, en RRHH)
- `contractor_profile` (futuro)
- `sales_agent_profile` (futuro)

Los perfiles referencian `partyId` + `partyRoleId`. `PartiesModule` no conoce reglas fiscales, laborales ni comerciales.

### D6. Boundary estricto

- `PartiesModule` no conoce ventas, compras, nómina ni comisiones.
- Cada módulo dueño de un rol es responsable de su perfil extendido.
- Los perfiles no acceden a tablas de otros módulos; consumen `Party` solo vía puerto `IPartyReadPort`.

### D7. Migración aditiva multi-fase

No se rompe lo existente. Plan resumido (detalle en HLD y spec):

1. Crear `PartiesModule` con `party`, `party_contact`, `party_role`, `user_account` vínculo.
2. Backfill: cada `Subscriber` actual genera su `Party` + `party_role = CUSTOMER` + `subscriber_profile` apuntando al Party, preservando el id de `Subscriber`.
3. Cada `User` con `personType` o datos de tercero, vincula su `partyId`.
4. `Subscriber` se reduce progresivamente a perfil especializado, delegando identidad a `Party`.
5. Purchasing y RRHH nacen ya apoyados en `Party`.

La migración sigue el patrón ADR-024 (migración aditiva con preservación de datos).

## Alternativas consideradas

### A. Ampliar `User` con múltiples roles de negocio (descartada)

Mezcla autenticación con identidad de tercero. Usuarios sin cuenta (la mayoría de proveedores y clientes) no podrían existir sin crear cuentas ficticias. Viola el principio de separación de identidad.

### B. Crear `Supplier`, `Employee`, `Contractor`, `SalesAgent` como entidades paralelas a `Subscriber` (descartada)

Replica identificación, contacto y datos fiscales N veces. Sin master común, impide consolidar historial por persona u organización y genera riesgos reales de habeas data e inconsistencia.

### C. Party + PartyRole + UserAccount + perfiles especializados (elegida)

Separa correctamente identidad, autenticación y rol de negocio. Permite multi-rol simultáneo sin duplicación. Es el patrón estándar de ERP y CRM consolidados.

## Consecuencias

### Positivas

- Una misma persona u organización puede ser cliente + proveedor + empleado a la vez sin duplicación.
- Purchasing y RRHH nacen con master correcto, sin deuda técnica desde día uno.
- Habeas data, auditoría y consolidación por tercero se simplifican.
- Permite dashboards transversales por tercero (cuánto compramos a X, cuánto nos paga X).

### Costos y tradeoffs

- Migración aditiva multi-fase con ventanas controladas.
- Subscriber deja de ser dueño de identidad y pasa a ser perfil especializado.
- `User` evoluciona semánticamente a `UserAccount` con vínculo opcional a `Party`.
- Más módulos en el modulith; más superficie de tests y documentación.

### Riesgos aceptados

- Coexistencia temporal de modelos durante la migración de MOD05.
- La primera versión de Parties no implementa deduplicación automática avanzada (merge sugerido manual).
- No se implementa sincronización con entidades externas (RUES, DIAN) en v1.

## Consecuencias documentales

- Nuevo HLD `HLD-MOD08-PARTIES-v1.0.md`.
- Addendum al HLD de CRM que confirma que `Subscriber` evoluciona a perfil especializado.
- PRD addendum con RF-PAR-xx para formalizar el maestro de terceros.
- Spec `docs/superpowers/specs/2026-04-21-parties-multi-rol-design.md`.
- Actualización al ADR-025 no se requiere: el modelo de dos dimensiones de `Subscriber` se conserva dentro del perfil especializado.

## Referencias

- AGENTS.md
- docs/prds/PRD_Sistema_ISP_Colombia_v2_3.md
- docs/adrs/ADR-024-Migracion-CRM-Expediente-Unico.md
- docs/adrs/ADR-025-Subscriber-Modelo-Dos-Dimensiones.md
- docs/adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md
- docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md
