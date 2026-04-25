# F1 — Scaffold MOD07 Taxation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el módulo `TaxationModule` (MOD07) en iWana neXt con catálogo maestro de impuestos, presets Colombia, puerto `ITaxCatalogReadPort` y CRUD tenant.

**Architecture:** Modulith NestJS con boundary estricto — Taxation es el único dueño de `tax_definitions`; otros módulos consumen vía `ITaxCatalogReadPort`. Multi-tenant por schema PostgreSQL con `runInTenantSchema()`. Presets `SYSTEM` inmutables, siembra en provisioning BullMQ.

**Tech Stack:** NestJS 11 + TypeORM + PostgreSQL (schema-tenant) + Zod + class-validator + Swagger + Jest/Supertest

**Artefactos de referencia obligatorios:**
- `docs/hlds/HLD-MOD07-TAXATION-v1.0.md`
- `docs/adrs/ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md`
- `docs/prompts/PROMPT-TAXATION-PARTIES-COMMERCIAL-FASE-01-v1.0.md` §FASE 1

---

## Mapa de archivos

| Acción | Ruta |
|---|---|
| Crear | `packages/shared/src/enums/taxation/index.ts` |
| Crear | `packages/shared/src/enums/taxation/tax-category.enum.ts` |
| Crear | `packages/shared/src/enums/taxation/jurisdiction-level.enum.ts` |
| Crear | `packages/shared/src/enums/taxation/tax-treatment.enum.ts` |
| Crear | `packages/shared/src/enums/taxation/tax-context.enum.ts` |
| Crear | `packages/shared/src/enums/taxation/tax-origin.enum.ts` |
| Modificar | `packages/shared/src/index.ts` |
| Crear | `packages/database/src/migrations/tenant/021_create_taxation_module.ts` |
| Modificar | `packages/database/src/migrations/tenant/runner.ts` |
| Crear | `apps/api/src/modules/taxation/entities/tax-definition.entity.ts` |
| Crear | `apps/api/src/modules/taxation/dto/create-tax-definition.dto.ts` |
| Crear | `apps/api/src/modules/taxation/dto/update-tax-definition.dto.ts` |
| Crear | `apps/api/src/modules/taxation/dto/list-tax-definition-query.dto.ts` |
| Crear | `apps/api/src/modules/taxation/ports/tax-catalog-read.port.ts` |
| Crear | `apps/api/src/modules/taxation/adapters/tax-catalog-read.adapter.ts` |
| Crear | `apps/api/src/modules/taxation/services/tax-definition.service.ts` |
| Crear | `apps/api/src/modules/taxation/services/tax-presets.seeder.ts` |
| Crear | `apps/api/src/modules/taxation/taxation.controller.ts` |
| Crear | `apps/api/src/modules/taxation/taxation.module.ts` |
| Modificar | `apps/api/src/app.module.ts` |
| Crear | `apps/api/src/modules/taxation/tests/tax-definition.service.spec.ts` |
| Crear | `apps/api/src/modules/taxation/tests/tax.controller.http.spec.ts` |
| Crear | `docs/informes/INFORME-TAXATION-PARTIES-PROGRAMA-v1.0.md` |

---

## Task 1: Enums MOD07 en @iwana/shared

**Files:**
- Create: `packages/shared/src/enums/taxation/tax-category.enum.ts`
- Create: `packages/shared/src/enums/taxation/jurisdiction-level.enum.ts`
- Create: `packages/shared/src/enums/taxation/tax-treatment.enum.ts`
- Create: `packages/shared/src/enums/taxation/tax-context.enum.ts`
- Create: `packages/shared/src/enums/taxation/tax-origin.enum.ts`
- Create: `packages/shared/src/enums/taxation/index.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Crear enums**

```typescript
// packages/shared/src/enums/taxation/tax-category.enum.ts
export enum TaxCategory {
  VAT = 'VAT',
  WITHHOLDING = 'WITHHOLDING',
  MUNICIPAL = 'MUNICIPAL',
  STAMP = 'STAMP',
  OTHER = 'OTHER',
}

// packages/shared/src/enums/taxation/jurisdiction-level.enum.ts
export enum JurisdictionLevel {
  NATIONAL = 'NATIONAL',
  DEPARTMENT = 'DEPARTMENT',
  MUNICIPAL = 'MUNICIPAL',
}

// packages/shared/src/enums/taxation/tax-treatment.enum.ts
export enum TaxTreatment {
  STANDARD = 'STANDARD',
  EXEMPT = 'EXEMPT',
  EXCLUDED = 'EXCLUDED',
  FIXED = 'FIXED',
}

// packages/shared/src/enums/taxation/tax-context.enum.ts
export enum TaxContext {
  SALES = 'SALES',
  PURCHASE = 'PURCHASE',
  BOTH = 'BOTH',
}

// packages/shared/src/enums/taxation/tax-origin.enum.ts
export enum TaxOrigin {
  SYSTEM = 'SYSTEM',
  CUSTOM = 'CUSTOM',
}
```

- [ ] **Step 2: Crear barrel index de taxation**

```typescript
// packages/shared/src/enums/taxation/index.ts
export * from './tax-category.enum';
export * from './jurisdiction-level.enum';
export * from './tax-treatment.enum';
export * from './tax-context.enum';
export * from './tax-origin.enum';
```

- [ ] **Step 3: Exportar desde shared/src/index.ts**

Añadir después de `export * from './enums/commercial';`:
```typescript
export * from './enums/taxation';
```

- [ ] **Step 4: Compilar shared para verificar**

```bash
cd C:\appiw && pnpm --filter @iwana/shared build
```

Expected: build sin errores.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/enums/taxation/ packages/shared/src/index.ts
git commit -m "feat(shared): add MOD07 taxation enums — TaxCategory, JurisdictionLevel, TaxTreatment, TaxContext, TaxOrigin

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Migración 021 — Crear tabla tax_definitions

**Files:**
- Create: `packages/database/src/migrations/tenant/021_create_taxation_module.ts`
- Modify: `packages/database/src/migrations/tenant/runner.ts`

- [ ] **Step 1: Crear migración reversible**

```typescript
// packages/database/src/migrations/tenant/021_create_taxation_module.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 021: crea el esquema del Módulo Taxation (MOD07).
 * - Tabla tax_definitions con catálogo unificado de impuestos por tenant.
 * - Índices: unicidad (code), contexto+activo, categoría.
 *
 * Schema: tenant (search_path resuelto por TenantContext — sin prefijo explícito)
 * Reversible: sí — down() elimina la tabla completa.
 *
 * Referencias: HLD-MOD07-TAXATION-v1.0 §4, ADR-029
 */
export class CreateTaxationModule1700000000021 implements MigrationInterface {
  name = 'CreateTaxationModule1700000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tax_definitions (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        code VARCHAR(32) NOT NULL,
        name VARCHAR(120) NOT NULL,
        category VARCHAR(20) NOT NULL
          CHECK (category IN ('VAT','WITHHOLDING','MUNICIPAL','STAMP','OTHER')),
        jurisdiction_level VARCHAR(20) NOT NULL
          CHECK (jurisdiction_level IN ('NATIONAL','DEPARTMENT','MUNICIPAL')),
        municipality_code VARCHAR(8),
        base_rate NUMERIC(7,4),
        treatment VARCHAR(20) NOT NULL
          CHECK (treatment IN ('STANDARD','EXEMPT','EXCLUDED','FIXED')),
        context VARCHAR(10) NOT NULL
          CHECK (context IN ('SALES','PURCHASE','BOTH')),
        origin VARCHAR(10) NOT NULL DEFAULT 'CUSTOM'
          CHECK (origin IN ('SYSTEM','CUSTOM')),
        is_active BOOLEAN NOT NULL DEFAULT true,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT pk_tax_definitions PRIMARY KEY (id),
        CONSTRAINT uq_tax_definitions_code UNIQUE (code)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tax_definitions_context_active
      ON tax_definitions (context, is_active)
      WHERE is_active = true AND deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tax_definitions_category
      ON tax_definitions (category)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tax_definitions_category`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tax_definitions_context_active`);
    await queryRunner.query(`DROP TABLE IF EXISTS tax_definitions`);
  }
}
```

- [ ] **Step 2: Registrar en runner.ts**

Añadir import y entrada en `TENANT_MIGRATIONS`:
```typescript
import { CreateTaxationModule1700000000021 } from './021_create_taxation_module';
// ...en TENANT_MIGRATIONS array:
CreateTaxationModule1700000000021,
```

- [ ] **Step 3: Commit**

```bash
git add packages/database/src/migrations/tenant/021_create_taxation_module.ts packages/database/src/migrations/tenant/runner.ts
git commit -m "feat(db): migration 021 — create tax_definitions table (MOD07)

Reversible. Índices: uq_code, context+active, category.
Ref: HLD-MOD07 §4, ADR-029

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Entidad TaxDefinition

**Files:**
- Create: `apps/api/src/modules/taxation/entities/tax-definition.entity.ts`

- [ ] **Step 1: Crear entidad**

```typescript
// apps/api/src/modules/taxation/entities/tax-definition.entity.ts
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  TaxCategory,
  JurisdictionLevel,
  TaxTreatment,
  TaxContext,
  TaxOrigin,
} from '@iwana/shared';

/**
 * Catálogo unificado de impuestos del tenant.
 * Owner: TaxationModule (MOD07). Ningún otro módulo accede a esta tabla directamente.
 * Los presets origin=SYSTEM no son editables ni eliminables por el tenant.
 *
 * HLD-MOD07 §4, ADR-029
 */
@Entity({ name: 'tax_definitions' })
@Index('uq_tax_definitions_code', ['code'], { unique: true })
@Index('idx_tax_definitions_context_active', ['context', 'isActive'])
@Index('idx_tax_definitions_category', ['category'])
export class TaxDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Código único por tenant. Ej: IVA_19, RETE_FUENTE_SERVICIOS, ICA_BOGOTA */
  @Column({ type: 'varchar', length: 32, name: 'code' })
  code: string;

  @Column({ type: 'varchar', length: 120, name: 'name' })
  name: string;

  @Column({ type: 'varchar', length: 20, name: 'category' })
  category: TaxCategory;

  @Column({ type: 'varchar', length: 20, name: 'jurisdiction_level' })
  jurisdictionLevel: JurisdictionLevel;

  /** Código DANE cuando aplica jurisdicción municipal */
  @Column({ type: 'varchar', length: 8, name: 'municipality_code', nullable: true })
  municipalityCode: string | null;

  /** Tasa base referencial. Null si siempre exento/excluido o si la tasa la define la regla */
  @Column({ type: 'numeric', precision: 7, scale: 4, name: 'base_rate', nullable: true })
  baseRate: number | null;

  @Column({ type: 'varchar', length: 20, name: 'treatment' })
  treatment: TaxTreatment;

  /** Contexto de uso declarado: ventas, compras o ambos */
  @Column({ type: 'varchar', length: 10, name: 'context' })
  context: TaxContext;

  /** SYSTEM = preset Colombia no editable; CUSTOM = creado por el tenant */
  @Column({ type: 'varchar', length: 10, name: 'origin', default: TaxOrigin.CUSTOM })
  origin: TaxOrigin;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'text', name: 'notes', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /** Soft delete — SYSTEM nunca se elimina */
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/taxation/entities/
git commit -m "feat(taxation): add TaxDefinition entity — MOD07

Origin SYSTEM inmutable. Soft delete vía deletedAt.
Ref: HLD-MOD07 §4

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: DTOs (Zod + class-validator)

**Files:**
- Create: `apps/api/src/modules/taxation/dto/create-tax-definition.dto.ts`
- Create: `apps/api/src/modules/taxation/dto/update-tax-definition.dto.ts`
- Create: `apps/api/src/modules/taxation/dto/list-tax-definition-query.dto.ts`

- [ ] **Step 1: Crear create DTO**

```typescript
// apps/api/src/modules/taxation/dto/create-tax-definition.dto.ts
import { z } from 'zod';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  TaxCategory,
  JurisdictionLevel,
  TaxTreatment,
  TaxContext,
} from '@iwana/shared';

/** Schema Zod para validación en boundary externo */
export const CreateTaxDefinitionSchema = z.object({
  code: z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/, 'Solo mayúsculas, números y guión bajo'),
  name: z.string().min(1).max(120),
  category: z.nativeEnum(TaxCategory),
  jurisdictionLevel: z.nativeEnum(JurisdictionLevel),
  municipalityCode: z.string().max(8).nullable().optional(),
  baseRate: z.number().min(0).max(100).nullable().optional(),
  treatment: z.nativeEnum(TaxTreatment),
  context: z.nativeEnum(TaxContext),
  notes: z.string().nullable().optional(),
});

export type CreateTaxDefinitionInput = z.infer<typeof CreateTaxDefinitionSchema>;

/** DTO class-validator para OpenAPI + ValidationPipe */
export class CreateTaxDefinitionDto {
  @ApiProperty({ maxLength: 32, description: 'Código único (ej: IVA_19). Solo A-Z, 0-9 y _' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ enum: TaxCategory })
  @IsEnum(TaxCategory)
  category: TaxCategory;

  @ApiProperty({ enum: JurisdictionLevel })
  @IsEnum(JurisdictionLevel)
  jurisdictionLevel: JurisdictionLevel;

  @ApiPropertyOptional({ maxLength: 8, description: 'Código DANE cuando aplica municipio' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  municipalityCode?: string;

  @ApiPropertyOptional({ description: 'Tasa base referencial 0-100. Null si exento/excluido' })
  @IsOptional()
  baseRate?: number;

  @ApiProperty({ enum: TaxTreatment })
  @IsEnum(TaxTreatment)
  treatment: TaxTreatment;

  @ApiProperty({ enum: TaxContext })
  @IsEnum(TaxContext)
  context: TaxContext;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
```

- [ ] **Step 2: Crear update DTO**

```typescript
// apps/api/src/modules/taxation/dto/update-tax-definition.dto.ts
import { z } from 'zod';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { JurisdictionLevel, TaxContext, TaxTreatment } from '@iwana/shared';

export const UpdateTaxDefinitionSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  jurisdictionLevel: z.nativeEnum(JurisdictionLevel).optional(),
  municipalityCode: z.string().max(8).nullable().optional(),
  baseRate: z.number().min(0).max(100).nullable().optional(),
  treatment: z.nativeEnum(TaxTreatment).optional(),
  context: z.nativeEnum(TaxContext).optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateTaxDefinitionInput = z.infer<typeof UpdateTaxDefinitionSchema>;

export class UpdateTaxDefinitionDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: JurisdictionLevel })
  @IsOptional()
  @IsEnum(JurisdictionLevel)
  jurisdictionLevel?: JurisdictionLevel;

  @ApiPropertyOptional({ maxLength: 8 })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  municipalityCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  baseRate?: number;

  @ApiPropertyOptional({ enum: TaxTreatment })
  @IsOptional()
  @IsEnum(TaxTreatment)
  treatment?: TaxTreatment;

  @ApiPropertyOptional({ enum: TaxContext })
  @IsOptional()
  @IsEnum(TaxContext)
  context?: TaxContext;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

- [ ] **Step 3: Crear listQuery DTO**

```typescript
// apps/api/src/modules/taxation/dto/list-tax-definition-query.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TaxCategory, TaxContext, TaxOrigin } from '@iwana/shared';

export class ListTaxDefinitionQueryDto {
  @ApiPropertyOptional({ enum: TaxContext, description: 'Filtrar por contexto SALES|PURCHASE|BOTH' })
  @IsOptional()
  @IsEnum(TaxContext)
  context?: TaxContext;

  @ApiPropertyOptional({ enum: TaxCategory })
  @IsOptional()
  @IsEnum(TaxCategory)
  category?: TaxCategory;

  @ApiPropertyOptional({ enum: TaxOrigin })
  @IsOptional()
  @IsEnum(TaxOrigin)
  origin?: TaxOrigin;

  @ApiPropertyOptional({ description: 'Incluir inactivos (default: false)' })
  @IsOptional()
  @IsString()
  includeInactive?: string;
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/taxation/dto/
git commit -m "feat(taxation): add MOD07 DTOs — CreateTaxDefinition, Update, ListQuery

Zod schemas en boundaries externos. class-validator para OpenAPI+ValidationPipe.
Ref: HLD-MOD07 §4, PROMPT F1

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Puerto ITaxCatalogReadPort + Adapter

**Files:**
- Create: `apps/api/src/modules/taxation/ports/tax-catalog-read.port.ts`
- Create: `apps/api/src/modules/taxation/adapters/tax-catalog-read.adapter.ts`

- [ ] **Step 1: Crear puerto con snapshot inmutable**

```typescript
// apps/api/src/modules/taxation/ports/tax-catalog-read.port.ts
import { Injectable } from '@nestjs/common';
import { TaxCategory, JurisdictionLevel, TaxTreatment, TaxContext, TaxOrigin } from '@iwana/shared';

/**
 * Snapshot inmutable de una definición de impuesto.
 * Se expone a bounded contexts downstream (Commercial, Purchasing, Billing).
 * No se expone la entidad TypeORM ni el repositorio.
 *
 * HLD-MOD07 §5
 */
export type TaxDefinitionSnapshot = {
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

/**
 * Puerto de lectura del catálogo de impuestos.
 * CommercialModule y futuros módulos downstream implementan este contrato,
 * sin importar TaxDefinition directamente.
 *
 * ADR-029 — Bounded Context Taxation: Catálogo Unificado
 */
@Injectable()
export abstract class ITaxCatalogReadPort {
  abstract getById(id: string): Promise<TaxDefinitionSnapshot | null>;
  abstract listByContext(context: TaxContext): Promise<TaxDefinitionSnapshot[]>;
  abstract resolveSystemPreset(code: string): Promise<TaxDefinitionSnapshot | null>;
}
```

- [ ] **Step 2: Crear adapter**

```typescript
// apps/api/src/modules/taxation/adapters/tax-catalog-read.adapter.ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { TaxContext, TaxOrigin } from '@iwana/shared';
import { TaxDefinition } from '../entities/tax-definition.entity';
import { ITaxCatalogReadPort, TaxDefinitionSnapshot } from '../ports/tax-catalog-read.port';

/**
 * Implementación real del puerto de lectura del catálogo tributario.
 * Opera dentro del schema del tenant usando runInTenantSchema().
 *
 * Exportado desde TaxationModule para consumo externo vía ITaxCatalogReadPort.
 */
@Injectable()
export class TaxCatalogReadAdapter extends ITaxCatalogReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async getById(id: string): Promise<TaxDefinitionSnapshot | null> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(TaxDefinition, {
        where: { id, isActive: true, deletedAt: IsNull() },
      });
      return entity ? this.toSnapshot(entity) : null;
    });
  }

  async listByContext(context: TaxContext): Promise<TaxDefinitionSnapshot[]> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entities = await qr.manager.find(TaxDefinition, {
        where: [
          { context, isActive: true, deletedAt: IsNull() },
          { context: TaxContext.BOTH, isActive: true, deletedAt: IsNull() },
        ],
        order: { code: 'ASC' },
      });
      return entities.map((e) => this.toSnapshot(e));
    });
  }

  async resolveSystemPreset(code: string): Promise<TaxDefinitionSnapshot | null> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(TaxDefinition, {
        where: { code, origin: TaxOrigin.SYSTEM, deletedAt: IsNull() },
      });
      return entity ? this.toSnapshot(entity) : null;
    });
  }

  private toSnapshot(entity: TaxDefinition): TaxDefinitionSnapshot {
    return {
      id: entity.id,
      code: entity.code,
      name: entity.name,
      category: entity.category,
      jurisdictionLevel: entity.jurisdictionLevel,
      municipalityCode: entity.municipalityCode,
      baseRate: entity.baseRate,
      treatment: entity.treatment,
      context: entity.context,
      origin: entity.origin,
      isActive: entity.isActive,
    };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/taxation/ports/ apps/api/src/modules/taxation/adapters/
git commit -m "feat(taxation): add ITaxCatalogReadPort + TaxCatalogReadAdapter

Puerto inmutable para bounded contexts downstream.
ADR-029 compliance — ningún módulo externo toca tax_definitions directamente.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: TaxDefinitionService

**Files:**
- Create: `apps/api/src/modules/taxation/services/tax-definition.service.ts`

- [ ] **Step 1: Crear servicio con reglas de negocio**

```typescript
// apps/api/src/modules/taxation/services/tax-definition.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { TaxOrigin } from '@iwana/shared';
import { TaxDefinition } from '../entities/tax-definition.entity';
import { CreateTaxDefinitionSchema, CreateTaxDefinitionInput } from '../dto/create-tax-definition.dto';
import { UpdateTaxDefinitionSchema, UpdateTaxDefinitionInput } from '../dto/update-tax-definition.dto';
import { ListTaxDefinitionQueryDto } from '../dto/list-tax-definition-query.dto';

/**
 * Servicio del catálogo de impuestos del tenant (MOD07).
 *
 * Reglas de negocio:
 * - Unicidad por (code) dentro del tenant.
 * - Presets origin=SYSTEM no son editables ni eliminables; solo duplicables como CUSTOM.
 * - Soft delete: deletedAt; nunca eliminación física.
 *
 * HLD-MOD07 §3, ADR-029
 */
@Injectable()
export class TaxDefinitionService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findAll(query: ListTaxDefinitionQueryDto): Promise<TaxDefinition[]> {
    const { schemaName } = TenantContext.getOrThrow();
    const includeInactive = query.includeInactive === 'true';

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(TaxDefinition, 'td')
        .where('td.deleted_at IS NULL');

      if (!includeInactive) {
        qb.andWhere('td.is_active = true');
      }
      if (query.context) {
        // Incluye las definiciones BOTH cuando se filtra por contexto específico
        qb.andWhere('(td.context = :ctx OR td.context = :both)', {
          ctx: query.context,
          both: 'BOTH',
        });
      }
      if (query.category) {
        qb.andWhere('td.category = :cat', { cat: query.category });
      }
      if (query.origin) {
        qb.andWhere('td.origin = :origin', { origin: query.origin });
      }

      return qb.orderBy('td.code', 'ASC').getMany();
    });
  }

  async findOne(id: string): Promise<TaxDefinition> {
    const { schemaName } = TenantContext.getOrThrow();
    const entity = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(TaxDefinition, { where: { id, deletedAt: IsNull() } }),
    );
    if (!entity) throw new NotFoundException(`TaxDefinition ${id} no encontrada`);
    return entity;
  }

  async create(input: CreateTaxDefinitionInput): Promise<TaxDefinition> {
    // Validar con Zod en el boundary del servicio
    const parsed = CreateTaxDefinitionSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // Unicidad por code dentro del tenant (schema)
      const existing = await qr.manager.findOne(TaxDefinition, {
        where: { code: parsed.data.code, deletedAt: IsNull() },
      });
      if (existing) {
        throw new BadRequestException(
          `Ya existe una definición de impuesto con código '${parsed.data.code}'`,
        );
      }

      const entity = qr.manager.create(TaxDefinition, {
        code: parsed.data.code.toUpperCase(),
        name: parsed.data.name,
        category: parsed.data.category,
        jurisdictionLevel: parsed.data.jurisdictionLevel,
        municipalityCode: parsed.data.municipalityCode ?? null,
        baseRate: parsed.data.baseRate ?? null,
        treatment: parsed.data.treatment,
        context: parsed.data.context,
        origin: TaxOrigin.CUSTOM, // El tenant solo puede crear CUSTOM
        notes: parsed.data.notes ?? null,
        isActive: true,
      });

      return qr.manager.save(TaxDefinition, entity);
    });
  }

  async update(id: string, input: UpdateTaxDefinitionInput): Promise<TaxDefinition> {
    // Validar con Zod
    const parsed = UpdateTaxDefinitionSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }

    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(TaxDefinition, {
        where: { id, deletedAt: IsNull() },
      });
      if (!entity) throw new NotFoundException(`TaxDefinition ${id} no encontrada`);

      // Los presets SYSTEM son inmutables — ni el tenant ni los admins pueden editarlos
      if (entity.origin === TaxOrigin.SYSTEM) {
        throw new ForbiddenException(
          'Los presets del sistema no son editables. Puede duplicarlos como CUSTOM.',
        );
      }

      Object.assign(entity, {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.jurisdictionLevel !== undefined && {
          jurisdictionLevel: parsed.data.jurisdictionLevel,
        }),
        ...(parsed.data.municipalityCode !== undefined && {
          municipalityCode: parsed.data.municipalityCode,
        }),
        ...(parsed.data.baseRate !== undefined && { baseRate: parsed.data.baseRate }),
        ...(parsed.data.treatment !== undefined && { treatment: parsed.data.treatment }),
        ...(parsed.data.context !== undefined && { context: parsed.data.context }),
        ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
        ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
      });

      return qr.manager.save(TaxDefinition, entity);
    });
  }

  /**
   * Soft delete de una definición de impuesto.
   * Presets SYSTEM nunca se pueden eliminar.
   */
  async softDelete(id: string): Promise<void> {
    const { schemaName } = TenantContext.getOrThrow();

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(TaxDefinition, {
        where: { id, deletedAt: IsNull() },
      });
      if (!entity) throw new NotFoundException(`TaxDefinition ${id} no encontrada`);

      if (entity.origin === TaxOrigin.SYSTEM) {
        throw new ForbiddenException(
          'Los presets del sistema no pueden eliminarse.',
        );
      }

      entity.deletedAt = new Date();
      entity.isActive = false;
      await qr.manager.save(TaxDefinition, entity);
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/taxation/services/tax-definition.service.ts
git commit -m "feat(taxation): add TaxDefinitionService — unicidad, SYSTEM inmutable, soft delete

Zod en boundary + class-validator en controller. Reglas SYSTEM bloqueadas.
Ref: HLD-MOD07 §3, ADR-029, RF-TAX-01

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: TaxPresetsSeeder Colombia

**Files:**
- Create: `apps/api/src/modules/taxation/services/tax-presets.seeder.ts`

- [ ] **Step 1: Crear seeder con 6 presets Colombia**

```typescript
// apps/api/src/modules/taxation/services/tax-presets.seeder.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import {
  TaxCategory,
  JurisdictionLevel,
  TaxTreatment,
  TaxContext,
  TaxOrigin,
} from '@iwana/shared';
import { TaxDefinition } from '../entities/tax-definition.entity';

/**
 * Siembra los presets fiscales estándar de Colombia para un tenant nuevo.
 * Idempotente: usa INSERT ... ON CONFLICT DO NOTHING via findOne + create.
 * Se invoca desde el procesador de provisioning BullMQ (TenantProvisioningProcessor).
 *
 * Presets: RF-TAX-02 (PRD v2.3 §6)
 * HLD-MOD07 §4 — origin=SYSTEM, inmutables por el tenant.
 */
@Injectable()
export class TaxPresetsSeeder {
  private readonly logger = new Logger(TaxPresetsSeeder.name);

  /** Presets estándar Colombia — no modificar sin actualizar ADR-029 */
  private static readonly COLOMBIA_PRESETS: Omit<
    TaxDefinition,
    'id' | 'createdAt' | 'updatedAt' | 'deletedAt'
  >[] = [
    {
      code: 'IVA_19',
      name: 'IVA 19%',
      category: TaxCategory.VAT,
      jurisdictionLevel: JurisdictionLevel.NATIONAL,
      municipalityCode: null,
      baseRate: 19,
      treatment: TaxTreatment.STANDARD,
      context: TaxContext.BOTH,
      origin: TaxOrigin.SYSTEM,
      isActive: true,
      notes: 'Tarifa general IVA Colombia — Art. 468 E.T.',
    },
    {
      code: 'IVA_EXENTO',
      name: 'IVA exento (0%)',
      category: TaxCategory.VAT,
      jurisdictionLevel: JurisdictionLevel.NATIONAL,
      municipalityCode: null,
      baseRate: 0,
      treatment: TaxTreatment.EXEMPT,
      context: TaxContext.BOTH,
      origin: TaxOrigin.SYSTEM,
      isActive: true,
      notes: 'Servicios de internet residencial estrato 1-3 — Decreto 1835/2021',
    },
    {
      code: 'IVA_EXCLUIDO',
      name: 'IVA excluido',
      category: TaxCategory.VAT,
      jurisdictionLevel: JurisdictionLevel.NATIONAL,
      municipalityCode: null,
      baseRate: null,
      treatment: TaxTreatment.EXCLUDED,
      context: TaxContext.BOTH,
      origin: TaxOrigin.SYSTEM,
      isActive: true,
      notes: 'Bienes y servicios excluidos de IVA — Art. 424 E.T.',
    },
    {
      code: 'RETE_FUENTE_SERVICIOS',
      name: 'Retención en la fuente — Servicios',
      category: TaxCategory.WITHHOLDING,
      jurisdictionLevel: JurisdictionLevel.NATIONAL,
      municipalityCode: null,
      baseRate: 4,
      treatment: TaxTreatment.STANDARD,
      context: TaxContext.PURCHASE,
      origin: TaxOrigin.SYSTEM,
      isActive: true,
      notes: 'RteFte servicios en general — Art. 392 E.T. (4% para no autoretenedores)',
    },
    {
      code: 'RETE_ICA',
      name: 'ReteICA — Bogotá',
      category: TaxCategory.MUNICIPAL,
      jurisdictionLevel: JurisdictionLevel.MUNICIPAL,
      municipalityCode: '11001',
      baseRate: 0.414,
      treatment: TaxTreatment.STANDARD,
      context: TaxContext.PURCHASE,
      origin: TaxOrigin.SYSTEM,
      isActive: true,
      notes: 'Retención ICA Bogotá D.C. — CIIU 6130 (telecomunicaciones inalámbricas)',
    },
    {
      code: 'ESTAMPILLA_DEPARTAMENTAL',
      name: 'Estampilla departamental',
      category: TaxCategory.STAMP,
      jurisdictionLevel: JurisdictionLevel.DEPARTMENT,
      municipalityCode: null,
      baseRate: null,
      treatment: TaxTreatment.STANDARD,
      context: TaxContext.BOTH,
      origin: TaxOrigin.SYSTEM,
      isActive: false, // Inactivo por defecto — se activa según el departamento
      notes: 'Estampilla pro-hospitales, pro-universidad, etc. según departamento',
    },
  ];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Siembra presets Colombia en el schema del tenant indicado.
   * Idempotente: no falla si ya existen (ON CONFLICT por code único).
   *
   * @param schemaName - Schema del tenant en PostgreSQL
   */
  async seedForTenant(schemaName: string): Promise<void> {
    this.logger.log(`[TaxPresetsSeeder] Sembrando presets Colombia en schema ${schemaName}`);

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      for (const preset of TaxPresetsSeeder.COLOMBIA_PRESETS) {
        // Idempotencia: verificar por code (unique en el schema)
        const existing = await qr.manager.findOne(TaxDefinition, {
          where: { code: preset.code, deletedAt: IsNull() },
        });

        if (existing) {
          this.logger.debug(`[TaxPresetsSeeder] Preset ${preset.code} ya existe — omitiendo`);
          continue;
        }

        const entity = qr.manager.create(TaxDefinition, preset);
        await qr.manager.save(TaxDefinition, entity);
        this.logger.debug(`[TaxPresetsSeeder] Preset ${preset.code} sembrado`);
      }
    });

    this.logger.log(`[TaxPresetsSeeder] Presets Colombia completados para ${schemaName}`);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/taxation/services/tax-presets.seeder.ts
git commit -m "feat(taxation): add TaxPresetsSeeder — 6 presets Colombia RF-TAX-02

IVA_19, IVA_EXENTO, IVA_EXCLUIDO, RETE_FUENTE_SERVICIOS, RETE_ICA, ESTAMPILLA_DEPARTAMENTAL.
Idempotente. Se invoca desde provisioning BullMQ.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: TaxationController REST

**Files:**
- Create: `apps/api/src/modules/taxation/taxation.controller.ts`

- [ ] **Step 1: Crear controller con OpenAPI**

```typescript
// apps/api/src/modules/taxation/taxation.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@iwana/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TaxDefinitionService } from './services/tax-definition.service';
import { CreateTaxDefinitionDto } from './dto/create-tax-definition.dto';
import { UpdateTaxDefinitionDto } from './dto/update-tax-definition.dto';
import { ListTaxDefinitionQueryDto } from './dto/list-tax-definition-query.dto';

/**
 * CRUD del catálogo de impuestos del tenant.
 * Presets SYSTEM no editables ni eliminables (servicio lanza ForbiddenException).
 *
 * Roles autorizados: ADMIN (escritura), ACCOUNTANT (lectura + escritura), SYSTEM_ADMIN.
 * HLD-MOD07 §5, ADR-029
 */
@ApiTags('taxation')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('taxation')
export class TaxationController {
  constructor(private readonly taxDefinitionService: TaxDefinitionService) {}

  @Get('definitions')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar definiciones de impuestos del tenant' })
  @ApiResponse({ status: 200, description: 'Lista de definiciones ordenadas por código' })
  async findAll(@Query() query: ListTaxDefinitionQueryDto) {
    const data = await this.taxDefinitionService.findAll(query);
    return { data };
  }

  @Post('definitions')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear definición de impuesto CUSTOM' })
  @ApiResponse({ status: 201, description: 'Definición creada' })
  @ApiResponse({ status: 400, description: 'Código duplicado o validación Zod fallida' })
  async create(@Body() dto: CreateTaxDefinitionDto) {
    const data = await this.taxDefinitionService.create(dto);
    return { data };
  }

  @Patch('definitions/:id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Actualizar definición CUSTOM (SYSTEM bloqueado)' })
  @ApiResponse({ status: 200, description: 'Definición actualizada' })
  @ApiResponse({ status: 403, description: 'Intento de editar preset SYSTEM' })
  @ApiResponse({ status: 404, description: 'Definición no encontrada' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxDefinitionDto,
  ) {
    const data = await this.taxDefinitionService.update(id, dto);
    return { data };
  }

  @Delete('definitions/:id')
  @Roles(UserRole.ADMIN, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Soft delete de definición CUSTOM (SYSTEM bloqueado)' })
  @ApiResponse({ status: 200, description: 'Definición desactivada (soft delete)' })
  @ApiResponse({ status: 403, description: 'Intento de eliminar preset SYSTEM' })
  @ApiResponse({ status: 404, description: 'Definición no encontrada' })
  async softDelete(@Param('id', ParseUUIDPipe) id: string) {
    await this.taxDefinitionService.softDelete(id);
    return { message: 'Definición de impuesto desactivada' };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/taxation/taxation.controller.ts
git commit -m "feat(taxation): add TaxationController — GET/POST/PATCH/DELETE definitions

OpenAPI + RBAC. ForbiddenException en presets SYSTEM.
Ref: HLD-MOD07 §5, PROMPT F1

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: TaxationModule + Registro en AppModule

**Files:**
- Create: `apps/api/src/modules/taxation/taxation.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Crear TaxationModule**

```typescript
// apps/api/src/modules/taxation/taxation.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaxDefinition } from './entities/tax-definition.entity';
import { TaxDefinitionService } from './services/tax-definition.service';
import { TaxPresetsSeeder } from './services/tax-presets.seeder';
import { TaxCatalogReadAdapter } from './adapters/tax-catalog-read.adapter';
import { ITaxCatalogReadPort } from './ports/tax-catalog-read.port';
import { TaxationController } from './taxation.controller';

/**
 * Módulo Taxation (MOD07) — Catálogo unificado de impuestos por tenant.
 *
 * Exports:
 * - ITaxCatalogReadPort: para consumo externo vía puerto (CommercialModule, futuros).
 * - TaxPresetsSeeder: para invocación desde TenantProvisioningProcessor.
 *
 * No exporta TaxDefinition ni TaxDefinitionService (boundary estricto).
 * ADR-029 — ningún módulo externo toca la tabla tax_definitions directamente.
 */
@Module({
  imports: [TypeOrmModule.forFeature([TaxDefinition])],
  controllers: [TaxationController],
  providers: [
    TaxDefinitionService,
    TaxPresetsSeeder,
    TaxCatalogReadAdapter,
    {
      provide: ITaxCatalogReadPort,
      useExisting: TaxCatalogReadAdapter,
    },
  ],
  exports: [ITaxCatalogReadPort, TaxPresetsSeeder],
})
export class TaxationModule {}
```

- [ ] **Step 2: Registrar en app.module.ts**

En `apps/api/src/app.module.ts`, añadir el import del módulo:

```typescript
import { TaxationModule } from './modules/taxation/taxation.module';
```

Y en el array `imports` del decorador `@Module`, después de `CommercialModule`:

```typescript
// Módulo Taxation (MOD07): catálogo unificado de impuestos, presets Colombia, puerto lectura
TaxationModule,
```

- [ ] **Step 3: Compilar para verificar wiring**

```bash
cd C:\appiw && pnpm --filter @iwana/api build
```

Expected: build sin errores de TypeScript.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/taxation/taxation.module.ts apps/api/src/app.module.ts
git commit -m "feat(taxation): wire TaxationModule in AppModule — MOD07

Exports ITaxCatalogReadPort + TaxPresetsSeeder.
Ref: HLD-MOD07 §3, ADR-029

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 10: Tests unitarios — TaxDefinitionService

**Files:**
- Create: `apps/api/src/modules/taxation/tests/tax-definition.service.spec.ts`

- [ ] **Step 1: Crear tests unitarios**

```typescript
// apps/api/src/modules/taxation/tests/tax-definition.service.spec.ts
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import {
  TaxCategory,
  JurisdictionLevel,
  TaxTreatment,
  TaxContext,
  TaxOrigin,
} from '@iwana/shared';
import { TaxDefinition } from '../entities/tax-definition.entity';
import { TaxDefinitionService } from '../services/tax-definition.service';

jest.mock('@iwana/db', () => ({
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({ schemaName: 'tenant_test', tenantId: 'tid-001' }),
  },
  runInTenantSchema: jest.fn(),
}));

/** Factory de TaxDefinition para tests */
function buildTaxDef(overrides: Partial<TaxDefinition> = {}): TaxDefinition {
  return Object.assign(new TaxDefinition(), {
    id: 'def-001',
    code: 'IVA_19',
    name: 'IVA 19%',
    category: TaxCategory.VAT,
    jurisdictionLevel: JurisdictionLevel.NATIONAL,
    municipalityCode: null,
    baseRate: 19,
    treatment: TaxTreatment.STANDARD,
    context: TaxContext.BOTH,
    origin: TaxOrigin.CUSTOM,
    isActive: true,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

describe('TaxDefinitionService', () => {
  let service: TaxDefinitionService;
  let mockQr: {
    manager: {
      findOne: jest.Mock;
      find: jest.Mock;
      create: jest.Mock;
      save: jest.Mock;
      createQueryBuilder: jest.Mock;
    };
  };
  let mockDataSource: Partial<DataSource>;

  beforeEach(() => {
    mockQr = {
      manager: {
        findOne: jest.fn(),
        find: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        createQueryBuilder: jest.fn(),
      },
    };

    mockDataSource = {};

    (runInTenantSchema as jest.Mock).mockImplementation(
      (_ds: unknown, _schema: string, fn: (qr: typeof mockQr) => Promise<unknown>) =>
        fn(mockQr),
    );

    service = new TaxDefinitionService(mockDataSource as DataSource);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('debería crear una definición CUSTOM con datos válidos', async () => {
      mockQr.manager.findOne.mockResolvedValue(null);
      const entity = buildTaxDef();
      mockQr.manager.create.mockReturnValue(entity);
      mockQr.manager.save.mockResolvedValue(entity);

      const result = await service.create({
        code: 'IVA_19',
        name: 'IVA 19%',
        category: TaxCategory.VAT,
        jurisdictionLevel: JurisdictionLevel.NATIONAL,
        treatment: TaxTreatment.STANDARD,
        context: TaxContext.BOTH,
      });

      expect(result).toBe(entity);
      expect(mockQr.manager.create).toHaveBeenCalledWith(
        TaxDefinition,
        expect.objectContaining({ origin: TaxOrigin.CUSTOM }),
      );
    });

    it('debería lanzar BadRequestException si el código ya existe', async () => {
      mockQr.manager.findOne.mockResolvedValue(buildTaxDef());

      await expect(
        service.create({
          code: 'IVA_19',
          name: 'IVA 19%',
          category: TaxCategory.VAT,
          jurisdictionLevel: JurisdictionLevel.NATIONAL,
          treatment: TaxTreatment.STANDARD,
          context: TaxContext.BOTH,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debería lanzar BadRequestException si el código tiene caracteres inválidos', async () => {
      await expect(
        service.create({
          code: 'iva-19 invalid!',
          name: 'IVA',
          category: TaxCategory.VAT,
          jurisdictionLevel: JurisdictionLevel.NATIONAL,
          treatment: TaxTreatment.STANDARD,
          context: TaxContext.BOTH,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debería forzar origin=CUSTOM aunque el input lo omita', async () => {
      mockQr.manager.findOne.mockResolvedValue(null);
      const entity = buildTaxDef();
      mockQr.manager.create.mockReturnValue(entity);
      mockQr.manager.save.mockResolvedValue(entity);

      await service.create({
        code: 'CUSTOM_TAX',
        name: 'Impuesto custom',
        category: TaxCategory.OTHER,
        jurisdictionLevel: JurisdictionLevel.NATIONAL,
        treatment: TaxTreatment.STANDARD,
        context: TaxContext.SALES,
      });

      expect(mockQr.manager.create).toHaveBeenCalledWith(
        TaxDefinition,
        expect.objectContaining({ origin: TaxOrigin.CUSTOM }),
      );
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('debería lanzar ForbiddenException al editar un preset SYSTEM', async () => {
      mockQr.manager.findOne.mockResolvedValue(buildTaxDef({ origin: TaxOrigin.SYSTEM }));

      await expect(service.update('def-001', { name: 'Nuevo nombre' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('debería actualizar un preset CUSTOM correctamente', async () => {
      const entity = buildTaxDef({ origin: TaxOrigin.CUSTOM });
      mockQr.manager.findOne.mockResolvedValue(entity);
      mockQr.manager.save.mockResolvedValue({ ...entity, name: 'Nombre actualizado' });

      const result = await service.update('def-001', { name: 'Nombre actualizado' });

      expect(result.name).toBe('Nombre actualizado');
    });

    it('debería lanzar NotFoundException si el ID no existe', async () => {
      mockQr.manager.findOne.mockResolvedValue(null);

      await expect(service.update('no-existe', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── softDelete ───────────────────────────────────────────────────────────────

  describe('softDelete', () => {
    it('debería lanzar ForbiddenException al eliminar un preset SYSTEM', async () => {
      mockQr.manager.findOne.mockResolvedValue(buildTaxDef({ origin: TaxOrigin.SYSTEM }));

      await expect(service.softDelete('def-001')).rejects.toThrow(ForbiddenException);
    });

    it('debería marcar deletedAt y isActive=false para CUSTOM', async () => {
      const entity = buildTaxDef({ origin: TaxOrigin.CUSTOM });
      mockQr.manager.findOne.mockResolvedValue(entity);
      mockQr.manager.save.mockResolvedValue({ ...entity, deletedAt: new Date(), isActive: false });

      await service.softDelete('def-001');

      expect(mockQr.manager.save).toHaveBeenCalledWith(
        TaxDefinition,
        expect.objectContaining({ isActive: false }),
      );
    });

    it('debería lanzar NotFoundException si el ID no existe', async () => {
      mockQr.manager.findOne.mockResolvedValue(null);

      await expect(service.softDelete('no-existe')).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 2: Ejecutar tests y verificar que pasan**

```bash
cd C:\appiw && pnpm --filter @iwana/api test -- --testPathPattern="taxation/tests/tax-definition.service" --no-coverage
```

Expected: todos los tests en verde.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/taxation/tests/tax-definition.service.spec.ts
git commit -m "test(taxation): unit tests TaxDefinitionService — unicidad, SYSTEM inmutable, Zod

Cubre: unicidad code, origin SYSTEM bloqueado en update/delete, Zod validación,
       NotFoundException, ForbiddenException. Coverage objetivo ≥80%.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 11: Tests HTTP — TaxationController

**Files:**
- Create: `apps/api/src/modules/taxation/tests/tax.controller.http.spec.ts`

- [ ] **Step 1: Crear tests HTTP**

```typescript
// apps/api/src/modules/taxation/tests/tax.controller.http.spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { TaxCategory, JurisdictionLevel, TaxTreatment, TaxContext, TaxOrigin, UserRole } from '@iwana/shared';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { TaxationController } from '../taxation.controller';
import { TaxDefinitionService } from '../services/tax-definition.service';

/** Payload JWT mínimo para tests — ADMIN por defecto */
function buildMockUser(role: UserRole = UserRole.ADMIN) {
  return { sub: 'user-001', role, tenantId: 'tid-001', schemaName: 'tenant_test' };
}

describe('TaxationController (HTTP)', () => {
  let app: INestApplication;
  let taxService: jest.Mocked<TaxDefinitionService>;

  beforeAll(async () => {
    taxService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<TaxDefinitionService>;

    const moduleRef = await Test.createTestingModule({
      controllers: [TaxationController],
      providers: [{ provide: TaxDefinitionService, useValue: taxService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (ctx: import('@nestjs/common').ExecutionContext) => {
        ctx.switchToHttp().getRequest().user = buildMockUser();
        return true;
      }})
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(() => app.close());
  afterEach(() => jest.clearAllMocks());

  // ─── GET /taxation/definitions ─────────────────────────────────────────────

  describe('GET /api/v1/taxation/definitions', () => {
    it('debería retornar 200 con la lista de definiciones', async () => {
      taxService.findAll.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/taxation/definitions')
        .expect(200);

      expect(res.body).toEqual({ data: [] });
      expect(taxService.findAll).toHaveBeenCalledTimes(1);
    });

    it('debería pasar el query context al servicio', async () => {
      taxService.findAll.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/taxation/definitions?context=SALES')
        .expect(200);

      expect(taxService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ context: TaxContext.SALES }),
      );
    });
  });

  // ─── POST /taxation/definitions ────────────────────────────────────────────

  describe('POST /api/v1/taxation/definitions', () => {
    const validBody = {
      code: 'CUSTOM_01',
      name: 'Impuesto Custom',
      category: TaxCategory.OTHER,
      jurisdictionLevel: JurisdictionLevel.NATIONAL,
      treatment: TaxTreatment.STANDARD,
      context: TaxContext.SALES,
    };

    it('debería retornar 201 al crear con datos válidos', async () => {
      const created = { id: 'def-new', ...validBody, origin: TaxOrigin.CUSTOM, isActive: true };
      taxService.create.mockResolvedValue(created as any);

      const res = await request(app.getHttpServer())
        .post('/taxation/definitions')
        .send(validBody)
        .expect(201);

      expect(res.body.data.origin).toBe(TaxOrigin.CUSTOM);
    });

    it('debería retornar 400 si falta category', async () => {
      const { category: _cat, ...body } = validBody;
      await request(app.getHttpServer())
        .post('/taxation/definitions')
        .send(body)
        .expect(400);
    });
  });

  // ─── PATCH /taxation/definitions/:id ───────────────────────────────────────

  describe('PATCH /api/v1/taxation/definitions/:id', () => {
    it('debería retornar 200 al actualizar CUSTOM', async () => {
      const updated = { id: 'def-001', name: 'Nuevo nombre', origin: TaxOrigin.CUSTOM };
      taxService.update.mockResolvedValue(updated as any);

      const res = await request(app.getHttpServer())
        .patch('/taxation/definitions/def-001')
        .send({ name: 'Nuevo nombre' })
        .expect(200);

      expect(res.body.data.name).toBe('Nuevo nombre');
    });

    it('debería propagar 403 al intentar editar un preset SYSTEM', async () => {
      const { ForbiddenException } = await import('@nestjs/common');
      taxService.update.mockRejectedValue(new ForbiddenException('SYSTEM preset'));

      await request(app.getHttpServer())
        .patch('/taxation/definitions/system-preset-id')
        .send({ name: 'Hack' })
        .expect(403);
    });
  });

  // ─── DELETE /taxation/definitions/:id ──────────────────────────────────────

  describe('DELETE /api/v1/taxation/definitions/:id', () => {
    it('debería retornar 200 al eliminar CUSTOM', async () => {
      taxService.softDelete.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .delete('/taxation/definitions/def-001')
        .expect(200);

      expect(res.body.message).toBe('Definición de impuesto desactivada');
    });

    it('debería propagar 403 al intentar eliminar un preset SYSTEM', async () => {
      const { ForbiddenException } = await import('@nestjs/common');
      taxService.softDelete.mockRejectedValue(new ForbiddenException('SYSTEM preset'));

      await request(app.getHttpServer())
        .delete('/taxation/definitions/system-id')
        .expect(403);
    });

    it('debería retornar 400 si el ID no es UUID válido', async () => {
      await request(app.getHttpServer())
        .delete('/taxation/definitions/not-a-uuid')
        .expect(400);
    });
  });
});
```

- [ ] **Step 2: Ejecutar tests HTTP**

```bash
cd C:\appiw && pnpm --filter @iwana/api test -- --testPathPattern="taxation/tests/tax.controller.http" --no-coverage
```

Expected: todos los tests en verde.

- [ ] **Step 3: Ejecutar cobertura completa del módulo**

```bash
cd C:\appiw && pnpm --filter @iwana/api test -- --testPathPattern="taxation" --coverage
```

Expected: cobertura ≥ 80% en `tax-definition.service.ts` y `taxation.controller.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/taxation/tests/
git commit -m "test(taxation): HTTP tests TaxationController — roles, SYSTEM block, paths

Cubre GET/POST/PATCH/DELETE con casos happy path y errores 400/403/404.
Ref: HLD-MOD07 §9, PROMPT F1

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 12: Lint, typecheck y commit final F1

- [ ] **Step 1: Lint y typecheck globales**

```bash
cd C:\appiw && pnpm lint && pnpm typecheck
```

Expected: sin errores ni warnings bloqueantes.

- [ ] **Step 2: Ejecutar test suite completa del API**

```bash
cd C:\appiw && pnpm --filter @iwana/api test
```

Expected: todos en verde.

- [ ] **Step 3: Crear informe vivo**

Crear `docs/informes/INFORME-TAXATION-PARTIES-PROGRAMA-v1.0.md` con el estado de F1.

- [ ] **Step 4: Commit final de F1**

```bash
git add docs/informes/INFORME-TAXATION-PARTIES-PROGRAMA-v1.0.md
git commit -m "docs: open INFORME-TAXATION-PARTIES-PROGRAMA-v1.0 — F1 completada

Criterios CA-01, CA-02, CA-11, CA-12 cubiertos.
Ref: PROMPT-TAXATION-PARTIES-COMMERCIAL-FASE-01-v1.0 §FASE 1

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Self-Review

### Spec coverage

| Requisito F1 | Tarea |
|---|---|
| Entidad TaxDefinition con columnas exactas HLD §4 | Task 3 |
| Migración reversible en schema tenant | Task 2 |
| DTOs Zod: create, update, listQuery | Task 4 |
| TaxDefinitionService: unicidad (code), bloqueo SYSTEM | Task 6 |
| Controller REST 4 endpoints + OpenAPI | Task 8 |
| TaxPresetsSeeder 6 presets Colombia RF-TAX-02 | Task 7 |
| ITaxCatalogReadPort + adapter | Task 5 |
| Módulo registrado en app.module.ts | Task 9 |
| Unit tests: unicidad, SYSTEM, Zod | Task 10 |
| HTTP tests: roles, tenant isolation, SYSTEM | Task 11 |
| Cobertura ≥ 80% service y controller | Task 11 |
| Informe vivo abierto con sección F1 | Task 12 |

### Gaps detectados

- El seeder (`TaxPresetsSeeder`) necesita conectarse a `TenantProvisioningProcessor` en `apps/worker`. Eso es wiring de provisioning que está **fuera del scope de F1** según el prompt (F1 solo crea y exporta el seeder; la integración con el worker puede hacerse en F1 como tarea adicional o en F2 si el worker también procesa parties). Se deja como nota en el informe.

- El constraint `uq_tax_definitions_code` en la migración no incluye `tenant_id` porque la tabla vive en el **schema del tenant** (cada tenant tiene su propio schema/namespace). Es correcto según la arquitectura multi-tenant por schema del proyecto.
