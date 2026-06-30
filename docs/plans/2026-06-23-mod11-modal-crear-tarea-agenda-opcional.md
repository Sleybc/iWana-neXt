# MOD11 Modal Crear Tarea con Agenda Opcional Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el modal actual de `Agendar tarea` en `Programacion` por un flujo task-first que cree primero `Task`, conserve `responsable` y `destinatario`, y trate agenda y OT como continuidad opcional.

**Architecture:** La implementación no recrea `TasksModule`; lo reutiliza. El cambio principal vive en portal: se extrae un núcleo compartido de captura de tarea desde `TaskForm`, se crea un wizard específico para `Programacion` y se orquesta `tasksApi.create()` seguido por `wfmApi.events.create()` y `tasksApi.linkScheduleEvent()` solo cuando el modo de ejecución lo exija. `SchedulingQuickCreateDialog` deja de ser un flujo paralelo y pasa a ser una entrada precargada al mismo wizard.

**Tech Stack:** Next.js App Router, React, TypeScript estricto, react-hook-form, Zod, `@iwana/ui`, `@iwana/shared`, Jest, pnpm.

---

## Source documents

- `docs/specs/2026-06-23-mod11-crear-tarea-agenda-opcional-design.md`
- `docs/specs/2026-06-22-mod11-operaciones-tareas-design.md`
- `docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md`
- `docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md`
- `apps/portal/src/components/operations/TaskForm.tsx`
- `apps/portal/src/components/scheduling/SchedulingClient.tsx`
- `apps/portal/src/components/scheduling/SchedulingQuickCreateDialog.tsx`
- `apps/portal/src/components/scheduling/ScheduleEventForm.tsx`

## File map

### Shared task intake primitives

- Create: `apps/portal/src/components/operations/task-intake-schema.ts`
- Create: `apps/portal/src/components/operations/TaskCoreFields.tsx`
- Modify: `apps/portal/src/components/operations/TaskForm.tsx`
- Modify: `apps/portal/src/components/operations/TaskForm.spec.tsx`

### Scheduling task-first wizard

- Create: `apps/portal/src/components/scheduling/CreateTaskSchedulingDialog.tsx`
- Create: `apps/portal/src/components/scheduling/CreateTaskSchedulingDialog.spec.tsx`
- Create: `apps/portal/src/components/scheduling/scheduling-task-orchestration.ts`
- Create: `apps/portal/src/components/scheduling/scheduling-task-orchestration.spec.ts`
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx`
- Modify: `apps/portal/src/components/scheduling/SchedulingQuickCreateDialog.tsx`

### Optional shared UI helpers

- Create: `apps/portal/src/components/scheduling/TaskSchedulingStep.tsx`
- Create: `apps/portal/src/components/scheduling/TaskAgendaStep.tsx`
- Create: `apps/portal/src/components/scheduling/TaskOperationalFollowUpStep.tsx`

### Test coverage

- Modify: `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx`
- Modify: `apps/portal/src/components/scheduling/ScheduleEventForm.spec.tsx`

---

### Task 1: Extraer el núcleo compartido de captura de tarea desde Operaciones

**Files:**
- Create: `apps/portal/src/components/operations/task-intake-schema.ts`
- Create: `apps/portal/src/components/operations/TaskCoreFields.tsx`
- Modify: `apps/portal/src/components/operations/TaskForm.tsx`
- Test: `apps/portal/src/components/operations/TaskForm.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('shows execution mode before any scheduling fields and keeps responsible and recipient separated', async () => {
  render(
    <TaskForm
      responsibleOptions={[{ value: 'user-123', label: 'Laura Ruiz' }]}
      internalAreaOptions={[{ value: 'operations-area', label: 'Operaciones' }]}
      internalUserOptions={[{ value: 'user-123', label: 'Laura Ruiz' }]}
      onSubmit={jest.fn()}
      isSubmitting={false}
      error={null}
    />,
  );

  expect(screen.getByLabelText('Modo de ejecucion')).toBeInTheDocument();
  expect(screen.getByLabelText('Responsable')).toBeInTheDocument();
  expect(screen.getByLabelText('Tipo de destinatario')).toBeInTheDocument();
  expect(screen.queryByLabelText('Fecha de visita')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/operations/TaskForm.spec.tsx`  
Expected: FAIL because the shared extraction points do not exist yet and the form cannot be reused outside `TaskForm`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/portal/src/components/operations/task-intake-schema.ts
import { z } from 'zod';
import { TaskExecutionMode, TaskPriority, TaskRecipientType, TaskType } from '@iwana/shared';

export const taskIntakeSchema = z.object({
  title: z.string().trim().min(1, 'El titulo es obligatorio.').max(200),
  type: z.nativeEnum(TaskType),
  priority: z.nativeEnum(TaskPriority),
  executionMode: z.nativeEnum(TaskExecutionMode),
  dueAt: z.string().optional().or(z.literal('')),
  responsibleRefId: z.string().min(1, 'Selecciona un responsable.'),
  recipientType: z.nativeEnum(TaskRecipientType),
  recipientRefId: z.string().optional().or(z.literal('')),
  recipientLabel: z.string().trim().max(160).optional().or(z.literal('')),
  channel: z.enum(['PHONE', 'WHATSAPP', 'IN_PERSON', 'EMAIL', 'OTHER']).default('PHONE'),
  description: z.string().trim().max(500).optional().or(z.literal('')),
});

export type TaskIntakeValues = z.infer<typeof taskIntakeSchema>;
```

```tsx
// apps/portal/src/components/operations/TaskCoreFields.tsx
interface TaskCoreFieldsProps {
  control: Control<TaskIntakeValues>;
  register: UseFormRegister<TaskIntakeValues>;
  watch: UseFormWatch<TaskIntakeValues>;
  setValue: UseFormSetValue<TaskIntakeValues>;
  errors: FieldErrors<TaskIntakeValues>;
  responsibleOptions: Array<{ value: string; label: string }>;
  internalAreaOptions: Array<{ value: string; label: string }>;
  internalUserOptions: Array<{ value: string; label: string }>;
  disabled?: boolean;
  hideSubmitSection?: boolean;
}

export function TaskCoreFields(props: TaskCoreFieldsProps) {
  const recipientType = props.watch('recipientType');
  const executionMode = props.watch('executionMode');

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Input id="task-title" label="Titulo" {...props.register('title')} />
      <Controller
        control={props.control}
        name="type"
        render={({ field }) => (
          <Select id="task-type" label="Tipo de tarea" value={field.value} onChange={field.onChange} options={TYPE_OPTIONS} />
        )}
      />
      <Controller
        control={props.control}
        name="executionMode"
        render={({ field }) => (
          <Select
            id="task-execution-mode"
            label="Modo de ejecucion"
            value={field.value}
            onChange={field.onChange}
            options={EXECUTION_MODE_OPTIONS}
          />
        )}
      />
      <Controller
        control={props.control}
        name="responsibleRefId"
        render={({ field }) => (
          <Select
            id="task-responsible"
            label="Responsable"
            value={field.value}
            onChange={field.onChange}
            options={props.responsibleOptions}
          />
        )}
      />
      <Controller
        control={props.control}
        name="recipientType"
        render={({ field }) => (
          <Select
            id="task-recipient-type"
            label="Tipo de destinatario"
            value={field.value}
            onChange={field.onChange}
            options={RECIPIENT_TYPE_OPTIONS}
          />
        )}
      />
      {executionMode === TaskExecutionMode.DUE_DATE && (
        <Input id="task-due-at" type="datetime-local" label="Fecha objetivo" {...props.register('dueAt')} />
      )}
      {recipientType === TaskRecipientType.INTERNAL_AREA && (
        <Controller
          control={props.control}
          name="recipientRefId"
          render={({ field }) => (
            <Select
              id="task-recipient"
              label="Destinatario"
              value={field.value}
              onChange={field.onChange}
              options={props.internalAreaOptions}
            />
          )}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/operations/TaskForm.spec.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/components/operations/task-intake-schema.ts \
  apps/portal/src/components/operations/TaskCoreFields.tsx \
  apps/portal/src/components/operations/TaskForm.tsx \
  apps/portal/src/components/operations/TaskForm.spec.tsx
git commit -m "refactor: extract shared task intake core fields"
```

### Task 2: Crear el wizard task-first para Programacion

**Files:**
- Create: `apps/portal/src/components/scheduling/CreateTaskSchedulingDialog.tsx`
- Create: `apps/portal/src/components/scheduling/TaskSchedulingStep.tsx`
- Create: `apps/portal/src/components/scheduling/TaskAgendaStep.tsx`
- Create: `apps/portal/src/components/scheduling/TaskOperationalFollowUpStep.tsx`
- Test: `apps/portal/src/components/scheduling/CreateTaskSchedulingDialog.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('hides agenda fields until execution mode requires scheduling', async () => {
  render(
    <CreateTaskSchedulingDialog
      open={true}
      technicians={[]}
      responsibleOptions={[{ value: 'user-123', label: 'Laura Ruiz' }]}
      internalAreaOptions={[{ value: 'operations-area', label: 'Operaciones' }]}
      internalUserOptions={[{ value: 'user-123', label: 'Laura Ruiz' }]}
      onOpenChange={jest.fn()}
      onSubmit={jest.fn()}
      isSubmitting={false}
      error={null}
    />,
  );

  expect(screen.getByText('Paso 1 de 3')).toBeInTheDocument();
  expect(screen.queryByLabelText('Fecha de visita')).not.toBeInTheDocument();

  await userEvent.selectOptions(screen.getByLabelText('Modo de ejecucion'), 'SCHEDULED');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

  expect(screen.getByText('Paso 2 de 3')).toBeInTheDocument();
  expect(screen.getByLabelText('Fecha de visita')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/CreateTaskSchedulingDialog.spec.tsx`  
Expected: FAIL because the dialog and step components do not exist.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/portal/src/components/scheduling/CreateTaskSchedulingDialog.tsx
export function CreateTaskSchedulingDialog(props: CreateTaskSchedulingDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const form = useForm<TaskIntakeValues & AgendaValues & FollowUpValues>({
    resolver: zodResolver(createTaskSchedulingSchema),
    defaultValues: buildDefaultValues(props.initialValues),
  });

  const executionMode = form.watch('executionMode');
  const requiresAgenda =
    executionMode === TaskExecutionMode.SCHEDULED ||
    executionMode === TaskExecutionMode.FIELD_SERVICE;

  const totalSteps = requiresAgenda ? 3 : 2;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{props.contextTitle ?? 'Crear tarea'}</DialogTitle>
          <DialogDescription>
            Registra el trabajo, define responsable y destinatario, y decide si necesita agenda.
          </DialogDescription>
        </DialogHeader>

        <p className="portal-eyebrow">Paso {step} de {totalSteps}</p>

        {step === 1 && <TaskSchedulingStep form={form} {...props} />}
        {step === 2 && requiresAgenda && <TaskAgendaStep form={form} technicians={props.technicians} />}
        {step === totalSteps && <TaskOperationalFollowUpStep form={form} />}

        <div className="flex justify-between gap-3">
          <Button type="button" variant="ghost" onClick={() => setStep((current) => Math.max(1, current - 1) as 1 | 2 | 3)}>
            Atras
          </Button>
          {step < totalSteps ? (
            <Button type="button" onClick={() => setStep((current) => (current + 1) as 1 | 2 | 3)}>
              Continuar
            </Button>
          ) : (
            <Button type="button" loading={props.isSubmitting} onClick={form.handleSubmit((values) => props.onSubmit(values))}>
              {requiresAgenda ? 'Crear tarea y agenda' : 'Crear tarea'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/CreateTaskSchedulingDialog.spec.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/components/scheduling/CreateTaskSchedulingDialog.tsx \
  apps/portal/src/components/scheduling/TaskSchedulingStep.tsx \
  apps/portal/src/components/scheduling/TaskAgendaStep.tsx \
  apps/portal/src/components/scheduling/TaskOperationalFollowUpStep.tsx \
  apps/portal/src/components/scheduling/CreateTaskSchedulingDialog.spec.tsx
git commit -m "feat: add task-first scheduling wizard dialog"
```

### Task 3: Orquestar Task -> Agenda -> OT usando APIs existentes

**Files:**
- Create: `apps/portal/src/components/scheduling/scheduling-task-orchestration.ts`
- Create: `apps/portal/src/components/scheduling/scheduling-task-orchestration.spec.ts`
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx`
- Modify: `apps/portal/src/components/scheduling/SchedulingQuickCreateDialog.tsx`

- [ ] **Step 1: Write the failing test**

```ts
it('creates the task first and only creates a schedule event when executionMode requires it', async () => {
  tasksApi.create = jest.fn().mockResolvedValue({ id: 'task-001', taskNumber: 'TSK-001' });
  wfmApi.events.create = jest.fn().mockResolvedValue({ id: 'evt-001', workOrderId: null });
  tasksApi.linkScheduleEvent = jest.fn().mockResolvedValue({});

  await createTaskWithOptionalScheduling({
    values: {
      title: 'Instalacion barrio norte',
      type: 'INSTALLATION',
      priority: 'HIGH',
      responsibleRefId: 'user-123',
      recipientType: 'PROSPECT',
      recipientRefId: 'pros-1',
      recipientLabel: 'Cliente Demo',
      executionMode: 'SCHEDULED',
      scheduledDateLocal: '2026-06-24',
      scheduledStartTimeLocal: '09:00',
      durationMinutes: 120,
    },
  });

  expect(tasksApi.create).toHaveBeenCalled();
  expect(wfmApi.events.create).toHaveBeenCalled();
  expect(tasksApi.linkScheduleEvent).toHaveBeenCalledWith('task-001', { scheduleEventId: 'evt-001' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/scheduling-task-orchestration.spec.ts src/components/scheduling/SchedulingClient.spec.tsx`  
Expected: FAIL because the orchestration helper does not exist and `SchedulingClient` still uses `wfmApi.events.create()` as its primary action.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/portal/src/components/scheduling/scheduling-task-orchestration.ts
export async function createTaskWithOptionalScheduling({
  values,
  sourceContext,
  linkedTicketId,
}: CreateTaskWithOptionalSchedulingArgs) {
  const task = await tasksApi.create({
    type: values.taskType,
    priority: values.priority,
    title: values.title,
    description: values.description || null,
    originContext: sourceContext,
    ticketId: linkedTicketId ?? null,
    responsibleType: 'USER',
    responsibleRefId: values.responsibleRefId,
    recipientType: values.recipientType,
    recipientRefId: values.recipientRefId || null,
    recipientLabel: values.recipientLabel || null,
    executionMode: values.executionMode,
    dueAt: values.executionMode === 'DUE_DATE' ? toIsoFromDatetimeLocal(values.dueAt) : null,
    scheduledRequired: ['SCHEDULED', 'FIELD_SERVICE'].includes(values.executionMode),
  });

  if (!['SCHEDULED', 'FIELD_SERVICE'].includes(values.executionMode)) {
    return { task, event: null };
  }

  const event = await wfmApi.events.create({
    title: values.title,
    type: values.scheduleWorkType,
    assignedUserId: values.agendaResponsibleRefId ?? values.responsibleRefId,
    scheduledStartAt: toIsoFromDatetimeLocal(`${values.scheduledDateLocal}T${values.scheduledStartTimeLocal}`),
    scheduledEndAt: toIsoFromDatetimeLocal(values.scheduledEndAtLocal),
    address: values.address || undefined,
    municipality: values.municipality || undefined,
    sector: values.sector || undefined,
    ticketId: linkedTicketId ?? undefined,
    expedienteId: values.expedienteId || undefined,
    workOrder: values.createWorkOrder ? {
      summary: values.workOrderSummary,
      priority: values.workOrderPriority,
      sourceContext: values.workOrderSourceContext,
    } : undefined,
  });

  await tasksApi.linkScheduleEvent(task.id, { scheduleEventId: event.id });

  if (event.workOrderId) {
    await tasksApi.linkWorkOrder(task.id, { workOrderId: event.workOrderId });
  }

  return { task, event };
}
```

```tsx
// apps/portal/src/components/scheduling/SchedulingClient.tsx
<CreateTaskSchedulingDialog
  open={isCreateOpen}
  initialValues={createInitialValues}
  technicians={technicians}
  responsibleOptions={buildTechnicianOptions(technicians)}
  internalAreaOptions={INTERNAL_AREA_OPTIONS}
  internalUserOptions={buildTechnicianOptions(technicians)}
  error={createError}
  isSubmitting={isCreateSubmitting}
  onOpenChange={setIsCreateOpen}
  onSubmit={async (values) => {
    setIsCreateSubmitting(true);
    try {
      const result = await createTaskWithOptionalScheduling({
        values,
        sourceContext: expedienteContextId ? 'CRM' : 'MANUAL',
        linkedTicketId: installationTicketId,
      });
      setFeedback(
        result.event
          ? `La tarea ${result.task.taskNumber} quedo creada y la agenda fue vinculada.`
          : `La tarea ${result.task.taskNumber} quedo creada sin agenda.`
      );
      await loadData();
    } finally {
      setIsCreateSubmitting(false);
    }
  }}
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/scheduling-task-orchestration.spec.ts src/components/scheduling/SchedulingClient.spec.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/components/scheduling/scheduling-task-orchestration.ts \
  apps/portal/src/components/scheduling/scheduling-task-orchestration.spec.ts \
  apps/portal/src/components/scheduling/SchedulingClient.tsx \
  apps/portal/src/components/scheduling/SchedulingQuickCreateDialog.tsx
git commit -m "feat: orchestrate task-first scheduling flow"
```

### Task 4: Consolidar quick create, labels y regresiones del flujo actual

**Files:**
- Modify: `apps/portal/src/components/scheduling/SchedulingQuickCreateDialog.tsx`
- Modify: `apps/portal/src/components/scheduling/ScheduleEventForm.spec.tsx`
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('opens the same wizard from quick create with slot values prefilled', async () => {
  render(<SchedulingClient surface="agenda" />);

  fireEvent.click(await screen.findByRole('button', { name: /crear tarea rapida/i }));

  expect(await screen.findByText('Crear tarea con agenda sugerida')).toBeInTheDocument();
  expect(screen.getByText('Paso 1 de 3')).toBeInTheDocument();
  expect(screen.getByDisplayValue('09:00')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/SchedulingClient.spec.tsx src/components/scheduling/ScheduleEventForm.spec.tsx`  
Expected: FAIL because quick create still owns a parallel mini-form and the labels still assume `Agendar tarea`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/portal/src/components/scheduling/SchedulingQuickCreateDialog.tsx
export function SchedulingQuickCreateDialog(props: SchedulingQuickCreateDialogProps) {
  if (!props.open || !props.initialValues) {
    return null;
  }

  return (
    <CreateTaskSchedulingDialog
      open={props.open}
      contextTitle="Crear tarea con agenda sugerida"
      initialValues={props.initialValues}
      technicians={props.technicians}
      responsibleOptions={props.responsibleOptions}
      internalAreaOptions={props.internalAreaOptions}
      internalUserOptions={props.internalUserOptions}
      error={props.error}
      isSubmitting={props.isSubmitting}
      onOpenChange={props.onOpenChange}
      onSubmit={props.onSubmit}
    />
  );
}
```

```tsx
// apps/portal/src/components/scheduling/ScheduleEventForm.spec.tsx
expect(screen.queryByRole('button', { name: 'Agendar tarea' })).not.toBeInTheDocument();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/CreateTaskSchedulingDialog.spec.tsx src/components/scheduling/scheduling-task-orchestration.spec.ts src/components/scheduling/SchedulingClient.spec.tsx src/components/operations/TaskForm.spec.tsx`  
Expected: PASS.

Run: `pnpm --filter @iwana/portal typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/components/scheduling/SchedulingQuickCreateDialog.tsx \
  apps/portal/src/components/scheduling/ScheduleEventForm.spec.tsx \
  apps/portal/src/components/scheduling/SchedulingClient.spec.tsx \
  apps/portal/src/components/scheduling/CreateTaskSchedulingDialog.spec.tsx \
  apps/portal/src/components/scheduling/scheduling-task-orchestration.spec.ts \
  apps/portal/src/components/operations/TaskForm.spec.tsx
git commit -m "test: align scheduling entry points with task-first wizard"
```

---

## Self-review

### Spec coverage

- **Crear primero la Task:** Task 3.
- **Mantener responsable y destinatario separados:** Task 1 + Task 2.
- **Agenda opcional y condicional:** Task 2 + Task 3.
- **Eliminar flujo paralelo de quick create:** Task 4.
- **No duplicar ticket/OT en el intake base:** Task 2 + Task 3.

### Placeholder scan

- No quedan `TODO`, `TBD` ni referencias del tipo “similar a”.
- Cada tarea lista archivos exactos, pruebas y comandos concretos.

### Type consistency

- `TaskExecutionMode` se usa igual en extracción de intake, wizard y orquestación.
- La acción primaria visible es `Crear tarea` o `Crear tarea y agenda`, no `Agendar tarea`.
- El helper `createTaskWithOptionalScheduling()` concentra la secuencia `Task -> Agenda -> OT`.

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-06-23-mod11-modal-crear-tarea-agenda-opcional.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
