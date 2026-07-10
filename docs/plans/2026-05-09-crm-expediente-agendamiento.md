# CRM Expediente Agendamiento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar el flujo manual de `Agendar instalación` desde expedientes CRM listos para instalación hacia `/dashboard/scheduling`, con formulario WFM prellenado y sincronización posterior del estado a `INSTALACION_AGENDADA`.

**Architecture:** El primer corte se resuelve sin cambiar boundaries ni contratos backend nuevos. CRM dispara navegación con `expedienteId` por query params seguros, Scheduling consulta el expediente autenticado para prellenar el formulario y, después de crear el evento WFM, actualiza CRM vía `transitionExpedienteStatus`.

**Tech Stack:** Next.js App Router, React 19, TypeScript estricto, Jest, portal `api-client`, contratos existentes CRM y WFM.

**Version:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-05-09

---

## Source documents

- Rol: `docs/roles/_historico/Perfil_IA_Sr_Dev_Fullstack_v1.md`
- PRD CRM: `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md`
- PRD WFM: `docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md`
- HLD CRM: `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`
- HLD WFM: `docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md`
- ADR CRM pipeline: `docs/adrs/ADR-026-Pipeline-CRM-8-Estados.md`
- ADR WFM boundary: `docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md`
- Informe vivo WFM: `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`
- Informe vivo CRM: `docs/informes/INFORME-MOD05-GESTION-COMERCIAL-OPERATIVA-FASE01-v1.0.md`

## File map

- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
- Create: `apps/portal/src/components/crm/expedientes/expediente-scheduling.ts`
- Create: `apps/portal/src/components/crm/expedientes/expediente-scheduling.spec.ts`
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx`
- Modify: `apps/portal/src/components/scheduling/ScheduleEventForm.tsx`
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx`
- Modify: `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`
- Modify: `docs/informes/INFORME-MOD05-GESTION-COMERCIAL-OPERATIVA-FASE01-v1.0.md`

### Task 1: Regla de elegibilidad y CTA desde CRM

**Files:**
- Create: `apps/portal/src/components/crm/expedientes/expediente-scheduling.ts`
- Test: `apps/portal/src/components/crm/expedientes/expediente-scheduling.spec.ts`
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`

- [ ] **Step 1: Escribir prueba de la regla de elegibilidad**

```ts
import { canScheduleInstallation, buildSchedulingHref } from './expediente-scheduling';

describe('expediente scheduling', () => {
  it('should allow scheduling only for listo para instalacion with readiness and 75 percent', () => {
    expect(
      canScheduleInstallation({
        status: 'LISTO_PARA_INSTALACION',
        overallProgress: 75,
        canTransition: true,
      }),
    ).toBe(true);
    expect(
      canScheduleInstallation({
        status: 'EN_COTIZACION',
        overallProgress: 90,
        canTransition: true,
      }),
    ).toBe(false);
  });

  it('should build scheduling href with expediente context', () => {
    expect(buildSchedulingHref('550e8400-e29b-41d4-a716-446655440000')).toBe(
      '/dashboard/scheduling?open=create&type=INSTALLATION&expedienteId=550e8400-e29b-41d4-a716-446655440000',
    );
  });
});
```

- [ ] **Step 2: Ejecutar la prueba y confirmar rojo**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/crm/expedientes/expediente-scheduling.spec.ts`
Expected: FAIL porque el helper todavía no existe.

- [ ] **Step 3: Implementar helper mínimo**

```ts
export function canScheduleInstallation(input: {
  status: string;
  overallProgress: number;
  canTransition: boolean;
}) {
  return (
    input.status === 'LISTO_PARA_INSTALACION' &&
    input.canTransition &&
    input.overallProgress >= 75
  );
}

export function buildSchedulingHref(expedienteId: string) {
  return `/dashboard/scheduling?open=create&type=INSTALLATION&expedienteId=${expedienteId}`;
}
```

- [ ] **Step 4: Reemplazar CTA en la página de expediente**

```ts
const canSchedule = canScheduleInstallation({
  status: expediente.status,
  overallProgress,
  canTransition: installationReadiness?.canTransition ?? false,
});

<Button
  type="button"
  variant="secondary"
  onClick={() => router.push(buildSchedulingHref(id))}
  disabled={!canSchedule}
>
  Agendar instalación
</Button>
```

- [ ] **Step 5: Ejecutar la prueba y typecheck del portal**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/crm/expedientes/expediente-scheduling.spec.ts`
Expected: PASS.

Run: `pnpm --filter @iwana/portal typecheck`
Expected: PASS.

### Task 2: Prellenado de Scheduling desde query params seguros

**Files:**
- Modify: `apps/portal/src/components/scheduling/ScheduleEventForm.tsx`
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx`
- Test: `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx`

- [ ] **Step 1: Escribir prueba del flujo de apertura desde CRM**

```ts
it('should open create dialog prefilled from expediente query params', async () => {
  currentSearchParams = 'open=create&type=INSTALLATION&expedienteId=550e8400-e29b-41d4-a716-446655440000';
  crmApiMock.getExpediente.mockResolvedValue(buildExpedienteResponse());

  render(<SchedulingClient />);

  expect(await screen.findByText('Crear evento operativo')).toBeInTheDocument();
  expect(screen.getByLabelText('Expediente')).toHaveValue('550e8400-e29b-41d4-a716-446655440000');
  expect(screen.getByLabelText('Título operativo')).toHaveValue('Instalación - Cliente demo');
});
```

- [ ] **Step 2: Ejecutar prueba y confirmar rojo**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/SchedulingClient.spec.tsx`
Expected: FAIL porque SchedulingClient aún no lee query params ni precarga el formulario.

- [ ] **Step 3: Implementar lectura de query params y contexto CRM**

```ts
const searchParams = useSearchParams();
const router = useRouter();
const pathname = usePathname();

useEffect(() => {
  if (searchParams.get('open') !== 'create') return;
  if (searchParams.get('type') !== 'INSTALLATION') return;
  const expedienteId = searchParams.get('expedienteId');
  if (!expedienteId) return;
  void hydrateCreateFromExpediente(expedienteId);
}, [searchParams]);
```

- [ ] **Step 4: Extender el formulario con `initialValues` y reset reactivo**

```ts
<ScheduleEventForm
  initialValues={createInitialValues}
  technicians={technicians}
  ...
/>
```

- [ ] **Step 5: Reejecutar prueba de Scheduling**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/SchedulingClient.spec.tsx`
Expected: PASS con el modal abierto y datos prellenados.

### Task 3: Crear evento WFM y sincronizar estado CRM

**Files:**
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx`
- Test: `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx`

- [ ] **Step 1: Escribir prueba de sincronización CRM post-creación**

```ts
it('should mark expediente as instalacion agendada after creating the WFM event', async () => {
  currentSearchParams = 'open=create&type=INSTALLATION&expedienteId=550e8400-e29b-41d4-a716-446655440000';
  crmApiMock.getExpediente.mockResolvedValue(buildExpedienteResponse());
  wfmApiMock.events.create.mockResolvedValue(buildCreatedEvent());
  crmApiMock.transitionExpedienteStatus.mockResolvedValue({ data: { id: '550e...' } });

  render(<SchedulingClient />);
  fireEvent.change(await screen.findByLabelText('Técnico responsable'), {
    target: { value: 'tech-1' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));

  await waitFor(() => {
    expect(crmApiMock.transitionExpedienteStatus).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      expect.objectContaining({ targetStatus: 'INSTALACION_AGENDADA' }),
    );
  });
});
```

- [ ] **Step 2: Ejecutar prueba y confirmar rojo**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/SchedulingClient.spec.tsx`
Expected: FAIL porque el submit aún no sincroniza CRM.

- [ ] **Step 3: Implementar transición CRM después de crear el evento**

```ts
const createdEvent = await wfmApi.events.create(payload);
if (expedienteContextId && payload.expedienteId === expedienteContextId) {
  await crmApi.transitionExpedienteStatus(expedienteContextId, {
    targetStatus: 'INSTALACION_AGENDADA',
    reason: 'Instalación agendada desde WFM',
  });
}
```

- [ ] **Step 4: Manejar fallo parcial sin perder el evento creado**

```ts
try {
  await crmApi.transitionExpedienteStatus(...);
} catch (transitionError) {
  setInfoMessage('El evento se creó, pero no fue posible actualizar el expediente automáticamente.');
}
```

- [ ] **Step 5: Ejecutar pruebas focalizadas y typecheck**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/crm/expedientes/expediente-scheduling.spec.ts src/components/scheduling/SchedulingClient.spec.tsx src/components/scheduling/SchedulingOverview.spec.tsx`
Expected: PASS.

Run: `pnpm --filter @iwana/portal typecheck`
Expected: PASS.

### Task 4: Actualizar informes vivos

**Files:**
- Modify: `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`
- Modify: `docs/informes/INFORME-MOD05-GESTION-COMERCIAL-OPERATIVA-FASE01-v1.0.md`

- [ ] **Step 1: Añadir evidencia del flujo CRM -> Scheduling**

```md
- CTA `Agendar instalación` desde expedientes en `LISTO_PARA_INSTALACION` con readiness >= 75%.
- Apertura de `/dashboard/scheduling` con formulario WFM prellenado desde `expedienteId`.
- Sincronización de expediente a `INSTALACION_AGENDADA` después de crear el evento.
```

- [ ] **Step 2: Registrar comandos ejecutados y resultado**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/crm/expedientes/expediente-scheduling.spec.ts src/components/scheduling/SchedulingClient.spec.tsx src/components/scheduling/SchedulingOverview.spec.tsx && pnpm --filter @iwana/portal typecheck`
Expected: PASS.
