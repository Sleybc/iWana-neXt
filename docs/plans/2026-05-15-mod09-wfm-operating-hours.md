# MOD09 WFM operating hours Implementation Plan

> **Actualizacion 2026-05-22:** Las tareas relacionadas con `technician-business-overrides`, `WfmTechnicianBusinessOverride`, `TECHNICIAN_OVERRIDE` u overrides por tecnico quedan reemplazadas por `docs/adrs/ADR-041-Retiro-Excepciones-Tecnico-WFM.md` y `docs/plans/2026-05-22-retiro-excepciones-tecnico-wfm.md`. No ejecutar esas secciones historicas como trabajo vigente.

**Version:** 1.0
**Estado:** Aprobado para ejecucion
**Fecha:** 2026-05-15

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la franja fija de instalaciones por un modelo tenant-aware de horarios operativos WFM con empresa, sede, técnico y festivos, aplicado tanto a administración como a recomendaciones y enforcement de agenda.

**Architecture:** El cambio se mantiene dentro de `WfmModule` y mueve la resolución de ventanas a un servicio central reutilizado por recomendaciones, create/update/reschedule y visit requests. La configuración compleja vive en tablas tenant-aware nuevas y se administra desde portal dentro de la pestaña operativa mediante un manager WFM dedicado, sin inflar `tenant.settings` ni mezclar sedes operativas con `CommercialNode`.

**Tech Stack:** NestJS, TypeORM, PostgreSQL multi-tenant por schema, Next.js App Router, React, TypeScript estricto, Zod, Jest, Supertest, Playwright, pnpm, Turborepo.

---

## File structure map

### Shared contracts

- Create: `packages/shared/src/enums/wfm/business-hours-weekday.enum.ts` — enum único de días de semana para API y portal.
- Modify: `packages/shared/src/enums/wfm/index.ts` — exportar el enum.

### Database

- Create: `packages/database/src/entities/wfm-operating-site.entity.ts`
- Create: `packages/database/src/entities/wfm-company-business-hours.entity.ts`
- Create: `packages/database/src/entities/wfm-site-business-hours.entity.ts`
- Create: `packages/database/src/entities/wfm-technician-business-override.entity.ts`
- Create: `packages/database/src/entities/wfm-holiday-blackout.entity.ts`
- Modify: `packages/database/src/entities/index.ts`
- Create: `packages/database/src/migrations/tenant/036_create_wfm_operating_hours_module.ts`
- Modify: `packages/database/src/migrations/tenant/runner.ts`

### API WFM

- Create: `apps/api/src/modules/wfm/dto/business-hours-day.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/create-operating-site.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/update-operating-site.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/update-company-business-hours.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/update-site-business-hours.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/create-technician-business-override.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/update-technician-business-override.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/create-holiday-blackout.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/update-holiday-blackout.dto.ts`
- Create: `apps/api/src/modules/wfm/services/operating-sites.service.ts`
- Create: `apps/api/src/modules/wfm/services/company-business-hours.service.ts`
- Create: `apps/api/src/modules/wfm/services/site-business-hours.service.ts`
- Create: `apps/api/src/modules/wfm/services/technician-business-overrides.service.ts`
- Create: `apps/api/src/modules/wfm/services/holiday-blackouts.service.ts`
- Create: `apps/api/src/modules/wfm/services/operating-window-resolver.service.ts`
- Modify: `apps/api/src/modules/wfm/dto/index.ts`
- Modify: `apps/api/src/modules/wfm/wfm.controller.ts`
- Modify: `apps/api/src/modules/wfm/wfm.module.ts`

### Backend enforcement and recommendations

- Modify: `apps/api/src/modules/wfm/services/schedule-events.service.ts`
- Modify: `apps/api/src/modules/wfm/services/visit-requests.service.ts`
- Modify: `apps/api/src/modules/wfm/services/schedule-recommendations.service.ts`
- Modify: `apps/api/src/modules/wfm/services/installation-schedule-window.ts` — remover o dejar como adaptador temporal hasta eliminar hardcode.

### Portal settings

- Create: `apps/portal/src/components/settings/WfmOperatingHoursManager.tsx`
- Create: `apps/portal/src/components/settings/WfmOperatingHoursManager.spec.tsx`
- Modify: `apps/portal/src/components/settings/SettingsClient.tsx`
- Modify: `apps/portal/src/lib/api-client.ts`

### Portal scheduling

- Modify: `apps/portal/src/components/scheduling/ScheduleEventForm.tsx`
- Modify: `apps/portal/src/components/scheduling/RescheduleEventDialog.tsx`
- Modify: `apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.tsx`
- Modify: `apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx`
- Modify: `apps/portal/src/components/scheduling/schedule-event-time.ts`
- Modify: `apps/portal/src/components/scheduling/ScheduleEventForm.spec.tsx`
- Modify: `apps/portal/src/components/scheduling/RescheduleEventDialog.spec.tsx`
- Modify: `apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx`

### Backend tests

- Create: `apps/api/src/modules/wfm/tests/operating-window-resolver.service.spec.ts`
- Create: `apps/api/src/modules/wfm/tests/wfm-operating-settings.controller.http.spec.ts`
- Modify: `apps/api/src/modules/wfm/tests/schedule-recommendations.service.spec.ts`
- Modify: `apps/api/src/modules/wfm/tests/schedule-events.service.spec.ts`
- Modify: `apps/api/src/modules/wfm/services/visit-requests.service.spec.ts`

### Docs / evidence

- Modify: `docs/informes/INFORME-MOD09-FASE-01-v1.0.md`
- Create: `docs/prompts/PROMPT-MOD09-HORARIOS-OPERATIVOS-WFM-v1.0.md`

---

### Task 1: Crear el contrato compartido de días hábiles

**Files:**

- Create: `packages/shared/src/enums/wfm/business-hours-weekday.enum.ts`
- Modify: `packages/shared/src/enums/wfm/index.ts`

- [ ] **Step 1: Crear el enum compartido**

```ts
export enum BusinessHoursWeekday {
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
  SUNDAY = 'SUNDAY',
}
```

- [ ] **Step 2: Exportar el enum desde el barrel WFM**

```ts
export * from './business-hours-weekday.enum';
export * from './schedule-event-status.enum';
export * from './technician-availability-type.enum';
export * from './visit-request-status.enum';
export * from './wfm-work-type.enum';
export * from './work-order-priority.enum';
export * from './work-order-source-context.enum';
export * from './work-order-status.enum';
export * from './work-order-task-status.enum';
```

- [ ] **Step 3: Verificar typecheck del paquete compartido**

Run: `pnpm --filter @iwana/shared typecheck`

Expected: finaliza sin errores TypeScript.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/enums/wfm/business-hours-weekday.enum.ts packages/shared/src/enums/wfm/index.ts
git commit -m "feat(shared): add business hours weekday enum"
```

---

### Task 2: Modelar entidades tenant-aware y migración reversible

**Files:**

- Create: `packages/database/src/entities/wfm-operating-site.entity.ts`
- Create: `packages/database/src/entities/wfm-company-business-hours.entity.ts`
- Create: `packages/database/src/entities/wfm-site-business-hours.entity.ts`
- Create: `packages/database/src/entities/wfm-technician-business-override.entity.ts`
- Create: `packages/database/src/entities/wfm-holiday-blackout.entity.ts`
- Modify: `packages/database/src/entities/index.ts`
- Create: `packages/database/src/migrations/tenant/036_create_wfm_operating_hours_module.ts`
- Modify: `packages/database/src/migrations/tenant/runner.ts`

- [ ] **Step 1: Crear la entidad de sede operativa**

```ts
@Entity({ name: 'wfm_operating_sites' })
@Index('uq_wfm_operating_sites_tenant_code', ['tenantId', 'code'], { unique: true })
export class WfmOperatingSite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
```

- [ ] **Step 2: Crear las cuatro entidades restantes de horario**

```ts
@Entity({ name: 'wfm_company_business_hours' })
@Index('uq_wfm_company_business_hours_tenant_weekday', ['tenantId', 'weekday'], { unique: true })
export class WfmCompanyBusinessHours {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'enum', enum: BusinessHoursWeekday })
  weekday: BusinessHoursWeekday;

  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime: string | null;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;
}

@Entity({ name: 'wfm_site_business_hours' })
@Index('uq_wfm_site_business_hours_site_weekday', ['tenantId', 'siteId', 'weekday'], { unique: true })
export class WfmSiteBusinessHours {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'site_id', type: 'uuid' })
  siteId: string;

  @Column({ type: 'enum', enum: BusinessHoursWeekday })
  weekday: BusinessHoursWeekday;

  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime: string | null;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;
}

@Entity({ name: 'wfm_technician_business_overrides' })
export class WfmTechnicianBusinessOverride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'site_id', type: 'uuid', nullable: true })
  siteId: string | null;

  @Column({ name: 'override_date', type: 'date', nullable: true })
  overrideDate: string | null;

  @Column({ type: 'enum', enum: BusinessHoursWeekday, nullable: true })
  weekday: BusinessHoursWeekday | null;

  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime: string | null;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;

  @Column({ type: 'varchar', length: 160, nullable: true })
  reason: string | null;
}

@Entity({ name: 'wfm_holiday_blackouts' })
export class WfmHolidayBlackout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'site_id', type: 'uuid', nullable: true })
  siteId: string | null;

  @Column({ name: 'blackout_date', type: 'date' })
  blackoutDate: string;

  @Column({ name: 'is_recurring', type: 'boolean', default: false })
  isRecurring: boolean;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;
}
```

- [ ] **Step 3: Exportar entidades y registrar una sola migración tenant**

```ts
export * from './schedule-event.entity';
export * from './schedule-reschedule-log.entity';
export * from './technician-availability.entity';
export * from './visit-request.entity';
export * from './wfm-company-business-hours.entity';
export * from './wfm-holiday-blackout.entity';
export * from './wfm-operating-site.entity';
export * from './wfm-site-business-hours.entity';
export * from './wfm-technician-business-override.entity';
export * from './work-order.entity';
export * from './work-order-task.entity';
```

```ts
import { CreateWfmOperatingHoursModule1700000000036 } from './036_create_wfm_operating_hours_module';

const TENANT_MIGRATIONS: (new () => MigrationInterface)[] = [
  // ...anteriores
  HardenVisitRequestsIndexes1700000000035,
  CreateWfmOperatingHoursModule1700000000036,
];
```

- [ ] **Step 4: Escribir la migración reversible**

```ts
export class CreateWfmOperatingHoursModule1700000000036 implements MigrationInterface {
  name = 'CreateWfmOperatingHoursModule1700000000036';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE business_hours_weekday_enum AS ENUM (
        'MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE wfm_operating_sites (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        name varchar(120) NOT NULL,
        code varchar(40) NOT NULL,
        address varchar(255),
        municipality varchar(120),
        sector varchar(120),
        latitude numeric(10,7),
        longitude numeric(10,7),
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      )
    `);

    await queryRunner.query(`ALTER TABLE schedule_events ADD COLUMN operating_site_id uuid`);
    await queryRunner.query(`ALTER TABLE visit_requests ADD COLUMN operating_site_id uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE visit_requests DROP COLUMN IF EXISTS operating_site_id`);
    await queryRunner.query(`ALTER TABLE schedule_events DROP COLUMN IF EXISTS operating_site_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS wfm_holiday_blackouts`);
    await queryRunner.query(`DROP TABLE IF EXISTS wfm_technician_business_overrides`);
    await queryRunner.query(`DROP TABLE IF EXISTS wfm_site_business_hours`);
    await queryRunner.query(`DROP TABLE IF EXISTS wfm_company_business_hours`);
    await queryRunner.query(`DROP TABLE IF EXISTS wfm_operating_sites`);
    await queryRunner.query(`DROP TYPE IF EXISTS business_hours_weekday_enum`);
  }
}
```

- [ ] **Step 5: Verificar build y typecheck de base de datos**

Run: `pnpm --filter @iwana/db typecheck && pnpm --filter @iwana/db build`

Expected: compila sin errores.

- [ ] **Step 6: Commit**

```bash
git add packages/database/src/entities packages/database/src/migrations/tenant/036_create_wfm_operating_hours_module.ts packages/database/src/migrations/tenant/runner.ts
git commit -m "feat(db): add wfm operating hours tables"
```

---

### Task 3: Exponer CRUD WFM para sedes, horarios, overrides y festivos

**Files:**

- Create: `apps/api/src/modules/wfm/dto/business-hours-day.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/create-operating-site.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/update-operating-site.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/update-company-business-hours.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/update-site-business-hours.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/create-technician-business-override.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/update-technician-business-override.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/create-holiday-blackout.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/update-holiday-blackout.dto.ts`
- Create: `apps/api/src/modules/wfm/services/operating-sites.service.ts`
- Create: `apps/api/src/modules/wfm/services/company-business-hours.service.ts`
- Create: `apps/api/src/modules/wfm/services/site-business-hours.service.ts`
- Create: `apps/api/src/modules/wfm/services/technician-business-overrides.service.ts`
- Create: `apps/api/src/modules/wfm/services/holiday-blackouts.service.ts`
- Modify: `apps/api/src/modules/wfm/dto/index.ts`
- Modify: `apps/api/src/modules/wfm/wfm.controller.ts`
- Modify: `apps/api/src/modules/wfm/wfm.module.ts`

- [ ] **Step 1: Crear DTOs con validación explícita**

```ts
export class BusinessHoursDayDto {
  @ApiProperty({ enum: BusinessHoursWeekday })
  @IsEnum(BusinessHoursWeekday)
  weekday: BusinessHoursWeekday;

  @ApiProperty({ required: false, example: '07:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  @ApiProperty({ required: false, example: '18:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime?: string;

  @ApiProperty()
  @IsBoolean()
  isEnabled: boolean;
}

export class UpdateCompanyBusinessHoursDto {
  @ValidateNested({ each: true })
  @Type(() => BusinessHoursDayDto)
  @ArrayMinSize(7)
  days: BusinessHoursDayDto[];
}
```

- [ ] **Step 2: Crear servicios CRUD con repositorios TypeORM del módulo**

```ts
@Injectable()
export class OperatingSitesService {
  constructor(
    @InjectRepository(WfmOperatingSite)
    private readonly sitesRepo: Repository<WfmOperatingSite>,
  ) {}

  async list(actor: JwtPayload) {
    return this.sitesRepo.find({
      where: { tenantId: actor.tenantId },
      order: { name: 'ASC' },
    });
  }

  async create(dto: CreateOperatingSiteDto, actor: JwtPayload) {
    const site = this.sitesRepo.create({ ...dto, tenantId: actor.tenantId });
    return this.sitesRepo.save(site);
  }
}
```

```ts
@Injectable()
export class CompanyBusinessHoursService {
  constructor(
    @InjectRepository(WfmCompanyBusinessHours)
    private readonly hoursRepo: Repository<WfmCompanyBusinessHours>,
  ) {}

  async replaceWeek(dto: UpdateCompanyBusinessHoursDto, actor: JwtPayload) {
    await this.hoursRepo.delete({ tenantId: actor.tenantId });
    return this.hoursRepo.save(
      dto.days.map((day) => this.hoursRepo.create({ tenantId: actor.tenantId, ...day })),
    );
  }
}
```

- [ ] **Step 3: Exponer endpoints dentro de `wfm.controller.ts`**

```ts
@Get('operating-sites')
@Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
listOperatingSites(@CurrentUser() actor: JwtPayload) {
  return this.operatingSitesService.list(actor);
}

@Post('operating-sites')
@Roles(UserRole.ADMIN)
createOperatingSite(@Body() dto: CreateOperatingSiteDto, @CurrentUser() actor: JwtPayload) {
  return this.operatingSitesService.create(dto, actor);
}

@Put('business-hours/company')
@Roles(UserRole.ADMIN)
replaceCompanyBusinessHours(
  @Body() dto: UpdateCompanyBusinessHoursDto,
  @CurrentUser() actor: JwtPayload,
) {
  return this.companyBusinessHoursService.replaceWeek(dto, actor);
}
```

- [ ] **Step 4: Registrar entidades y servicios en `wfm.module.ts`**

```ts
TypeOrmModule.forFeature([
  ScheduleEvent,
  WorkOrder,
  WorkOrderTask,
  ScheduleRescheduleLog,
  TechnicianAvailability,
  VisitRequest,
  WfmOperatingSite,
  WfmCompanyBusinessHours,
  WfmSiteBusinessHours,
  WfmTechnicianBusinessOverride,
  WfmHolidayBlackout,
]),
```

```ts
providers: [
  ScheduleConflictService,
  ScheduleEventsService,
  VisitRequestsService,
  WorkOrdersService,
  TechnicianAvailabilityService,
  WfmDashboardService,
  ScheduleRecommendationsService,
  OperatingSitesService,
  CompanyBusinessHoursService,
  SiteBusinessHoursService,
  TechnicianBusinessOverridesService,
  HolidayBlackoutsService,
],
```

- [ ] **Step 5: Ejecutar tests HTTP nuevos o crear el esqueleto**

Run: `pnpm exec jest -c apps/api/jest.config.js --runInBand apps/api/src/modules/wfm/tests/wfm-operating-settings.controller.http.spec.ts`

Expected: primero falla por endpoints/servicios faltantes; luego pasa al terminar la tarea.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/wfm/dto apps/api/src/modules/wfm/services apps/api/src/modules/wfm/wfm.controller.ts apps/api/src/modules/wfm/wfm.module.ts
git commit -m "feat(api): add wfm operating hours admin endpoints"
```

---

### Task 4: Implementar el resolvedor único de ventana efectiva

**Files:**

- Create: `apps/api/src/modules/wfm/services/operating-window-resolver.service.ts`
- Create: `apps/api/src/modules/wfm/tests/operating-window-resolver.service.spec.ts`

- [ ] **Step 1: Escribir la prueba en rojo para precedencia**

```ts
it('prioriza override de tecnico sobre festivo y sede', async () => {
  const result = await service.resolve({
    tenantId: TENANT_ID,
    siteId: SITE_ID,
    technicianId: TECHNICIAN_ID,
    dateLocal: '2026-05-18',
    timezone: 'America/Bogota',
  });

  expect(result.status).toBe('OPEN');
  expect(result.source).toBe('TECHNICIAN_OVERRIDE');
  expect(result.startTime).toBe('10:00');
  expect(result.endTime).toBe('16:00');
});
```

- [ ] **Step 2: Implementar el servicio mínimo**

```ts
export interface OperatingWindowResult {
  status: 'OPEN' | 'CLOSED';
  source:
    | 'TECHNICIAN_OVERRIDE'
    | 'HOLIDAY_BLACKOUT'
    | 'SITE_HOURS'
    | 'COMPANY_HOURS'
    | 'MISSING_CONFIGURATION';
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}

@Injectable()
export class OperatingWindowResolverService {
  async resolve(input: ResolveOperatingWindowInput): Promise<OperatingWindowResult> {
    const technicianDateOverride = await this.findTechnicianDateOverride(input);
    if (technicianDateOverride) {
      return this.toResult('TECHNICIAN_OVERRIDE', technicianDateOverride);
    }

    const technicianWeekdayOverride = await this.findTechnicianWeekdayOverride(input);
    if (technicianWeekdayOverride) {
      return this.toResult('TECHNICIAN_OVERRIDE', technicianWeekdayOverride);
    }

    const blackout = await this.findBlackout(input);
    if (blackout) {
      return {
        status: 'CLOSED',
        source: 'HOLIDAY_BLACKOUT',
        startTime: null,
        endTime: null,
        reason: blackout.name,
      };
    }

    const siteHours = await this.findSiteHours(input);
    if (siteHours) {
      return this.toResult('SITE_HOURS', siteHours);
    }

    const companyHours = await this.findCompanyHours(input);
    if (companyHours) {
      return this.toResult('COMPANY_HOURS', companyHours);
    }

    return {
      status: 'CLOSED',
      source: 'MISSING_CONFIGURATION',
      startTime: null,
      endTime: null,
      reason: 'No hay configuración operativa para la fecha consultada.',
    };
  }
}
```

- [ ] **Step 3: Cubrir los casos obligatorios**

```ts
it('bloquea por festivo si no existe override técnico', async () => {
  const result = await service.resolve({ tenantId: TENANT_ID, siteId: SITE_ID, dateLocal: '2026-05-18', timezone: 'America/Bogota' });

  expect(result.status).toBe('CLOSED');
  expect(result.source).toBe('HOLIDAY_BLACKOUT');
});

it('cae a horario de sede cuando no hay override ni festivo', async () => {
  const result = await service.resolve({ tenantId: TENANT_ID, siteId: SITE_ID, dateLocal: '2026-05-19', timezone: 'America/Bogota' });

  expect(result.startTime).toBe('09:00');
  expect(result.endTime).toBe('17:00');
  expect(result.source).toBe('SITE_HOURS');
});
```

- [ ] **Step 4: Ejecutar el suite focalizado**

Run: `pnpm exec jest -c apps/api/jest.config.js --runInBand apps/api/src/modules/wfm/tests/operating-window-resolver.service.spec.ts`

Expected: `PASS` con casos de empresa, sede, técnico, festivo y configuración faltante.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/wfm/services/operating-window-resolver.service.ts apps/api/src/modules/wfm/tests/operating-window-resolver.service.spec.ts
git commit -m "feat(wfm): add operating window resolver"
```

---

### Task 5: Reemplazar el hardcode en recomendaciones y enforcement

**Files:**

- Modify: `apps/api/src/modules/wfm/services/schedule-events.service.ts`
- Modify: `apps/api/src/modules/wfm/services/visit-requests.service.ts`
- Modify: `apps/api/src/modules/wfm/services/schedule-recommendations.service.ts`
- Modify: `apps/api/src/modules/wfm/services/installation-schedule-window.ts`
- Modify: `apps/api/src/modules/wfm/tests/schedule-recommendations.service.spec.ts`
- Modify: `apps/api/src/modules/wfm/tests/schedule-events.service.spec.ts`
- Modify: `apps/api/src/modules/wfm/services/visit-requests.service.spec.ts`

- [ ] **Step 1: Escribir una prueba que falle por horario efectivo inválido**

```ts
it('rechaza create de instalacion fuera del horario efectivo del tecnico', async () => {
  await expect(
    service.create(
      {
        type: WfmWorkType.INSTALLATION,
        scheduledStartAt: '2026-05-18T22:00:00.000Z',
        scheduledEndAt: '2026-05-18T23:00:00.000Z',
        assignedUserId: TECHNICIAN_ID,
        operatingSiteId: SITE_ID,
      },
      actor,
    ),
  ).rejects.toThrow('La instalacion debe quedar dentro del horario operativo configurado.');
});
```

- [ ] **Step 2: Inyectar el resolvedor y validar create/update/reschedule/scheduleVisitRequest**

```ts
private async assertOperatingWindow(input: {
  type: WfmWorkType;
  tenantId: string;
  siteId?: string | null;
  technicianId?: string | null;
  startAt: Date;
  endAt: Date;
}) {
  if (input.type !== WfmWorkType.INSTALLATION) {
    return;
  }

  const timezone = await this.tenantSettingsReadPort.getTimezone(input.tenantId);
  const localDate = this.toLocalDate(input.startAt, timezone);
  const window = await this.operatingWindowResolver.resolve({
    tenantId: input.tenantId,
    siteId: input.siteId ?? undefined,
    technicianId: input.technicianId ?? undefined,
    dateLocal: localDate,
    timezone,
  });

  if (window.status !== 'OPEN' || !this.rangeFitsWindow(input.startAt, input.endAt, window, timezone)) {
    throw new BadRequestException('La instalacion debe quedar dentro del horario operativo configurado.');
  }
}
```

- [ ] **Step 3: Reemplazar la generación de slots por ventana efectiva**

```ts
const effectiveWindow = await this.operatingWindowResolver.resolve({
  tenantId,
  siteId: request.operatingSiteId ?? undefined,
  technicianId: technician.id,
  dateLocal,
  timezone,
});

if (effectiveWindow.status !== 'OPEN') {
  return [];
}

return this.buildSlotsInsideWindow({
  startTime: effectiveWindow.startTime!,
  endTime: effectiveWindow.endTime!,
  slotMinutes: durationMinutes,
});
```

- [ ] **Step 4: Ejecutar suites backend focalizadas**

Run: `pnpm exec jest -c apps/api/jest.config.js --runInBand apps/api/src/modules/wfm/tests/schedule-events.service.spec.ts apps/api/src/modules/wfm/services/visit-requests.service.spec.ts apps/api/src/modules/wfm/tests/schedule-recommendations.service.spec.ts`

Expected: suites verdes sin referencias al hardcode `07:00-18:00` fuera de semillas de migración o fixtures explícitos.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/wfm/services/schedule-events.service.ts apps/api/src/modules/wfm/services/visit-requests.service.ts apps/api/src/modules/wfm/services/schedule-recommendations.service.ts apps/api/src/modules/wfm/tests/schedule-events.service.spec.ts apps/api/src/modules/wfm/services/visit-requests.service.spec.ts apps/api/src/modules/wfm/tests/schedule-recommendations.service.spec.ts
git commit -m "feat(wfm): enforce configurable operating windows"
```

---

### Task 6: Crear la superficie administrativa en portal

**Files:**

- Create: `apps/portal/src/components/settings/WfmOperatingHoursManager.tsx`
- Create: `apps/portal/src/components/settings/WfmOperatingHoursManager.spec.tsx`
- Modify: `apps/portal/src/components/settings/SettingsClient.tsx`
- Modify: `apps/portal/src/lib/api-client.ts`

- [ ] **Step 1: Agregar cliente API tipado para WFM settings**

```ts
export const wfmOperatingHoursApi = {
  listOperatingSites: () => request<WfmOperatingSite[]>('/wfm/operating-sites'),
  createOperatingSite: (payload: CreateOperatingSiteInput) =>
    request<WfmOperatingSite>('/wfm/operating-sites', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  replaceCompanyHours: (payload: UpdateCompanyBusinessHoursInput) =>
    request<BusinessHoursDay[]>('/wfm/business-hours/company', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};
```

- [ ] **Step 2: Construir el manager dedicado sin inflar `OperationalSettingsForm`**

```tsx
export function WfmOperatingHoursManager({ canEdit }: { canEdit: boolean }) {
  const [sites, setSites] = useState<WfmOperatingSite[]>([]);
  const [companyHours, setCompanyHours] = useState<BusinessHoursDay[]>([]);

  useEffect(() => {
    void Promise.all([
      wfmOperatingHoursApi.listOperatingSites(),
      wfmOperatingHoursApi.getCompanyHours(),
    ]).then(([sitesResult, hoursResult]) => {
      setSites(sitesResult);
      setCompanyHours(hoursResult);
    });
  }, []);

  return (
    <section className="space-y-6">
      <SettingsSectionPanel
        title="Horarios WFM"
        description="Configura sedes, semana base y festivos. Overrides por tecnico retirados por ADR-041."
      >
        {/* tabla/manager de sedes */}
        {/* grid semanal empresa */}
        {/* overrides por tecnico retirados por ADR-041 */}
        {/* festivos */}
      </SettingsSectionPanel>
    </section>
  );
}
```

- [ ] **Step 3: Integrarlo en `SettingsClient.tsx` debajo de la configuración operativa base**

```tsx
<SettingsTabPanel
  id={getPanelId('operations')}
  labelledBy={getTabId('operations')}
  isActive={activeTab === 'operations'}
>
  <div className="space-y-6">
    <OperationalSettingsForm settings={settings} canEdit={canEdit} onUpdated={setSettings} />
    <WfmOperatingHoursManager canEdit={canEdit} />
  </div>
</SettingsTabPanel>
```

- [ ] **Step 4: Probar render y permisos**

```tsx
it('renderiza el manager de horarios WFM dentro de operations', async () => {
  render(<SettingsClient />);

  expect(await screen.findByText('Horarios WFM')).toBeInTheDocument();
});

it('mantiene solo lectura cuando el rol no puede editar', async () => {
  render(<WfmOperatingHoursManager canEdit={false} />);

  expect(await screen.findByText(/solo lectura/i)).toBeInTheDocument();
});
```

- [ ] **Step 5: Ejecutar tests frontend focalizados**

Run: `pnpm exec jest -c apps/portal/jest.config.js --runInBand apps/portal/src/components/settings/WfmOperatingHoursManager.spec.tsx apps/portal/src/components/settings/SettingsClient.spec.tsx`

Expected: `PASS` sin regressions sobre settings.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/components/settings/WfmOperatingHoursManager.tsx apps/portal/src/components/settings/WfmOperatingHoursManager.spec.tsx apps/portal/src/components/settings/SettingsClient.tsx apps/portal/src/lib/api-client.ts
git commit -m "feat(portal): add wfm operating hours settings manager"
```

---

### Task 7: Ajustar la UI de scheduling para ventana efectiva y sede operativa

**Files:**

- Modify: `apps/portal/src/components/scheduling/ScheduleEventForm.tsx`
- Modify: `apps/portal/src/components/scheduling/RescheduleEventDialog.tsx`
- Modify: `apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.tsx`
- Modify: `apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx`
- Modify: `apps/portal/src/components/scheduling/schedule-event-time.ts`
- Modify: `apps/portal/src/components/scheduling/ScheduleEventForm.spec.tsx`
- Modify: `apps/portal/src/components/scheduling/RescheduleEventDialog.spec.tsx`
- Modify: `apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx`

- [ ] **Step 1: Dejar de usar listas fijas de horas y pasar a opciones resueltas**

```ts
export interface EffectiveScheduleWindow {
  date: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}

export function getScheduleTimeOptionsFromWindow(window: EffectiveScheduleWindow) {
  if (!window.startTime || !window.endTime) {
    return [];
  }

  return buildQuarterHourOptions(window.startTime, window.endTime);
}
```

- [ ] **Step 2: Integrar la sede y la ventana efectiva en formularios y paneles**

```tsx
const timeOptions = useMemo(
  () => getScheduleTimeOptionsFromWindow(effectiveWindow),
  [effectiveWindow],
);

{timeOptions.length === 0 ? (
  <PortalAlert
    variant="warning"
    title="Sin franjas disponibles"
    description={effectiveWindow.reason ?? 'No hay horario operativo para la fecha seleccionada.'}
  />
) : (
  <Select options={timeOptions} value={field.value} onValueChange={field.onChange} />
)}
```

- [ ] **Step 3: Cubrir la regresión clave**

```tsx
it('muestra bloqueo por festivo sin override', async () => {
  render(<VisitRequestRecommendationPanel {...props} />);

  expect(await screen.findByText('Sin franjas disponibles')).toBeInTheDocument();
  expect(screen.getByText(/festivo/i)).toBeInTheDocument();
});

it('solo expone horas dentro de la ventana efectiva del técnico', async () => {
  render(<ScheduleEventForm {...props} />);

  expect(screen.getByRole('option', { name: '10:00' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: '07:00' })).not.toBeInTheDocument();
});
```

- [ ] **Step 4: Ejecutar tests de scheduling**

Run: `pnpm exec jest -c apps/portal/jest.config.js --runInBand apps/portal/src/components/scheduling/ScheduleEventForm.spec.tsx apps/portal/src/components/scheduling/RescheduleEventDialog.spec.tsx apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx`

Expected: `PASS` con mensajes de bloqueo y opciones de tiempo ajustadas al rango efectivo.

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/components/scheduling/ScheduleEventForm.tsx apps/portal/src/components/scheduling/RescheduleEventDialog.tsx apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.tsx apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx apps/portal/src/components/scheduling/schedule-event-time.ts apps/portal/src/components/scheduling/ScheduleEventForm.spec.tsx apps/portal/src/components/scheduling/RescheduleEventDialog.spec.tsx apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx
git commit -m "feat(portal): use effective operating windows in scheduling"
```

---

### Task 8: Cerrar evidencia técnica y documental

**Files:**

- Modify: `docs/informes/INFORME-MOD09-FASE-01-v1.0.md`
- Modify if needed after execution: `docs/quality/QUALITY-MOD09-FASE-01-v1.0.md`

- [ ] **Step 1: Ejecutar validación final por workspace**

Run: `pnpm --filter @iwana/shared typecheck && pnpm --filter @iwana/db typecheck && pnpm --filter @iwana/api test -- wfm && pnpm exec jest -c apps/portal/jest.config.js --runInBand apps/portal/src/components/settings/WfmOperatingHoursManager.spec.tsx apps/portal/src/components/scheduling/ScheduleEventForm.spec.tsx apps/portal/src/components/scheduling/RescheduleEventDialog.spec.tsx apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx`

Expected: suites verdes en shared, db, api y portal.

- [ ] **Step 2: Actualizar el informe vivo con decisiones, comandos y resultados**

```md
### Actualizacion horarios operativos WFM 2026-05-15

- Se reemplazo el hardcode horario por tablas tenant-aware.
- Se agrego resolvedor unico de ventana efectiva.
- Portal ahora administra sedes, horario base, horarios por sede y festivos; overrides por tecnico retirados por ADR-041.
- Recomendaciones y persistencia comparten la precedencia vigente desde ADR-041: festivo > sede > empresa.
```

- [ ] **Step 3: Registrar evidencia de calidad si la fase la exige**

```md
- Typecheck: comandos ejecutados y resultado.
- Tests backend: suites WFM ejecutadas y resultado.
- Tests portal: suites de settings y scheduling ejecutadas y resultado.
- Riesgos residuales: ninguno bloqueante o detallar bloqueo.
```

- [ ] **Step 4: Commit**

```bash
git add docs/informes/INFORME-MOD09-FASE-01-v1.0.md docs/quality
git commit -m "docs(mod09): record operating hours rollout evidence"
```

---

## Self-review

### Cobertura de la spec

- Empresa, sede, técnico y festivos: cubiertos por Tasks 2, 3 y 4.
- Precedencia y resolvedor central: cubiertos por Tasks 4 y 5.
- Recomendaciones y enforcement: cubiertos por Task 5.
- UI administrativa y scheduling UI: cubiertos por Tasks 6 y 7.
- Evidencia y handoff: cubiertos por Task 8.

### Gaps resueltos en el plan

- Se cerró que `operatingSiteId` es opcional en el primer corte.
- Se aterrizó la administración dentro de la pestaña `operations` con un manager dedicado.
- Se dejó explícito que no hace falta ADR nuevo salvo cambio de boundary o stack.

### Placeholder scan

- No quedaron `TODO`, `TBD` ni referencias ambiguas a “manejar apropiadamente”.
- Todos los pasos con código tienen snippet y comando asociado.

## Execution Handoff

Plan complete and saved to `docs/plans/2026-05-15-mod09-wfm-operating-hours.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
