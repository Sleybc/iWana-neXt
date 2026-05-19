# MOD09 pending visits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la bandeja de visitas pendientes de MOD09 como inbox operativo WFM con `VisitRequest`, integraciones CRM/Assurance/manual, portal `pending-visits`, agendamiento transaccional e idempotente, y cobertura focalizada.

**Architecture:** El cambio agrega un nuevo aggregate owner `VisitRequest` dentro de `WfmModule` y reutiliza los servicios existentes de recomendaciones, conflictos, agenda y Work Orders para no duplicar lógica. Assurance sigue originando trabajo de campo por BullMQ hacia `apps/worker`, CRM pasa a crear/abrir solicitudes WFM antes del agendamiento, y el portal mueve la decisión principal a `/dashboard/scheduling/pending-visits`.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL tenant schema, BullMQ, Next.js App Router, React, TypeScript estricto, Zod, Jest, Supertest, Playwright, pnpm, Turborepo.

---

## File structure map

### Shared contracts

- Create: `packages/shared/src/enums/wfm/visit-request-status.enum.ts` — nuevo enum de estados funcionales.
- Modify: `packages/shared/src/enums/wfm/index.ts` — exportar `VisitRequestStatus`.

### Database

- Create: `packages/database/src/entities/visit-request.entity.ts` — nueva entidad tenant-aware owner de WFM.
- Modify: `packages/database/src/entities/index.ts` — exportar `VisitRequest`.
- Create: `packages/database/src/migrations/tenant/034_create_visit_requests.ts` — migración reversible.
- Modify: `packages/database/src/migrations/tenant/runner.ts` — registrar la migración nueva.

### API WFM

- Create: `apps/api/src/modules/wfm/dto/create-visit-request.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/list-visit-requests-query.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/update-visit-request-context.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/schedule-visit-request.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/cancel-visit-request.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/reject-visit-request.dto.ts`
- Modify: `apps/api/src/modules/wfm/dto/index.ts`
- Create: `apps/api/src/modules/wfm/services/visit-requests.service.ts`
- Modify: `apps/api/src/modules/wfm/wfm.controller.ts`
- Modify: `apps/api/src/modules/wfm/wfm.module.ts`

### Assurance / worker

- Modify: `apps/api/src/modules/assurance/ports/assurance-field-service.port.ts` — enriquecer payload.
- Modify: `apps/api/src/modules/assurance/services/tickets.service.ts` — enviar snapshot operativo mínimo.
- Create: `apps/worker/src/processors/assurance-field-service.processor.ts` — materializar solicitud WFM desde job BullMQ.
- Modify: `apps/worker/src/worker.module.ts` — registrar processor.

### CRM integration

- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx` — al entrar desde expediente crear/abrir `VisitRequest`.
- Optionally modify if needed after reading current flow before coding: `apps/portal/src/components/crm/expedientes/expediente-scheduling.ts` — helpers para redirección a `pending-visits`.

### Portal pending visits

- Modify: `apps/portal/src/app/dashboard/scheduling/page.tsx` — soportar vista principal o subruta.
- Create: `apps/portal/src/app/dashboard/scheduling/pending-visits/page.tsx`
- Create: `apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx`
- Create: `apps/portal/src/components/scheduling/PendingVisitRequestInbox.tsx`
- Create: `apps/portal/src/components/scheduling/WeeklyTechnicianMatrix.tsx`
- Create: `apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.tsx`
- Create: `apps/portal/src/components/scheduling/ScheduleVisitRequestConfirmDialog.tsx`
- Modify: `apps/portal/src/components/scheduling/scheduling-ui.ts`
- Modify: `apps/portal/src/lib/api-client.ts`

### Tests

- Create: `apps/api/src/modules/wfm/tests/visit-requests.service.spec.ts`
- Create: `apps/api/src/modules/wfm/tests/visit-requests.controller.http.spec.ts`
- Modify: `apps/api/src/modules/assurance/tests/tickets.service.spec.ts`
- Create: `apps/worker/src/processors/assurance-field-service.processor.spec.ts`
- Create: `apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx`
- Create: `apps/portal/src/components/scheduling/WeeklyTechnicianMatrix.spec.tsx`
- Create: `apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.spec.tsx`
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx`
- Modify: `e2e/tests/portal-wfm-scheduling.spec.ts`

### Docs / evidence

- Modify: `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`
- Create or modify after checking current naming: `docs/quality/QUALITY-MOD09-FASE-02-v1.0.md`

---

### Task 1: Shared enum for VisitRequestStatus

**Files:**
- Create: `packages/shared/src/enums/wfm/visit-request-status.enum.ts`
- Modify: `packages/shared/src/enums/wfm/index.ts`
- Test: no archivo nuevo; validar por typecheck de paquetes consumidores

- [ ] **Step 1: Write the enum file**

```ts
export enum VisitRequestStatus {
  PENDING = 'PENDING',
  NEEDS_CONTEXT = 'NEEDS_CONTEXT',
  READY_TO_SCHEDULE = 'READY_TO_SCHEDULE',
  SCHEDULED = 'SCHEDULED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}
```

- [ ] **Step 2: Export it from the WFM enums barrel**

```ts
export * from './schedule-event-status.enum';
export * from './technician-availability-type.enum';
export * from './visit-request-status.enum';
export * from './wfm-work-type.enum';
export * from './work-order-priority.enum';
export * from './work-order-source-context.enum';
export * from './work-order-status.enum';
export * from './work-order-task-status.enum';
```

- [ ] **Step 3: Run a narrow typecheck**

Run: `pnpm --filter @iwana/shared typecheck`

Expected: `Done in` or equivalent success output with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/enums/wfm/visit-request-status.enum.ts packages/shared/src/enums/wfm/index.ts
git commit -m "feat(shared): add visit request status enum" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Tenant entity and migration for visit_requests

**Files:**
- Create: `packages/database/src/entities/visit-request.entity.ts`
- Modify: `packages/database/src/entities/index.ts`
- Create: `packages/database/src/migrations/tenant/034_create_visit_requests.ts`
- Modify: `packages/database/src/migrations/tenant/runner.ts`
- Test: migration command + database typecheck path already used in repo

- [ ] **Step 1: Write the failing entity export expectation mentally and implement the entity**

```ts
@Entity({ name: 'visit_requests' })
@Index('idx_visit_requests_tenant_status_created', ['tenantId', 'status', 'createdAt'])
export class VisitRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'enum', enum: VisitRequestStatus })
  status: VisitRequestStatus;

  @Column({ name: 'origin_context', type: 'enum', enum: WorkOrderSourceContext })
  originContext: WorkOrderSourceContext;

  @Column({ name: 'origin_ref', type: 'varchar', length: 160, nullable: true })
  originRef: string | null;

  @Column({ name: 'origin_label', type: 'varchar', length: 160, nullable: true })
  originLabel: string | null;

  @Column({ name: 'work_type', type: 'enum', enum: WfmWorkType })
  workType: WfmWorkType;

  @Column({ type: 'enum', enum: WorkOrderPriority })
  priority: WorkOrderPriority;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
```

- [ ] **Step 2: Add the remaining refs and audit columns in the same entity**

```ts
@Column({ name: 'requested_window_start_at', type: 'timestamptz', nullable: true })
requestedWindowStartAt: Date | null;

@Column({ name: 'requested_window_end_at', type: 'timestamptz', nullable: true })
requestedWindowEndAt: Date | null;

@Column({ name: 'sla_due_at', type: 'timestamptz', nullable: true })
slaDueAt: Date | null;

@Column({ type: 'varchar', length: 255, nullable: true })
address: string | null;

@DeleteDateColumn({ name: 'deleted_at' })
deletedAt: Date | null;
```

- [ ] **Step 3: Export the entity**

```ts
export * from './schedule-event.entity';
export * from './schedule-reschedule-log.entity';
export * from './technician-availability.entity';
export * from './visit-request.entity';
export * from './work-order.entity';
export * from './work-order-task.entity';
```

- [ ] **Step 4: Create the reversible tenant migration**

```ts
await queryRunner.query(`
  CREATE TABLE IF NOT EXISTS visit_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    status varchar(32) NOT NULL,
    origin_context varchar(32) NOT NULL,
    origin_ref varchar(160),
    origin_label varchar(160),
    work_type varchar(32) NOT NULL,
    priority varchar(32) NOT NULL,
    title varchar(160) NOT NULL,
    description text,
    requested_window_start_at timestamptz,
    requested_window_end_at timestamptz,
    sla_due_at timestamptz,
    address varchar(255),
    municipality varchar(120),
    sector varchar(120),
    latitude numeric(10,7),
    longitude numeric(10,7),
    expediente_id uuid,
    subscriber_id uuid,
    ticket_id varchar(160),
    contract_id uuid,
    schedule_event_id uuid,
    work_order_id uuid,
    requested_by_user_id uuid NOT NULL,
    scheduled_by_user_id uuid,
    scheduled_at timestamptz,
    cancelled_at timestamptz,
    cancelled_by_user_id uuid,
    cancel_reason varchar(200),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
  )
`);

await queryRunner.query(`
  CREATE INDEX IF NOT EXISTS idx_visit_requests_tenant_status_created
  ON visit_requests (tenant_id, status, created_at)
`);
```

And in `down()`:

```ts
await queryRunner.query('DROP TABLE IF EXISTS visit_requests CASCADE');
```

- [ ] **Step 5: Register the migration in the tenant runner**

```ts
import { CreateVisitRequests034 } from './034_create_visit_requests';

export const TENANT_MIGRATIONS = [
  CreateWfmModule030,
  AddScheduleEventSector033,
  CreateVisitRequests034,
];
```

- [ ] **Step 6: Run focused validation**

Run:

```bash
pnpm --filter @iwana/db typecheck
pnpm --filter @iwana/db migration:run
pnpm --filter @iwana/db migration:revert
```

Expected:

1. typecheck green;
2. migration applies without `relation already exists`;
3. revert drops `visit_requests` cleanly.

- [ ] **Step 7: Commit**

```bash
git add packages/database/src/entities/visit-request.entity.ts packages/database/src/entities/index.ts packages/database/src/migrations/tenant/034_create_visit_requests.ts packages/database/src/migrations/tenant/runner.ts
git commit -m "feat(db): add visit requests persistence" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: DTOs and HTTP contract for visit-requests

**Files:**
- Create: `apps/api/src/modules/wfm/dto/create-visit-request.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/list-visit-requests-query.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/update-visit-request-context.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/schedule-visit-request.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/cancel-visit-request.dto.ts`
- Create: `apps/api/src/modules/wfm/dto/reject-visit-request.dto.ts`
- Modify: `apps/api/src/modules/wfm/dto/index.ts`
- Test: `apps/api/src/modules/wfm/tests/visit-requests.controller.http.spec.ts`

- [ ] **Step 1: Add the list query DTO**

```ts
export const ListVisitRequestsQuerySchema = z.object({
  status: z.nativeEnum(VisitRequestStatus).optional(),
  originContext: z.nativeEnum(WorkOrderSourceContext).optional(),
  workType: z.nativeEnum(WfmWorkType).optional(),
  priority: z.nativeEnum(WorkOrderPriority).optional(),
  municipality: z.string().max(120).optional(),
  sector: z.string().max(120).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
```

- [ ] **Step 2: Add the create DTO with operational-only fields**

```ts
export const CreateVisitRequestSchema = z.object({
  originContext: z.nativeEnum(WorkOrderSourceContext),
  originRef: z.string().max(160).optional().nullable(),
  originLabel: z.string().max(160).optional().nullable(),
  workType: z.nativeEnum(WfmWorkType).optional(),
  priority: z.nativeEnum(WorkOrderPriority).default(WorkOrderPriority.NORMAL),
  title: z.string().min(1).max(160),
  description: z.string().max(1000).optional().nullable(),
  requestedWindowStartAt: z.string().datetime({ offset: true }).optional().nullable(),
  requestedWindowEndAt: z.string().datetime({ offset: true }).optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  municipality: z.string().max(120).optional().nullable(),
  sector: z.string().max(120).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  expedienteId: z.string().uuid().optional().nullable(),
  subscriberId: z.string().uuid().optional().nullable(),
  ticketId: z.string().max(160).optional().nullable(),
  contractId: z.string().uuid().optional().nullable(),
  slaDueAt: z.string().datetime({ offset: true }).optional().nullable(),
});
```

- [ ] **Step 3: Add update, schedule, cancel and reject DTOs**

```ts
export const UpdateVisitRequestContextSchema = CreateVisitRequestSchema.pick({
  workType: true,
  priority: true,
  description: true,
  requestedWindowStartAt: true,
  requestedWindowEndAt: true,
  address: true,
  municipality: true,
  sector: true,
  latitude: true,
  longitude: true,
  slaDueAt: true,
}).strict();

export const ScheduleVisitRequestSchema = z.object({
  assignedUserId: z.string().uuid(),
  scheduledStartAt: z.string().datetime({ offset: true }),
  scheduledEndAt: z.string().datetime({ offset: true }),
  createWorkOrder: z.boolean().default(true),
  workOrderSummary: z.string().min(1).max(200).optional(),
  workOrderNotes: z.string().max(500).optional().nullable(),
});
```

- [ ] **Step 4: Export all DTOs from the barrel**

```ts
export * from './cancel-visit-request.dto';
export * from './create-schedule-event.dto';
export * from './create-visit-request.dto';
export * from './list-schedule-events-query.dto';
export * from './list-visit-requests-query.dto';
export * from './reject-visit-request.dto';
export * from './reschedule-event.dto';
export * from './schedule-recommendation.dto';
export * from './schedule-visit-request.dto';
export * from './technician-availability.dto';
export * from './transition-schedule-event.dto';
export * from './transition-work-order.dto';
export * from './update-schedule-event.dto';
export * from './update-visit-request-context.dto';
```

- [ ] **Step 5: Write the failing HTTP spec for whitelist and role behavior**

```ts
it('should reject invalid visit request query params', async () => {
  await request(app.getHttpServer())
    .get('/api/v1/wfm/visit-requests?limit=200&status=INVALID')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(400);
});

it('should forbid technicians from listing global visit requests', async () => {
  await request(app.getHttpServer())
    .get('/api/v1/wfm/visit-requests')
    .set('Authorization', `Bearer ${technicianToken}`)
    .expect(403);
});
```

- [ ] **Step 6: Run the new HTTP spec to verify it fails**

Run:

```bash
pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/visit-requests.controller.http.spec.ts
```

Expected: FAIL because controller/service/routes do not exist yet.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/wfm/dto/*.ts apps/api/src/modules/wfm/tests/visit-requests.controller.http.spec.ts
git commit -m "test(api): define visit request contract expectations" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: VisitRequestsService core with TDD

**Files:**
- Create: `apps/api/src/modules/wfm/services/visit-requests.service.ts`
- Create: `apps/api/src/modules/wfm/tests/visit-requests.service.spec.ts`
- Test: `apps/api/src/modules/wfm/tests/visit-requests.service.spec.ts`

- [ ] **Step 1: Write the first failing service tests for status derivation and duplicate protection**

```ts
it('should create NEEDS_CONTEXT when required location data is missing', async () => {
  const result = await service.create(
    {
      originContext: WorkOrderSourceContext.ASSURANCE,
      originRef: 'TCK-001',
      title: 'Visita tecnica',
      priority: WorkOrderPriority.NORMAL,
    },
    actor,
  );

  expect(result.status).toBe(VisitRequestStatus.NEEDS_CONTEXT);
});

it('should reject duplicate active requests for same origin and work type', async () => {
  await service.create(validCrmRequest(), actor);

  await expect(service.create(validCrmRequest(), actor)).rejects.toThrow(
    'Ya existe una solicitud activa para este origen',
  );
});
```

- [ ] **Step 2: Add failing tests for schedule idempotency and recommendation preconditions**

```ts
it('should reject recommendations when request is not ready to schedule', async () => {
  await expect(
    service.recommendSchedule(needsContextId, { durationMinutes: 120 }, actor),
  ).rejects.toThrow('La solicitud aun no tiene contexto suficiente');
});

it('should return existing scheduled payload on repeated schedule call', async () => {
  const first = await service.scheduleVisitRequest(readyId, validScheduleInput(), actor);
  const second = await service.scheduleVisitRequest(readyId, validScheduleInput(), actor);

  expect(second.scheduleEvent.id).toBe(first.scheduleEvent.id);
  expect(second.workOrder?.id).toBe(first.workOrder?.id);
});
```

- [ ] **Step 3: Run the service spec to verify it fails**

Run:

```bash
pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/visit-requests.service.spec.ts
```

Expected: FAIL with missing service/class and unmet expectations.

- [ ] **Step 4: Implement minimal service structure and constants**

```ts
const TERMINAL_VISIT_REQUEST_STATUSES = new Set<VisitRequestStatus>([
  VisitRequestStatus.SCHEDULED,
  VisitRequestStatus.CANCELLED,
  VisitRequestStatus.REJECTED,
  VisitRequestStatus.EXPIRED,
]);

const GLOBAL_MANAGE_ROLES = new Set<UserRole>([UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT]);

@Injectable()
export class VisitRequestsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly recommendationsService: ScheduleRecommendationsService,
    private readonly scheduleEventsService: ScheduleEventsService,
    private readonly workOrdersService: WorkOrdersService,
    private readonly conflictService: ScheduleConflictService,
  ) {}
}
```

- [ ] **Step 5: Implement `create()` with status derivation**

```ts
private deriveInitialStatus(input: CreateVisitRequestInput): VisitRequestStatus {
  const hasWorkType = Boolean(input.workType);
  const hasWindow =
    Boolean(input.requestedWindowStartAt) &&
    Boolean(input.requestedWindowEndAt) &&
    new Date(input.requestedWindowEndAt!).getTime() > new Date(input.requestedWindowStartAt!).getTime();
  const hasLocation = Boolean(input.address || input.municipality || input.sector);

  if (hasWorkType && hasWindow && hasLocation) {
    return VisitRequestStatus.READY_TO_SCHEDULE;
  }

  return VisitRequestStatus.NEEDS_CONTEXT;
}
```

- [ ] **Step 6: Implement duplicate protection and list/detail access**

```ts
const duplicate = await qr.manager.findOne(VisitRequest, {
  where: {
    tenantId,
    originContext: validated.originContext,
    originRef: validated.originRef ?? null,
    workType: validated.workType ?? WfmWorkType.TECHNICAL_VISIT,
  },
  order: { createdAt: 'DESC' },
});

if (duplicate && !TERMINAL_VISIT_REQUEST_STATUSES.has(duplicate.status)) {
  throw new BadRequestException('Ya existe una solicitud activa para este origen');
}
```

- [ ] **Step 7: Implement `recommendSchedule()` by reusing the recommendation service**

```ts
return this.recommendationsService.recommend({
  candidateUserIds: overrides.candidateUserIds ?? actorCandidateUserIds,
  durationMinutes: overrides.durationMinutes ?? 120,
  windowStartAt: overrides.windowStartAt ?? request.requestedWindowStartAt!.toISOString(),
  windowEndAt: overrides.windowEndAt ?? request.requestedWindowEndAt!.toISOString(),
  municipality: request.municipality ?? undefined,
  sector: request.sector ?? undefined,
  latitude: request.latitude ? Number(request.latitude) : undefined,
  longitude: request.longitude ? Number(request.longitude) : undefined,
  maxResults: overrides.maxResults ?? 8,
});
```

- [ ] **Step 8: Implement `scheduleVisitRequest()` with tenant transaction**

```ts
return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
  const request = await qr.manager.findOneByOrFail(VisitRequest, { id, tenantId });

  if (request.status === VisitRequestStatus.SCHEDULED && request.scheduleEventId) {
    const scheduleEvent = await qr.manager.findOneByOrFail(ScheduleEvent, {
      id: request.scheduleEventId,
      tenantId,
    });
    const workOrder = request.workOrderId
      ? await qr.manager.findOneBy(WorkOrder, { id: request.workOrderId, tenantId })
      : null;

    return { visitRequest: request, scheduleEvent, workOrder };
  }

  if (request.status !== VisitRequestStatus.READY_TO_SCHEDULE) {
    throw new BadRequestException('Solo las solicitudes READY_TO_SCHEDULE pueden agendarse');
  }
});
```

- [ ] **Step 9: Run the service spec to verify it passes**

Run:

```bash
pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/visit-requests.service.spec.ts
```

Expected: PASS with the new suite green.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/wfm/services/visit-requests.service.ts apps/api/src/modules/wfm/tests/visit-requests.service.spec.ts
git commit -m "feat(api): add visit request service orchestration" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Wire controller and module routes for visit-requests

**Files:**
- Modify: `apps/api/src/modules/wfm/wfm.controller.ts`
- Modify: `apps/api/src/modules/wfm/wfm.module.ts`
- Test: `apps/api/src/modules/wfm/tests/visit-requests.controller.http.spec.ts`

- [ ] **Step 1: Inject the new service into the module**

```ts
import { VisitRequest } from '@iwana/db';
import { VisitRequestsService } from './services/visit-requests.service';

TypeOrmModule.forFeature([
  ScheduleEvent,
  WorkOrder,
  WorkOrderTask,
  ScheduleRescheduleLog,
  TechnicianAvailability,
  VisitRequest,
]),
```

- [ ] **Step 2: Add visit-request routes before unrelated parameterized routes**

```ts
@Get('visit-requests')
@Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
listVisitRequests(@Query() query: ListVisitRequestsQueryDto, @CurrentUser() actor: JwtPayload) {
  return this.visitRequestsService.list(query, actor);
}

@Post('visit-requests')
@Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.SALES)
createVisitRequest(@Body() dto: CreateVisitRequestDto, @CurrentUser() actor: JwtPayload) {
  return this.visitRequestsService.create(dto, actor);
}
```

- [ ] **Step 3: Add detail, update-context, recommendations, schedule, cancel and reject routes**

```ts
@Post('visit-requests/:id/schedule')
@Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
scheduleVisitRequest(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: ScheduleVisitRequestDto,
  @CurrentUser() actor: JwtPayload,
) {
  return this.visitRequestsService.scheduleVisitRequest(id, dto, actor);
}
```

- [ ] **Step 4: Run the HTTP spec and make it pass**

Run:

```bash
pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/visit-requests.controller.http.spec.ts
```

Expected: PASS for role, validation and route contract checks.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/wfm/wfm.controller.ts apps/api/src/modules/wfm/wfm.module.ts
git commit -m "feat(api): expose visit request endpoints" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Assurance queue payload and worker materialization

**Files:**
- Modify: `apps/api/src/modules/assurance/ports/assurance-field-service.port.ts`
- Modify: `apps/api/src/modules/assurance/services/tickets.service.ts`
- Create: `apps/worker/src/processors/assurance-field-service.processor.ts`
- Create: `apps/worker/src/processors/assurance-field-service.processor.spec.ts`
- Modify: `apps/worker/src/worker.module.ts`
- Test: `apps/api/src/modules/assurance/tests/tickets.service.spec.ts`, `apps/worker/src/processors/assurance-field-service.processor.spec.ts`

- [ ] **Step 1: Expand the queue payload contract**

```ts
export interface FieldServiceRequest {
  ticketId: string;
  tenantId: string;
  priority: string;
  subject: string;
  requestedByUserId: string;
  notes: string | null;
  workType?: WfmWorkType;
  address?: string | null;
  municipality?: string | null;
  sector?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}
```

- [ ] **Step 2: Write the failing assurance service test**

```ts
it('should publish field service request with operational snapshot', async () => {
  await service.requestFieldService(
    'ticket-002',
    {
      notes: 'Revisar nodo de acceso',
      municipality: 'Tunja',
      sector: 'Centro',
      workType: WfmWorkType.TECHNICAL_VISIT,
    },
    actor,
  );

  expect(fieldServicePort.requestFieldService).toHaveBeenCalledWith(
    expect.objectContaining({
      ticketId: 'ticket-002',
      municipality: 'Tunja',
      sector: 'Centro',
      workType: WfmWorkType.TECHNICAL_VISIT,
    }),
  );
});
```

- [ ] **Step 3: Implement the payload mapping in `TicketsService.requestFieldService()`**

```ts
await this.fieldServicePort.requestFieldService({
  ticketId: id,
  tenantId,
  priority: ticket.priority,
  subject: ticket.subject,
  requestedByUserId: actor.sub,
  notes: validated.notes ?? null,
  workType: validated.workType ?? WfmWorkType.TECHNICAL_VISIT,
  address: validated.address ?? null,
  municipality: validated.municipality ?? null,
  sector: validated.sector ?? null,
  latitude: validated.latitude ?? null,
  longitude: validated.longitude ?? null,
});
```

- [ ] **Step 4: Write the failing worker processor test**

```ts
it('should create a NEEDS_CONTEXT visit request when address data is missing', async () => {
  await processor.handle({
    data: {
      tenantId: TENANT_ID,
      ticketId: 'ticket-002',
      priority: 'NORMAL',
      subject: 'Visita tecnica',
      requestedByUserId: USER_ID,
      notes: 'Sin coordenadas',
    },
  } as Job<FieldServiceRequest>);

  expect(wfmApi.createVisitRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      originContext: WorkOrderSourceContext.ASSURANCE,
      ticketId: 'ticket-002',
    }),
  );
});
```

- [ ] **Step 5: Implement the worker processor**

```ts
@Processor(ASSURANCE_FIELD_SERVICE_QUEUE)
export class AssuranceFieldServiceProcessor extends WorkerHost {
  constructor(private readonly httpService: HttpService) {
    super();
  }

  async process(job: Job<FieldServiceRequest>) {
    await this.httpService.post('/api/v1/wfm/visit-requests', {
      originContext: WorkOrderSourceContext.ASSURANCE,
      originRef: job.data.ticketId,
      originLabel: `Ticket ${job.data.ticketId}`,
      workType: job.data.workType ?? WfmWorkType.TECHNICAL_VISIT,
      priority: job.data.priority,
      title: job.data.subject,
      description: job.data.notes,
      address: job.data.address ?? null,
      municipality: job.data.municipality ?? null,
      sector: job.data.sector ?? null,
      latitude: job.data.latitude ?? null,
      longitude: job.data.longitude ?? null,
      ticketId: job.data.ticketId,
    });
  }
}
```

Add the same request metadata pattern the worker already uses for tenant-aware outbound calls:

```ts
await this.httpService.post(
  '/api/v1/wfm/visit-requests',
  payload,
  {
    headers: {
      'x-tenant-id': job.data.tenantId,
      'x-system-source': 'assurance-field-service-worker',
    },
  },
);
```

- [ ] **Step 6: Register the processor in `worker.module.ts`**

```ts
providers: [
  SchedulerService,
  RefreshTokenPurgeProcessor,
  TenantProvisioningProcessor,
  TenantSchemaPurgeProcessor,
  SearchIndexWorkerService,
  AssuranceFieldServiceProcessor,
]
```

- [ ] **Step 7: Run the focused specs**

Run:

```bash
pnpm --filter @iwana/api test -- --runInBand src/modules/assurance/tests/tickets.service.spec.ts
pnpm --filter @iwana/worker test -- --runInBand src/processors/assurance-field-service.processor.spec.ts
```

Expected: PASS for both suites.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/assurance/ports/assurance-field-service.port.ts apps/api/src/modules/assurance/services/tickets.service.ts apps/api/src/modules/assurance/tests/tickets.service.spec.ts apps/worker/src/processors/assurance-field-service.processor.ts apps/worker/src/processors/assurance-field-service.processor.spec.ts apps/worker/src/worker.module.ts
git commit -m "feat(assurance): materialize field service requests in wfm" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: Portal API client and pending-visits route shell

**Files:**
- Modify: `apps/portal/src/lib/api-client.ts`
- Create: `apps/portal/src/app/dashboard/scheduling/pending-visits/page.tsx`
- Modify: `apps/portal/src/app/dashboard/scheduling/page.tsx`
- Modify: `apps/portal/src/components/scheduling/scheduling-ui.ts`
- Test: `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx`

- [ ] **Step 1: Add visit-request types and client methods**

```ts
export interface WfmVisitRequest {
  id: string;
  status: VisitRequestStatus;
  originContext: WorkOrderSourceContext;
  originRef: string | null;
  originLabel: string | null;
  workType: WfmWorkType | null;
  priority: WorkOrderPriority;
  title: string;
  municipality: string | null;
  sector: string | null;
  scheduleEventId: string | null;
  workOrderId: string | null;
}

visitRequests: {
  list: (params?: ListWfmVisitRequestsParams, tenantSlug?: string) => { /* ... */ },
  create: (dto: CreateWfmVisitRequestDto, tenantSlug?: string) => { /* ... */ },
  get: (id: string, tenantSlug?: string) => { /* ... */ },
  updateContext: (id: string, dto: UpdateWfmVisitRequestDto, tenantSlug?: string) => { /* ... */ },
  recommend: (id: string, dto: WfmVisitRequestRecommendationDto, tenantSlug?: string) => { /* ... */ },
  schedule: (id: string, dto: ScheduleWfmVisitRequestDto, tenantSlug?: string) => { /* ... */ },
}
```

- [ ] **Step 2: Add the route page**

```tsx
import { PendingVisitRequestsView } from '@/components/scheduling/PendingVisitRequestsView';

export const metadata = {
  title: 'Visitas pendientes | Portal Empresarial',
  description: 'Bandeja operativa de solicitudes de visita pendientes por agendar.',
};

export default function PendingVisitsPage() {
  return <PendingVisitRequestsView />;
}
```

- [ ] **Step 3: Expose route-level labels and role helpers**

```ts
export function canViewPendingVisits(role?: string | null): boolean {
  return role === UserRole.ADMIN || role === UserRole.NOC || role === UserRole.SUPPORT || role === UserRole.SALES;
}

export function canManagePendingVisitsGlobally(role?: string | null): boolean {
  return role === UserRole.ADMIN || role === UserRole.NOC || role === UserRole.SUPPORT;
}
```

- [ ] **Step 4: Update the current scheduling page copy to link to the new inbox**

```tsx
export default function SchedulingPage() {
  return <SchedulingClient />;
}
```

And inside the client or page header actions, add a link/button:

```tsx
<Button asChild variant="secondary">
  <Link href="/dashboard/scheduling/pending-visits">Abrir bandeja pendiente</Link>
</Button>
```

- [ ] **Step 5: Run the existing scheduling client spec**

Run:

```bash
pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/SchedulingClient.spec.tsx
```

Expected: FAIL if new route/button changes current expectations; then update the spec.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/lib/api-client.ts apps/portal/src/app/dashboard/scheduling/pending-visits/page.tsx apps/portal/src/app/dashboard/scheduling/page.tsx apps/portal/src/components/scheduling/scheduling-ui.ts apps/portal/src/components/scheduling/SchedulingClient.spec.tsx
git commit -m "feat(portal): scaffold pending visits route and client" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: Build pending-visits portal UI

**Files:**
- Create: `apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx`
- Create: `apps/portal/src/components/scheduling/PendingVisitRequestInbox.tsx`
- Create: `apps/portal/src/components/scheduling/WeeklyTechnicianMatrix.tsx`
- Create: `apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.tsx`
- Create: `apps/portal/src/components/scheduling/ScheduleVisitRequestConfirmDialog.tsx`
- Create: `apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx`
- Create: `apps/portal/src/components/scheduling/WeeklyTechnicianMatrix.spec.tsx`
- Create: `apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.spec.tsx`

- [ ] **Step 1: Write the failing UI tests**

```tsx
it('shows a global inbox for NOC and hides it for technicians', async () => {
  render(<PendingVisitRequestsView />, { role: UserRole.NOC });
  expect(await screen.findByRole('heading', { name: /visitas pendientes/i })).toBeInTheDocument();
});

it('renders weekly matrix rows per technician with stable horizontal scroll', () => {
  render(<WeeklyTechnicianMatrix technicians={technicians} recommendations={recommendations} />);
  expect(screen.getByRole('table', { name: /matriz semanal/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the UI specs to verify they fail**

Run:

```bash
pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/PendingVisitRequestsView.spec.tsx src/components/scheduling/WeeklyTechnicianMatrix.spec.tsx src/components/scheduling/VisitRequestRecommendationPanel.spec.tsx
```

Expected: FAIL because the components do not exist yet.

- [ ] **Step 3: Implement the container view**

```tsx
export function PendingVisitRequestsView() {
  const { user } = useAuth();
  const canView = canViewPendingVisits(user?.role);
  const canManageGlobally = canManagePendingVisitsGlobally(user?.role);

  if (!canView) {
    return <PortalAlert variant="error" title="Acceso restringido" description="No tienes permisos para esta bandeja." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visitas pendientes"
        description="Prioriza, recomienda y agenda solicitudes operativas sin depender del modal."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(340px,420px)_minmax(0,1fr)_minmax(320px,360px)]">
        <PendingVisitRequestInbox />
        <WeeklyTechnicianMatrix />
        <VisitRequestRecommendationPanel />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement the inbox table with `align-middle`**

```tsx
<table className="min-w-full text-sm">
  <thead>
    <tr>
      <th className="px-3 py-2 text-left">Solicitud</th>
      <th className="px-3 py-2 text-left">Origen</th>
      <th className="px-3 py-2 text-left">Estado</th>
      <th className="px-3 py-2 text-left">Zona</th>
    </tr>
  </thead>
  <tbody>
    {rows.map((request) => (
      <tr key={request.id}>
        <td className="align-middle px-3 py-3">{request.title}</td>
        <td className="align-middle px-3 py-3">{request.originLabel ?? 'Sin referencia'}</td>
        <td className="align-middle px-3 py-3"><Badge>{request.status}</Badge></td>
        <td className="align-middle px-3 py-3">{request.municipality ?? 'Sin municipio'}</td>
      </tr>
    ))}
  </tbody>
</table>
```

For the weekly matrix body, use the same `align-middle` rule and stable horizontal scroll:

```tsx
<div className="overflow-x-auto">
  <table className="min-w-[1200px] text-sm" aria-label="Matriz semanal">
    <tbody>
      {technicians.map((technician) => (
        <tr key={technician.id}>
          <th className="sticky left-0 z-10 align-middle bg-white px-3 py-3 text-left">
            {technician.firstName} {technician.lastName}
          </th>
          {slots.map((slot) => (
            <td key={`${technician.id}-${slot.key}`} className="align-middle px-2 py-2">
              {renderSlotCell(technician.id, slot)}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

- [ ] **Step 5: Implement the recommendation panel and confirm dialog**

```tsx
<Card>
  <CardContent className="space-y-4 p-5">
    <h2 className="text-base font-semibold">Recomendaciones</h2>
    {recommendations.length === 0 ? (
      <PortalEmptyState title="Sin recomendaciones" description="Completa contexto o ajusta la ventana solicitada." />
    ) : (
      recommendations.map((item) => (
        <button key={`${item.technicianId}-${item.scheduledStartAt}`} onClick={() => onSelect(item)}>
          <span>{item.labels.join(' · ')}</span>
        </button>
      ))
    )}
  </CardContent>
</Card>
```

- [ ] **Step 6: Run the UI specs to make them pass**

Run:

```bash
pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/PendingVisitRequestsView.spec.tsx src/components/scheduling/WeeklyTechnicianMatrix.spec.tsx src/components/scheduling/VisitRequestRecommendationPanel.spec.tsx
pnpm --filter @iwana/portal typecheck
```

Expected: PASS for the new specs and typecheck green.

- [ ] **Step 7: Commit**

```bash
git add apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx apps/portal/src/components/scheduling/PendingVisitRequestInbox.tsx apps/portal/src/components/scheduling/WeeklyTechnicianMatrix.tsx apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.tsx apps/portal/src/components/scheduling/ScheduleVisitRequestConfirmDialog.tsx apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx apps/portal/src/components/scheduling/WeeklyTechnicianMatrix.spec.tsx apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.spec.tsx
git commit -m "feat(portal): add pending visits scheduling workspace" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: CRM entry flow and schedule confirmation

**Files:**
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx`
- Modify if needed: `apps/portal/src/components/crm/expedientes/expediente-scheduling.ts`
- Test: `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx`

- [ ] **Step 1: Write the failing client test for expediente entry**

```tsx
it('creates or reuses a visit request before opening scheduling confirmation from CRM', async () => {
  mockSearchParams('?open=create&type=INSTALLATION&expedienteId=550e8400-e29b-41d4-a716-446655440000');
  wfmApi.visitRequests.list = jest.fn().mockResolvedValue({ data: [] });
  wfmApi.visitRequests.create = jest.fn().mockResolvedValue({ data: { id: 'vr-1', status: 'READY_TO_SCHEDULE' } });

  render(<SchedulingClient />);

  await waitFor(() => {
    expect(wfmApi.visitRequests.create).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Update `hydrateCreateFromExpediente()` to use visit-requests first**

```ts
const existing = await wfmApi.visitRequests.list({
  originContext: WorkOrderSourceContext.CRM,
  workType: WfmWorkType.INSTALLATION,
});

const reusable = existing.data.find((item) => item.originRef === expedienteId && item.status !== VisitRequestStatus.SCHEDULED);

const visitRequest =
  reusable ??
  (
    await wfmApi.visitRequests.create({
      originContext: WorkOrderSourceContext.CRM,
      originRef: response.data.id,
      originLabel: `Oportunidad ${formatSchedulingExpedienteLabel(response.data.id)}`,
      workType: WfmWorkType.INSTALLATION,
      priority: WorkOrderPriority.NORMAL,
      title: 'Instalación de servicio',
      address: response.data.address ?? null,
      municipality: response.data.municipality ?? null,
      sector: response.data.neighborhood ?? null,
      expedienteId: response.data.id,
      subscriberId: response.data.subscriberId ?? null,
    })
  ).data;
```

- [ ] **Step 3: Reuse the new confirmation dialog when recommendation is chosen**

```tsx
<ScheduleVisitRequestConfirmDialog
  open={isConfirmOpen}
  visitRequest={selectedVisitRequest}
  recommendation={selectedRecommendation}
  onConfirm={handleConfirmScheduleVisitRequest}
/>
```

- [ ] **Step 4: Run the scheduling client spec**

Run:

```bash
pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/SchedulingClient.spec.tsx
```

Expected: PASS with the CRM entry flow updated.

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/components/scheduling/SchedulingClient.tsx apps/portal/src/components/crm/expedientes/expediente-scheduling.ts apps/portal/src/components/scheduling/SchedulingClient.spec.tsx
git commit -m "feat(portal): route crm scheduling through visit requests" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 10: End-to-end verification and documentation

**Files:**
- Modify: `e2e/tests/portal-wfm-scheduling.spec.ts`
- Modify: `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`
- Modify or Create: `docs/quality/QUALITY-MOD09-FASE-02-v1.0.md`

- [ ] **Step 1: Add the failing E2E flows**

```ts
test('admin agenda una solicitud CRM desde pending-visits', async ({ page }) => {
  await page.goto('/dashboard/scheduling/pending-visits');
  await expect(page.getByRole('heading', { name: /visitas pendientes/i })).toBeVisible();
  await page.getByRole('button', { name: /recomendar/i }).click();
  await page.getByRole('button', { name: /confirmar agenda/i }).click();
  await expect(page.getByText(/solicitud agendada/i)).toBeVisible();
});

test('tecnico no accede a la bandeja global', async ({ page }) => {
  await loginAsTechnician(page);
  await page.goto('/dashboard/scheduling/pending-visits');
  await expect(page.getByText(/acceso restringido/i)).toBeVisible();
});
```

- [ ] **Step 2: Run the E2E file and verify it fails first**

Run:

```bash
pnpm test:e2e:portal -- portal-wfm-scheduling.spec.ts
```

Expected: FAIL until the pending-visits route and mocks are updated.

- [ ] **Step 3: Update the report and quality evidence with exact commands**

```md
- Se agregó `VisitRequest` como nueva entidad owner de WFM.
- Assurance materializa solicitudes vía BullMQ en `apps/worker`.
- El portal incorpora `/dashboard/scheduling/pending-visits` como nueva superficie principal.

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/visit-requests.service.spec.ts src/modules/wfm/tests/visit-requests.controller.http.spec.ts` | Verde |
| `pnpm --filter @iwana/worker test -- --runInBand src/processors/assurance-field-service.processor.spec.ts` | Verde |
| `pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/PendingVisitRequestsView.spec.tsx src/components/scheduling/WeeklyTechnicianMatrix.spec.tsx src/components/scheduling/VisitRequestRecommendationPanel.spec.tsx src/components/scheduling/SchedulingClient.spec.tsx` | Verde |
| `pnpm test:e2e:portal -- portal-wfm-scheduling.spec.ts` | Verde |
```

- [ ] **Step 4: Run final focused verification**

Run:

```bash
pnpm --filter @iwana/api typecheck
pnpm --filter @iwana/db typecheck
pnpm --filter @iwana/worker typecheck
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/visit-requests.service.spec.ts src/modules/wfm/tests/visit-requests.controller.http.spec.ts
pnpm --filter @iwana/worker test -- --runInBand src/processors/assurance-field-service.processor.spec.ts
pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/PendingVisitRequestsView.spec.tsx src/components/scheduling/WeeklyTechnicianMatrix.spec.tsx src/components/scheduling/VisitRequestRecommendationPanel.spec.tsx src/components/scheduling/SchedulingClient.spec.tsx
pnpm test:e2e:portal -- portal-wfm-scheduling.spec.ts
```

Expected: all commands green; if any command fails, fix before closing.

- [ ] **Step 5: Commit**

```bash
git add e2e/tests/portal-wfm-scheduling.spec.ts docs/informes/INFORME-MOD09-FASE-02-v1.0.md docs/quality/QUALITY-MOD09-FASE-02-v1.0.md
git commit -m "test(mod09): validate pending visits workflows" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Self-review

### Spec coverage

- `VisitRequest` owner en WFM: cubierto por Tasks 1, 2, 4 y 5.
- Integración CRM / Assurance / manual: cubierto por Tasks 6 y 9; manual entra por API/UI de Tasks 3, 4, 7 y 8.
- BullMQ en worker para Assurance: cubierto por Task 6.
- Portal `pending-visits` con inbox, matriz y recomendaciones: cubierto por Tasks 7 y 8.
- Roles: cubierto por Tasks 3, 5, 7, 8 y 10.
- OpenAPI / docs / informe: cubierto por Tasks 3, 5 y 10.

### Placeholder scan

- No se dejaron `TODO`, `TBD` ni referencias circulares entre tareas.
- Cada tarea incluye archivos, cambios concretos, comandos y commits.

### Type consistency

- Se usa `VisitRequestStatus`, `VisitRequestsService`, `visit-requests` y `pending-visits` de forma consistente en todo el plan.
- El payload de Assurance y los tipos de portal usan el mismo concepto `VisitRequest`.
