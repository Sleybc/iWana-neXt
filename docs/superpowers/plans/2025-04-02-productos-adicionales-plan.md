# Productos Adicionales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar gestión de productos adicionales (TvBox, Cámaras, etc.) al CRM, permitiendo que los expedientes registren interés en múltiples productos además del plan principal.

**Architecture:** Nueva entidad `AdditionalProduct` con CRUD en módulo Tenant (siguiendo patrón de PlanCatalogItem). Columna JSONB en `expediente_records` para almacenar IDs seleccionados. UI en Settings → Comercial → Productos adicionales.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, React, Tailwind, Zod

---

## Files Changed

### Backend (API)

| File                                                                | Action | Description                          |
| ------------------------------------------------------------------- | ------ | ------------------------------------ |
| `packages/shared/src/enums/crm/additional-product-category.enum.ts` | Create | Enum de categorías                   |
| `packages/shared/src/enums/crm/index.ts`                            | Modify | Exportar nuevo enum                  |
| `apps/api/src/modules/tenant/entities/additional-product.entity.ts` | Create | Entity TypeORM                       |
| `apps/api/src/modules/tenant/dto/tenant-additional-products.dto.ts` | Create | DTOs CRUD                            |
| `apps/api/src/modules/tenant/tenant.module.ts`                      | Modify | Registrar entity                     |
| `apps/api/src/modules/tenant/tenant.service.ts`                     | Modify | Métodos CRUD                         |
| `apps/api/src/modules/tenant/tenant.controller.ts`                  | Modify | Endpoints REST                       |
| `packages/database/src/migrations/`                                 | Create | Migración tabla + columna expediente |

### Frontend (Portal)

| File                                                                | Action | Description           |
| ------------------------------------------------------------------- | ------ | --------------------- |
| `apps/portal/src/lib/api-client.ts`                                 | Modify | Tipos y funciones API |
| `apps/portal/src/components/settings/AdditionalProductsManager.tsx` | Create | UI CRUD productos     |
| `apps/portal/src/components/settings/CommercialTabLayout.tsx`       | Modify | Agregar tab productos |
| `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`       | Modify | Checkboxes productos  |

---

## Task 1: Enum AdditionalProductCategory

**Files:**

- Create: `packages/shared/src/enums/crm/additional-product-category.enum.ts`
- Modify: `packages/shared/src/enums/crm/index.ts`

- [ ] **Step 1: Create enum file**

```typescript
// packages/shared/src/enums/crm/additional-product-category.enum.ts
export enum AdditionalProductCategory {
  ENTERTAINMENT = 'ENTERTAINMENT',
  SECURITY = 'SECURITY',
  CONNECTIVITY = 'CONNECTIVITY',
  BUSINESS = 'BUSINESS',
}

export const ADDITIONAL_PRODUCT_CATEGORY_LABELS: Record<AdditionalProductCategory, string> = {
  [AdditionalProductCategory.ENTERTAINMENT]: 'Entretenimiento',
  [AdditionalProductCategory.SECURITY]: 'Seguridad',
  [AdditionalProductCategory.CONNECTIVITY]: 'Conectividad',
  [AdditionalProductCategory.BUSINESS]: 'Negocios',
};
```

- [ ] **Step 2: Export from index**

```typescript
// packages/shared/src/enums/crm/index.ts
// Add to existing exports:
export * from './additional-product-category.enum';
```

- [ ] **Step 3: Run build to verify**

Run: `cd C:\appiw && pnpm --filter @iwana/shared build`
Expected: Build successful

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/enums/crm/additional-product-category.enum.ts packages/shared/src/enums/crm/index.ts
git commit -m "feat(shared): add AdditionalProductCategory enum"
```

---

## Task 2: Entity AdditionalProduct

**Files:**

- Create: `apps/api/src/modules/tenant/entities/additional-product.entity.ts`
- Modify: `apps/api/src/modules/tenant/tenant.module.ts`

- [ ] **Step 1: Create entity file**

```typescript
// apps/api/src/modules/tenant/entities/additional-product.entity.ts
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AdditionalProductCategory } from '@iwana/shared';

@Entity({ name: 'additional_products' })
@Index('idx_additional_products_tenant_active', ['tenantId', 'isActive'])
export class AdditionalProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({
    type: 'enum',
    enum: Object.values(AdditionalProductCategory),
    default: AdditionalProductCategory.CONNECTIVITY,
  })
  category: AdditionalProductCategory;

  @Column({ type: 'integer', name: 'sort_order', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
```

- [ ] **Step 2: Register entity in module**

```typescript
// apps/api/src/modules/tenant/tenant.module.ts
// Add import:
import { AdditionalProduct } from './entities/additional-product.entity';

// Modify TypeOrmModule.forFeature array:
TypeOrmModule.forFeature([Tenant, CommercialNode, CoverageZone, PlanCatalogItem, AdditionalProduct]),
```

- [ ] **Step 3: Run build to verify**

Run: `cd C:\appiw && pnpm --filter @iwana/api build`
Expected: Build successful

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/tenant/entities/additional-product.entity.ts apps/api/src/modules/tenant/tenant.module.ts
git commit -m "feat(api): add AdditionalProduct entity"
```

---

## Task 3: DTOs for Additional Products

**Files:**

- Create: `apps/api/src/modules/tenant/dto/tenant-additional-products.dto.ts`

- [ ] **Step 1: Create DTOs file**

```typescript
// apps/api/src/modules/tenant/dto/tenant-additional-products.dto.ts
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AdditionalProductCategory } from '@iwana/shared';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateAdditionalProductDto {
  @IsString()
  @Transform(trimString)
  @MaxLength(100)
  name: string;

  @IsEnum(AdditionalProductCategory)
  category: AdditionalProductCategory;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(999)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAdditionalProductDto {
  @IsOptional()
  @IsString()
  @Transform(trimString)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(AdditionalProductCategory)
  category?: AdditionalProductCategory;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(999)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AdditionalProductResponseDto {
  @IsUUID()
  id: string;

  @IsString()
  name: string;

  @IsEnum(AdditionalProductCategory)
  category: AdditionalProductCategory;

  @IsNumber()
  sortOrder: number;

  @IsBoolean()
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 2: Run build to verify**

Run: `cd C:\appiw && pnpm --filter @iwana/api build`
Expected: Build successful

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/tenant/dto/tenant-additional-products.dto.ts
git commit -m "feat(api): add DTOs for additional products CRUD"
```

---

## Task 4: Service Methods for Additional Products

**Files:**

- Modify: `apps/api/src/modules/tenant/tenant.service.ts`

- [ ] **Step 1: Find existing service location**

Run: `cd C:\appiw && grep -n "getPlanCatalog\|createPlanCatalogItem" apps/api/src/modules/tenant/tenant.service.ts`
Expected: Findline numbers for plan methods

- [ ] **Step 2: Add imports for AdditionalProduct**

Add to existing imports in `tenant.service.ts`:

```typescript
import { AdditionalProduct } from './entities/additional-product.entity';
import {
  CreateAdditionalProductDto,
  UpdateAdditionalProductDto,
  AdditionalProductResponseDto,
} from './dto/tenant-additional-products.dto';
import { AdditionalProductCategory } from '@iwana/shared';
```

- [ ] **Step 3: Add getAdditionalProducts method**

Add after the existing plan methods in `tenant.service.ts`:

```typescript
  async getAdditionalProducts(
    tenantId: string,
    schemaName: string,
  ): Promise<AdditionalProductResponseDto[]> {
    const products = await this.tenantRepo.manager
      .createQueryBuilder(AdditionalProduct, 'product')
      .where('product.tenantId = :tenantId', { tenantId })
      .orderBy('product.category', 'ASC')
      .addOrderBy('product.sortOrder', 'ASC')
      .getMany();

    return products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      sortOrder: p.sortOrder,
      isActive: p.isActive,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }
```

- [ ] **Step 4: Add createAdditionalProduct method**

```typescript
  async createAdditionalProduct(
    tenantId: string,
    schemaName: string,
    dto: CreateAdditionalProductDto,
    userId: string,
  ): Promise<AdditionalProductResponseDto[]> {
    const product = this.tenantRepo.manager.create(AdditionalProduct, {
      tenantId,
      name: dto.name,
      category: dto.category,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    await this.tenantRepo.manager.save(product);

    return this.getAdditionalProducts(tenantId, schemaName);
  }
```

- [ ] **Step 5: Add updateAdditionalProduct method**

```typescript
  async updateAdditionalProduct(
    tenantId: string,
    schemaName: string,
    productId: string,
    dto: UpdateAdditionalProductDto,
    userId: string,
  ): Promise<AdditionalProductResponseDto[]> {
    const product = await this.tenantRepo.manager.findOneByOrFail(AdditionalProduct, {
      id: productId,
      tenantId,
    });

    if (dto.name !== undefined) product.name = dto.name;
    if (dto.category !== undefined) product.category = dto.category;
    if (dto.sortOrder !== undefined) product.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) product.isActive = dto.isActive;

    await this.tenantRepo.manager.save(product);

    return this.getAdditionalProducts(tenantId, schemaName);
  }
```

- [ ] **Step 6: Add removeAdditionalProduct method**

```typescript
  async removeAdditionalProduct(
    tenantId: string,
    schemaName: string,
    productId: string,
    userId: string,
  ): Promise<AdditionalProductResponseDto[]> {
    await this.tenantRepo.manager.softDelete(AdditionalProduct, {
      id: productId,
      tenantId,
    });

    return this.getAdditionalProducts(tenantId, schemaName);
  }
```

- [ ] **Step 7: Run build to verify**

Run: `cd C:\appiw && pnpm --filter @iwana/api build`
Expected: Build successful

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/tenant/tenant.service.ts
git commit -m "feat(api): add CRUD methods for additional products in TenantService"
```

---

## Task 5: Controller Endpoints for Additional Products

**Files:**

- Modify: `apps/api/src/modules/tenant/tenant.controller.ts`

- [ ] **Step 1: Add imports for AdditionalProduct DTOs**

Add to existing imports in `tenant.controller.ts`:

```typescript
import {
  CreateAdditionalProductDto,
  UpdateAdditionalProductDto,
  AdditionalProductResponseDto,
} from './dto/tenant-additional-products.dto';
```

- [ ] **Step 2: Add GET endpoint for listing additional products**

Add after the plan endpoints (around line 405):

```typescript
  @Get('me/additional-products')
  @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.ACCOUNTANT, UserRole.SUPPORT)
  @ApiOperation({ summary: 'Listar productos adicionales del tenant autenticado' })
  async getAdditionalProducts(
    @CurrentUser() user: JwtPayload,
  ): Promise<{ data: AdditionalProductResponseDto[] }> {
    const data = await this.tenantService.getAdditionalProducts(
      user.tenantId!,
      user.schemaName!,
    );
    return { data };
  }
```

- [ ] **Step 3: Add POST endpoint for creating additional product**

```typescript
  @Post('me/additional-products')
  @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear producto adicional para el tenant autenticado' })
  async createAdditionalProduct(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAdditionalProductDto,
  ): Promise<{ data: AdditionalProductResponseDto[] }> {
    const data = await this.tenantService.createAdditionalProduct(
      user.tenantId!,
      user.schemaName!,
      dto,
      user.sub,
    );
    return { data };
  }
```

- [ ] **Step 4: Add PATCH endpoint for updating additional product**

```typescript
  @Patch('me/additional-products/:productId')
  @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar producto adicional del tenant autenticado' })
  async updateAdditionalProduct(
    @CurrentUser() user: JwtPayload,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateAdditionalProductDto,
  ): Promise<{ data: AdditionalProductResponseDto[] }> {
    const data = await this.tenantService.updateAdditionalProduct(
      user.tenantId!,
      user.schemaName!,
      productId,
      dto,
      user.sub,
    );
    return { data };
  }
```

- [ ] **Step 5: Add DELETE endpoint for soft-deleting additional product**

```typescript
  @Delete('me/additional-products/:productId')
  @UseGuards(JwtAuthGuard, RolesGuard, AbacGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar (soft-delete) producto adicional del tenant' })
  async removeAdditionalProduct(
    @CurrentUser() user: JwtPayload,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<{ data: AdditionalProductResponseDto[] }> {
    const data = await this.tenantService.removeAdditionalProduct(
      user.tenantId!,
      user.schemaName!,
      productId,
      user.sub,
    );
    return { data };
  }
```

- [ ] **Step 6: Run build to verify**

Run: `cd C:\appiw && pnpm --filter @iwana/api build`
Expected: Build successful

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/tenant/tenant.controller.ts
git commit -m "feat(api): add REST endpoints for additional products CRUD"
```

---

## Task 6: Database Migration

**Files:**

- Create: `packages/database/src/migrations/YYYYMMDDHHMMSS-AddAdditionalProducts.ts`

- [ ] **Step 1: Generate migration**

Run: `cd C:\appiw\packages\database && npx typeorm migration:create src/migrations/AddAdditionalProducts`
Expected: Creates migration file with timestamp

- [ ] **Step 2: Write migration content**

Replace the migration file content:

```typescript
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddAdditionalProducts1712345678900 implements MigrationInterface {
  name = 'AddAdditionalProducts1712345678900';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Crear enum para categorías
    await queryRunner.query(`
      CREATE TYPE additional_product_category AS ENUM (
        'ENTERTAINMENT',
        'SECURITY',
        'CONNECTIVITY',
        'BUSINESS'
      )
    `);

    // Crear tabla additional_products
    await queryRunner.createTable(
      new Table({
        name: 'additional_products',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'tenant_id', type: 'uuid', isNullable: false },
          { name: 'name', type: 'varchar', length: '100', isNullable: false },
          {
            name: 'category',
            type: 'additional_product_category',
            isNullable: false,
            default: "'CONNECTIVITY'",
          },
          { name: 'sort_order', type: 'integer', default: 0 },
          { name: 'is_active', type: 'boolean', default: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
          { name: 'deleted_at', type: 'timestamptz', isNullable: true },
        ],
      }),
      true,
    );

    // Crear índice
    await queryRunner.createIndex(
      'additional_products',
      new TableIndex({
        name: 'idx_additional_products_tenant_active',
        columnNames: ['tenant_id', 'is_active'],
      }),
    );

    // Agregar columna a expediente_records
    await queryRunner.query(`
      ALTER TABLE expediente_records
      ADD COLUMN additional_product_ids jsonb DEFAULT '[]'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir columna en expediente_records
    await queryRunner.query(`
      ALTER TABLE expediente_records
      DROP COLUMN additional_product_ids
    `);

    // Eliminar tabla e índice
    await queryRunner.dropIndex('additional_products', 'idx_additional_products_tenant_active');
    await queryRunner.dropTable('additional_products');

    // Eliminar enum
    await queryRunner.query(`DROP TYPE additional_product_category`);
  }
}
```

- [ ] **Step 3: Run migration locally**

Run: `cd C:\appiw && pnpm --filter @iwana/db migration:run`
Expected: Migration executed successfully

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/migrations/*AddAdditionalProducts*
git commit -m "feat(db): add migration for additional_products table and column"
```

---

## Task 7: Seed Initial Products

**Files:**

- Create: `packages/database/src/seeds/additional-products.seed.ts`

- [ ] **Step 1: Check if seeds directory exists**

Run: `ls C:\appiw\packages\database\src\seeds`
Expected: List existing seeds or empty

- [ ] **Step 2: Create seed file**

```typescript
// packages/database/src/seeds/additional-products.seed.ts
import { DataSource } from 'typeorm';
import { AdditionalProductCategory } from '@iwana/shared';

const DEFAULT_PRODUCTS = [
  { name: 'TvBox', category: AdditionalProductCategory.ENTERTAINMENT, sortOrder: 1 },
  {
    name: 'Decodificador adicional',
    category: AdditionalProductCategory.ENTERTAINMENT,
    sortOrder: 2,
  },
  { name: 'Cámaras de seguridad', category: AdditionalProductCategory.SECURITY, sortOrder: 1 },
  { name: 'DVR / NVR', category: AdditionalProductCategory.SECURITY, sortOrder: 2 },
  { name: 'Alarma residencial', category: AdditionalProductCategory.SECURITY, sortOrder: 3 },
  { name: 'Router WiFi mesh', category: AdditionalProductCategory.CONNECTIVITY, sortOrder: 1 },
  { name: 'Extensor de cobertura', category: AdditionalProductCategory.CONNECTIVITY, sortOrder: 2 },
  { name: 'IP estática', category: AdditionalProductCategory.CONNECTIVITY, sortOrder: 3 },
  { name: 'Soporte prioritario', category: AdditionalProductCategory.BUSINESS, sortOrder: 1 },
  {
    name: 'Línea telefónica adicional',
    category: AdditionalProductCategory.BUSINESS,
    sortOrder: 2,
  },
];

export async function seedAdditionalProducts(
  dataSource: DataSource,
  tenantId: string,
): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    for (const product of DEFAULT_PRODUCTS) {
      await queryRunner.query(
        `INSERT INTO additional_products (tenant_id, name, category, sort_order, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, now(), now())
         ON CONFLICT DO NOTHING`,
        [tenantId, product.name, product.category, product.sortOrder],
      );
    }
  } finally {
    await queryRunner.release();
  }
}
```

- [ ] **Step 3: Commit seed file**

```bash
git add packages/database/src/seeds/additional-products.seed.ts
git commit -m "feat(db): add seed for default additional products"
```

---

## Task 8: Frontend API Client Types

**Files:**

- Modify: `apps/portal/src/lib/api-client.ts`

- [ ] **Step 1: Find location for additional products types**

Run: `cd C:\appiw && grep -n "PlanCatalogItem" apps/portal/src/lib/api-client.ts | head -5`
Expected: Find where plan types are defined

- [ ] **Step 2: Add types and API functions**

Add after plan catalog types in `api-client.ts`:

```typescript
// Additional Products types
export interface AdditionalProduct {
  id: string;
  name: string;
  category: 'ENTERTAINMENT' | 'SECURITY' | 'CONNECTIVITY' | 'BUSINESS';
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAdditionalProductDto {
  name: string;
  category: AdditionalProduct['category'];
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateAdditionalProductDto {
  name?: string;
  category?: AdditionalProduct['category'];
  sortOrder?: number;
  isActive?: boolean;
}
```

- [ ] **Step 3: Add API functions for additional products**

Add after plan catalog functions:

```typescript
export async function getAdditionalProducts(): Promise<AdditionalProduct[]> {
  const response = await request('/tenants/me/additional-products', { method: 'GET' });
  return response.data;
}

export async function createAdditionalProduct(
  dto: CreateAdditionalProductDto,
): Promise<AdditionalProduct[]> {
  const response = await request('/tenants/me/additional-products', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
  return response.data;
}

export async function updateAdditionalProduct(
  productId: string,
  dto: UpdateAdditionalProductDto,
): Promise<AdditionalProduct[]> {
  const response = await request(`/tenants/me/additional-products/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
  return response.data;
}

export async function deleteAdditionalProduct(productId: string): Promise<AdditionalProduct[]> {
  const response = await request(`/tenants/me/additional-products/${productId}`, {
    method: 'DELETE',
  });
  return response.data;
}
```

- [ ] **Step 4: Run typecheck**

Run: `cd C:\appiw && pnpm --filter @iwana/web typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/lib/api-client.ts
git commit -m "feat(portal): add API client types and functions for additional products"
```

---

## Task 9: AdditionalProductsManager Component

**Files:**

- Create: `apps/portal/src/components/settings/AdditionalProductsManager.tsx`

- [ ] **Step 1: Create component file structure**

Study existing `PlanCatalogManager.tsx` for pattern reference.

- [ ] **Step 2: Create full component**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  cn,
} from '@iwana/ui';
import {
  ApiError,
  getAdditionalProducts,
  createAdditionalProduct,
  updateAdditionalProduct,
  deleteAdditionalProduct,
  type AdditionalProduct,
  type CreateAdditionalProductDto,
  type UpdateAdditionalProductDto,
} from '@/lib/api-client';
import { AdditionalProductCategory, ADDITIONAL_PRODUCT_CATEGORY_LABELS } from '@iwana/shared';

const productFormSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres.').max(100, 'Máximo 100 caracteres.'),
  category: z.nativeEnum(AdditionalProductCategory),
  sortOrder: z.number().int().min(0).max(999),
  isActive: z.boolean(),
});

type ProductFormValues = z.infer<typeof productFormSchema>;

const CATEGORY_ORDER = [
  AdditionalProductCategory.ENTERTAINMENT,
  AdditionalProductCategory.SECURITY,
  AdditionalProductCategory.CONNECTIVITY,
  AdditionalProductCategory.BUSINESS,
];

const tableHeadClass = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500';
const cellClass = 'px-4 py-3 align-top text-sm text-gray-700 dark:text-gray-200';

interface AdditionalProductsManagerProps {
  canEdit: boolean;
}

export function AdditionalProductsManager({ canEdit }: AdditionalProductsManagerProps) {
  const [products, setProducts] = useState<AdditionalProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: '',
      category: AdditionalProductCategory.CONNECTIVITY,
      sortOrder: 0,
      isActive: true,
    },
  });

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdditionalProducts();
      setProducts(data);
    } catch (err) {
      console.error('Error loading additional products:', err);
      setError('No se pudieron cargar los productos adicionales.');
    } finally {
      setLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingProductId(null);
    reset({
      name: '',
      category: AdditionalProductCategory.CONNECTIVITY,
      sortOrder: 0,
      isActive: true,
    });
    setCreating(true);
  }

  function openEditDialog(product: AdditionalProduct) {
    setEditingProductId(product.id);
    reset({
      name: product.name,
      category: product.category,
      sortOrder: product.sortOrder,
      isActive: product.isActive,
    });
    setCreating(true);
  }

  async function onSubmit(values: ProductFormValues) {
    setSaving(true);
    setError(null);

    try {
      if (editingProductId) {
        const dto: UpdateAdditionalProductDto = {
          name: values.name,
          category: values.category,
          sortOrder: values.sortOrder,
          isActive: values.isActive,
        };
        const updated = await updateAdditionalProduct(editingProductId, dto);
        setProducts(updated);
      } else {
        const dto: CreateAdditionalProductDto = {
          name: values.name,
          category: values.category,
          sortOrder: values.sortOrder,
          isActive: values.isActive,
        };
        const created = await createAdditionalProduct(dto);
        setProducts(created);
      }
      setCreating(false);
    } catch (err) {
      console.error('Error saving additional product:', err);
      setError('No se pudo guardar el producto.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(productId: string) {
    if (!window.confirm('¿Eliminar este producto adicional?')) return;

    setDeleting(productId);
    setError(null);

    try {
      const updated = await deleteAdditionalProduct(productId);
      setProducts(updated);
    } catch (err) {
      console.error('Error deleting additional product:', err);
      setError('No se pudo eliminar el producto.');
    } finally {
      setDeleting(null);
    }
  }

  const groupedProducts = CATEGORY_ORDER.reduce((acc, category) => {
    acc[category] = products.filter((p) => p.category === category);
    return acc;
  }, {} as Record<AdditionalProductCategory, AdditionalProduct[]>);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold">Productos Adicionales</CardTitle>
        {canEdit && (
          <Button onClick={openCreateDialog} size="sm">
            Agregar producto
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-gray-500">Cargando productos...</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : products.length === 0 ? (
          <p className="text-sm text-gray-500">
            No hay productos adicionales. Crea uno para empezar.
          </p>
        ) : (
          <div className="space-y-6">
            {CATEGORY_ORDER.map((category) => {
              const categoryProducts = groupedProducts[category];
              if (categoryProducts.length === 0) return null;

              return (
                <div key={category}>
                  <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {ADDITIONAL_PRODUCT_CATEGORY_LABELS[category]}
                  </h3>
                  <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-dark-border">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                      <thead className="bg-gray-50 dark:bg-dark-surface-2">
                        <tr>
                          <th className={tableHeadClass}>Nombre</th>
                          <th className={tableHeadClass}>Orden</th>
                          <th className={tableHeadClass}>Estado</th>
                          {canEdit && <th className={cn(tableHeadClass, 'w-32')}>Acciones</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-dark-border dark:bg-dark-surface-1">
                        {categoryProducts.map((product) => (
                          <tr key={product.id}>
                            <td className={cellClass}>{product.name}</td>
                            <td className={cellClass}>{product.sortOrder}</td>
                            <td className={cellClass}>
                              <Badge
                                variant={product.isActive ? 'success' : 'neutral'}
                                className="text-xs"
                              >
                                {product.isActive ? 'Activo' : 'Inactivo'}
                              </Badge>
                            </td>
                            {canEdit && (
                              <td className={cellClass}>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openEditDialog(product)}
                                  >
                                    Editar
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDelete(product.id)}
                                    disabled={deleting === product.id}
                                  >
                                    {deleting === product.id ? 'Eliminando...' : 'Eliminar'}
                                  </Button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingProductId ? 'Editar producto' : 'Crear producto'}
            </DialogTitle>
            <DialogDescription>
              {editingProductId
                ? 'Modifica los datos del producto adicional.'
                : 'Agrega un nuevo producto adicional al catálogo.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Nombre
              </label>
              <Input
                {...register('name')}
                placeholder="Ej. TvBox, Cámaras de seguridad"
                aria-invalid={errors.name ? 'true' : 'false'}
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Categoría
              </label>
              <select
                {...register('category')}
                className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200"
              >
                {CATEGORY_ORDER.map((cat) => (
                  <option key={cat} value={cat}>
                    {ADDITIONAL_PRODUCT_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Orden
              </label>
              <Input
                {...register('sortOrder', { valueAsNumber: true })}
                type="number"
                min={0}
                max={999}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                {...register('isActive')}
                type="checkbox"
                id="isActive"
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="isActive" className="text-sm text-gray-700 dark:text-gray-200">
                Activo
              </label>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={!isDirty || saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
```

- [ ] **Step 3: Run build to verify**

Run: `cd C:\appiw && pnpm --filter @iwana/web build`
Expected: Build successful

- [ ] **Step 4: Commit**

```bash
git add apps/portal/src/components/settings/AdditionalProductsManager.tsx
git commit -m "feat(portal): add AdditionalProductsManager component"
```

---

## Task 10: Integrate into CommercialTabLayout

**Files:**

- Modify: `apps/portal/src/components/settings/CommercialTabLayout.tsx`

- [ ] **Step 1: Import AdditionalProductsManager**

Add to imports:

```typescript
import { AdditionalProductsManager } from './AdditionalProductsManager';
```

- [ ] **Step 2: Update CommercialSubItem type**

```typescript
export type CommercialSubItem = 'coverage' | 'plans' | 'products';
```

- [ ] **Step 3: Update COMMERCIAL_SUBNAV**

```typescript
const COMMERCIAL_SUBNAV: Array<{ id: CommercialSubItem; label: string }> = [
  { id: 'coverage', label: 'Cobertura' },
  { id: 'plans', label: 'Planes' },
  { id: 'products', label: 'Productos adicionales' },
];
```

- [ ] **Step 4: Add render case for products**

```typescript
{activeSubItem === 'products' && (
  <AdditionalProductsManager canEdit={canEdit} />
)}
```

- [ ] **Step 5: Run build to verify**

Run: `cd C:\appiw && pnpm --filter @iwana/web build`
Expected: Build successful

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/components/settings/CommercialTabLayout.tsx
git commit -m "feat(portal): add products tab to CommercialTabLayout"
```

---

## Task 11: Update Expediente UI for Additional Products

**Files:**

- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
- Modify: `apps/portal/src/components/crm/expedientes/expediente-ui.ts`

- [ ] **Step 1: Add additional product IDs to form state**

Find the form state definition and add:

```typescript
additionalProductIds: string[] | null;
```

- [ ] **Step 2: Add UI constants for categories**

In `expediente-ui.ts`:

```typescript
export const ADDITIONAL_PRODUCT_CATEGORY_OPTIONS = [
  { value: AdditionalProductCategory.ENTERTAINMENT, label: 'Entretenimiento' },
  { value: AdditionalProductCategory.SECURITY, label: 'Seguridad' },
  { value: AdditionalProductCategory.CONNECTIVITY, label: 'Conectividad' },
  { value: AdditionalProductCategory.BUSINESS, label: 'Negocios' },
] as const;
```

- [ ] **Step 3: Add checkboxes in the commercial_interest section**

In the render, after the plan dropdown, add checkboxes grouped by category.

- [ ] **Step 4: Update API payload on save**

Include `additionalProductIds` in the update payload.

- [ ] **Step 5: Run build to verify**

Run: `cd C:\appiw && pnpm --filter @iwana/web build`
Expected: Build successful

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/app/dashboard/crm/expedientes apps/portal/src/components/crm/expedientes
git commit -m "feat(portal): add additional products checkboxes to expediente form"
```

---

## Task 12: End-to-End Testing

**Files:**

- No new files (manual testing)

- [ ] **Step 1: Start development environment**

Run: `pnpm dev`
Expected: All services running

- [ ] **Step 2: Test API endpoints manually**

Use curl or Postman to:

- GET `/api/v1/tenants/me/additional-products`
- POST `/api/v1/tenants/me/additional-products`
- PATCH `/api/v1/tenants/me/additional-products/:id`
- DELETE `/api/v1/tenants/me/additional-products/:id`

- [ ] **Step 3: Test Portal UI**

Navigate to:

- Settings → Comercial → Productos adicionales
- Create, edit, delete products
- Check categorization works correctly

- [ ] **Step 4: Test Expediente UI**

Navigate to:

- CRM → Expedientes → Open any expediente
- Verify checkboxes appear in "Interés Comercial" section
- Verify selection persists on save

- [ ] **Step 5: Run all tests**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 6: Commit any fixes**

```bash
git add .
git commit -m "test: verify additional products end-to-end"
```

---

## Verification Checklist

- [ ] Database migration applied successfully
- [ ] API endpoints respond correctly (GET, POST, PATCH, DELETE)
- [ ] Products grouped by category in UI
- [ ] CRUD operations work in Portal Settings
- [ ] Expediente form shows checkboxes for products
- [ ] Selection persists across saves
- [ ] All tests pass

---

## Summary

This plan implements:

1. **Backend**: Entity, DTOs, Service methods, Controller endpoints for additional products
2. **Database**: Migration for `additional_products` table + column in `expediente_records`
3. **Frontend**: CRUD UI in Settings/Comercial, checkboxes in Expediente form

All changes follow existing patterns (`PlanCatalogItem`, `CommercialTabLayout`) for consistency.
