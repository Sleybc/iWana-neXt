# MOD11 Ejecucion Operativa / Tareas Fase 01 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el MVP de `TasksModule` para crear, asignar, reasignar, vincular y cerrar tareas operativas con responsable y destinatario explícitos, manteniendo boundaries limpios con MOD10 y MOD09.

**Architecture:** La implementación crea un nuevo bounded context `TasksModule` en backend con entidades tenant-aware propias (`OperationalTask`, `TaskTimelineEvent`, `TaskAssignmentHistory`), contratos REST bajo `/api/v1/tasks` y una UI nueva en portal visible como `Operaciones`. MOD11 no leerá tablas de MOD10 ni MOD09; solo almacenará referencias lógicas (`ticketId`, `scheduleEventId`, `workOrderId`) y mantendrá el ownership del trabajo ejecutable, dejando tickets en MOD10 y agenda/OT en MOD09.

**Tech Stack:** NestJS, Next.js App Router, TypeScript estricto, Zod, TypeORM, PostgreSQL multi-tenant por schema, Jest, Playwright, pnpm.

---

## Source documents

- `docs/specs/2026-06-22-mod11-operaciones-tareas-design.md`
- `docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md`
- `docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md`
- `docs/adrs/ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md`
- `docs/prds/PRD-MOD10-SERVICE-ASSURANCE-v1.0.md`
- `docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md`
- `docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md`
- `docs/adrs/ADR-038-Bounded-Context-Service-Assurance.md`

## File map

### Shared contracts

- Create: `packages/shared/src/enums/tasks/task-type.enum.ts`
- Create: `packages/shared/src/enums/tasks/task-status.enum.ts`
- Create: `packages/shared/src/enums/tasks/task-priority.enum.ts`
- Create: `packages/shared/src/enums/tasks/task-origin-context.enum.ts`
- Create: `packages/shared/src/enums/tasks/task-recipient-type.enum.ts`
- Create: `packages/shared/src/enums/tasks/task-responsible-type.enum.ts`
- Create: `packages/shared/src/enums/tasks/task-execution-mode.enum.ts`
- Create: `packages/shared/src/enums/tasks/index.ts`
- Modify: `packages/shared/src/enums/index.ts`

### Database

- Create: `packages/database/src/entities/operational-task.entity.ts`
- Create: `packages/database/src/entities/task-timeline-event.entity.ts`
- Create: `packages/database/src/entities/task-assignment-history.entity.ts`
- Modify: `packages/database/src/entities/index.ts`
- Create: `packages/database/src/migrations/tenant/045_create_tasks_module.ts`
- Modify: `packages/database/src/migrations/tenant/runner.ts`

### API / backend

- Create: `apps/api/src/modules/tasks/tasks.module.ts`
- Create: `apps/api/src/modules/tasks/tasks.controller.ts`
- Create: `apps/api/src/modules/tasks/dto/create-task.dto.ts`
- Create: `apps/api/src/modules/tasks/dto/update-task.dto.ts`
- Create: `apps/api/src/modules/tasks/dto/list-task-query.dto.ts`
- Create: `apps/api/src/modules/tasks/dto/assign-task.dto.ts`
- Create: `apps/api/src/modules/tasks/dto/transition-task.dto.ts`
- Create: `apps/api/src/modules/tasks/dto/link-schedule-event.dto.ts`
- Create: `apps/api/src/modules/tasks/dto/link-work-order.dto.ts`
- Create: `apps/api/src/modules/tasks/dto/index.ts`
- Create: `apps/api/src/modules/tasks/services/tasks.service.ts`
- Create: `apps/api/src/modules/tasks/services/task-timeline.service.ts`
- Create: `apps/api/src/modules/tasks/services/task-assignment.service.ts`
- Create: `apps/api/src/modules/tasks/tests/tasks.service.spec.ts`
- Create: `apps/api/src/modules/tasks/tests/task-assignment.service.spec.ts`
- Create: `apps/api/src/modules/tasks/tests/tasks.controller.http.spec.ts`
- Modify: `apps/api/src/app.module.ts`

### Portal / frontend

- Modify: `apps/portal/src/lib/api-client.ts`
- Create: `apps/portal/src/app/dashboard/operations/page.tsx`
- Create: `apps/portal/src/components/operations/operations-labels.ts`
- Create: `apps/portal/src/components/operations/OperationsClient.tsx`
- Create: `apps/portal/src/components/operations/TasksToolbar.tsx`
- Create: `apps/portal/src/components/operations/TasksTable.tsx`
- Create: `apps/portal/src/components/operations/TaskForm.tsx`
- Create: `apps/portal/src/components/operations/TaskDetailDrawer.tsx`
- Create: `apps/portal/src/components/operations/TaskTimeline.tsx`
- Create: `apps/portal/src/components/operations/TaskAssignmentHistory.tsx`
- Create: `apps/portal/src/components/operations/operations-labels.spec.ts`
- Create: `apps/portal/src/components/operations/TaskForm.spec.tsx`
- Create: `apps/portal/src/components/operations/OperationsClient.spec.tsx`
- Modify: `apps/portal/src/components/layout/Sidebar.tsx`

### Documentation

- Modify: `docs/informes/INFORME-MOD11-EJECUCION-OPERATIVA-DEFINICION-v1.0.md`
- Create: `docs/informes/INFORME-MOD11-EJECUCION-OPERATIVA-FASE-01-v1.0.md`
- Create: `docs/quality/CHECKLIST-MOD11-EJECUCION-OPERATIVA-FASE-01-v1.0.md`

---

### Task 1: Crear contratos compartidos y persistencia tenant-aware

**Files:**
- Create: `packages/shared/src/enums/tasks/*.ts`
- Modify: `packages/shared/src/enums/index.ts`
- Create: `packages/database/src/entities/operational-task.entity.ts`
- Create: `packages/database/src/entities/task-timeline-event.entity.ts`
- Create: `packages/database/src/entities/task-assignment-history.entity.ts`
- Modify: `packages/database/src/entities/index.ts`
- Create: `packages/database/src/migrations/tenant/045_create_tasks_module.ts`
- Modify: `packages/database/src/migrations/tenant/runner.ts`
- Test: `apps/api/src/modules/tasks/tests/tasks.service.spec.ts`

- [ ] **Step 1: Escribir la prueba roja del servicio de creación**

```ts
import { TaskExecutionMode, TaskOriginContext, TaskPriority, TaskRecipientType, TaskResponsibleType, TaskStatus, TaskType } from '@iwana/shared';

it('creates an operational task with explicit responsible and recipient', async () => {
  manager.findOne = jest.fn().mockResolvedValue(null);
  manager.create = jest.fn((_entity, payload) => payload);
  manager.save = jest.fn().mockImplementation(async (_entity, payload) => ({
    id: 'task-001',
    tenantId: 'tenant-001',
    taskNumber: 'TSK-20260622-001',
    createdAt: new Date('2026-06-22T14:00:00.000Z'),
    updatedAt: new Date('2026-06-22T14:00:00.000Z'),
    ...payload,
  }));

  const result = await service.create(
    {
      type: TaskType.INTERNAL_OPERATION,
      priority: TaskPriority.NORMAL,
      title: 'Validar equipo retirado',
      description: 'Revisar devolución en bodega central',
      originContext: TaskOriginContext.MANUAL,
      responsibleType: TaskResponsibleType.USER,
      responsibleRefId: 'user-123',
      recipientType: TaskRecipientType.INTERNAL_AREA,
      recipientRefId: 'operations-area',
      recipientLabel: 'Operaciones',
      executionMode: TaskExecutionMode.IMMEDIATE,
      scheduledRequired: false,
    },
    actor,
  );

  expect(result.status).toBe(TaskStatus.OPEN);
  expect(result.responsibleRefId).toBe('user-123');
  expect(result.recipientType).toBe(TaskRecipientType.INTERNAL_AREA);
});
```

- [ ] **Step 2: Ejecutar la prueba para verificar que falla**

Run: `pnpm --filter @iwana/api test -- --runInBand src/modules/tasks/tests/tasks.service.spec.ts`  
Expected: FAIL con errores como `Cannot find module '@iwana/shared' enums/tasks` o `TasksService is not defined`.

- [ ] **Step 3: Crear enums, entidades y migración mínima**

```ts
// packages/shared/src/enums/tasks/task-type.enum.ts
export enum TaskType {
  CUSTOMER_SUPPORT = 'CUSTOMER_SUPPORT',
  INTERNAL_OPERATION = 'INTERNAL_OPERATION',
  INSTALLATION = 'INSTALLATION',
  FIELD_VISIT = 'FIELD_VISIT',
  BACKOFFICE = 'BACKOFFICE',
  COLLECTION = 'COLLECTION',
  REVIEW = 'REVIEW',
}
```

```ts
// packages/shared/src/enums/tasks/task-status.enum.ts
export enum TaskStatus {
  OPEN = 'OPEN',
  READY = 'READY',
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING_EXTERNAL = 'PENDING_EXTERNAL',
  PENDING_INTERNAL = 'PENDING_INTERNAL',
  BLOCKED = 'BLOCKED',
  RESOLVED = 'RESOLVED',
  CANCELLED = 'CANCELLED',
}
```

```ts
// packages/database/src/entities/operational-task.entity.ts
@Index('uq_operational_tasks_tenant_number', ['tenantId', 'taskNumber'], { unique: true })
@Index('idx_operational_tasks_tenant_status', ['tenantId', 'status'])
@Index('idx_operational_tasks_tenant_responsible', ['tenantId', 'responsibleRefId'])
@Entity({ name: 'operational_tasks' })
export class OperationalTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'task_number', type: 'varchar', length: 30 })
  taskNumber: string;

  @Column({ type: 'enum', enum: TaskType })
  type: TaskType;

  @Column({ type: 'enum', enum: TaskStatus, default: TaskStatus.OPEN })
  status: TaskStatus;

  @Column({ type: 'enum', enum: TaskPriority, default: TaskPriority.NORMAL })
  priority: TaskPriority;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'origin_context', type: 'enum', enum: TaskOriginContext })
  originContext: TaskOriginContext;

  @Column({ name: 'origin_ref_id', type: 'varchar', length: 160, nullable: true })
  originRefId: string | null;

  @Column({ name: 'ticket_id', type: 'varchar', length: 160, nullable: true })
  ticketId: string | null;

  @Column({ name: 'responsible_type', type: 'enum', enum: TaskResponsibleType })
  responsibleType: TaskResponsibleType;

  @Column({ name: 'responsible_ref_id', type: 'varchar', length: 160 })
  responsibleRefId: string;

  @Column({ name: 'recipient_type', type: 'enum', enum: TaskRecipientType })
  recipientType: TaskRecipientType;

  @Column({ name: 'recipient_ref_id', type: 'varchar', length: 160, nullable: true })
  recipientRefId: string | null;

  @Column({ name: 'recipient_label', type: 'varchar', length: 160, nullable: true })
  recipientLabel: string | null;

  @Column({ name: 'execution_mode', type: 'enum', enum: TaskExecutionMode })
  executionMode: TaskExecutionMode;

  @Column({ name: 'scheduled_required', type: 'boolean', default: false })
  scheduledRequired: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
```

```ts
// packages/database/src/migrations/tenant/045_create_tasks_module.ts
export class CreateTasksModule0450000000000 implements MigrationInterface {
  name = 'CreateTasksModule0450000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."task_status_enum" AS ENUM (
        'OPEN','READY','SCHEDULED','IN_PROGRESS','PENDING_EXTERNAL','PENDING_INTERNAL','BLOCKED','RESOLVED','CANCELLED'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "operational_tasks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "task_number" character varying(30) NOT NULL,
        "type" character varying(64) NOT NULL,
        "status" "public"."task_status_enum" NOT NULL DEFAULT 'OPEN',
        "priority" character varying(32) NOT NULL,
        "title" character varying(200) NOT NULL,
        "description" text,
        "origin_context" character varying(64) NOT NULL,
        "origin_ref_id" character varying(160),
        "ticket_id" character varying(160),
        "responsible_type" character varying(32) NOT NULL,
        "responsible_ref_id" character varying(160) NOT NULL,
        "recipient_type" character varying(32) NOT NULL,
        "recipient_ref_id" character varying(160),
        "recipient_label" character varying(160),
        "execution_mode" character varying(32) NOT NULL,
        "scheduled_required" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_operational_tasks_id" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "operational_tasks"`);
    await queryRunner.query(`DROP TYPE "public"."task_status_enum"`);
  }
}
```

- [ ] **Step 4: Re-ejecutar la prueba roja y ajustar exports**

Run: `pnpm --filter @iwana/api test -- --runInBand src/modules/tasks/tests/tasks.service.spec.ts`  
Expected: sigue FALLANDO, pero ahora por ausencia de `TasksService` o de DTOs, no por enums/entidades faltantes.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/enums/tasks packages/shared/src/enums/index.ts \
  packages/database/src/entities/operational-task.entity.ts \
  packages/database/src/entities/task-timeline-event.entity.ts \
  packages/database/src/entities/task-assignment-history.entity.ts \
  packages/database/src/entities/index.ts \
  packages/database/src/migrations/tenant/045_create_tasks_module.ts \
  packages/database/src/migrations/tenant/runner.ts \
  apps/api/src/modules/tasks/tests/tasks.service.spec.ts
git commit -m "feat: add tasks shared contracts and tenant persistence scaffold"
```

---

### Task 2: Implementar backend REST de tareas con timeline y ownership

**Files:**
- Create: `apps/api/src/modules/tasks/tasks.module.ts`
- Create: `apps/api/src/modules/tasks/tasks.controller.ts`
- Create: `apps/api/src/modules/tasks/dto/*.ts`
- Create: `apps/api/src/modules/tasks/services/tasks.service.ts`
- Create: `apps/api/src/modules/tasks/services/task-timeline.service.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/modules/tasks/tests/tasks.service.spec.ts`
- Test: `apps/api/src/modules/tasks/tests/tasks.controller.http.spec.ts`

- [ ] **Step 1: Escribir la prueba HTTP roja del create/list**

```ts
it('creates and lists operational tasks for SUPPORT', async () => {
  await request(app.getHttpServer())
    .post('/api/v1/tasks/tasks')
    .set('Authorization', 'Bearer support-token')
    .send({
      type: 'INTERNAL_OPERATION',
      priority: 'NORMAL',
      title: 'Validar cambio de router',
      originContext: 'MANUAL',
      responsibleType: 'USER',
      responsibleRefId: 'user-123',
      recipientType: 'INTERNAL_AREA',
      recipientRefId: 'noc-area',
      recipientLabel: 'NOC',
      executionMode: 'IMMEDIATE',
      scheduledRequired: false,
    })
    .expect(201);

  const response = await request(app.getHttpServer())
    .get('/api/v1/tasks/tasks')
    .set('Authorization', 'Bearer support-token')
    .expect(200);

  expect(response.body.data).toEqual(
    expect.arrayContaining([expect.objectContaining({ title: 'Validar cambio de router' })]),
  );
});
```

- [ ] **Step 2: Ejecutar tests backend para confirmar rojo**

Run: `pnpm --filter @iwana/api test -- --runInBand src/modules/tasks/tests/tasks.service.spec.ts src/modules/tasks/tests/tasks.controller.http.spec.ts`  
Expected: FAIL porque el módulo, controller, DTOs y servicios aún no existen.

- [ ] **Step 3: Implementar DTOs, service y controller mínimos**

```ts
// apps/api/src/modules/tasks/dto/create-task.dto.ts
export const CreateTaskSchema = z.object({
  type: z.nativeEnum(TaskType),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.NORMAL),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  originContext: z.nativeEnum(TaskOriginContext),
  originRefId: z.string().trim().max(160).optional().nullable(),
  ticketId: z.string().trim().max(160).optional().nullable(),
  responsibleType: z.nativeEnum(TaskResponsibleType),
  responsibleRefId: z.string().trim().min(1).max(160),
  recipientType: z.nativeEnum(TaskRecipientType),
  recipientRefId: z.string().trim().max(160).optional().nullable(),
  recipientLabel: z.string().trim().max(160).optional().nullable(),
  executionMode: z.nativeEnum(TaskExecutionMode),
  scheduledRequired: z.boolean(),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
```

```ts
// apps/api/src/modules/tasks/services/tasks.service.ts
@Injectable()
export class TasksService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly timelineService: TaskTimelineService,
  ) {}

  async create(input: CreateTaskInput, actor: JwtPayload): Promise<OperationalTask> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreateTaskSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const taskNumber = `TSK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-001`;
      const entity = qr.manager.create(OperationalTask, {
        tenantId,
        taskNumber,
        status: TaskStatus.OPEN,
        ...validated,
      });
      const saved = await qr.manager.save(OperationalTask, entity);
      await this.timelineService.recordWithManager(qr.manager, {
        taskId: saved.id,
        tenantId,
        eventType: 'CREATED',
        payload: { status: saved.status, responsibleRefId: saved.responsibleRefId },
        actorUserId: actor.sub,
      });
      return saved;
    });
  }

  async list(query: ListTaskQueryInput, actor: JwtPayload): Promise<ListTasksResponseDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListTaskQuerySchema.parse(query);
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(OperationalTask, 'task')
        .where('task.tenant_id = :tenantId', { tenantId })
        .orderBy('task.created_at', 'DESC');
      if ([UserRole.TECHNICIAN, UserRole.CONTRACTOR].includes(actor.role as UserRole)) {
        qb.andWhere('task.responsible_ref_id = :responsibleRefId', { responsibleRefId: actor.sub });
      }
      if (validated.status) qb.andWhere('task.status = :status', { status: validated.status });
      const data = await qb.getMany();
      return { data, total: data.length, page: 1, limit: data.length || 1 };
    });
  }
}
```

```ts
// apps/api/src/modules/tasks/tasks.controller.ts
@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('tasks')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.NOC, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  list(@Query(new ZodValidationPipe(ListTaskQuerySchema)) query: ListTaskQueryDto, @CurrentUser() actor: JwtPayload) {
    return this.tasksService.list(query, actor);
  }

  @Post('tasks')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.NOC, UserRole.SALES)
  create(@Body(new ZodValidationPipe(CreateTaskSchema)) body: CreateTaskDto, @CurrentUser() actor: JwtPayload) {
    return this.tasksService.create(body, actor);
  }
}
```

- [ ] **Step 4: Re-ejecutar tests y typecheck focal**

Run: `pnpm --filter @iwana/api test -- --runInBand src/modules/tasks/tests/tasks.service.spec.ts src/modules/tasks/tests/tasks.controller.http.spec.ts`  
Expected: PASS.

Run: `pnpm --filter @iwana/api typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/tasks apps/api/src/app.module.ts
git commit -m "feat: add tasks backend create and list flows"
```

---

### Task 3: Implementar asignación, transición y vínculos lógicos con MOD10/MOD09

**Files:**
- Create: `apps/api/src/modules/tasks/services/task-assignment.service.ts`
- Modify: `apps/api/src/modules/tasks/services/tasks.service.ts`
- Modify: `apps/api/src/modules/tasks/tasks.controller.ts`
- Create: `apps/api/src/modules/tasks/dto/assign-task.dto.ts`
- Create: `apps/api/src/modules/tasks/dto/transition-task.dto.ts`
- Create: `apps/api/src/modules/tasks/dto/link-schedule-event.dto.ts`
- Create: `apps/api/src/modules/tasks/dto/link-work-order.dto.ts`
- Test: `apps/api/src/modules/tasks/tests/task-assignment.service.spec.ts`
- Test: `apps/api/src/modules/tasks/tests/tasks.controller.http.spec.ts`

- [ ] **Step 1: Escribir la prueba roja de reasignación con historial**

```ts
it('reassigns a task and stores assignment history', async () => {
  manager.findOne = jest.fn().mockResolvedValue({
    id: 'task-001',
    tenantId: 'tenant-001',
    responsibleRefId: 'user-123',
    responsibleType: TaskResponsibleType.USER,
  });
  manager.save = jest.fn().mockResolvedValue({
    id: 'history-001',
    previousResponsibleRefId: 'user-123',
    newResponsibleRefId: 'user-999',
  });

  const result = await service.assign(
    'task-001',
    {
      responsibleType: TaskResponsibleType.USER,
      responsibleRefId: 'user-999',
      reason: 'Redistribucion operativa',
    },
    actor,
  );

  expect(result.responsibleRefId).toBe('user-999');
  expect(manager.save).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      previousResponsibleRefId: 'user-123',
      newResponsibleRefId: 'user-999',
    }),
  );
});
```

- [ ] **Step 2: Escribir la prueba roja de vínculos lógicos**

```ts
it('links schedule event and work order without reading WFM tables', async () => {
  manager.findOne = jest.fn().mockResolvedValue({
    id: 'task-001',
    tenantId: 'tenant-001',
    scheduleEventId: null,
    workOrderId: null,
  });
  manager.update = jest.fn().mockResolvedValue(undefined);

  await tasksService.linkScheduleEvent(
    'task-001',
    { scheduleEventId: 'evt-001' },
    actor,
  );
  await tasksService.linkWorkOrder(
    'task-001',
    { workOrderId: 'wo-001' },
    actor,
  );

  expect(manager.update).toHaveBeenNthCalledWith(
    1,
    OperationalTask,
    { id: 'task-001', tenantId: 'tenant-001' },
    expect.objectContaining({ scheduleEventId: 'evt-001' }),
  );
  expect(manager.update).toHaveBeenNthCalledWith(
    2,
    OperationalTask,
    { id: 'task-001', tenantId: 'tenant-001' },
    expect.objectContaining({ workOrderId: 'wo-001' }),
  );
});
```

- [ ] **Step 3: Implementar asignación, transiciones y links**

```ts
// apps/api/src/modules/tasks/services/task-assignment.service.ts
@Injectable()
export class TaskAssignmentService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async assign(id: string, input: AssignTaskInput, actor: JwtPayload): Promise<OperationalTask> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = AssignTaskSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const task = await qr.manager.findOneByOrFail(OperationalTask, { id, tenantId });
      const previousResponsibleRefId = task.responsibleRefId;

      task.responsibleType = validated.responsibleType;
      task.responsibleRefId = validated.responsibleRefId;
      const saved = await qr.manager.save(OperationalTask, task);

      await qr.manager.save(
        TaskAssignmentHistory,
        qr.manager.create(TaskAssignmentHistory, {
          tenantId,
          taskId: id,
          previousResponsibleRefId,
          newResponsibleRefId: validated.responsibleRefId,
          reason: validated.reason ?? null,
          actorUserId: actor.sub,
        }),
      );

      return saved;
    });
  }
}
```

```ts
// apps/api/src/modules/tasks/services/tasks.service.ts
async transitionStatus(id: string, input: TransitionTaskInput, actor: JwtPayload) {
  const { tenantId, schemaName } = TenantContext.getOrThrow();
  const validated = TransitionTaskSchema.parse(input);
  return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
    const task = await qr.manager.findOneByOrFail(OperationalTask, { id, tenantId });
    task.status = validated.status;
    if (validated.status === TaskStatus.RESOLVED) task.resolvedAt = new Date();
    if (validated.status === TaskStatus.CANCELLED) task.closedAt = new Date();
    const saved = await qr.manager.save(OperationalTask, task);
    await this.timelineService.recordWithManager(qr.manager, {
      taskId: id,
      tenantId,
      eventType: 'STATUS_CHANGED',
      payload: { to: validated.status, notes: validated.notes ?? null },
      actorUserId: actor.sub,
    });
    return saved;
  });
}

async linkScheduleEvent(id: string, input: LinkScheduleEventInput, actor: JwtPayload) {
  const { tenantId, schemaName } = TenantContext.getOrThrow();
  const validated = LinkScheduleEventSchema.parse(input);
  return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
    await qr.manager.update(OperationalTask, { id, tenantId }, { scheduleEventId: validated.scheduleEventId });
    await this.timelineService.recordWithManager(qr.manager, {
      taskId: id,
      tenantId,
      eventType: 'SCHEDULE_LINKED',
      payload: { scheduleEventId: validated.scheduleEventId },
      actorUserId: actor.sub,
    });
    return qr.manager.findOneByOrFail(OperationalTask, { id, tenantId });
  });
}
```

```ts
// apps/api/src/modules/tasks/tasks.controller.ts
@Post('tasks/:id/assign')
@Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.NOC)
assign(@Param('id') id: string, @Body(new ZodValidationPipe(AssignTaskSchema)) body: AssignTaskDto, @CurrentUser() actor: JwtPayload) {
  return this.taskAssignmentService.assign(id, body, actor);
}

@Post('tasks/:id/transition')
@Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.NOC, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
transition(@Param('id') id: string, @Body(new ZodValidationPipe(TransitionTaskSchema)) body: TransitionTaskDto, @CurrentUser() actor: JwtPayload) {
  return this.tasksService.transitionStatus(id, body, actor);
}
```

- [ ] **Step 4: Ejecutar pruebas backend focalizadas**

Run: `pnpm --filter @iwana/api test -- --runInBand src/modules/tasks/tests/task-assignment.service.spec.ts src/modules/tasks/tests/tasks.controller.http.spec.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/tasks/services/task-assignment.service.ts \
  apps/api/src/modules/tasks/services/tasks.service.ts \
  apps/api/src/modules/tasks/tasks.controller.ts \
  apps/api/src/modules/tasks/dto/assign-task.dto.ts \
  apps/api/src/modules/tasks/dto/transition-task.dto.ts \
  apps/api/src/modules/tasks/dto/link-schedule-event.dto.ts \
  apps/api/src/modules/tasks/dto/link-work-order.dto.ts \
  apps/api/src/modules/tasks/tests/task-assignment.service.spec.ts \
  apps/api/src/modules/tasks/tests/tasks.controller.http.spec.ts
git commit -m "feat: add task assignment transition and logical links"
```

---

### Task 4: Implementar UI de Operaciones en portal y cliente API tipado

**Files:**
- Modify: `apps/portal/src/lib/api-client.ts`
- Create: `apps/portal/src/app/dashboard/operations/page.tsx`
- Create: `apps/portal/src/components/operations/operations-labels.ts`
- Create: `apps/portal/src/components/operations/OperationsClient.tsx`
- Create: `apps/portal/src/components/operations/TasksToolbar.tsx`
- Create: `apps/portal/src/components/operations/TasksTable.tsx`
- Create: `apps/portal/src/components/operations/TaskForm.tsx`
- Create: `apps/portal/src/components/operations/TaskDetailDrawer.tsx`
- Create: `apps/portal/src/components/operations/TaskTimeline.tsx`
- Create: `apps/portal/src/components/operations/TaskAssignmentHistory.tsx`
- Create: `apps/portal/src/components/operations/operations-labels.spec.ts`
- Create: `apps/portal/src/components/operations/TaskForm.spec.tsx`
- Create: `apps/portal/src/components/operations/OperationsClient.spec.tsx`
- Modify: `apps/portal/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Escribir la prueba roja de labels y formulario**

```ts
it('renders task type and status labels in spanish', () => {
  expect(getTaskTypeLabel(TaskType.INTERNAL_OPERATION)).toBe('Operación interna');
  expect(getTaskStatusLabel(TaskStatus.IN_PROGRESS)).toBe('En progreso');
});
```

```tsx
it('submits task form with responsible and recipient fields', async () => {
  const onSubmit = jest.fn();
  render(<TaskForm onSubmit={onSubmit} isSubmitting={false} error={null} />);

  await userEvent.type(screen.getByLabelText('Título'), 'Validar equipo retirado');
  await userEvent.selectOptions(screen.getByLabelText('Responsable'), 'user-123');
  await userEvent.selectOptions(screen.getByLabelText('Destinatario'), 'operations-area');
  await userEvent.click(screen.getByRole('button', { name: 'Crear tarea' }));

  await waitFor(() => {
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Validar equipo retirado',
        responsibleRefId: 'user-123',
        recipientRefId: 'operations-area',
      }),
    );
  });
});
```

- [ ] **Step 2: Ejecutar pruebas portal para confirmar rojo**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/operations/operations-labels.spec.ts src/components/operations/TaskForm.spec.tsx src/components/operations/OperationsClient.spec.tsx`  
Expected: FAIL porque los componentes y labels aún no existen.

- [ ] **Step 3: Implementar cliente tipado, shell y componentes**

```ts
// apps/portal/src/lib/api-client.ts
export interface OperationalTaskRecord {
  id: string;
  taskNumber: string;
  type: string;
  status: string;
  priority: string;
  title: string;
  responsibleRefId: string;
  recipientType: string;
  recipientLabel: string | null;
}

export const tasksApi = {
  list: (tenantSlug?: string) =>
    request<{ data: OperationalTaskRecord[]; total: number; page: number; limit: number }>(
      '/tasks/tasks',
      { method: 'GET', returnFullResponse: true },
      tenantSlug,
    ),
  create: (dto: Record<string, unknown>, tenantSlug?: string) =>
    request<OperationalTaskRecord>('/tasks/tasks', {
      method: 'POST',
      body: JSON.stringify(dto),
      returnFullResponse: true,
    }, tenantSlug),
};
```

```tsx
// apps/portal/src/components/operations/OperationsClient.tsx
export function OperationsClient() {
  const [tasks, setTasks] = useState<OperationalTaskRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      const response = await tasksApi.list();
      setTasks(response.data);
    } catch (loadError) {
      setError(mapApiError(loadError));
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  return (
    <div className="space-y-6">
      <TasksToolbar />
      <TaskForm
        isSubmitting={false}
        error={error}
        onSubmit={async (payload) => {
          await tasksApi.create(payload);
          await loadTasks();
        }}
      />
      <TasksTable tasks={tasks} />
    </div>
  );
}
```

```tsx
// apps/portal/src/app/dashboard/operations/page.tsx
export default function OperationsPage() {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-gray-950 dark:text-white">Operaciones</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Ejecuta y despacha tareas operativas con responsable y destinatario explícitos.
        </p>
      </header>
      <OperationsClient />
    </section>
  );
}
```

- [ ] **Step 4: Re-ejecutar pruebas portal y typecheck**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/operations/operations-labels.spec.ts src/components/operations/TaskForm.spec.tsx src/components/operations/OperationsClient.spec.tsx`  
Expected: PASS.

Run: `pnpm --filter @iwana/portal typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/lib/api-client.ts \
  apps/portal/src/app/dashboard/operations/page.tsx \
  apps/portal/src/components/operations \
  apps/portal/src/components/layout/Sidebar.tsx
git commit -m "feat: add operations portal shell for tasks"
```

---

### Task 5: Cerrar documentación viva, checklist y verificación integral

**Files:**
- Modify: `docs/informes/INFORME-MOD11-EJECUCION-OPERATIVA-DEFINICION-v1.0.md`
- Create: `docs/informes/INFORME-MOD11-EJECUCION-OPERATIVA-FASE-01-v1.0.md`
- Create: `docs/quality/CHECKLIST-MOD11-EJECUCION-OPERATIVA-FASE-01-v1.0.md`

- [ ] **Step 1: Crear informe de fase con alcance ejecutado**

```md
# INFORME - MOD11 Ejecucion Operativa / Tareas Fase 01

**Version:** 1.0  
**Estado:** En revision  
**Fecha:** 2026-06-22  

## Alcance ejecutado

- `TasksModule` backend con CRUD base, handoff y timeline.
- Entidades tenant-aware y migración reversible.
- UI portal `Operaciones`.
- Contratos lógicos con `ticketId`, `scheduleEventId` y `workOrderId`.
```

- [ ] **Step 2: Crear checklist de calidad**

```md
# CHECKLIST - MOD11 Ejecucion Operativa / Tareas Fase 01

- [ ] Sin violación de boundary con MOD10/MOD09
- [ ] Sin PII sensible en entidad de tarea
- [ ] Migración reversible validada
- [ ] OpenAPI actualizado
- [ ] Tests backend focalizados en verde
- [ ] Tests portal focalizados en verde
- [ ] E2E documentado o bloqueo explícito
```

- [ ] **Step 3: Actualizar informe de definición con plan y prompt**

```md
## 3. Artefactos creados

| Artefacto | Ruta | Estado |
| --- | --- | --- |
| Plan de implementación | docs/plans/2026-06-22-mod11-ejecucion-operativa-tareas-fase-01.md | En revision |
| Prompt de ejecución | docs/prompts/PROMPT-MOD11-EJECUCION-OPERATIVA-TAREAS-FASE-01-v1.0.md | En revision |
```

- [ ] **Step 4: Ejecutar validación final de workspaces tocados**

Run: `pnpm --filter @iwana/api test -- --runInBand src/modules/tasks/tests/tasks.service.spec.ts src/modules/tasks/tests/task-assignment.service.spec.ts src/modules/tasks/tests/tasks.controller.http.spec.ts && pnpm --filter @iwana/api typecheck && pnpm --filter @iwana/portal test -- --runInBand src/components/operations/operations-labels.spec.ts src/components/operations/TaskForm.spec.tsx src/components/operations/OperationsClient.spec.tsx && pnpm --filter @iwana/portal typecheck`  
Expected: PASS en backend y portal para el slice MOD11.

- [ ] **Step 5: Commit**

```bash
git add docs/informes/INFORME-MOD11-EJECUCION-OPERATIVA-DEFINICION-v1.0.md \
  docs/informes/INFORME-MOD11-EJECUCION-OPERATIVA-FASE-01-v1.0.md \
  docs/quality/CHECKLIST-MOD11-EJECUCION-OPERATIVA-FASE-01-v1.0.md
git commit -m "docs: add mod11 execution report and quality checklist"
```

---

## Self-review

### Spec coverage

- **Entidad de tarea con responsable y destinatario:** Task 1 + Task 2.
- **Responsable único activo con historial:** Task 3.
- **Agenda opcional y vínculo lógico con WFM:** Task 3.
- **UI visible como Operaciones:** Task 4.
- **Trazabilidad documental y checklist:** Task 5.

### Placeholder scan

- No quedan `TODO`, `TBD` ni pasos genéricos sin archivos, comandos o código.
- Los nombres `TasksService`, `TaskAssignmentService`, `OperationalTask` y `/api/v1/tasks` se usan de forma consistente.

### Type consistency

- `TaskStatus`, `TaskType`, `TaskRecipientType`, `TaskResponsibleType` y `TaskExecutionMode` se definen en Task 1 y se reutilizan igual en Tasks 2-4.
- Las rutas `GET/POST /api/v1/tasks/tasks` y los handlers del controller usan el mismo naming durante todo el plan.
