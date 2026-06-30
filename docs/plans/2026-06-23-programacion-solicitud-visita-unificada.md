# Programacion con Solicitud de Visita Unificada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `visit-requests` into the single scheduling intake path for CRM, Assurance tickets, and Tasks, while demoting manual scheduling to an exceptional flow.

**Architecture:** Reuse the existing WFM `visit-requests` model instead of creating a new intake object. Origin modules continue owning the business case (`expediente`, `ticket`, `task`), while portal orchestration creates or reuses a `visit-request` and then routes the user to either `Agenda` or `Pendientes por agendar`. `Programacion` keeps ownership of schedule events, work orders, and supervision only.

**Tech Stack:** NestJS 11, Next.js App Router, React 19, TypeScript strict, Zod, Jest, Supertest, Playwright portal, pnpm, Turborepo.

---

## Source documents

- Spec aprobada: `docs/specs/2026-06-23-programacion-solicitud-visita-unificada-design.md`
- PRD MOD09 consolidado: `docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md`
- PRD MOD11: `docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md`
- Plan previo de tareas en agenda: `docs/plans/2026-06-23-mod11-modal-crear-tarea-agenda-opcional.md`
- Informe vivo MOD09: `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`
- Informe vivo MOD11: `docs/informes/INFORME-MOD11-EJECUCION-OPERATIVA-DEFINICION-v1.0.md`

## File map

### Shared contracts

- Modify: `packages/shared/src/enums/wfm/work-order-source-context.enum.ts`
  - Add a source value for Task-originated scheduling intake.

### WFM backend

- Modify: `apps/api/src/modules/wfm/services/visit-requests.service.ts`
  - Accept task-originated visit requests in access checks without introducing a new model.
- Modify: `apps/api/src/modules/wfm/services/visit-requests.service.spec.ts`
  - Cover task-originated intake and duplicate reuse.

### Portal scheduling orchestration

- Create: `apps/portal/src/components/scheduling/visit-request-origin-orchestration.ts`
  - Shared portal helper that creates or reuses `visit-requests` from CRM, Assurance, and Tasks.
- Create: `apps/portal/src/components/scheduling/visit-request-origin-orchestration.spec.ts`
  - Unit tests for routing and API orchestration.
- Modify: `apps/portal/src/components/scheduling/pending-visit-scheduling-handoff.ts`
  - Add inbox routing helper for “Enviar a pendientes”.
- Modify: `apps/portal/src/components/scheduling/pending-visits-ui.ts`
  - Add the friendly origin label for Tasks and align wording.
- Modify: `apps/portal/src/components/scheduling/pending-visits-ui.spec.ts`
  - Validate the new origin label.

### CRM origin

- Create: `apps/portal/src/components/crm/expedientes/ExpedienteSchedulingActions.tsx`
  - Lightweight chooser with `Agendar ahora` and `Enviar a pendientes`.
- Create: `apps/portal/src/components/crm/expedientes/ExpedienteSchedulingActions.spec.tsx`
  - Cover the two CTA paths.
- Modify: `apps/portal/src/components/crm/expedientes/expediente-scheduling.ts`
  - Keep only the route helpers and capability checks; move scheduling orchestration out of raw URL building.
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
  - Replace direct scheduling jump with the new action chooser.

### Assurance origin

- Modify: `apps/portal/src/components/assurance/AssuranceCreateTicketForm.tsx`
  - Capture follow-up action when field service is required.
- Create: `apps/portal/src/components/assurance/AssuranceClient.spec.tsx`
  - Cover create-only, schedule-now, and send-to-pending flows.
- Modify: `apps/portal/src/components/assurance/AssuranceClient.tsx`
  - Create the ticket, optionally request field service, then route through the shared visit-request helper.

### Tasks origin

- Modify: `apps/portal/src/components/operations/TaskForm.tsx`
  - Replace the current direct “Abrir Programacion” alert with a follow-up choice that creates a `visit-request`.
- Modify: `apps/portal/src/components/operations/TaskForm.spec.tsx`
  - Cover the task-to-visit-request follow-up flow.
- Modify: `apps/portal/src/components/operations/OperationsClient.tsx`
  - Own the post-create follow-up action and route.

### Programacion surface cleanup

- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx`
  - Demote generic capture CTAs and relabel them as manual visit intake only.
- Modify: `apps/portal/src/components/scheduling/ScheduleEventForm.tsx`
  - Align visible copy with manual visit scheduling instead of generic business capture.
- Modify: `apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx`
  - Support selecting a newly created `visit-request` from CRM, Ticket, or Task origins.
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx`
  - Cover new manual-only entry copy and routing.

### Docs

- Modify: `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`
  - Record the unified intake implementation.
- Modify: `docs/informes/INFORME-MOD11-EJECUCION-OPERATIVA-DEFINICION-v1.0.md`
  - Add traceability from Tasks into the shared scheduling intake.

---

### Task 1: Normalize visit-request source taxonomy

**Files:**
- Modify: `packages/shared/src/enums/wfm/work-order-source-context.enum.ts`
- Modify: `apps/api/src/modules/wfm/services/visit-requests.service.ts`
- Test: `apps/api/src/modules/wfm/services/visit-requests.service.spec.ts`
- Modify: `apps/portal/src/components/scheduling/pending-visits-ui.ts`
- Test: `apps/portal/src/components/scheduling/pending-visits-ui.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add a UI label assertion and a backend creation assertion.

```ts
// apps/portal/src/components/scheduling/pending-visits-ui.spec.ts
import { WorkOrderSourceContext } from '@iwana/shared';
import { getVisitRequestOriginLabel } from './pending-visits-ui';

it('renders a friendly label for task-originated visit requests', () => {
  expect(getVisitRequestOriginLabel(WorkOrderSourceContext.TASKS)).toBe('Tareas');
});
```

```ts
// apps/api/src/modules/wfm/services/visit-requests.service.spec.ts
it('creates a task-originated visit request without opening a second intake model', async () => {
  const result = await service.createVisitRequest(
    {
      originContext: WorkOrderSourceContext.TASKS,
      originRef: 'task-001',
      originLabel: 'Tarea OT-001',
      workType: WfmWorkType.TECHNICAL_VISIT,
      title: 'Visita derivada de tarea',
      municipality: 'Bogotá',
      address: 'Cra 1 # 2-3',
    },
    actor,
  );

  expect(result.originContext).toBe(WorkOrderSourceContext.TASKS);
  expect(result.originRef).toBe('task-001');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/pending-visits-ui.spec.ts
pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/services/visit-requests.service.spec.ts
```

Expected:

- portal fails because `WorkOrderSourceContext.TASKS` and its label do not exist yet;
- api may fail in enum parsing or access checks for the new source.

- [ ] **Step 3: Implement the minimal contract changes**

Add the new source enum and map it in portal copy and backend access checks.

```ts
// packages/shared/src/enums/wfm/work-order-source-context.enum.ts
export enum WorkOrderSourceContext {
  CRM = 'CRM',
  ASSURANCE = 'ASSURANCE',
  PROVISIONING = 'PROVISIONING',
  TASKS = 'TASKS',
  MANUAL = 'MANUAL',
}
```

```ts
// apps/portal/src/components/scheduling/pending-visits-ui.ts
const visitRequestOriginLabels: Record<WorkOrderSourceContext, string> = {
  [WorkOrderSourceContext.CRM]: 'CRM',
  [WorkOrderSourceContext.ASSURANCE]: 'Mesa de ayuda',
  [WorkOrderSourceContext.PROVISIONING]: 'Provisionamiento',
  [WorkOrderSourceContext.TASKS]: 'Tareas',
  [WorkOrderSourceContext.MANUAL]: 'Manual',
};
```

```ts
// apps/api/src/modules/wfm/services/visit-requests.service.ts
private ensureActorCanCreateVisitRequest(
  actor: JwtPayload,
  originContext: WorkOrderSourceContext,
): void {
  const role = actor.role as UserRole;

  if (
    originContext === WorkOrderSourceContext.TASKS &&
    ![UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.SALES].includes(role)
  ) {
    throw new ForbiddenException('Tu rol no puede crear solicitudes derivadas de tareas.');
  }

  // Mantener los checks existentes para CRM, ASSURANCE, MANUAL y PROVISIONING.
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/pending-visits-ui.spec.ts
pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/services/visit-requests.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/enums/wfm/work-order-source-context.enum.ts apps/api/src/modules/wfm/services/visit-requests.service.ts apps/api/src/modules/wfm/services/visit-requests.service.spec.ts apps/portal/src/components/scheduling/pending-visits-ui.ts apps/portal/src/components/scheduling/pending-visits-ui.spec.ts
git commit -m "feat: normalize task source in visit requests"
```

### Task 2: Create a shared portal orchestration helper for visit-request intake

**Files:**
- Create: `apps/portal/src/components/scheduling/visit-request-origin-orchestration.ts`
- Test: `apps/portal/src/components/scheduling/visit-request-origin-orchestration.spec.ts`
- Modify: `apps/portal/src/components/scheduling/pending-visit-scheduling-handoff.ts`

- [ ] **Step 1: Write the failing orchestration tests**

Define one shared helper test per origin and one routing assertion.

```ts
// apps/portal/src/components/scheduling/visit-request-origin-orchestration.spec.ts
it('routes CRM scheduling-now through agenda handoff', async () => {
  assuranceApi.tickets.findOrCreateInstallation.mockResolvedValue({ ticketId: 'TK-001' });
  wfmApi.visitRequests.create.mockResolvedValue({ id: 'vr-001', title: 'Instalación', originContext: WorkOrderSourceContext.CRM });

  const result = await createCrmVisitRequestAndRoute({
    expedienteId: '550e8400-e29b-41d4-a716-446655440000',
    customerLabel: 'Cliente Demo',
    nextAction: 'schedule-now',
  });

  expect(result.href).toBe('/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-001');
});

it('routes task scheduling-later to pending inbox with selection', async () => {
  wfmApi.visitRequests.create.mockResolvedValue({ id: 'vr-task-1', title: 'Visita de tarea', originContext: WorkOrderSourceContext.TASKS });

  const result = await createTaskVisitRequestAndRoute({
    taskId: 'task-001',
    title: 'Visita de tarea',
    municipality: 'Bogotá',
    address: 'Cra 1 # 2-3',
    nextAction: 'send-to-pending',
  });

  expect(result.href).toBe('/dashboard/scheduling/pending-visits?selectedVisitRequestId=vr-task-1');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/visit-request-origin-orchestration.spec.ts
```

Expected: FAIL because the helper file and inbox route helper do not exist yet.

- [ ] **Step 3: Implement the shared helper and inbox route**

Create a focused helper that returns the created `visitRequest` and the next route.

```ts
// apps/portal/src/components/scheduling/pending-visit-scheduling-handoff.ts
export function buildPendingVisitInboxHref(selectedVisitRequestId?: string | null): string {
  if (!selectedVisitRequestId) {
    return '/dashboard/scheduling/pending-visits';
  }

  return `/dashboard/scheduling/pending-visits?selectedVisitRequestId=${encodeURIComponent(selectedVisitRequestId)}`;
}
```

```ts
// apps/portal/src/components/scheduling/visit-request-origin-orchestration.ts
import { WorkOrderPriority, WorkOrderSourceContext, WfmWorkType } from '@iwana/shared';
import { assuranceApi, wfmApi } from '@/lib/api-client';
import { buildPendingVisitInboxHref, buildPendingVisitSchedulingHref } from './pending-visit-scheduling-handoff';

export type VisitRequestNextAction = 'schedule-now' | 'send-to-pending';

function resolveNextHref(visitRequestId: string, nextAction: VisitRequestNextAction): string {
  return nextAction === 'schedule-now'
    ? buildPendingVisitSchedulingHref({ source: 'pending-visits', visitRequestId })
    : buildPendingVisitInboxHref(visitRequestId);
}

export async function createCrmVisitRequestAndRoute(input: {
  expedienteId: string;
  customerLabel: string;
  municipality?: string;
  address?: string;
  nextAction: VisitRequestNextAction;
}) {
  const ticket = await assuranceApi.tickets.findOrCreateInstallation({ expedienteId: input.expedienteId });
  const visitRequest = await wfmApi.visitRequests.create({
    originContext: WorkOrderSourceContext.CRM,
    originRef: input.expedienteId,
    originLabel: `Cliente ${input.customerLabel}`.slice(0, 160),
    workType: WfmWorkType.INSTALLATION,
    priority: WorkOrderPriority.NORMAL,
    title: `Instalación para ${input.customerLabel}`.slice(0, 160),
    expedienteId: input.expedienteId,
    ticketId: ticket.ticketId,
    municipality: input.municipality ?? null,
    address: input.address ?? null,
  });

  return { visitRequest, href: resolveNextHref(visitRequest.id, input.nextAction) };
}

export async function createAssuranceVisitRequestAndRoute(input: {
  ticketId: string;
  subject: string;
  priority: WorkOrderPriority;
  notes?: string | null;
  nextAction: VisitRequestNextAction;
}) {
  await assuranceApi.tickets.requestFieldService(input.ticketId, { notes: input.notes ?? null });
  const visitRequest = await wfmApi.visitRequests.create({
    originContext: WorkOrderSourceContext.ASSURANCE,
    originRef: input.ticketId,
    originLabel: `Ticket ${input.ticketId}`,
    workType: WfmWorkType.TECHNICAL_VISIT,
    priority: input.priority,
    title: input.subject.slice(0, 160),
    ticketId: input.ticketId,
    description: input.notes ?? null,
  });

  return { visitRequest, href: resolveNextHref(visitRequest.id, input.nextAction) };
}

export async function createTaskVisitRequestAndRoute(input: {
  taskId: string;
  title: string;
  municipality?: string | null;
  address?: string | null;
  nextAction: VisitRequestNextAction;
}) {
  const visitRequest = await wfmApi.visitRequests.create({
    originContext: WorkOrderSourceContext.TASKS,
    originRef: input.taskId,
    originLabel: `Tarea ${input.taskId}`.slice(0, 160),
    workType: WfmWorkType.TECHNICAL_VISIT,
    priority: WorkOrderPriority.NORMAL,
    title: input.title.slice(0, 160),
    municipality: input.municipality ?? null,
    address: input.address ?? null,
  });

  return { visitRequest, href: resolveNextHref(visitRequest.id, input.nextAction) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/visit-request-origin-orchestration.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/components/scheduling/pending-visit-scheduling-handoff.ts apps/portal/src/components/scheduling/visit-request-origin-orchestration.ts apps/portal/src/components/scheduling/visit-request-origin-orchestration.spec.ts
git commit -m "feat: add shared visit request origin orchestration"
```

### Task 3: Integrate CRM into the unified visit-request intake

**Files:**
- Create: `apps/portal/src/components/crm/expedientes/ExpedienteSchedulingActions.tsx`
- Test: `apps/portal/src/components/crm/expedientes/ExpedienteSchedulingActions.spec.tsx`
- Modify: `apps/portal/src/components/crm/expedientes/expediente-scheduling.ts`
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`

- [ ] **Step 1: Write the failing CRM action tests**

```tsx
// apps/portal/src/components/crm/expedientes/ExpedienteSchedulingActions.spec.tsx
it('offers schedule-now and send-to-pending from CRM', async () => {
  render(
    <ExpedienteSchedulingActions
      expedienteId="550e8400-e29b-41d4-a716-446655440000"
      customerLabel="Cliente Demo"
      municipality="Bogotá"
      address="Cra 1 # 2-3"
    />,
  );

  expect(screen.getByRole('button', { name: 'Agendar ahora' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Enviar a pendientes' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @iwana/portal test -- --runInBand src/components/crm/expedientes/ExpedienteSchedulingActions.spec.tsx
```

Expected: FAIL because the action component does not exist.

- [ ] **Step 3: Implement the CRM action chooser**

Create a focused component and replace raw URL jumps.

```tsx
// apps/portal/src/components/crm/expedientes/ExpedienteSchedulingActions.tsx
'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@iwana/ui';
import { createCrmVisitRequestAndRoute } from '@/components/scheduling/visit-request-origin-orchestration';

export function ExpedienteSchedulingActions(props: {
  expedienteId: string;
  customerLabel: string;
  municipality?: string | null;
  address?: string | null;
}) {
  const router = useRouter();

  const submit = async (nextAction: 'schedule-now' | 'send-to-pending') => {
    const result = await createCrmVisitRequestAndRoute({
      expedienteId: props.expedienteId,
      customerLabel: props.customerLabel,
      municipality: props.municipality ?? undefined,
      address: props.address ?? undefined,
      nextAction,
    });

    router.push(result.href);
  };

  return (
    <div className="flex flex-wrap gap-3">
      <Button onClick={() => void submit('schedule-now')}>Agendar ahora</Button>
      <Button variant="secondary" onClick={() => void submit('send-to-pending')}>
        Enviar a pendientes
      </Button>
    </div>
  );
}
```

```ts
// apps/portal/src/components/crm/expedientes/expediente-scheduling.ts
export function buildSchedulingHref(expedienteId: string): string {
  return `/dashboard/crm/expedientes/${encodeURIComponent(expedienteId)}#programacion`;
}
```

- [ ] **Step 4: Run the focused CRM tests**

Run:

```bash
pnpm --filter @iwana/portal test -- --runInBand src/components/crm/expedientes/ExpedienteSchedulingActions.spec.tsx src/components/crm/expedientes/expediente-scheduling.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/components/crm/expedientes/ExpedienteSchedulingActions.tsx apps/portal/src/components/crm/expedientes/ExpedienteSchedulingActions.spec.tsx apps/portal/src/components/crm/expedientes/expediente-scheduling.ts apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx
git commit -m "feat: route crm scheduling through visit requests"
```

### Task 4: Integrate Assurance tickets into the same intake

**Files:**
- Modify: `apps/portal/src/components/assurance/AssuranceCreateTicketForm.tsx`
- Modify: `apps/portal/src/components/assurance/AssuranceClient.tsx`
- Create: `apps/portal/src/components/assurance/AssuranceClient.spec.tsx`

- [ ] **Step 1: Write the failing Assurance tests**

```tsx
// apps/portal/src/components/assurance/AssuranceClient.spec.tsx
it('creates a ticket and routes to pending visits when field service is requested later', async () => {
  assuranceApi.tickets.create.mockResolvedValue({ id: 'TK-001', subject: 'Sin servicio' });
  assuranceApi.tickets.requestFieldService.mockResolvedValue({ id: 'TK-001' });
  wfmApi.visitRequests.create.mockResolvedValue({ id: 'vr-001', title: 'Sin servicio' });

  render(<AssuranceClient />);

  await user.click(screen.getByRole('button', { name: 'Crear ticket' }));
  await user.click(screen.getByRole('button', { name: 'Enviar a pendientes' }));

  expect(mockRouterPush).toHaveBeenCalledWith('/dashboard/scheduling/pending-visits?selectedVisitRequestId=vr-001');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @iwana/portal test -- --runInBand src/components/assurance/AssuranceClient.spec.tsx src/components/assurance/AssuranceCreateTicketForm.spec.tsx
```

Expected: FAIL because the create form does not expose the follow-up action and `AssuranceClient.spec.tsx` does not exist yet.

- [ ] **Step 3: Implement the ticket follow-up choice**

Extend the form contract and route the ticket through the shared helper.

```ts
// apps/portal/src/components/assurance/AssuranceCreateTicketForm.tsx
type AssuranceTicketFollowUpAction = 'ticket-only' | 'schedule-now' | 'send-to-pending';

interface AssuranceCreateTicketSubmitPayload {
  ticket: CreateAssuranceTicketDto;
  followUpAction: AssuranceTicketFollowUpAction;
}

interface AssuranceCreateTicketFormProps {
  onSubmit: (payload: AssuranceCreateTicketSubmitPayload) => Promise<void>;
  // props existentes...
}
```

```tsx
// dentro del form JSX
<Controller
  name="fieldDecision"
  control={control}
  render={({ field }) => (
    <Select
      id="assurance-ticket-field-decision"
      label="Decisión de campo"
      value={field.value}
      options={ASSURANCE_FIELD_DECISION_OPTIONS}
      onChange={(event) => field.onChange(event.target.value)}
      error={errors.fieldDecision?.message ?? ''}
    />
  )}
/>

{watch('fieldDecision') === TicketFieldDecision.FIELD_SERVICE_REQUIRED && (
  <Controller
    name="followUpAction"
    control={control}
    render={({ field }) => (
      <Select
        id="assurance-follow-up-action"
        label="Siguiente paso"
        value={field.value}
        options={[
          { value: 'schedule-now', label: 'Agendar ahora' },
          { value: 'send-to-pending', label: 'Enviar a pendientes' },
          { value: 'ticket-only', label: 'Crear ticket sin visita todavía' },
        ]}
        onChange={(event) => field.onChange(event.target.value)}
      />
    )}
  />
)}
```

```ts
// apps/portal/src/components/assurance/AssuranceClient.tsx
const router = useRouter();

const handleCreate = async ({
  ticket,
  followUpAction,
}: AssuranceCreateTicketSubmitPayload) => {
  const createdTicket = await assuranceApi.tickets.create(ticket);

  if (
    ticket.fieldDecision !== TicketFieldDecision.FIELD_SERVICE_REQUIRED ||
    followUpAction === 'ticket-only'
  ) {
    setFeedback(`El ticket ${createdTicket.ticketNumber ?? createdTicket.id} fue creado.`);
    return;
  }

  const result = await createAssuranceVisitRequestAndRoute({
    ticketId: createdTicket.id,
    subject: createdTicket.subject,
    priority: createdTicket.priority,
    nextAction: followUpAction,
  });

  router.push(result.href);
};
```

- [ ] **Step 4: Run the focused Assurance tests**

Run:

```bash
pnpm --filter @iwana/portal test -- --runInBand src/components/assurance/AssuranceClient.spec.tsx src/components/assurance/AssuranceCreateTicketForm.spec.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/components/assurance/AssuranceCreateTicketForm.tsx apps/portal/src/components/assurance/AssuranceClient.tsx apps/portal/src/components/assurance/AssuranceClient.spec.tsx
git commit -m "feat: route assurance tickets through visit request intake"
```

### Task 5: Integrate Tasks into the same intake and remove direct generic scheduling

**Files:**
- Modify: `apps/portal/src/components/operations/TaskForm.tsx`
- Modify: `apps/portal/src/components/operations/TaskForm.spec.tsx`
- Modify: `apps/portal/src/components/operations/OperationsClient.tsx`
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx`
- Modify: `apps/portal/src/components/scheduling/ScheduleEventForm.tsx`
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx`
- Modify: `apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx`

- [ ] **Step 1: Write the failing task and scheduling copy tests**

```tsx
// apps/portal/src/components/operations/TaskForm.spec.tsx
it('offers follow-up scheduling actions for tasks that require a visit', async () => {
  render(<TaskForm {...props} />);

  await user.selectOptions(screen.getByLabelText('Modo de ejecución'), TaskExecutionMode.FIELD_SERVICE);

  expect(screen.getByRole('button', { name: 'Agendar ahora' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Enviar a pendientes' })).toBeInTheDocument();
});
```

```tsx
// apps/portal/src/components/scheduling/SchedulingClient.spec.tsx
it('shows manual visit language instead of generic business capture', async () => {
  render(<SchedulingClient />);

  expect(screen.getByText('Solicitud manual')).toBeInTheDocument();
  expect(screen.queryByText('Agendar tarea')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @iwana/portal test -- --runInBand src/components/operations/TaskForm.spec.tsx src/components/scheduling/SchedulingClient.spec.tsx
```

Expected: FAIL because task follow-up actions and manual-only scheduling copy are not implemented yet.

- [ ] **Step 3: Implement task follow-up routing and manual-only scheduling copy**

Use the shared orchestration helper instead of a direct generic jump into scheduling.

```tsx
// apps/portal/src/components/operations/TaskForm.tsx
{getScheduledRequired(executionMode) && (
  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
    <p className="text-sm font-medium text-sky-900">Esta tarea requiere coordinación de visita.</p>
    <p className="mt-1 text-sm text-sky-700">
      Después de crearla, elige si deseas agendar de una vez o dejarla en pendientes.
    </p>
    <div className="mt-3 flex flex-wrap gap-3">
      <Button type="button" variant="secondary" onClick={() => setFollowUpAction('schedule-now')}>
        Agendar ahora
      </Button>
      <Button type="button" variant="secondary" onClick={() => setFollowUpAction('send-to-pending')}>
        Enviar a pendientes
      </Button>
    </div>
  </div>
)}
```

```ts
// apps/portal/src/components/operations/OperationsClient.tsx
const handleTaskCreated = async (task: OperationalTaskRecord, followUpAction: 'schedule-now' | 'send-to-pending' | null) => {
  if (!followUpAction) {
    return;
  }

  const result = await createTaskVisitRequestAndRoute({
    taskId: task.id,
    title: task.title,
    municipality: null,
    address: null,
    nextAction: followUpAction,
  });

  router.push(result.href);
};
```

```tsx
// apps/portal/src/components/scheduling/SchedulingClient.tsx
<PageHeader
  title="Programación"
  description="Coordina visitas agendadas, pendientes por asignar y solicitudes manuales excepcionales."
/>
```

```tsx
// apps/portal/src/components/scheduling/ScheduleEventForm.tsx
<DialogTitle>{isManualFlow ? 'Solicitud manual de visita' : 'Agendar visita'}</DialogTitle>
<DialogDescription>
  {isManualFlow
    ? 'Usa este flujo solo cuando la visita no proviene de CRM, Mesa de ayuda o Tareas.'
    : 'Confirma técnico, franja y contexto operativo de la visita.'}
</DialogDescription>
```

- [ ] **Step 4: Run the focused task and scheduling tests**

Run:

```bash
pnpm --filter @iwana/portal test -- --runInBand src/components/operations/TaskForm.spec.tsx src/components/scheduling/SchedulingClient.spec.tsx src/components/scheduling/PendingVisitRequestsView.spec.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/components/operations/TaskForm.tsx apps/portal/src/components/operations/TaskForm.spec.tsx apps/portal/src/components/operations/OperationsClient.tsx apps/portal/src/components/scheduling/SchedulingClient.tsx apps/portal/src/components/scheduling/ScheduleEventForm.tsx apps/portal/src/components/scheduling/SchedulingClient.spec.tsx apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx
git commit -m "feat: unify task scheduling through visit requests"
```

### Task 6: Update evidence and run end-to-end verification

**Files:**
- Modify: `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`
- Modify: `docs/informes/INFORME-MOD11-EJECUCION-OPERATIVA-DEFINICION-v1.0.md`

- [ ] **Step 1: Add the failing verification checklist locally**

Add a short evidence block before running commands.

```md
## 10. Verificacion de intake unificado

- CRM -> solicitud de visita -> agenda o pendientes
- Ticket -> solicitud de visita -> agenda o pendientes
- Tarea -> solicitud de visita -> agenda o pendientes
- Programacion manual solo como excepcion
```

- [ ] **Step 2: Run focused verification**

Run:

```bash
pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/services/visit-requests.service.spec.ts
pnpm --filter @iwana/portal test -- --runInBand src/components/crm/expedientes/ExpedienteSchedulingActions.spec.tsx src/components/assurance/AssuranceClient.spec.tsx src/components/operations/TaskForm.spec.tsx src/components/scheduling/visit-request-origin-orchestration.spec.ts src/components/scheduling/SchedulingClient.spec.tsx
pnpm --filter @iwana/api typecheck
pnpm --filter @iwana/portal typecheck
```

Expected:

- all focused tests PASS;
- typecheck PASS in api and portal.

- [ ] **Step 3: Run the portal E2E slice**

Run:

```bash
pnpm exec playwright test -c e2e/playwright.portal.config.ts --grep "CRM|ticket|tarea|pending visits|agenda"
```

Expected:

- PASS, or document the exact blocker in both informes if the repo still lacks one of the origin flows in E2E fixtures.

- [ ] **Step 4: Update the two live reports**

Record the new unified intake in both reports with absolute date `2026-06-23`.

```md
- 2026-06-23: Se consolidó el intake de Programación sobre `visit-requests` como embudo único para CRM, Mesa de ayuda y Tareas. La captura manual queda disponible solo como solicitud excepcional de visita.
```

- [ ] **Step 5: Commit**

```bash
git add docs/informes/INFORME-MOD09-FASE-02-v1.0.md docs/informes/INFORME-MOD11-EJECUCION-OPERATIVA-DEFINICION-v1.0.md
git commit -m "docs: record unified scheduling intake"
```

---

## Self-review

- **Spec coverage:** The plan covers the shared object (`visit-requests`), the three origin modules (CRM, Assurance, Tasks), manual-flow demotion, routing, labels, and evidence updates.
- **Placeholder scan:** No `TODO`, `TBD`, or “implement later” markers remain.
- **Type consistency:** The plan consistently uses `WorkOrderSourceContext.TASKS`, `VisitRequestNextAction`, and the existing `visit-requests` API instead of introducing a second intake model.

## Execution Handoff

Plan complete and saved to `docs/plans/2026-06-23-programacion-solicitud-visita-unificada.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
