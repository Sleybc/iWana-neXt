# CRM Post-Conversion Listing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar las bandejas operativas post-conversión de expedientes CRM, con semántica backend `view`, banner de conversión en detalle y navegación consistente entre expediente y subscriber.

**Architecture:** La solución extiende contratos existentes sin abrir nuevos endpoints ni cambiar schema. Backend centraliza la semántica de vistas y el portal consume esa fuente de verdad para tabs, búsqueda global controlada y señal mínima de conversión, preservando el vínculo inverso existente desde Subscriber 360°.

**Tech Stack:** NestJS 11, TypeScript estricto, TypeORM, Next.js App Router, React 19, Jest, Playwright, pnpm.

**Version:** 1.0  
**Estado:** Aprobado — listo para ejecución  
**Fecha:** 2026-05-11

---

## Source documents

- Rol: `docs/roles/Perfil_IA_Sr_Dev_Fullstack_v1.md`
- Spec de ejecución: `docs/specs/SPEC-MOD05-CRM-POSTCONVERSION-FULLSTACK-v1.0.md`
- Design aprobada: `docs/superpowers/specs/2026-05-11-crm-postconversion-listing-design.md`
- PRD rector: `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-03-v1.0.md`
- PRD complementario: `docs/prds/PRD-MOD05-CRM-AUTO-PIPELINE-v1.0.md`
- HLD: `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`
- ADR rector: `docs/adrs/ADR-027-Conversion-Expediente-Subscriber-Two-Stage.md`
- Informe vivo: `docs/informes/INFORME-MOD05-DEFINICION-v1.0.md`

## File map

- Create: `apps/api/src/modules/crm/expedientes/expediente-list-view.ts`
- Modify: `apps/api/src/modules/crm/expedientes/expedientes.controller.ts`
- Modify: `apps/api/src/modules/crm/expedientes/expedientes.module.ts`
- Modify: `apps/api/src/modules/crm/expedientes/expediente.service.ts`
- Modify: `apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts`
- Modify: `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`
- Modify: `apps/api/src/modules/crm/subscribers/subscribers.service.ts`
- Modify: `apps/api/src/modules/crm/subscribers/tests/subscribers.service.spec.ts`
- Create: `apps/portal/src/components/crm/expedientes/expediente-list-view.ts`
- Create: `apps/portal/src/components/crm/expedientes/expediente-list-view.spec.ts`
- Create: `apps/portal/src/components/crm/expedientes/ExpedienteConversionBanner.tsx`
- Create: `apps/portal/src/components/crm/expedientes/ExpedienteConversionBanner.spec.tsx`
- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/page.tsx`
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/page.spec.tsx`
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
- Modify: `apps/portal/src/components/crm/CrmOverviewClient.tsx`
- Modify: `e2e/tests/portal-crm-expedientes.spec.ts`
- Modify: `docs/informes/INFORME-MOD05-DEFINICION-v1.0.md`

### Task 1: Centralizar la semántica backend de `view`

**Files:**
- Create: `apps/api/src/modules/crm/expedientes/expediente-list-view.ts`
- Modify: `apps/api/src/modules/crm/expedientes/expedientes.controller.ts`
- Modify: `apps/api/src/modules/crm/expedientes/expediente.service.ts`
- Test: `apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts`
- Test: `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`

- [ ] **Step 1: Escribir la prueba roja del controller para `view` y precedencia**

```ts
it('propaga view al servicio y da precedencia a view sobre includeCompleted', async () => {
  expedienteServiceMock.findAll.mockResolvedValue({ data: [], total: 0 });

  await (controller as any).findAll(
    undefined,
    undefined,
    'Cliente demo',
    1,
    20,
    undefined,
    '900123456',
    'true',
    'converted',
  );

  expect(expedienteServiceMock.findAll).toHaveBeenCalledWith(
    expect.objectContaining({
      search: 'Cliente demo',
      documentNumber: '900123456',
      includeCompleted: true,
      view: 'converted',
    }),
  );
});
```

- [ ] **Step 2: Escribir la prueba roja del service para las cuatro vistas**

```ts
it('filtra open, converted, archive y all desde una sola regla de dominio', async () => {
  const baseRows = [
    buildExpediente({ id: 'exp-open', status: ExpedienteStatus.PRECALIFICADO }),
    buildExpediente({ id: 'exp-converted', status: ExpedienteStatus.INSTALACION_AGENDADA }),
    buildExpediente({ id: 'exp-active', status: ExpedienteStatus.CLIENTE_ACTIVO }),
    buildExpediente({ id: 'exp-archived', status: ExpedienteStatus.DESCARTADO }),
  ];

  mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
    callback({
      manager: {
        createQueryBuilder: jest.fn().mockReturnValue(buildFindAllQueryBuilder(baseRows)),
      },
    }),
  );

  await expect(service.findAll({ view: 'open', limit: 20, page: 1 })).resolves.toMatchObject({
    data: [expect.objectContaining({ id: 'exp-open' })],
    total: 1,
  });
  await expect(service.findAll({ view: 'converted', limit: 20, page: 1 })).resolves.toMatchObject({
    data: [expect.objectContaining({ id: 'exp-converted' })],
    total: 1,
  });
  await expect(service.findAll({ view: 'archive', limit: 20, page: 1 })).resolves.toMatchObject({
    data: expect.arrayContaining([
      expect.objectContaining({ id: 'exp-active' }),
      expect.objectContaining({ id: 'exp-archived' }),
    ]),
    total: 2,
  });
});
```

- [ ] **Step 3: Ejecutar las pruebas focalizadas y confirmar rojo**

Run: `pnpm --filter @iwana/api test -- src/modules/crm/expedientes/tests/expedientes.controller.spec.ts src/modules/crm/expedientes/tests/expediente.service.spec.ts`

Expected: FAIL porque `view` todavía no existe en controller/service y no hay helper compartido.

- [ ] **Step 4: Implementar `ExpedienteListView` y componerlo en controller + service**

```ts
export type ExpedienteListView = 'open' | 'converted' | 'archive' | 'all';

export function resolveExpedienteStatusesForView(
  view: ExpedienteListView,
): ExpedienteStatus[] | null {
  switch (view) {
    case 'open':
      return [
        ExpedienteStatus.NUEVO_POTENCIAL,
        ExpedienteStatus.PRECALIFICADO,
        ExpedienteStatus.VALIDANDO_COBERTURA,
        ExpedienteStatus.EN_COTIZACION,
        ExpedienteStatus.LISTO_PARA_INSTALACION,
      ];
    case 'converted':
      return [ExpedienteStatus.INSTALACION_AGENDADA];
    case 'archive':
      return [ExpedienteStatus.CLIENTE_ACTIVO, ExpedienteStatus.DESCARTADO];
    case 'all':
      return null;
  }
}
```

```ts
async findAll(
  @Query('includeCompleted') includeCompleted?: string,
  @Query('view') view?: string,
) {
  const result = await this.expedienteService.findAll({
    ...,
    includeCompleted: includeCompleted === 'true',
    view: parseExpedienteListView(view),
  });
  return result;
}
```

```ts
const effectiveView = filters.view ?? (includeCompleted ? 'all' : 'open');
const allowedStatuses = resolveExpedienteStatusesForView(effectiveView);

if (allowedStatuses && !status) {
  query.andWhere('expediente.status IN (:...allowedStatuses)', { allowedStatuses });
}
if (allowedStatuses && status) {
  query.andWhere('expediente.status = :status', { status });
}
if (!filters.view && includeCompleted) {
  // Compatibilidad temporal: conserva el comportamiento legado cuando no llega `view`.
}
```

- [ ] **Step 5: Añadir caso de `documentNumber` con vista aplicada y reejecutar**

Run: `pnpm --filter @iwana/api test -- src/modules/crm/expedientes/tests/expedientes.controller.spec.ts src/modules/crm/expedientes/tests/expediente.service.spec.ts`

Expected: PASS con `view` soportado, precedencia correcta y filtro exacto por documento conservado.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/crm/expedientes/expediente-list-view.ts \
  apps/api/src/modules/crm/expedientes/expedientes.controller.ts \
  apps/api/src/modules/crm/expedientes/expediente.service.ts \
  apps/api/src/modules/crm/expedientes/tests/expedientes.controller.spec.ts \
  apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts
git commit -m "feat(crm): add expediente list views"
```

### Task 2: Enriquecer `GET /crm/expedientes/:id` con `subscriberSummary`

**Files:**
- Modify: `apps/api/src/modules/crm/expedientes/expedientes.module.ts`
- Modify: `apps/api/src/modules/crm/expedientes/expediente.service.ts`
- Modify: `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`
- Modify: `apps/api/src/modules/crm/subscribers/subscribers.service.ts`
- Modify: `apps/api/src/modules/crm/subscribers/tests/subscribers.service.spec.ts`

- [ ] **Step 0: Declarar `subscribersServiceMock` en el setup del test de ExpedienteService**

Antes de escribir cualquier test rojo que use `SubscribersService`, añadir la declaración del mock en el bloque de setup del archivo `expediente.service.spec.ts`:

```ts
// Declarar junto al resto de mocks del módulo
const subscribersServiceMock = {
  findSummaryByExpedienteId: jest.fn(),
};

// En providers del TestingModule:
{ provide: SubscribersService, useValue: subscribersServiceMock },

// En beforeEach — reset para evitar contaminación entre tests:
subscribersServiceMock.findSummaryByExpedienteId.mockReset();
```

- [ ] **Step 1: Escribir la prueba roja del detalle vinculado**

```ts
it('retorna subscriberSummary cuando existe suscriptor vinculado por expedienteId', async () => {
  const expediente = buildExpediente({
    id: 'exp-linked',
    status: ExpedienteStatus.INSTALACION_AGENDADA,
  });

  mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
    callback({
      manager: {
        findOne: jest.fn().mockResolvedValueOnce(expediente),
      },
    }),
  );
  subscribersServiceMock.findSummaryByExpedienteId.mockResolvedValue({
    id: 'sub-1',
    status: SubscriberStatus.PROSPECT,
    fullName: 'Laura Pérez',
  });

  const result = await service.findById('exp-linked');

  expect((result as any).subscriberSummary).toEqual({
    id: 'sub-1',
    status: 'PROSPECT',
    fullName: 'Laura Pérez',
  });
});
```

- [ ] **Step 2: Ejecutar la prueba y confirmar rojo**

Run: `pnpm --filter @iwana/api test -- src/modules/crm/expedientes/tests/expediente.service.spec.ts`

Expected: FAIL porque `findById()` todavía no hidrata `subscriberSummary`.

- [ ] **Step 3: Escribir y ejecutar la prueba roja del read method en SubscribersService**

```ts
it('devuelve un summary mínimo por expedienteId', async () => {
  repository.findOne.mockResolvedValue(
    buildSubscriber({
      id: 'sub-1',
      expedienteId: 'exp-linked',
      status: SubscriberStatus.PROSPECT,
      firstName: 'Laura',
      lastName: 'Pérez',
    }),
  );

  await expect(service.findSummaryByExpedienteId('exp-linked')).resolves.toEqual({
    id: 'sub-1',
    status: SubscriberStatus.PROSPECT,
    fullName: 'Laura Pérez',
  });
});
```

Run: `pnpm --filter @iwana/api test -- src/modules/crm/subscribers/tests/subscribers.service.spec.ts`

Expected: FAIL porque `findSummaryByExpedienteId()` aún no existe.

- [ ] **Step 4: Implementar el read method y cablearlo desde ExpedientesModule**

```ts
async findSummaryByExpedienteId(expedienteId: string) {
  const subscriber = await this.subscriberRepository.findOne({
    where: { expedienteId },
  });

  if (!subscriber) {
    return null;
  }

  return {
    id: subscriber.id,
    status: subscriber.status,
    fullName:
      subscriber.commercialName ||
      subscriber.businessName ||
      [subscriber.firstName, subscriber.lastName].filter(Boolean).join(' ').trim(),
  };
}
```

```ts
@Module({
  imports: [
    ...,
    SubscribersModule,
  ],
  ...
})
export class ExpedientesModule {}
```

```ts
const subscriberSummary = await this.subscribersService.findSummaryByExpedienteId(id);
if (subscriberSummary) {
  Object.assign(entity, { subscriberSummary });
}
```

> El mock `subscribersServiceMock` ya fue declarado en Step 0. No redeclarar.

- [ ] **Step 5: Reejecutar las pruebas de service**

Run: `pnpm --filter @iwana/api test -- src/modules/crm/subscribers/tests/subscribers.service.spec.ts src/modules/crm/expedientes/tests/expediente.service.spec.ts`

Expected: PASS con `subscriberSummary` presente solo cuando exista vínculo.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/crm/expedientes/expedientes.module.ts \
  apps/api/src/modules/crm/expedientes/expediente.service.ts \
  apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts \
  apps/api/src/modules/crm/subscribers/subscribers.service.ts \
  apps/api/src/modules/crm/subscribers/tests/subscribers.service.spec.ts
git commit -m "feat(crm): expose expediente subscriber summary"
```

### Task 3: Adaptar `api-client` y listado del portal a vistas operativas

**Files:**
- Create: `apps/portal/src/components/crm/expedientes/expediente-list-view.ts`
- Create: `apps/portal/src/components/crm/expedientes/expediente-list-view.spec.ts`
- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/page.tsx`
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/page.spec.tsx`

- [ ] **Step 1: Escribir la prueba roja del helper de vista**

```ts
import {
  getDefaultExpedienteView,
  getExpedienteViewLabel,
  getOriginViewFromStatus,
} from './expediente-list-view';

describe('expediente list view', () => {
  it('should default to open and map archive statuses', () => {
    expect(getDefaultExpedienteView()).toBe('open');
    expect(getExpedienteViewLabel('archive')).toBe('Archivo');
    expect(getOriginViewFromStatus('CLIENTE_ACTIVO')).toBe('archive');
  });
});
```

- [ ] **Step 2: Escribir la prueba roja de la página para vista default, conteos y búsqueda global**

```ts
it('abre en Abiertas, muestra conteos y usa all solo cuando hay búsqueda o documento', async () => {
  crmApiMock.listExpedientes.mockResolvedValue({ data: [], total: 0 });
  crmApiMock.getPipelineSummary.mockResolvedValue({
    data: {
      NUEVO_POTENCIAL: 2,
      PRECALIFICADO: 1,
      VALIDANDO_COBERTURA: 1,
      EN_COTIZACION: 1,
      LISTO_PARA_INSTALACION: 1,
      INSTALACION_AGENDADA: 2,
      CLIENTE_ACTIVO: 3,
      DESCARTADO: 1,
    },
    total: 11,
  });

  render(<ExpedientesPage />);

  await waitFor(() => {
    expect(crmApiMock.listExpedientes).toHaveBeenCalledWith(
      expect.objectContaining({ view: 'open', limit: 100 }),
    );
  });
  expect(screen.getByText('Abiertas')).toBeInTheDocument();
  expect(screen.getByText('6')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Buscar en todo CRM' }));
  expect(crmApiMock.listExpedientes).toHaveBeenCalledTimes(1);

  fireEvent.change(screen.getByLabelText('Documento exacto'), {
    target: { value: '900123456' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar en todo CRM' }));

  await waitFor(() => {
    expect(crmApiMock.listExpedientes).toHaveBeenLastCalledWith(
      expect.objectContaining({ view: 'all', documentNumber: '900123456' }),
    );
  });
});
```

- [ ] **Step 3: Escribir la prueba roja del empty state por vista**

```ts
it('muestra empty state distinto para Convertidas y Archivo', async () => {
  crmApiMock.getPipelineSummary.mockResolvedValue({
    data: {
      NUEVO_POTENCIAL: 0,
      PRECALIFICADO: 0,
      VALIDANDO_COBERTURA: 0,
      EN_COTIZACION: 0,
      LISTO_PARA_INSTALACION: 0,
      INSTALACION_AGENDADA: 0,
      CLIENTE_ACTIVO: 0,
      DESCARTADO: 0,
    },
    total: 0,
  });
  crmApiMock.listExpedientes.mockResolvedValue({ data: [], total: 0 });

  render(<ExpedientesPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Convertidas' }));
  expect(await screen.findByText('Sin expedientes convertidos en transición')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Archivo' }));
  expect(await screen.findByText('Sin histórico comercial cerrado')).toBeInTheDocument();
});
```

- [ ] **Step 4: Ejecutar pruebas del portal y confirmar rojo**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/app/dashboard/crm/expedientes/page.spec.tsx src/components/crm/expedientes/expediente-list-view.spec.ts`

Expected: FAIL porque el helper no existe, `listExpedientes()` no acepta `view`, no hay `getPipelineSummary()` en la página y no existen empty states por vista.

- [ ] **Step 5: Extender `api-client` y helper de vistas**

```ts
export type ExpedienteListView = 'open' | 'converted' | 'archive' | 'all';

export interface ExpedienteSubscriberSummary {
  id: string;
  status: 'LEAD' | 'PROSPECT' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  fullName: string;
}
```

```ts
listExpedientes: (
  filters?: {
    view?: ExpedienteListView;
    status?: ExpedienteStatus;
    ...
  },
) => {
  if (filters?.view) searchParams.set('view', filters.view);
  ...
}
```

```ts
const VIEW_TABS = [
  { value: 'open', label: 'Abiertas' },
  { value: 'converted', label: 'Convertidas' },
  { value: 'archive', label: 'Archivo' },
] as const;
```

- [ ] **Step 6: Implementar tabs, badge de origen, conteos y retorno automático**

```ts
const [activeView, setActiveView] = useState<ExpedienteListView>('open');
const [globalSearchEnabled, setGlobalSearchEnabled] = useState(false);
const [summary, setSummary] = useState<Record<string, number>>({});

const effectiveView =
  globalSearchEnabled && (search.trim() || documentNumber.trim()) ? 'all' : activeView;

const [summaryResponse, response] = await Promise.all([
  crmApi.getPipelineSummary(),
  crmApi.listExpedientes({
    view: effectiveView,
    ...
  }),
]);
```

```tsx
<Button type="button" variant={activeView === 'converted' ? 'primary' : 'ghost'}>
  Convertidas
</Button>
<Badge variant="neutral">{summary.INSTALACION_AGENDADA ?? 0}</Badge>
```

```tsx
{effectiveView === 'all' && (
  <Badge variant="neutral">{getExpedienteViewLabel(getOriginViewFromStatus(expediente.status))}</Badge>
)}
```

- [ ] **Step 7: Reejecutar pruebas del portal**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/app/dashboard/crm/expedientes/page.spec.tsx src/components/crm/expedientes/expediente-list-view.spec.ts`

Expected: PASS con `open` por defecto, conteos por vista, empty states diferenciados y `all` condicionado.

- [ ] **Step 8: Commit**

```bash
git add apps/portal/src/components/crm/expedientes/expediente-list-view.ts \
  apps/portal/src/components/crm/expedientes/expediente-list-view.spec.ts \
  apps/portal/src/lib/api-client.ts \
  apps/portal/src/app/dashboard/crm/expedientes/page.tsx \
  apps/portal/src/app/dashboard/crm/expedientes/page.spec.tsx
git commit -m "feat(portal): add CRM expediente operational views"
```

### Task 4: Mostrar banner de conversión y ajustar overview CRM

**Files:**
- Create: `apps/portal/src/components/crm/expedientes/ExpedienteConversionBanner.tsx`
- Create: `apps/portal/src/components/crm/expedientes/ExpedienteConversionBanner.spec.tsx`
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
- Modify: `apps/portal/src/components/crm/CrmOverviewClient.tsx`
- Modify: `apps/portal/src/lib/api-client.ts`

- [ ] **Step 1: Escribir la prueba roja del banner**

```tsx
import { render, screen } from '@testing-library/react';
import { ExpedienteConversionBanner } from './ExpedienteConversionBanner';

describe('ExpedienteConversionBanner', () => {
  it('should render CTA when subscriber summary exists', () => {
    render(
      <ExpedienteConversionBanner
        status="INSTALACION_AGENDADA"
        subscriberSummary={{ id: 'sub-1', status: 'PROSPECT', fullName: 'Laura Pérez' }}
      />,
    );

    expect(screen.getByText('Este expediente ya fue convertido a suscriptor.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al suscriptor' })).toHaveAttribute(
      'href',
      '/dashboard/crm/subscribers/sub-1',
    );
  });
});
```

- [ ] **Step 2: Ejecutar la prueba y confirmar rojo**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/crm/expedientes/ExpedienteConversionBanner.spec.tsx`

Expected: FAIL porque el componente aún no existe y `ExpedienteRecord` no tipa `subscriberSummary`.

- [ ] **Step 3: Implementar banner reusable y montarlo en el detalle**

```tsx
export function ExpedienteConversionBanner({
  status,
  subscriberSummary,
}: {
  status: ExpedienteStatus;
  subscriberSummary?: ExpedienteSubscriberSummary;
}) {
  if (status !== 'INSTALACION_AGENDADA' && status !== 'CLIENTE_ACTIVO') {
    return null;
  }

  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900">
      <p className="font-semibold">Este expediente ya fue convertido a suscriptor.</p>
      <p className="mt-1">La operación posterior se gestiona desde Suscriptores.</p>
      {subscriberSummary ? (
        <Button asChild size="sm">
          <Link href={`/dashboard/crm/subscribers/${subscriberSummary.id}`}>Ir al suscriptor</Link>
        </Button>
      ) : null}
    </div>
  );
}
```

```tsx
<ExpedienteConversionBanner
  status={expediente.status}
  subscriberSummary={expediente.subscriberSummary}
/>
```

- [ ] **Step 4: Ajustar el overview para separar operativo vs histórico**

```ts
const compactMetrics = [
  {
    label: 'Total',
    value: loading ? '...' : String(metrics.total ?? 0),
    description: 'Expedientes de la cola operativa del CRM',
  },
  ...
  {
    label: 'Activos',
    value: loading ? '...' : String(metrics.activos),
    description: 'Cierre histórico ya convertido a suscriptor',
  },
];
```

- [ ] **Step 5: Reejecutar pruebas del banner y typecheck del portal**

Run: `pnpm --filter @iwana/portal test -- --runInBand src/components/crm/expedientes/ExpedienteConversionBanner.spec.tsx`

Expected: PASS con banner visible y CTA funcional.

Run: `pnpm --filter @iwana/portal typecheck`

Expected: PASS con `subscriberSummary` tipado y overview actualizado.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/components/crm/expedientes/ExpedienteConversionBanner.tsx \
  apps/portal/src/components/crm/expedientes/ExpedienteConversionBanner.spec.tsx \
  apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx \
  apps/portal/src/components/crm/CrmOverviewClient.tsx \
  apps/portal/src/lib/api-client.ts
git commit -m "feat(portal): show CRM conversion banner"
```

### Task 5: Cubrir E2E portal y actualizar informe vivo

**Files:**
- Modify: `e2e/tests/portal-crm-expedientes.spec.ts`
- Modify: `docs/informes/INFORME-MOD05-DEFINICION-v1.0.md`

- [ ] **Step 1: Escribir o ampliar el flujo E2E de bandejas y trazabilidad**

```ts
test('permite navegar entre abiertas, convertidas, archivo y subscriber 360', async ({ page }) => {
  await setAuthSession(page);
  await setupCrmMocks(page, {
    listViews: {
      open: [openExpediente],
      converted: [convertedExpediente],
      archive: [archivedExpediente],
      all: [convertedExpediente],
    },
    // Mock del detail con subscriberSummary incluido desde el inicio para que
    // el test falle por ausencia de UI (tabs/banner), no por mock faltante.
    expedienteDetail: {
      [convertedExpediente.id]: {
        ...convertedExpediente,
        subscriberSummary: {
          id: 'sub-1',
          status: 'PROSPECT',
          fullName: 'Empresa convertida SAS',
        },
      },
    },
  });

  await page.goto('/dashboard/crm/expedientes');
  await page.getByRole('button', { name: 'Convertidas' }).click();
  await expect(page.getByText('Expedientes ya convertidos a suscriptor')).toBeVisible();
  await page.getByRole('button', { name: 'Buscar en todo CRM' }).click();
  await page.getByRole('link', { name: 'Empresa convertida SAS' }).click();
  await expect(page.getByText('Este expediente ya fue convertido a suscriptor.')).toBeVisible();
  await page.getByRole('link', { name: 'Ir al suscriptor' }).click();
  await expect(page.getByRole('link', { name: 'Ir al expediente origen' })).toBeVisible();
});
```

- [ ] **Step 2: Ejecutar el E2E focal y confirmar rojo**

Run: `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-expedientes.spec.ts`

Expected: FAIL porque los mocks y la UI aún no cubren tabs, búsqueda `all` ni banner de conversión.

- [ ] **Step 3: Ajustar mocks y assertions al contrato final**

```ts
if (pathname.endsWith('/crm/expedientes') && method === 'GET') {
  const view = new URL(url).searchParams.get('view') ?? 'open';
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      data: expedientesByView[view],
      total: expedientesByView[view].length,
    }),
  });
  return;
}

if (pathname.endsWith(`/crm/expedientes/${convertedExpediente.id}`) && method === 'GET') {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      data: {
        ...convertedExpediente,
        subscriberSummary: {
          id: 'sub-1',
          status: 'PROSPECT',
          fullName: 'Empresa convertida SAS',
        },
      },
      completeness: buildCompleteness(),
      sectionCompleteness: [],
      installationReadiness: buildInstallationReadiness(),
      missingRequirements: [],
      pipelineRecommendation: buildRecommendation(),
    }),
  });
  return;
}
```

- [ ] **Step 4: Actualizar el informe vivo con implementación, pruebas y alcance**

```md
### Evidencia funcional del 2026-05-11 — post-conversión CRM

Se implementó la segmentación operativa de expedientes en `Abiertas`, `Convertidas`, `Archivo` y búsqueda global `Todo CRM`, con fuente de verdad backend vía `view`.

Archivos impactados:

- `apps/api/src/modules/crm/expedientes/...`
- `apps/portal/src/app/dashboard/crm/expedientes/...`
- `e2e/tests/portal-crm-expedientes.spec.ts`
```

- [ ] **Step 5: Ejecutar validación final del alcance**

Run: `pnpm --filter @iwana/api test -- src/modules/crm/expedientes/tests/expedientes.controller.spec.ts src/modules/crm/expedientes/tests/expediente.service.spec.ts`

Expected: PASS.

Run: `pnpm --filter @iwana/portal test -- --runInBand`

Expected: PASS.

Run: `pnpm --filter @iwana/api typecheck && pnpm --filter @iwana/portal typecheck`

Expected: PASS.

Run: `pnpm lint && pnpm build`

Expected: PASS.

Run: `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-expedientes.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add e2e/tests/portal-crm-expedientes.spec.ts \
  docs/informes/INFORME-MOD05-DEFINICION-v1.0.md
git commit -m "test(crm): cover post-conversion expediente views"
```

---

## Self-review checklist

- Spec coverage:
  - `GET /crm/expedientes` con `view` -> Task 1
  - `subscriberSummary` en detalle -> Task 2
  - tabs `Abiertas/Convertidas/Archivo` + `Todo CRM` -> Task 3
  - banner de conversión + CTA -> Task 4
  - overview semántico + E2E + informe -> Task 5
- Placeholder scan: no se dejan `TODO`, `TBD` ni referencias vacías.
- Type consistency:
  - `ExpedienteListView` se define una vez y se reutiliza en backend y portal.
  - `subscriberSummary` se nombra igual en contrato backend, `api-client` y banner portal.
- TDD sequencing:
  - Task 2: `subscribersServiceMock` declarado en Step 0 antes del test rojo de Step 1.
  - No redeclaración en Step 4.
- E2E fidelidad:
  - Task 5 Step 1: detail mock incluido desde el inicio; test falla por ausencia de UI, no por mock faltante.
- Validación final:
  - `pnpm lint && pnpm build` incluidos en Task 5 Step 5.

> **Estado de revisión:** ✅ Las 3 recomendaciones del plan review han sido incorporadas. Plan aprobado.
