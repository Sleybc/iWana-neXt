---
title: "HLD — Módulo Taxation: Catálogo unificado de impuestos"
version: "1.0"
owner: "Arquitectura de Soluciones"
date: "2026-04-21"
status: "Aprobado"
approvedAt: "2026-04-21"
approvedBy: "CTO Humano"
classification: "Confidencial — Uso Interno"
module: "MOD07"
codeName: "TaxationModule"
author: "AI-EM-ARCH (Modo Architect)"
references:
  - docs/adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md
  - docs/adrs/ADR-031-Rediseno-Tributario-Comercial-Impuestos-Reglas-Simulador.md
  - docs/hlds/HLD-MOD06-ARQUITECTURA-v1.0.md
  - docs/prds/PRD_Sistema_ISP_Colombia_v2_3.md
  - docs/specs/2026-04-21-taxation-bounded-context-design.md
---

# HLD: Módulo Taxation — Arquitectura v1.0 (MOD07)

## 1. Contexto de negocio

Taxation centraliza el **catálogo maestro de impuestos del tenant** en Colombia. Su objetivo es que cualquier bounded context que aplique o consulte impuestos (Commercial, Purchasing, Payroll, Billing) lea de una única fuente de verdad sin duplicar entidades ni lógica.

Responsabilidad explícita:

- Qué impuestos existen en el tenant (sistema y custom).
- Presets fiscales estándar de Colombia.
- Contexto de uso declarado: ventas, compras o ambos.

Responsabilidad fuera de alcance:

- Aplicación de impuestos a clientes o proveedores (propiedad de Commercial y Purchasing).
- Perfil fiscal de un tercero (propiedad del módulo dueño del rol).
- Cálculo financiero final de facturas (propiedad de Billing).
- Integración DIAN, RUT, RUES (fuera de v1).

## 2. Bounded contexts afectados

| Contexto | Rol | Impacto |
|---|---|---|
| TaxationModule (nuevo) | Owner | Catálogo, presets, versión fiscal |
| CommercialModule | Downstream | Consume via `ITaxCatalogReadPort` para reglas de aplicación de ventas |
| PurchasingModule (futuro) | Downstream | Consume via `ITaxCatalogReadPort` para reglas de compras |
| BillingModule (futuro) | Downstream | Consume definiciones para cálculo |
| AuthModule | Upstream | JWT + guards |
| AuditModule | Transversal | Interceptor global CUD |

### Boundary estricto

- Taxation no accede a tablas de otros módulos.
- Ningún otro módulo accede a la tabla `tax_definitions`; solo vía puerto.
- Los presets del sistema no son editables por tenant; solo duplicables.

## 3. Estructura del módulo

```
apps/api/src/modules/taxation/
├── taxation.module.ts
├── taxation.controller.ts              # CRUD tenant-scoped
├── entities/
│   └── tax-definition.entity.ts
├── dto/
│   ├── create-tax-definition.dto.ts    # Zod
│   ├── update-tax-definition.dto.ts    # Zod
│   └── list-tax-definition-query.dto.ts
├── services/
│   ├── tax-definition.service.ts
│   └── tax-presets.seeder.ts           # Siembra presets Colombia en provisioning
├── ports/
│   └── tax-catalog-read.port.ts        # ITaxCatalogReadPort (consumo externo)
├── adapters/
│   └── tax-catalog-read.adapter.ts
└── tests/
    ├── tax-definition.service.spec.ts
    └── tax.controller.http.spec.ts
```

## 4. Modelo de datos

### Tabla `tax_definitions` (schema del tenant)

| Columna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| code | varchar(32) | Único por tenant. Ej: `IVA_19`, `RETE_FUENTE_SERVICIOS`, `ICA_BOGOTA` |
| name | varchar(120) | Nombre legible |
| category | enum | `VAT` \| `WITHHOLDING` \| `MUNICIPAL` \| `STAMP` \| `OTHER` |
| jurisdictionLevel | enum | `NATIONAL` \| `DEPARTMENT` \| `MUNICIPAL` |
| municipalityCode | varchar(8) nullable | DANE cuando aplica |
| baseRate | decimal(7,4) nullable | Tasa base referencial. Null si siempre exento/excluido o si la tasa la define la regla |
| treatment | enum | `STANDARD` \| `EXEMPT` \| `EXCLUDED` \| `FIXED` |
| context | enum | `SALES` \| `PURCHASE` \| `BOTH` |
| origin | enum | `SYSTEM` \| `CUSTOM` |
| isActive | boolean | |
| notes | text nullable | |
| createdAt / updatedAt / deletedAt | timestamptz | |

Índices: `(tenant_schema, code)` único, `(context, isActive)`, `(category)`.

### Presets del sistema sembrados en provisioning

Preset `IVA_19`, `IVA_EXENTO`, `IVA_EXCLUIDO`, `RETE_FUENTE_SERVICIOS`, `RETE_ICA`, `ESTAMPILLA_DEPARTAMENTAL`. Se marcan con `origin = SYSTEM` y no son editables por tenant; sí son duplicables como `CUSTOM`.

## 5. Contratos expuestos

### `ITaxCatalogReadPort`

```ts
interface ITaxCatalogReadPort {
  getById(id: string): Promise<TaxDefinitionSnapshot | null>;
  listByContext(context: 'SALES' | 'PURCHASE' | 'BOTH'): Promise<TaxDefinitionSnapshot[]>;
  resolveSystemPreset(code: string): Promise<TaxDefinitionSnapshot | null>;
}

type TaxDefinitionSnapshot = {
  id: string;
  code: string;
  name: string;
  category: TaxCategory;
  jurisdictionLevel: JurisdictionLevel;
  municipalityCode: string | null;
  baseRate: number | null;
  treatment: TaxTreatment;
  context: TaxContext;
  origin: TaxOrigin;
  isActive: boolean;
};
```

El snapshot es un DTO inmutable; no se exponen entidades TypeORM ni repositorios.

### REST (admin tenant)

- `GET /api/v1/taxation/definitions?context=SALES|PURCHASE|BOTH`
- `POST /api/v1/taxation/definitions`
- `PATCH /api/v1/taxation/definitions/:id`
- `DELETE /api/v1/taxation/definitions/:id` (soft delete salvo presets SYSTEM)

Roles: `TENANT_ADMIN`, `TENANT_USER` con permiso tributario. No accesible a `IWANA_SUPPORT` más allá de lectura.

## 6. Multi-tenant

- Tabla `tax_definitions` vive en el schema del tenant.
- Resolución vía `search_path` estándar del modulith (`SET LOCAL` por transacción, compatible con pgBouncer).
- Seeder de presets se invoca durante provisioning vía BullMQ (consistente con ADR-017).

## 7. Migración desde Commercial

Fase 1: crear `tax_definitions` vacío. Fase 2: backfill:

- Por cada `tax_rule` existente con `taxType` + `ratePercentage`, asegurar un `TaxDefinition` correspondiente (sistema o custom).
- Por cada `tax_classification` con flags (`appliesIva`, `appliesRetefuente`, etc.) se crean los `TaxDefinition` base requeridos.
- Commercial cambia sus reglas para referenciar `tax_definition_id` en lugar de `taxType` string.

Fase 3: se deprecan las columnas `taxType` y `ratePercentage` en `tax_rule` en una migración reversible posterior.

## 8. Seguridad y auditoría

- Operaciones CUD registradas por `AuditInterceptor`.
- Presets SYSTEM no editables ni eliminables; intento bloqueado en servicio con test.
- Zod en todos los DTOs.
- Sin PII en esta entidad.

## 9. Testing

- Unit: `tax-definition.service.spec.ts` cubre validación Zod, reglas SYSTEM/CUSTOM, constraints de unicidad.
- HTTP: `tax.controller.http.spec.ts` cubre roles, tenant isolation, bloqueo de edición de SYSTEM.
- Integración: provisioning de tenant siembra presets (`*.provisioning.spec.ts`).
- Meta: ≥80% en servicio y controller (AGENTS.md gates).

## 10. Riesgos y pendientes

- Integración DANE / DIAN queda fuera de v1.
- Versionado fiscal histórico (SCD tipo 2 sobre `baseRate`) se evalúa para v2.
- El nombre final del módulo (`Taxation` vs `Fiscal`) se confirma al aprobar ADR-029.

## 11. Referencias

- docs/adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md
- docs/adrs/ADR-031-Rediseno-Tributario-Comercial-Impuestos-Reglas-Simulador.md
- docs/hlds/HLD-MOD06-ARQUITECTURA-v1.0.md
- docs/prds/PRD_Sistema_ISP_Colombia_v2_3.md
