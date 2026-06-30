# MOD09 Programacion + MOD11 OT de Ejecucion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `Programacion` en el centro unico de agendamiento y mover la OT enriquecida a MOD11 con integracion de inventario por custodia del tecnico/cuadrilla.

**Architecture:** `MOD09` conserva `VisitRequest`, `ScheduleEvent`, capacidad y despacho. `MOD11` agrega el owner de `ExecutionOrder` y de la ejecucion de campo, consumiendo inventario previamente cargado al tecnico/cuadrilla. La integracion se hace por referencias logicas y eventos/puertos, sin FKs cross-module.

**Tech Stack:** NestJS, Next.js App Router, TypeScript estricto, Zod, TypeORM, PostgreSQL multi-tenant por schema, Redis/BullMQ, Jest, Supertest, Playwright.

---

## Source documents

- `docs/specs/2026-06-24-mod09-mod11-programacion-centro-agendamiento-ot-ejecucion-design.md`
- `docs/adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md`
- `docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md`
- `docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md`
- `docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md`
- `docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md`
- `docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md`
- `docs/adrs/ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md`

## File map

### Documents and contracts

- Modify: `docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md`
- Modify: `docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md`
- Modify: `docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md`
- Modify: `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`
- Modify: `docs/informes/INFORME-MOD11-EJECUCION-OPERATIVA-DEFINICION-v1.0.md`

### Shared / database

- Create: `packages/shared/src/enums/operations/execution-order-status.enum.ts`
- Create: `packages/shared/src/enums/operations/execution-order-result.enum.ts`
- Create: `packages/shared/src/enums/inventory/inventory-disposition.enum.ts`
- Create: `packages/database/src/entities/execution-order.entity.ts`
- Create: `packages/database/src/entities/execution-order-activity.entity.ts`
- Create: `packages/database/src/entities/execution-order-item-usage.entity.ts`
- Create: `packages/database/src/entities/execution-order-evidence.entity.ts`
- Create: `packages/database/src/migrations/tenant/046_create_execution_orders_module.ts`

### API backend

- Modify: `apps/api/src/modules/wfm/services/visit-requests.service.ts`
- Modify: `apps/api/src/modules/wfm/services/schedule-events.service.ts`
- Create: `apps/api/src/modules/operations/execution-orders.module.ts`
- Create: `apps/api/src/modules/operations/execution-orders.controller.ts`
- Create: `apps/api/src/modules/operations/services/execution-orders.service.ts`
- Create: `apps/api/src/modules/operations/services/execution-order-inventory.service.ts`
- Create: `apps/api/src/modules/operations/dto/*.ts`
- Create: `apps/api/src/modules/operations/tests/execution-orders.service.spec.ts`
- Create: `apps/api/src/modules/operations/tests/execution-orders.controller.http.spec.ts`

### Portal frontend

- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx`
- Modify: `apps/portal/src/components/scheduling/ScheduleEventDrawer.tsx`
- Modify: `apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx`
- Modify: `apps/portal/src/components/operations/OperationsClient.tsx`
- Create: `apps/portal/src/components/operations/ExecutionOrderDrawer.tsx`
- Create: `apps/portal/src/components/operations/ExecutionOrderFieldWorkStep.tsx`
- Create: `apps/portal/src/components/operations/ExecutionOrderInventoryStep.tsx`
- Create: `apps/portal/src/components/operations/ExecutionOrderCloseStep.tsx`
- Modify: `apps/portal/src/lib/api-client.ts`
- Create: `apps/portal/src/components/operations/ExecutionOrderDrawer.spec.tsx`

---

### Task 1: Formalizar contratos y persistencia de OT de ejecucion

**Files:**
- Create: `packages/shared/src/enums/operations/execution-order-status.enum.ts`
- Create: `packages/shared/src/enums/operations/execution-order-result.enum.ts`
- Create: `packages/shared/src/enums/inventory/inventory-disposition.enum.ts`
- Create: `packages/database/src/entities/execution-order.entity.ts`
- Create: `packages/database/src/entities/execution-order-activity.entity.ts`
- Create: `packages/database/src/entities/execution-order-item-usage.entity.ts`
- Create: `packages/database/src/entities/execution-order-evidence.entity.ts`
- Create: `packages/database/src/migrations/tenant/046_create_execution_orders_module.ts`
- Test: `apps/api/src/modules/operations/tests/execution-orders.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('creates an execution order from a confirmed schedule with technician custody context', async () => {
  const result = await service.createFromScheduling(
    {
      visitRequestId: 'vr-001',
      scheduleEventId: 'se-001',
      originContext: 'CRM',
      originRefId: 'exp-001',
      assignedTechnicianId: 'tech-001',
      customerDisplayLabel: 'Cliente Torre Norte',
      serviceAddress: 'Calle 1 # 2 - 3',
      workType: 'INSTALLATION',
      workSummary: 'Instalar ONU y activar servicio',
      plannedWindowStartAt: '2026-06-24T14:00:00.000Z',
      plannedWindowEndAt: '2026-06-24T16:00:00.000Z',
    },
    actor,
  );

  expect(result.status).toBe('CREATED');
  expect(result.assignedTechnicianId).toBe('tech-001');
  expect(result.scheduleEventId).toBe('se-001');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @iwana/api test -- --runInBand src/modules/operations/tests/execution-orders.service.spec.ts`  
Expected: FAIL because `ExecutionOrdersService`, enums and entities do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/shared/src/enums/operations/execution-order-status.enum.ts
export enum ExecutionOrderStatus {
  CREATED = 'CREATED',
  ASSIGNED = 'ASSIGNED',
  EN_ROUTE = 'EN_ROUTE',
  IN_PROGRESS = 'IN_PROGRESS',
  BLOCKED = 'BLOCKED',
  COMPLETED = 'COMPLETED',
  COMPLETED_WITH_OBSERVATIONS = 'COMPLETED_WITH_OBSERVATIONS',
  NOT_EXECUTED = 'NOT_EXECUTED',
  CANCELLED = 'CANCELLED',
}
```

```ts
// packages/database/src/entities/execution-order.entity.ts
@Entity({ name: 'execution_orders' })
export class ExecutionOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'execution_order_number', type: 'varchar', length: 40 })
  executionOrderNumber: string;

  @Column({ name: 'visit_request_id', type: 'uuid', nullable: true })
  visitRequestId: string | null;

  @Column({ name: 'schedule_event_id', type: 'uuid' })
  scheduleEventId: string;

  @Column({ name: 'assigned_technician_id', type: 'uuid', nullable: true })
  assignedTechnicianId: string | null;

  @Column({ name: 'assigned_crew_id', type: 'uuid', nullable: true })
  assignedCrewId: string | null;

  @Column({ name: 'origin_context', type: 'varchar', length: 64 })
  originContext: string;

  @Column({ name: 'origin_ref_id', type: 'varchar', length: 160, nullable: true })
  originRefId: string | null;

  @Column({ name: 'customer_display_label', type: 'varchar', length: 200 })
  customerDisplayLabel: string;

  @Column({ name: 'service_address', type: 'varchar', length: 255 })
  serviceAddress: string;

  @Column({ name: 'work_type', type: 'varchar', length: 64 })
  workType: string;

  @Column({ name: 'work_summary', type: 'varchar', length: 200 })
  workSummary: string;

  @Column({ name: 'planned_window_start_at', type: 'timestamptz' })
  plannedWindowStartAt: Date;

  @Column({ name: 'planned_window_end_at', type: 'timestamptz' })
  plannedWindowEndAt: Date;

  @Column({ type: 'enum', enum: ExecutionOrderStatus, default: ExecutionOrderStatus.CREATED })
  status: ExecutionOrderStatus;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @iwana/api test -- --runInBand src/modules/operations/tests/execution-orders.service.spec.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/enums/operations packages/shared/src/enums/inventory \
  packages/database/src/entities/execution-order*.ts \
  packages/database/src/migrations/tenant/046_create_execution_orders_module.ts \
  apps/api/src/modules/operations/tests/execution-orders.service.spec.ts
git commit -m "feat: add execution order contracts and tenant persistence"
```

---

### Task 2: Hacer que Programacion cree o active la OT al confirmar agenda

**Files:**
- Modify: `apps/api/src/modules/wfm/services/visit-requests.service.ts`
- Modify: `apps/api/src/modules/wfm/services/schedule-events.service.ts`
- Create: `apps/api/src/modules/operations/services/execution-orders.service.ts`
- Test: `apps/api/src/modules/wfm/tests/visit-requests.service.spec.ts`
- Test: `apps/api/src/modules/operations/tests/execution-orders.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('creates an execution order when a visit request is scheduled', async () => {
  executionOrdersService.createFromScheduling = jest.fn().mockResolvedValue({
    id: 'eo-001',
    scheduleEventId: 'se-001',
    status: 'CREATED',
  });

  const result = await service.scheduleVisitRequest(
    'vr-001',
    {
      assignedUserId: 'tech-001',
      scheduledStartAt: '2026-06-24T14:00:00.000Z',
      scheduledEndAt: '2026-06-24T16:00:00.000Z',
      createWorkOrder: true,
    },
    actor,
  );

  expect(executionOrdersService.createFromScheduling).toHaveBeenCalledWith(
    expect.objectContaining({
      visitRequestId: 'vr-001',
      scheduleEventId: expect.any(String),
      assignedTechnicianId: 'tech-001',
    }),
    actor,
  );
  expect(result.status).toBe('SCHEDULED');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/visit-requests.service.spec.ts src/modules/operations/tests/execution-orders.service.spec.ts`  
Expected: FAIL because WFM does not yet call `ExecutionOrdersService`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/modules/operations/services/execution-orders.service.ts
async createFromScheduling(input: CreateExecutionOrderFromSchedulingInput, actor: JwtPayload) {
  const { tenantId, schemaName } = TenantContext.getOrThrow();
  return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
    const entity = qr.manager.create(ExecutionOrder, {
      tenantId,
      executionOrderNumber: await this.generateCode(qr.manager, tenantId),
      visitRequestId: input.visitRequestId ?? null,
      scheduleEventId: input.scheduleEventId,
      assignedTechnicianId: input.assignedTechnicianId ?? null,
      assignedCrewId: input.assignedCrewId ?? null,
      originContext: input.originContext,
      originRefId: input.originRefId ?? null,
      customerDisplayLabel: input.customerDisplayLabel,
      serviceAddress: input.serviceAddress,
      workType: input.workType,
      workSummary: input.workSummary,
      plannedWindowStartAt: new Date(input.plannedWindowStartAt),
      plannedWindowEndAt: new Date(input.plannedWindowEndAt),
      status: ExecutionOrderStatus.CREATED,
      createdBy: actor.sub,
    });
    return qr.manager.save(ExecutionOrder, entity);
  });
}
```

```ts
// apps/api/src/modules/wfm/services/visit-requests.service.ts
await this.executionOrdersService.createFromScheduling(
  {
    visitRequestId: visitRequest.id,
    scheduleEventId: savedEvent.id,
    assignedTechnicianId: validated.assignedUserId,
    originContext: visitRequest.originContext,
    originRefId: visitRequest.originRef,
    customerDisplayLabel: visitRequest.title,
    serviceAddress: visitRequest.address ?? 'Direccion pendiente',
    workType: visitRequest.workType,
    workSummary: validated.workOrderSummary?.trim() || visitRequest.title,
    plannedWindowStartAt: validated.scheduledStartAt,
    plannedWindowEndAt: validated.scheduledEndAt,
  },
  actor,
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/visit-requests.service.spec.ts src/modules/operations/tests/execution-orders.service.spec.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/wfm/services/visit-requests.service.ts \
  apps/api/src/modules/wfm/services/schedule-events.service.ts \
  apps/api/src/modules/operations/services/execution-orders.service.ts \
  apps/api/src/modules/wfm/tests/visit-requests.service.spec.ts \
  apps/api/src/modules/operations/tests/execution-orders.service.spec.ts
git commit -m "feat: create execution orders on scheduling confirmation"
```

---

### Task 3: Implementar backend de ejecucion de campo y consumo de inventario por custodia

**Files:**
- Create: `apps/api/src/modules/operations/execution-orders.controller.ts`
- Create: `apps/api/src/modules/operations/services/execution-order-inventory.service.ts`
- Create: `apps/api/src/modules/operations/dto/start-execution-order.dto.ts`
- Create: `apps/api/src/modules/operations/dto/register-field-work.dto.ts`
- Create: `apps/api/src/modules/operations/dto/register-item-usage.dto.ts`
- Create: `apps/api/src/modules/operations/dto/close-execution-order.dto.ts`
- Test: `apps/api/src/modules/operations/tests/execution-orders.controller.http.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('consumes technician stock items from an execution order and records final disposition', async () => {
  inventoryService.consumeTechnicianCustody = jest.fn().mockResolvedValue({
    stockMovementId: 'mov-001',
    finalDisposition: 'INSTALLED_AT_CUSTOMER',
  });

  const result = await service.registerItemUsage(
    'eo-001',
    {
      itemId: 'item-001',
      technicianCustodyId: 'cust-001',
      quantity: 1,
      serialNumber: 'SER-001',
      action: 'INSTALL',
      finalDisposition: 'INSTALLED_AT_CUSTOMER',
    },
    actor,
  );

  expect(inventoryService.consumeTechnicianCustody).toHaveBeenCalledWith(
    expect.objectContaining({
      technicianCustodyId: 'cust-001',
      finalDisposition: 'INSTALLED_AT_CUSTOMER',
    }),
    actor,
  );
  expect(result.itemId).toBe('item-001');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @iwana/api test -- --runInBand src/modules/operations/tests/execution-orders.controller.http.spec.ts src/modules/operations/tests/execution-orders.service.spec.ts`  
Expected: FAIL because inventory consumption endpoints and services do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/modules/operations/services/execution-order-inventory.service.ts
async consumeTechnicianCustody(input: ConsumeTechnicianCustodyInput, actor: JwtPayload) {
  return this.inventoryPort.consumeTechnicianCustody(
    {
      technicianCustodyId: input.technicianCustodyId,
      itemId: input.itemId,
      quantity: input.quantity,
      serialNumber: input.serialNumber ?? null,
      finalDisposition: input.finalDisposition,
      executionOrderId: input.executionOrderId,
    },
    actor,
  );
}
```

```ts
// apps/api/src/modules/operations/services/execution-orders.service.ts
async registerItemUsage(id: string, input: RegisterItemUsageInput, actor: JwtPayload) {
  const usage = await this.executionOrderInventoryService.consumeTechnicianCustody(
    { ...input, executionOrderId: id },
    actor,
  );

  return this.executionOrderItemUsageRepository.save({
    tenantId,
    executionOrderId: id,
    itemId: input.itemId,
    quantity: input.quantity,
    serialNumber: input.serialNumber ?? null,
    action: input.action,
    finalDisposition: input.finalDisposition,
    stockMovementId: usage.stockMovementId,
    createdBy: actor.sub,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @iwana/api test -- --runInBand src/modules/operations/tests/execution-orders.controller.http.spec.ts src/modules/operations/tests/execution-orders.service.spec.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/operations/execution-orders.controller.ts \
  apps/api/src/modules/operations/services/execution-order-inventory.service.ts \
  apps/api/src/modules/operations/dto \
  apps/api/src/modules/operations/tests/execution-orders.controller.http.spec.ts \
  apps/api/src/modules/operations/tests/execution-orders.service.spec.ts
git commit -m "feat: add field execution and technician stock consumption"
```

---

### Task 4: Ajustar UI para que Programacion abra OT y no capture ejecucion

**Files:**
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx`
- Modify: `apps/portal/src/components/scheduling/ScheduleEventDrawer.tsx`
- Modify: `apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx`
- Modify: `apps/portal/src/lib/api-client.ts`
- Test: `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('opens execution order from scheduling without showing inventory or field work capture inside WFM', async () => {
  render(<SchedulingClient surface="agenda" />);

  await userEvent.click(await screen.findByRole('button', { name: /ver detalle/i }));

  expect(screen.getByRole('link', { name: /abrir orden de trabajo/i })).toBeInTheDocument();
  expect(screen.queryByText(/materiales usados/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/actividades realizadas/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/SchedulingClient.spec.tsx`  
Expected: FAIL because WFM drawer still behaves as local execution detail.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/portal/src/components/scheduling/ScheduleEventDrawer.tsx
{executionOrderId ? (
  <Button asChild type="button">
    <Link href={`/dashboard/operations?executionOrderId=${executionOrderId}`}>
      Abrir orden de trabajo
    </Link>
  </Button>
) : null}
```

```tsx
// apps/portal/src/components/scheduling/SchedulingClient.tsx
<ScheduleEventDrawer
  ...
  executionOrderId={selectedExecutionOrderId}
  executionSummaryStatus={selectedExecutionOrderStatus}
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/SchedulingClient.spec.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/components/scheduling/SchedulingClient.tsx \
  apps/portal/src/components/scheduling/ScheduleEventDrawer.tsx \
  apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx \
  apps/portal/src/lib/api-client.ts \
  apps/portal/src/components/scheduling/SchedulingClient.spec.tsx
git commit -m "feat: keep scheduling focused on dispatch and open execution orders"
```

---

### Task 5: Crear drawer de OT en Operaciones con trabajo de campo, inventario y cierre

**Files:**
- Modify: `apps/portal/src/components/operations/OperationsClient.tsx`
- Create: `apps/portal/src/components/operations/ExecutionOrderDrawer.tsx`
- Create: `apps/portal/src/components/operations/ExecutionOrderFieldWorkStep.tsx`
- Create: `apps/portal/src/components/operations/ExecutionOrderInventoryStep.tsx`
- Create: `apps/portal/src/components/operations/ExecutionOrderCloseStep.tsx`
- Create: `apps/portal/src/components/operations/ExecutionOrderDrawer.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('renders execution order sections for field work, technician stock usage and technical close', async () => {
  render(
    <ExecutionOrderDrawer
      open
      executionOrder={buildExecutionOrder()}
      onOpenChange={() => undefined}
      onRegisterFieldWork={jest.fn()}
      onRegisterItemUsage={jest.fn()}
      onCloseExecutionOrder={jest.fn()}
    />,
  );

  expect(screen.getByText('Trabajo en campo')).toBeInTheDocument();
  expect(screen.getByText('Equipos y materiales usados')).toBeInTheDocument();
  expect(screen.getByText('Cierre tecnico')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/operations/ExecutionOrderDrawer.spec.tsx`  
Expected: FAIL because the drawer and steps do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/portal/src/components/operations/ExecutionOrderDrawer.tsx
export function ExecutionOrderDrawer(props: ExecutionOrderDrawerProps) {
  const { executionOrder, open, onOpenChange } = props;

  if (!open || !executionOrder) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{executionOrder.executionOrderNumber}</DialogTitle>
          <DialogDescription>{executionOrder.workSummary}</DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <ExecutionOrderFieldWorkStep executionOrder={executionOrder} onSubmit={props.onRegisterFieldWork} />
          <ExecutionOrderInventoryStep executionOrder={executionOrder} onSubmit={props.onRegisterItemUsage} />
          <ExecutionOrderCloseStep executionOrder={executionOrder} onSubmit={props.onCloseExecutionOrder} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/operations/ExecutionOrderDrawer.spec.tsx src/components/operations/OperationsClient.spec.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/components/operations/OperationsClient.tsx \
  apps/portal/src/components/operations/ExecutionOrderDrawer.tsx \
  apps/portal/src/components/operations/ExecutionOrderFieldWorkStep.tsx \
  apps/portal/src/components/operations/ExecutionOrderInventoryStep.tsx \
  apps/portal/src/components/operations/ExecutionOrderCloseStep.tsx \
  apps/portal/src/components/operations/ExecutionOrderDrawer.spec.tsx
git commit -m "feat: add execution order field work inventory and close flows"
```

---

### Task 6: Actualizar documentacion viva y ejecutar verificacion integral

**Files:**
- Modify: `docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md`
- Modify: `docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md`
- Modify: `docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md`
- Modify: `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`
- Modify: `docs/informes/INFORME-MOD11-EJECUCION-OPERATIVA-DEFINICION-v1.0.md`

- [ ] **Step 1: Update docs with executed boundary**

```md
## Correccion 2026-06-24

- `Programacion` queda limitada a agendamiento y supervision resumida.
- La OT enriquecida pasa a MOD11 como owner de ejecucion.
- La trazabilidad de equipos/materiales usa custodia de tecnico/cuadrilla.
```

- [ ] **Step 2: Run full verification**

Run: `pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/visit-requests.service.spec.ts src/modules/operations/tests/execution-orders.service.spec.ts src/modules/operations/tests/execution-orders.controller.http.spec.ts && pnpm --filter @iwana/api typecheck && pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/SchedulingClient.spec.tsx src/components/operations/ExecutionOrderDrawer.spec.tsx src/components/operations/OperationsClient.spec.tsx && pnpm --filter @iwana/portal typecheck`  
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md \
  docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md \
  docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md \
  docs/informes/INFORME-MOD09-FASE-02-v1.0.md \
  docs/informes/INFORME-MOD11-EJECUCION-OPERATIVA-DEFINICION-v1.0.md
git commit -m "docs: align mod09 and mod11 with execution order boundary"
```

---

## Self-review

### Spec coverage

- `Programacion` como centro de agendamiento: Tasks 2 and 4.
- OT enriquecida en MOD11: Tasks 1, 3 and 5.
- Inventario por custodia del tecnico/cuadrilla: Task 3.
- Apertura de OT desde agenda sin absorber ejecucion: Task 4.
- Trazabilidad documental y boundary: Task 6.

### Placeholder scan

- No hay `TODO`, `TBD` ni referencias abstractas sin archivos concretos.
- Los nombres `ExecutionOrder`, `ExecutionOrderStatus`, `ExecutionOrderInventoryService` y `ADR-047` se mantienen consistentes.

### Type consistency

- `ExecutionOrderStatus` y `InventoryDisposition` se introducen en Task 1 y se reutilizan en Tasks 2-5.
- `visitRequestId`, `scheduleEventId` y `assignedTechnicianId` mantienen el mismo naming en backend y frontend.
