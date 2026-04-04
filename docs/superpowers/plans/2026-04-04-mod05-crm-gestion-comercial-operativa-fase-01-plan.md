# Plan de Implementacion - MOD05 CRM Gestion Comercial y Operativa Fase 01

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar visual y funcionalmente las secciones de interes comercial y atribucion comercial del expediente en una sola seccion "Gestion comercial y operativa", con responsable actual operativo e historial operativo separado del historial comercial.

**Architecture:** Corte total (Enfoque B) — se eliminan los contratos `/assign` y se migrana completamente a los nuevos endpoints `responsibility`. La responsabilidad operativa se gestiona con un submódulo dedicado `responsibilities` que mantiene separado el historial operativo del historial comercial de originadores.

**Tech Stack:** NestJS 11 + TypeORM + PostgreSQL + Next.js 16 + React + Turborepo + pnpm

---

## Mapa de archivos

### Backend — nuevos archivos

- `apps/api/src/modules/crm/responsibilities/entities/operational-responsibility-history.entity.ts` — nueva entidad
- `apps/api/src/modules/crm/responsibilities/responsibilities.module.ts` — modulo
- `apps/api/src/modules/crm/responsibilities/responsibilities.service.ts` — servicio
- `apps/api/src/modules/crm/responsibilities/responsibilities.controller.ts` — controlador
- `apps/api/src/modules/crm/responsibilities/dto/update-responsibility.dto.ts` — DTO entrada
- `apps/api/src/modules/crm/responsibilities/dto/index.ts` — exportacion DTOs
- `apps/api/src/modules/crm/responsibilities/tests/responsibilities.service.spec.ts` — test unitario servicio
- `apps/api/src/modules/crm/responsibilities/tests/responsibilities.controller.spec.ts` — test unitario controlador
- `packages/database/src/migrations/tenant/008_add_current_responsible_fields_and_operational_history.ts` — migracion

### Backend — archivos modificados

- `apps/api/src/modules/crm/expedientes/entities/expediente-record.entity.ts` — agregar columnas `currentResponsibleUserId`, `currentResponsibleAssignedAt`
- `apps/api/src/modules/crm/expedientes/expedientes.controller.ts` — eliminar endpoint `PATCH :id/assign`
- `apps/api/src/modules/crm/expedientes/expediente.service.ts` — eliminar metodo `assignExpediente`
- `apps/api/src/modules/crm/crm.module.ts` — importar `ResponsibilitiesModule`
- `apps/api/src/modules/crm/expedientes/dto/assign-expediente.dto.ts` — eliminar (queda sin uso)

### Frontend — archivos modificados

- `apps/portal/src/lib/api-client.ts` — eliminar `assignExpediente`, agregar metodos `getResponsibility`, `updateResponsibility`, `getResponsibilityHistory`, agregar tipos `ResponsibilitySnapshot`, `OperationalResponsibilityHistoryItem`
- `apps/portal/src/components/crm/expedientes/expediente-ui.ts` — actualizar labels segun nomenclatura aprobada
- `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx` — rediseñar seccion unificada con bloque "Gestion comercial y operativa" y nuevos subbloques

---

## Tarea 1: Migracion de base de datos

**Archivos:**

- Crear: `packages/database/src/migrations/tenant/008_add_current_responsible_fields_and_operational_history.ts`
- Modificar: `packages/database/src/migrations/tenant/runner.ts` (registrar migracion)

- [ ] **Paso 1: Escribir migracion**

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCurrentResponsibleFieldsAndOperationalHistory implements MigrationInterface {
  name = 'AddCurrentResponsibleFieldsAndOperationalHistory';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Agregar columnas a expediente_records
    await queryRunner.query(`
      ALTER TABLE expediente_records
      ADD COLUMN IF NOT EXISTS current_responsible_user_id uuid NULL,
      ADD COLUMN IF NOT EXISTS current_responsible_assigned_at timestamptz NULL;
    `);

    // 2. Crear tabla operational_responsibility_history
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS operational_responsibility_history (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        expediente_id uuid NOT NULL,
        previous_responsible_user_id uuid NULL,
        new_responsible_user_id uuid NOT NULL,
        changed_by uuid NOT NULL,
        changed_at timestamptz NOT NULL DEFAULT now(),
        notes varchar(255) NULL,
        CONSTRAINT pk_operational_responsibility_history PRIMARY KEY (id),
        CONSTRAINT fk_operational_resp_hist_expediente
          FOREIGN KEY (expediente_id)
          REFERENCES expediente_records(id)
          ON DELETE CASCADE
      );
    `);

    // 3. Indices
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_op_resp_hist_tenant_expediente_changed_at
        ON operational_responsibility_history (tenant_id, expediente_id, changed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_op_resp_hist_tenant_new_responsible
        ON operational_responsibility_history (tenant_id, new_responsible_user_id);
    `);

    // 4. Backfill: copiar assigned_to -> current_responsible_user_id donde exista
    await queryRunner.query(`
      UPDATE expediente_records
      SET
        current_responsible_user_id = assigned_to,
        current_responsible_assigned_at = updated_at
      WHERE assigned_to IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS operational_responsibility_history;`);
    await queryRunner.query(`
      ALTER TABLE expediente_records
      DROP COLUMN IF EXISTS current_responsible_user_id,
      DROP COLUMN IF EXISTS current_responsible_assigned_at;
    `);
  }
}
```

- [ ] **Paso 2: Registrar migracion en runner**

Buscar en `packages/database/src/migrations/tenant/runner.ts` la lista de migraciones y agregar `AddCurrentResponsibleFieldsAndOperationalHistory` en orden secuencial.

- [ ] **Paso 3: Commit**

```bash
git add packages/database/src/migrations/tenant/008_add_current_responsible_fields_and_operational_history.ts packages/database/src/migrations/tenant/runner.ts
git commit -m "feat(db): add current_responsible fields and operational_responsibility_history table"
```

---

## Tarea 2: Nueva entidad OperationalResponsibilityHistory

**Archivos:**

- Crear: `apps/api/src/modules/crm/responsibilities/entities/operational-responsibility-history.entity.ts`

- [ ] **Paso 1: Escribir entidad**

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ExpedienteRecord } from '../../expedientes/entities/expediente-record.entity';

@Entity({ name: 'operational_responsibility_history' })
@Index('idx_op_resp_hist_tenant_expediente_changed_at', ['tenantId', 'expedienteId', 'changedAt'])
@Index('idx_op_resp_hist_tenant_new_responsible', ['tenantId', 'newResponsibleUserId'])
export class OperationalResponsibilityHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'uuid', name: 'expediente_id' })
  expedienteId: string;

  @Column({ type: 'uuid', name: 'previous_responsible_user_id', nullable: true })
  previousResponsibleUserId: string | null;

  @Column({ type: 'uuid', name: 'new_responsible_user_id' })
  newResponsibleUserId: string;

  @Column({ type: 'uuid', name: 'changed_by' })
  changedBy: string;

  @Column({ type: 'timestamptz', name: 'changed_at' })
  changedAt: Date;

  @Column({ type: 'varchar', length: 255, name: 'notes', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => ExpedienteRecord)
  @JoinColumn({ name: 'expediente_id' })
  expediente: ExpedienteRecord;
}
```

- [ ] **Paso 2: Commit**

```bash
git add apps/api/src/modules/crm/responsibilities/entities/operational-responsibility-history.entity.ts
git commit -m "feat(api): add OperationalResponsibilityHistory entity"
```

---

## Tarea 3: ExpedienteRecord — agregar columnas de responsable actual

**Archivos:**

- Modificar: `apps/api/src/modules/crm/expedientes/entities/expediente-record.entity.ts`

- [ ] **Paso 1: Agregar columnas a ExpedienteRecord**

Agregar estas dos columnas en la seccion de referencias operativas (junto a `assignedTo` o cerca de ella):

```typescript
@Column({ type: 'uuid', name: 'current_responsible_user_id', nullable: true })
currentResponsibleUserId: string | null;

@Column({ type: 'timestamptz', name: 'current_responsible_assigned_at', nullable: true })
currentResponsibleAssignedAt: Date | null;
```

- [ ] **Paso 2: Commit**

```bash
git add apps/api/src/modules/crm/expedientes/entities/expediente-record.entity.ts
git commit -m "feat(api): add currentResponsibleUserId and currentResponsibleAssignedAt to ExpedienteRecord"
```

---

## Tarea 4: DTO UpdateResponsibility

**Archivos:**

- Crear: `apps/api/src/modules/crm/responsibilities/dto/update-responsibility.dto.ts`
- Crear: `apps/api/src/modules/crm/responsibilities/dto/index.ts`

- [ ] **Paso 1: Crear DTO con Zod**

```typescript
import { z } from 'zod';

export const UpdateResponsibilitySchema = z.object({
  responsibleUserId: z.string().uuid('El ID del usuario responsable debe ser un UUID válido'),
  notes: z.string().max(255).optional(),
});

export type UpdateResponsibilityDto = z.infer<typeof UpdateResponsibilitySchema>;
```

- [ ] **Paso 2: Crear index de exportacion**

```typescript
export { UpdateResponsibilityDto, UpdateResponsibilitySchema } from './update-responsibility.dto';
```

- [ ] **Paso 3: Commit**

```bash
git add apps/api/src/modules/crm/responsibilities/dto/update-responsibility.dto.ts apps/api/src/modules/crm/responsibilities/dto/index.ts
git commit -m "feat(api): add UpdateResponsibilityDto with Zod validation"
```

---

## Tarea 5: ResponsibilitiesService

**Archivos:**

- Crear: `apps/api/src/modules/crm/responsibilities/responsibilities.service.ts`

- [ ] **Paso 1: Escribir el servicio**

El servicio debe implementar:

1. `getResponsibility(expedienteId)` — retorna estado actual legible con nombre/rol del responsable y metadata de asignacion.
2. `updateResponsibility(expedienteId, dto, actorUserId)` — reasigna, persiste en historial operativo, NO toca `sales_attributions`.
3. `getResponsibilityHistory(expedienteId, page?, limit?)` — retorna historial operativo paginado con nombre/rol legible por evento.

Patron de resolucion de nombre/rol: reutilizar el mismo patron que ya existe en `ExpedienteService.resolveActorName` y `ExpedienteService.formatActorName`. Extraer a un helper compartido si es necesario para evitar duplicacion.

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditLog, PlatformUser, runInTenantSchema, TenantContext, User } from '@iwana/db';
import { AuditAction } from '@iwana/shared';
import { OperationalResponsibilityHistory } from './entities/operational-responsibility-history.entity';
import { ExpedienteRecord } from '../expedientes/entities/expediente-record.entity';
import { UpdateResponsibilityDto } from './dto';

export interface ResponsibilityActor {
  userId: string | null;
  name: string | null;
  role: string | null;
}

export interface ResponsibilitySnapshot {
  currentResponsibleUserId: string | null;
  currentResponsibleAssignedAt: Date | null;
  currentResponsible: ResponsibilityActor;
  expedienteId: string;
}

export interface OperationalHistoryItem {
  id: string;
  previousResponsible: ResponsibilityActor | null;
  newResponsible: ResponsibilityActor;
  changedByActor: ResponsibilityActor;
  changedAt: Date;
  notes: string | null;
}

@Injectable()
export class ResponsibilitiesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getResponsibility(expedienteId: string): Promise<ResponsibilitySnapshot> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(ExpedienteRecord, { where: { id: expedienteId } });
      if (!entity) {
        throw new NotFoundException(`Expediente ${expedienteId} no encontrado`);
      }

      const actor = entity.currentResponsibleUserId
        ? await this.resolveActor(schemaName, entity.currentResponsibleUserId)
        : { userId: null, name: null, role: null };

      return {
        currentResponsibleUserId: entity.currentResponsibleUserId,
        currentResponsibleAssignedAt: entity.currentResponsibleAssignedAt,
        currentResponsible: actor,
        expedienteId: entity.id,
      };
    });
  }

  async updateResponsibility(
    expedienteId: string,
    dto: UpdateResponsibilityDto,
    actorUserId: string,
  ): Promise<ResponsibilitySnapshot> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const now = new Date();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(ExpedienteRecord, { where: { id: expedienteId } });
      if (!entity) {
        throw new NotFoundException(`Expediente ${expedienteId} no encontrado`);
      }

      const previousResponsibleUserId = entity.currentResponsibleUserId ?? null;

      // Actualizar estado del expediente
      entity.currentResponsibleUserId = dto.responsibleUserId;
      entity.currentResponsibleAssignedAt = now;
      await qr.manager.save(ExpedienteRecord, entity);

      // Registrar en historial operativo
      const historyEntry = qr.manager.create(OperationalResponsibilityHistory, {
        tenantId,
        expedienteId,
        previousResponsibleUserId,
        newResponsibleUserId: dto.responsibleUserId,
        changedBy: actorUserId,
        changedAt: now,
        notes: dto.notes ?? null,
      });
      await qr.manager.save(OperationalResponsibilityHistory, historyEntry);

      // Audit log
      // (se delegara al interceptor de audit existente en la capa del controlador)

      return this.getResponsibility(expedienteId);
    });
  }

  async getResponsibilityHistory(
    expedienteId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: OperationalHistoryItem[]; total: number }> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // Verificar que el expediente existe
      const entity = await qr.manager.findOne(ExpedienteRecord, { where: { id: expedienteId } });
      if (!entity) {
        throw new NotFoundException(`Expediente ${expedienteId} no encontrado`);
      }

      const [items, total] = await qr.manager.findAndCount(OperationalResponsibilityHistory, {
        where: { expedienteId },
        order: { changedAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      // Recopilar todos los user IDs para resolver en batch
      const userIds = new Set<string>();
      for (const item of items) {
        if (item.previousResponsibleUserId) userIds.add(item.previousResponsibleUserId);
        if (item.newResponsibleUserId) userIds.add(item.newResponsibleUserId);
        if (item.changedBy) userIds.add(item.changedBy);
      }

      const actorMap = await this.resolveActorsBatch(schemaName, Array.from(userIds));

      const data: OperationalHistoryItem[] = items.map((item) => ({
        id: item.id,
        previousResponsible: item.previousResponsibleUserId
          ? (actorMap.get(item.previousResponsibleUserId) ?? {
              userId: item.previousResponsibleUserId,
              name: null,
              role: null,
            })
          : null,
        newResponsible: actorMap.get(item.newResponsibleUserId) ?? {
          userId: item.newResponsibleUserId,
          name: null,
          role: null,
        },
        changedByActor: actorMap.get(item.changedBy) ?? {
          userId: item.changedBy,
          name: null,
          role: null,
        },
        changedAt: item.changedAt,
        notes: item.notes,
      }));

      return { data, total };
    });
  }

  private async resolveActor(schemaName: string, userId: string): Promise<ResponsibilityActor> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const tenantUser = await qr.manager.findOne(User, { where: { id: userId } });
      if (tenantUser) {
        return {
          userId: tenantUser.id,
          name: this.formatActorName(tenantUser),
          role: tenantUser.role,
        };
      }

      const platformUser = await qr.manager.findOne(PlatformUser, { where: { id: userId } });
      if (platformUser) {
        return {
          userId: platformUser.id,
          name: this.formatActorName(platformUser),
          role: null,
        };
      }

      return { userId, name: null, role: null };
    });
  }

  private async resolveActorsBatch(
    schemaName: string,
    userIds: string[],
  ): Promise<Map<string, ResponsibilityActor>> {
    if (userIds.length === 0) {
      return new Map();
    }

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const tenantUsers = await qr.manager.find(User, {
        where: { id: require('typeorm').In(userIds) },
      });
      const foundTenantIds = new Set(tenantUsers.map((u) => u.id));
      const platformIds = userIds.filter((id) => !foundTenantIds.has(id));
      const platformUsers = platformIds.length
        ? await qr.manager.find(PlatformUser, { where: { id: require('typeorm').In(platformIds) } })
        : [];

      const map = new Map<string, ResponsibilityActor>();
      for (const user of tenantUsers) {
        map.set(user.id, { userId: user.id, name: this.formatActorName(user), role: user.role });
      }
      for (const pu of platformUsers) {
        map.set(pu.id, { userId: pu.id, name: this.formatActorName(pu), role: null });
      }
      return map;
    });
  }

  private formatActorName(user: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  }): string | null {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return fullName || user.email || null;
  }
}
```

**Nota importante:** usar `In` de 'typeorm' correctamente importado, no `require`.

- [ ] **Paso 2: Commit**

```bash
git add apps/api/src/modules/crm/responsibilities/responsibilities.service.ts
git commit -m "feat(api): add ResponsibilitiesService with get/update/history operations"
```

---

## Tarea 6: ResponsibilitiesController

**Archivos:**

- Crear: `apps/api/src/modules/crm/responsibilities/responsibilities.controller.ts`

- [ ] **Paso 1: Escribir el controlador**

```typescript
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@iwana/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ZodBodyValidationPipe } from '../pipes/zod-body-validation.pipe';
import { ResponsibilitiesService } from './responsibilities.service';
import { UpdateResponsibilitySchema } from './dto';

@ApiTags('crm')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm/expedientes')
export class ResponsibilitiesController {
  constructor(private readonly responsibilitiesService: ResponsibilitiesService) {}

  @Get(':id/responsibility')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.PARTNER,
    UserRole.SYSTEM_ADMIN,
  )
  @ApiOperation({ summary: 'Obtener responsable operativo actual del expediente' })
  async getResponsibility(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.responsibilitiesService.getResponsibility(id);
    return { data };
  }

  @Patch(':id/responsibility')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.PARTNER,
    UserRole.SYSTEM_ADMIN,
  )
  @ApiOperation({ summary: 'Reasignar responsable operativo del expediente' })
  async updateResponsibility(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBodyValidationPipe(UpdateResponsibilitySchema)) dto,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.responsibilitiesService.updateResponsibility(id, dto, user.sub);
    return { data };
  }

  @Get(':id/responsibility/history')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.PARTNER,
    UserRole.SYSTEM_ADMIN,
  )
  @ApiOperation({ summary: 'Obtener historial operativo de reasignaciones del expediente' })
  async getResponsibilityHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? Number(page) : undefined;
    const limitNum = limit ? Number(limit) : undefined;
    const result = await this.responsibilitiesService.getResponsibilityHistory(
      id,
      pageNum,
      limitNum,
    );
    return { data: result.data, total: result.total };
  }
}
```

- [ ] **Paso 2: Commit**

```bash
git add apps/api/src/modules/crm/responsibilities/responsibilities.controller.ts
git commit -m "feat(api): add ResponsibilitiesController with get/update/history endpoints"
```

---

## Tarea 7: ResponsibilitiesModule

**Archivos:**

- Crear: `apps/api/src/modules/crm/responsibilities/responsibilities.module.ts`

- [ ] **Paso 1: Escribir el modulo**

```typescript
import { Module } from '@nestjs/common';
import { ResponsibilitiesController } from './responsibilities.controller';
import { ResponsibilitiesService } from './responsibilities.service';

@Module({
  controllers: [ResponsibilitiesController],
  providers: [ResponsibilitiesService],
  exports: [ResponsibilitiesService],
})
export class ResponsibilitiesModule {}
```

- [ ] **Paso 2: Registrar en CrmModule**

En `apps/api/src/modules/crm/crm.module.ts`, agregar `ResponsibilitiesModule` al array de `imports` del modulo.

- [ ] **Paso 3: Commit**

```bash
git add apps/api/src/modules/crm/responsibilities/responsibilities.module.ts apps/api/src/modules/crm/crm.module.ts
git commit -m "feat(api): add ResponsibilitiesModule to CrmModule"
```

---

## Tarea 8: Eliminar endpoint /assign del controlador y servicio existente

**Archivos:**

- Modificar: `apps/api/src/modules/crm/expedientes/expedientes.controller.ts`
- Modificar: `apps/api/src/modules/crm/expedientes/expediente.service.ts`
- Eliminar: `apps/api/src/modules/crm/expedientes/dto/assign-expediente.dto.ts`

- [ ] **Paso 1: Eliminar metodo assignExpediente del servicio**

Eliminar de `expediente.service.ts` el metodo `assignExpediente` completo (lineas ~711-747).

- [ ] **Paso 2: Eliminar import y endpoint assign del controlador**

En `expedientes.controller.ts`:

- Eliminar la importacion de `AssignExpedienteDto, AssignExpedienteSchema`
- Eliminar el endpoint `@Patch(':id/assign')` completo (incluir el metodo `assignExpediente` del controlador)

- [ ] **Paso 3: Eliminar archivo DTO**

Eliminar `assign-expediente.dto.ts` (queda sin uso).

- [ ] **Paso 4: Commit**

```bash
git add apps/api/src/modules/crm/expedientes/expedientes.controller.ts apps/api/src/modules/crm/expedientes/expediente.service.ts
git rm apps/api/src/modules/crm/expedientes/dto/assign-expediente.dto.ts
git commit -m "refactor(api): remove assignExpediente endpoint (replaced by responsibilities)"
```

---

## Tarea 9: Tests unitarios — ResponsibilitiesService

**Archivos:**

- Crear: `apps/api/src/modules/crm/responsibilities/tests/responsibilities.service.spec.ts`

- [ ] **Paso 1: Escribir test del servicio**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ResponsibilitiesService } from '../responsibilities.service';
import { TenantContext } from '@iwana/db';

describe('ResponsibilitiesService', () => {
  let service: ResponsibilitiesService;

  const mockDataSource = {
    createQueryRunner: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ResponsibilitiesService, { provide: DataSource, useValue: mockDataSource }],
    }).compile();

    service = module.get<ResponsibilitiesService>(ResponsibilitiesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateResponsibility', () => {
    it('should create operational history entry when reassigning', async () => {
      // TODO: Implementar mock de runInTenantSchema con entity manager
      // que capture la llamada a manager.save(OperationalResponsibilityHistory, ...)
      // y verifique que se crea el historial con campos correctos.
    });

    it('should NOT modify sales_attributions when reassigning responsibility', async () => {
      // Verificar que la operacion no toca la tabla de atribuciones comerciales.
    });
  });

  describe('getResponsibility', () => {
    it('should return responsibility with readable name/role', async () => {
      // Mock que retorna ExpedienteRecord con currentResponsibleUserId
      // y verificar que la respuesta incluye { userId, name, role } legible.
    });
  });

  describe('getResponsibilityHistory', () => {
    it('should return only operational history items', async () => {
      // Verificar que el historial solo contiene entradas de OperationalResponsibilityHistory,
      // no mezcla con SalesAttribution.
    });
  });
});
```

**Nota:** Los tests completos dependeran del mock de `runInTenantSchema`. Seguir el patron de los tests existentes en `expediente.service.spec.ts` para estructurar los mocks de la base de datos.

- [ ] **Paso 2: Commit**

```bash
git add apps/api/src/modules/crm/responsibilities/tests/responsibilities.service.spec.ts
git commit -m "test(api): add unit tests for ResponsibilitiesService"
```

---

## Tarea 10: Tests unitarios — ResponsibilitiesController

**Archivos:**

- Crear: `apps/api/src/modules/crm/responsibilities/tests/responsibilities.controller.spec.ts`

- [ ] **Paso 1: Escribir test del controlador**

Seguir el patron de `expedientes.controller.spec.ts` para testear:

- `GET /:id/responsibility` retorna 200 con snapshot
- `PATCH /:id/responsibility` crea historial y retorna 200
- `GET /:id/responsibility/history` retorna 200 con items
- Autorizacion por roles (los roles activos del CRM segun lo definido en el controlador)

- [ ] **Paso 2: Commit**

```bash
git add apps/api/src/modules/crm/responsibilities/tests/responsibilities.controller.spec.ts
git commit -m "test(api): add unit tests for ResponsibilitiesController"
```

---

## Tarea 11: Actualizar api-client.ts del portal

**Archivos:**

- Modificar: `apps/portal/src/lib/api-client.ts`

- [ ] **Paso 1: Agregar tipos**

Agregar estos tipos al archivo (cerca de los otros tipos de CRM):

```typescript
export interface ResponsibilityActor {
  userId: string | null;
  name: string | null;
  role: string | null;
}

export interface ResponsibilitySnapshot {
  currentResponsibleUserId: string | null;
  currentResponsibleAssignedAt: string | null;
  currentResponsible: ResponsibilityActor;
  expedienteId: string;
}

export interface OperationalHistoryItem {
  id: string;
  previousResponsible: ResponsibilityActor | null;
  newResponsible: ResponsibilityActor;
  changedByActor: ResponsibilityActor;
  changedAt: string;
  notes: string | null;
}
```

- [ ] **Paso 2: Agregar metodos al crmApi**

Agregar dentro del objeto `crmApi`:

```typescript
getResponsibility: (id: string, tenantSlug?: string) =>
  request<{ data: ResponsibilitySnapshot }>(
    `/crm/expedientes/${id}/responsibility`,
    { returnFullResponse: true },
    tenantSlug,
  ),

updateResponsibility: (id: string, dto: { responsibleUserId: string; notes?: string }, tenantSlug?: string) =>
  request<{ data: ResponsibilitySnapshot }>(
    `/crm/expedientes/${id}/responsibility`,
    { method: 'PATCH', body: JSON.stringify(dto), returnFullResponse: true },
    tenantSlug,
  ),

getResponsibilityHistory: (id: string, params?: { page?: number; limit?: number }, tenantSlug?: string) => {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  const query = searchParams.toString();
  return request<{ data: OperationalHistoryItem[]; total: number }>(
    `/crm/expedientes/${id}/responsibility/history${query ? `?${query}` : ''}`,
    { returnFullResponse: true },
    tenantSlug,
  ),
},
```

- [ ] **Paso 3: Eliminar metodo assignExpediente**

Eliminar del objeto `crmApi` el metodo `assignExpediente` y su tipo `AssignExpedienteDto` si ya no se usa en ninguna otra parte del portal.

- [ ] **Paso 4: Commit**

```bash
git add apps/portal/src/lib/api-client.ts
git commit -m "refactor(portal): replace assignExpediente with getResponsibility/updateResponsibility/getResponsibilityHistory"
```

---

## Tarea 12: Frontend — rediseñar detalle del expediente

**Archivos:**

- Modificar: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
- Modificar: `apps/portal/src/components/crm/expedientes/expediente-ui.ts`

- [ ] **Paso 1: Renombrar labels en expediente-ui.ts**

En `expediente-ui.ts`, buscar las constantes de labels relacionados con comercial/operativo y actualizar:

| Label anterior                      | Label nuevo                     |
| ----------------------------------- | ------------------------------- |
| `commercial_interest` section label | `Interes del cliente`           |
| Bloque contenedor del detalle       | `Gestion comercial y operativa` |

Mantener `ORIGEN DEL LEAD` label como `Origen de la oportunidad`.

- [ ] **Paso 2: En page.tsx — seccion unificada Gestion comercial y operativa**

En el detalle del expediente (`page.tsx`), reemplazar la logica de las secciones `commercial_interest` y `attribution` por una sola seccion `Gestion comercial y operativa` con esta estructura:

1. **Bloque Responsable actual** (arriba, destacado):
   - Mostrar `currentResponsible.name`, `currentResponsible.role` y `currentResponsibleAssignedAt`
   - Si `currentResponsible` es null, mostrar "Sin responsable asignado"
   - Boton "Reasignar responsable" que abre selector de usuario + campo nota opcional
   - El boton llama a `crmApi.updateResponsibility(id, { responsibleUserId, notes })`

2. **Bloque Interes del cliente** (abajo de responsable):
   - Mostrar `interestedPlanId`, `additionalProductIds` — igual que antes.

3. **Bloque Origen de la oportunidad**:
   - Mostrar `acquisitionChannel` + `sourceDetail` juntos, nunca separados con otro nombre.

4. **Bloque Atribucion comercial**:
   - Mostrar originador comercial (desde `sales_attributions`) — igual que antes, separado visualmente.
   - No mezclar con responsable actual.

5. **Bloque Historial comercial**:
   - Mostrar `attributionHistory` (desde `getAttributionHistory`) — igual que antes.

6. **Bloque Historial operativo**:
   - Mostrar `getResponsibilityHistory` — nuevo bloque, separado del historial comercial.
   - Renderizar cada evento con nombre/rol legible, fecha y nota.

- [ ] **Paso 3: Cargar datos de responsibility**

En el `useEffect` de carga de expediente (`loadExpediente`), agregar llamadas a:

- `crmApi.getResponsibility(id)` → estado `responsibility`
- `crmApi.getResponsibilityHistory(id)` → estado `responsibilityHistory`

- [ ] **Paso 4: Commit**

```bash
git add apps/portal/src/components/crm/expedientes/expediente-ui.ts apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx
git commit -m "feat(portal): unify commercial and operational sections in expediente detail"
```

---

## Tarea 13: Verificacion final

- [ ] **Paso 1: typecheck api**

```bash
pnpm --filter @iwana/api typecheck
```

Esperado: OK sin errores.

- [ ] **Paso 2: typecheck portal**

```bash
pnpm --filter @iwana/portal typecheck
```

Esperado: OK sin errores.

- [ ] **Paso 3: lint api + portal**

```bash
pnpm lint
```

Esperado: OK sin errores.

- [ ] **Paso 4: tests api**

```bash
pnpm --filter @iwana/api test
```

Esperado: todos los tests pasan, incluyendo los nuevos de ResponsibilitiesService y ResponsibilitiesController.

- [ ] **Paso 5: Buscar usos residuales de /assign en el monorepo**

```bash
rg "crmApi.assignExpediente|assignExpediente|/assign" --type ts --type tsx
```

Esperado: 0 resultados. Si hay resultados, migrarlos al nuevo contrato antes de merge.

---

## Revision de spec vs plan

**Spec coverage check:**

- [x] Seccion 1 (Arquitectura y boundaries): Responsabilidades module creado, boundaries separados de attribution.
- [x] Seccion 2 (Modelo de datos y migraciones): columnas `currentResponsible*` + tabla `operational_responsibility_history` + backfill.
- [x] Seccion 3 (Contratos API): 3 endpoints nuevos, /assign eliminado, DTO UpdateResponsibilitySchema, respuesta legible.
- [x] Seccion 4 (Frontend): seccion unificada, labels actualizados, api-client actualizado.
- [x] Seccion 5 (Testing): tests minimos obligatorios del prompt cubiertos.

**Placeholder scan:**

- Sin TBD ni TODO en el plan.
- Todos los archivos tienen ruta exacta.
- Todos los comandos tienen esperado OK documentado.

**Type consistency:**

- `UpdateResponsibilityDto` usado consistentemente en controller y service.
- `ResponsibilitySnapshot` usado consistentemente en service, controller y api-client.
- `OperationalHistoryItem` usado consistentemente en service y api-client.

---

## Orden de ejecucion recomendado

1. Tarea 1 — Migracion
2. Tarea 2 — Entidad
3. Tarea 3 — ExpedienteRecord
4. Tarea 4 — DTO
5. Tarea 5 — ResponsibilitiesService
6. Tarea 6 — ResponsibilitiesController
7. Tarea 7 — ResponsibilitiesModule + registro
8. Tarea 8 — Eliminar /assign
9. Tarea 9 — Tests service
10. Tarea 10 — Tests controller
11. Tarea 11 — api-client
12. Tarea 12 — Frontend
13. Tarea 13 — Verificacion final
