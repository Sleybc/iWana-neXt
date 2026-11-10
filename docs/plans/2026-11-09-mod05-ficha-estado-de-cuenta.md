# MOD05 Ficha — Estado de cuenta y valores heredados · Plan de implementación

> **Para quien ejecute:** skill obligatoria `executing-plans`. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** que la Vista general de la ficha del suscriptor muestre el estado de cuenta, y que la política de cobro del contrato diga qué valor hereda de la empresa.

**Arquitectura:** solo portal (`apps/portal`), sin endpoints ni contratos nuevos. Un hook carga una vez el estado de cuenta en `SubscriberDetailClient` y lo comparte con la Vista general (panel nuevo `SubscriberStatementSummary`) y con la pestaña Facturación. `BillingContractPolicy` lee además la política de la empresa (`GET /billing/policy`) para rotular los campos heredados.

**Stack:** Next.js 16 App Router (Client Components), React, `@iwana/ui`, `@iwana/shared` (contratos de billing), Jest + Testing Library, Playwright.

**Spec:** [2026-11-09-mod05-ficha-estado-de-cuenta-ux](../specs/2026-11-09-mod05-ficha-estado-de-cuenta-ux.md), aprobada (G0) el 2026-11-09.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `apps/portal/src/components/billing/billing-copy.ts` | Modificar | Textos del aviso de suplantación, compartidos (R-A11) |
| `apps/portal/src/components/billing/use-subscriber-statement.ts` | Crear | Carga única del estado de cuenta (R-A2, R-A3) |
| `apps/portal/src/components/billing/SubscriberBillingTab.tsx` | Modificar | Recibe la carga en lugar de hacerla |
| `apps/portal/src/components/billing/subscriber-billing-tab.spec.tsx` | Modificar (solo el arnés) | Monta la pestaña con el hook; las expectativas no cambian |
| `apps/portal/src/components/billing/SubscriberStatementSummary.tsx` | Crear | Panel «Estado de cuenta» (R-A4 a R-A12) |
| `apps/portal/src/components/billing/subscriber-statement-summary.spec.tsx` | Crear | CA-1, CA-3 a CA-7 |
| `apps/portal/src/components/billing/subscriber-statement-sharing.spec.tsx` | Crear | CA-8 y la parte de CA-2 del hook |
| `apps/portal/src/components/crm/subscribers/SubscriberOverviewTab.tsx` | Modificar | Recibe el panel como contenido (`accountSummary`) y lo pone encima de las columnas |
| `apps/portal/src/components/crm/subscribers/SubscriberDetailClient.tsx` | Modificar | Usa el hook, arma el panel y entrega la carga a la pestaña |
| `apps/portal/src/components/crm/subscribers/SubscriberDetailClient.mod05-deuda.portal.spec.tsx` | Modificar (prueba nueva) | CA-2 en el contenedor |
| `apps/portal/src/components/billing/BillingContractPolicy.tsx` | Modificar | Valores heredados visibles (R-B1 a R-B6) |
| `apps/portal/src/components/billing/billing-contract-policy.spec.tsx` | Crear | CA-9, CA-10 |
| `e2e/tests/portal-billing-flow.spec.ts` | Modificar (caso existente ampliado) | CA-11 |
| `docs/informes/INFORME-MOD05-FICHA-ESTADO-CUENTA-CIERRE-v1.0.md` | Crear | Evidencia de gates |

## Reglas de ejecución

- Todo en `main`, sin ramas ni worktrees. El árbol tiene cambios ajenos sin commitear (unos 83 archivos, entre ellos specs del portal): **no** hacer `stash`, `reset` ni `checkout` de rutas ajenas, y commitear solo las rutas de este plan.
- `subscriber-billing-tab.spec.tsx` y `SubscriberDetailClient.mod05-deuda.portal.spec.tsx` ya tienen, al redactar este plan, un cambio de otra sesión sin commitear: los mocks de `usePermissions` y `useRouter` devuelven un objeto estable. Este plan edita otras partes de esos archivos y conserva ese cambio. Al commitear (Tarea 8) no se puede separar por hunks sin modo interactivo, así que primero hay que esperar a que esa otra sesión publique o pedir al usuario cómo proceder.
- No ejecutar `scripts/dev.mjs` ni `pnpm dev` para probar: reinicia servicios de otras sesiones. El E2E usa el entorno que ya esté corriendo (Tarea 7).
- No matar procesos `node` por nombre.
- Las pruebas se corren con `jest` directo, sin la caché de Turbo, y se reporta el conteo real (`Tests:` y `Test Suites:`).

## Asignación de agentes y skills

| Tarea | Agente | Skills obligatorias | De apoyo (condición) | Descartadas (motivo) |
|---|---|---|---|---|
| 0, 8 | sesión principal | `iwana-test-evidence`, `verification-before-completion` | — | `iwana-checkpoint-commit` hasta que el usuario pida el commit |
| 1–5 | `fe-platform` o sesión principal | `frontend-dev-guidelines`, `testing-patterns`, `system-vocabulary-review` | `frontend-security-coder` (si se muestra algún dato del titular además de montos y números) | `core-components` (no se crean primitives), `nestjs-expert` (sin backend) |
| 6 | `fe-platform` o sesión principal | `frontend-dev-guidelines`, `testing-patterns`, `system-vocabulary-review` | `wcag-audit-patterns` (si la auditoría visual marca P1 de accesibilidad) | `tailwind-patterns` (no hay clases nuevas fuera de las existentes) |
| 7 | `sr-qa` | `e2e-testing-patterns` | `e2e-triage` (si el caso falla) | — |
| 8 | `test-change-reviewer`, `gate-verifier` | — | `iwana-identity-ui-review` (audit-ui) | `boundary-reviewer` y `contract-drift-reviewer` (sin cambios en `apps/api` ni `packages/shared`) |

La ejecución recomendada es **en esta sesión**, en secuencia. No lleva launcher (ADR-107 D8: solo para olas multiagente o que ejecuta otra sesión).

---

### Tarea 0: Línea base de pruebas del portal

- [ ] **Paso 1: Medir la línea base**

```bash
cd apps/portal && pnpm exec jest --silent 2>&1 | tail -n 6
```

Esperado: las líneas `Test Suites:` y `Tests:` con sus conteos. Anotarlas para la Tarea 8. Si hay fallos, anotar cuáles: son ajenos a este plan y no se corrigen aquí.

---

### Tarea 1: Textos compartidos del aviso de suplantación

**Archivos:**
- Modificar: `apps/portal/src/components/billing/billing-copy.ts` (al final)
- Modificar: `apps/portal/src/components/billing/SubscriberBillingTab.tsx:32-39, 78-84`

- [ ] **Paso 1: Agregar las constantes al final de `billing-copy.ts`**

```ts
export const IMPERSONATION_HOLD_TITLE =
  'Cobro suspendido preventivamente por investigación de suplantación de identidad (Ley 2573 de 2022).';
export const IMPERSONATION_HOLD_NOTICE = 'No se generarán nuevos cobros hasta resolución.';
```

- [ ] **Paso 2: Usarlas en `SubscriberBillingTab.tsx`**

En el import de `./billing-copy` agregar `IMPERSONATION_HOLD_NOTICE` e `IMPERSONATION_HOLD_TITLE`, y reemplazar el bloque de `impersonationHold` por:

```tsx
      {data.impersonationHold ? (
        <PortalAlert
          variant="info"
          title={IMPERSONATION_HOLD_TITLE}
          description={IMPERSONATION_HOLD_NOTICE}
        />
      ) : null}
```

- [ ] **Paso 3: Verificar que la pestaña no cambió**

```bash
cd apps/portal && pnpm exec jest src/components/billing/subscriber-billing-tab.spec.tsx
```

Esperado: PASS, 5 pruebas (la de suplantación compara el texto literal, así que prueba que no cambió).

---

### Tarea 2: Carga compartida del estado de cuenta

**Archivos:**
- Crear: `apps/portal/src/components/billing/use-subscriber-statement.ts`
- Modificar: `apps/portal/src/components/billing/SubscriberBillingTab.tsx:3, 26, 40-45, 47-58`
- Modificar: `apps/portal/src/components/billing/subscriber-billing-tab.spec.tsx` (arnés)

- [ ] **Paso 1: Crear el hook**

```ts
'use client';

import { useCallback } from 'react';
import type { BillingAccountStatement } from '@iwana/shared';
import { billingApi } from '@/lib/api-client';
import { useBillingLoad } from './billing-ui';

/** Una sola carga del estado de cuenta por ficha, compartida por Vista general y Facturación. */
export function useSubscriberStatement(subscriberId: string, enabled: boolean) {
  const load = useCallback(
    (): Promise<BillingAccountStatement | null> =>
      enabled && subscriberId ? billingApi.statement(subscriberId) : Promise.resolve(null),
    [subscriberId, enabled],
  );
  return useBillingLoad(load);
}

export type SubscriberStatementLoad = ReturnType<typeof useSubscriberStatement>;
```

- [ ] **Paso 2: Cambiar el arnés de la prueba de la pestaña (antes de tocar la pestaña)**

En `subscriber-billing-tab.spec.tsx`, agregar el import y un componente de arnés:

```tsx
import { useSubscriberStatement } from './use-subscriber-statement';

function TabWithStatement({ subscriberId }: { subscriberId: string }) {
  const statement = useSubscriberStatement(subscriberId, true);
  return <SubscriberBillingTab subscriberId={subscriberId} contracts={[]} statement={statement} />;
}
```

Reemplazar las dos llamadas de render:

```tsx
  return render(<TabWithStatement subscriberId={statement.subscriberId} />);
```

```tsx
    render(<TabWithStatement subscriberId={STATEMENT.subscriberId} />);
```

Ninguna expectativa cambia.

- [ ] **Paso 3: Comprobar que falla**

```bash
cd apps/portal && pnpm exec tsc --noEmit -p . 2>&1 | grep subscriber-billing-tab
```

Esperado: error de tipos porque `SubscriberBillingTab` aún no acepta `statement`.

- [ ] **Paso 4: Cambiar la pestaña para que reciba la carga**

En `SubscriberBillingTab.tsx`:
- import de React: `import { useState, type FormEvent } from 'react';` (sale `useCallback`);
- import de `./billing-ui`: quitar `useBillingLoad`;
- agregar `import type { SubscriberStatementLoad } from './use-subscriber-statement';`;
- reemplazar la firma y la carga:

```tsx
export function SubscriberBillingTab({
  subscriberId,
  contracts,
  statement,
}: {
  subscriberId: string;
  contracts: Contract[];
  statement: SubscriberStatementLoad;
}) {
  const { hasPermission } = usePermissions();
  const canRegister = hasPermission(AccessPermissionKey.BILLING_PAYMENTS_REGISTER);
  const canManagePolicy = hasPermission(AccessPermissionKey.BILLING_POLICY_MANAGE);
  const { data, loading, error, reload } = statement;
```

El resto del componente no cambia: `changed()` ya llama a `reload()`, que ahora es la recarga compartida.

- [ ] **Paso 5: Correr la prueba de la pestaña**

```bash
cd apps/portal && pnpm exec jest src/components/billing/subscriber-billing-tab.spec.tsx
```

Esperado: PASS, 5 pruebas. (`SubscriberDetailClient` queda con error de tipos hasta la Tarea 5; no commitear entre medio.)

---

### Tarea 3: Panel «Estado de cuenta»

**Archivos:**
- Crear: `apps/portal/src/components/billing/subscriber-statement-summary.spec.tsx`
- Crear: `apps/portal/src/components/billing/SubscriberStatementSummary.tsx`

- [ ] **Paso 1: Escribir las pruebas**

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BillingAccountStatement, BillingDocumentResponse } from '@iwana/shared';
import { formatBillingDate } from '@/components/crm/subscribers/billing-cycle-ui';
import { SubscriberStatementSummary } from './SubscriberStatementSummary';
import {
  IMPERSONATION_HOLD_TITLE,
  PROTECTED_LABEL,
  PROTECTED_NOTICE,
  formatBillingMoney,
} from './billing-copy';
import type { SubscriberStatementLoad } from './use-subscriber-statement';

const SUBSCRIBER_ID = '55555555-5555-4555-8555-555555555555';

function buildDocument(overrides: Partial<BillingDocumentResponse>): BillingDocumentResponse {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    tenantId: '22222222-2222-4222-8222-222222222222',
    periodId: '33333333-3333-4333-8333-333333333333',
    contractId: '44444444-4444-4444-8444-444444444444',
    subscriberId: SUBSCRIBER_ID,
    status: 'EMITIDO',
    number: 'DC-000101',
    dueDate: '2026-11-19',
    periodStart: '2026-10-05',
    periodEnd: '2026-11-04',
    coveredStart: '2026-10-05',
    paymentState: 'PENDIENTE',
    buyerProtected: false,
    subtotal: '100.00',
    taxTotal: '19.00',
    total: '119.00',
    unbilledAdditionalCount: 0,
    createdAt: '2026-11-05T12:00:00.000Z',
    updatedAt: '2026-11-05T12:00:00.000Z',
    pendingAmount: '119.00',
    ...overrides,
  };
}

const STATEMENT: BillingAccountStatement = {
  subscriberId: SUBSCRIBER_ID,
  buyerProtected: false,
  impersonationHold: false,
  totalInvoiced: '119.00',
  totalPaid: '0.00',
  totalPending: '119.00',
  creditBalance: '25.00',
  documents: [],
  payments: [],
  contractSummaries: [],
};

function loaded(data: BillingAccountStatement): SubscriberStatementLoad {
  return { data, loading: false, error: null, reload: jest.fn() };
}

function renderSummary(statement: SubscriberStatementLoad, onOpenBilling = jest.fn()) {
  render(<SubscriberStatementSummary statement={statement} onOpenBilling={onOpenBilling} />);
  return { onOpenBilling, region: screen.getByRole('region', { name: 'Estado de cuenta' }) };
}

describe('SubscriberStatementSummary (spec 2026-11-09 §3)', () => {
  it('CA-1: muestra deuda, saldo a favor y los tres pendientes más antiguos', () => {
    const documents = [
      buildDocument({ id: 'a1111111-1111-4111-8111-111111111111', number: 'DC-4', dueDate: '2026-12-19' }),
      buildDocument({ id: 'a2222222-2222-4222-8222-222222222222', number: 'DC-1', dueDate: '2026-09-19' }),
      buildDocument({ id: 'a3333333-3333-4333-8333-333333333333', number: 'DC-3', dueDate: '2026-11-19' }),
      buildDocument({ id: 'a4444444-4444-4444-8444-444444444444', number: 'DC-2', dueDate: '2026-10-19' }),
    ];
    const { region } = renderSummary(loaded({ ...STATEMENT, totalPending: '476.00', documents }));

    expect(within(region).getByText('Deuda pendiente')).toBeInTheDocument();
    expect(within(region).getByText(formatBillingMoney('476.00'))).toBeInTheDocument();
    expect(within(region).getByText('Saldo a favor')).toBeInTheDocument();
    expect(within(region).getByText(formatBillingMoney('25.00'))).toBeInTheDocument();
    const items = within(region).getAllByRole('listitem');
    expect(items.map((item) => within(item).getByText(/^DC-/u).textContent)).toEqual([
      'DC-1',
      'DC-2',
      'DC-3',
    ]);
    expect(items[0]).toHaveTextContent(`Vence ${formatBillingDate('2026-09-19')}`);
  });

  it('CA-3: anuncia los vencidos con texto además del color', () => {
    const { region } = renderSummary(
      loaded({ ...STATEMENT, documents: [buildDocument({ paymentState: 'VENCIDO' })] }),
    );
    expect(within(region).getByText('Tiene documentos vencidos')).toBeInTheDocument();
    expect(within(within(region).getByRole('listitem')).getByText('Vencido')).toBeInTheDocument();
  });

  it('CA-4: enlaza a Facturación desde el encabezado y desde «Ver los N documentos»', async () => {
    const user = userEvent.setup();
    const dueDates = ['2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01'];
    const documents = dueDates.map((dueDate, index) =>
      buildDocument({ id: `b${index}111111-1111-4111-8111-111111111111`, number: `DC-${index}`, dueDate }),
    );
    const { onOpenBilling, region } = renderSummary(loaded({ ...STATEMENT, documents }));

    await user.click(within(region).getByRole('button', { name: 'Ver los 5 documentos pendientes' }));
    await user.click(within(region).getByRole('button', { name: 'Ver facturación' }));
    expect(onOpenBilling).toHaveBeenCalledTimes(2);
  });

  it('CA-5: sin pendientes lo dice y mantiene las métricas', () => {
    const { region } = renderSummary(loaded({ ...STATEMENT, totalPending: '0.00' }));
    expect(within(region).getByText('No hay documentos de cobro pendientes')).toBeInTheDocument();
    expect(within(region).getByText('Deuda pendiente')).toBeInTheDocument();
  });

  it('CA-6: muestra los avisos de titular en custodia y de suplantación', () => {
    const { region } = renderSummary(
      loaded({ ...STATEMENT, buyerProtected: true, impersonationHold: true }),
    );
    expect(within(region).getByText(PROTECTED_LABEL)).toBeInTheDocument();
    expect(within(region).getByText(PROTECTED_NOTICE)).toBeInTheDocument();
    expect(within(region).getByText(IMPERSONATION_HOLD_TITLE)).toBeInTheDocument();
  });

  it('CA-7: un error ofrece reintentar', async () => {
    const user = userEvent.setup();
    const reload = jest.fn();
    const { region } = renderSummary({ data: null, loading: false, error: 'Falla', reload });
    await user.click(within(region).getByRole('button', { name: 'Reintentar' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Paso 2: Comprobar que falla**

```bash
cd apps/portal && pnpm exec jest src/components/billing/subscriber-statement-summary.spec.tsx
```

Esperado: FAIL, «Cannot find module './SubscriberStatementSummary'».

- [ ] **Paso 3: Crear el componente**

```tsx
'use client';

import { ChevronRight } from 'lucide-react';
import type { BillingAccountStatement } from '@iwana/shared';
import { Badge, cn } from '@iwana/ui';
import {
  PortalAlert,
  PortalMetricCard,
  PortalPanel,
  portalInlineTextLinkClassName,
} from '@/components/shared/portal-ui';
import { formatBillingDate } from '@/components/crm/subscribers/billing-cycle-ui';
import { pendingDocuments } from './BillingPaymentDialog';
import {
  formatBillingMoney,
  IMPERSONATION_HOLD_NOTICE,
  IMPERSONATION_HOLD_TITLE,
  PAYMENT_STATES,
  PROTECTED_LABEL,
  PROTECTED_NOTICE,
} from './billing-copy';
import { BillingLoadState } from './billing-ui';
import type { SubscriberStatementLoad } from './use-subscriber-statement';

const VISIBLE_DOCUMENTS = 3;

/** Estado de cuenta en la Vista general de la ficha (spec 2026-11-09 §3). */
export function SubscriberStatementSummary({
  statement,
  onOpenBilling,
}: {
  statement: SubscriberStatementLoad;
  onOpenBilling: () => void;
}) {
  const { data, loading, error, reload } = statement;
  return (
    <PortalPanel
      as="section"
      labelled
      title="Estado de cuenta"
      actions={<OpenBillingLink label="Ver facturación" onClick={onOpenBilling} />}
      contentClassName="space-y-4"
    >
      {data ? (
        <StatementBody statement={data} onOpenBilling={onOpenBilling} />
      ) : (
        <BillingLoadState loading={loading} error={error} onRetry={reload} />
      )}
    </PortalPanel>
  );
}

function StatementBody({
  statement,
  onOpenBilling,
}: {
  statement: BillingAccountStatement;
  onOpenBilling: () => void;
}) {
  const pending = pendingDocuments(statement.documents);
  const overdue = PAYMENT_STATES.VENCIDO;
  const hasOverdue = statement.documents.some((document) => document.paymentState === 'VENCIDO');
  return (
    <>
      {statement.buyerProtected ? (
        <PortalAlert variant="info" title={PROTECTED_LABEL} description={PROTECTED_NOTICE} />
      ) : null}
      {statement.impersonationHold ? (
        <PortalAlert
          variant="info"
          title={IMPERSONATION_HOLD_TITLE}
          description={IMPERSONATION_HOLD_NOTICE}
        />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <PortalMetricCard
          eyebrow="Cartera"
          title="Deuda pendiente"
          value={formatBillingMoney(statement.totalPending)}
          accent={hasOverdue ? 'warning' : 'neutral'}
          description={
            hasOverdue ? (
              <Badge variant={overdue.variant}>Tiene documentos vencidos</Badge>
            ) : undefined
          }
        />
        <PortalMetricCard
          eyebrow="Crédito"
          title="Saldo a favor"
          value={formatBillingMoney(statement.creditBalance)}
        />
      </div>
      {pending.length ? (
        <ul className="divide-y divide-gray-200 dark:divide-dark-border">
          {pending.slice(0, VISIBLE_DOCUMENTS).map((document) => (
            <li
              key={document.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="text-sm font-semibold">{document.number ?? 'Documento sin número'}</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Periodo {formatBillingDate(document.periodStart)} –{' '}
                  {formatBillingDate(document.periodEnd)} · Vence{' '}
                  {formatBillingDate(document.dueDate)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {document.paymentState === 'VENCIDO' ? (
                  <Badge variant={overdue.variant}>{overdue.label}</Badge>
                ) : null}
                <span className="text-sm font-semibold tabular-nums">
                  {formatBillingMoney(document.pendingAmount ?? '0')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          No hay documentos de cobro pendientes
        </p>
      )}
      {pending.length > VISIBLE_DOCUMENTS ? (
        <OpenBillingLink
          label={`Ver los ${pending.length} documentos pendientes`}
          onClick={onOpenBilling}
        />
      ) : null}
    </>
  );
}

function OpenBillingLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(portalInlineTextLinkClassName, 'min-h-11 gap-1')}
    >
      {label}
      <ChevronRight className="h-4 w-4" aria-hidden />
    </button>
  );
}
```

- [ ] **Paso 4: Correr las pruebas**

```bash
cd apps/portal && pnpm exec jest src/components/billing/subscriber-statement-summary.spec.tsx
```

Esperado: PASS, 6 pruebas.

---

### Tarea 4: Prueba de la carga compartida

**Archivos:**
- Crear: `apps/portal/src/components/billing/subscriber-statement-sharing.spec.tsx`

- [ ] **Paso 1: Escribir la prueba**

```tsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BillingAccountStatement } from '@iwana/shared';
import { SubscriberBillingTab } from './SubscriberBillingTab';
import { SubscriberStatementSummary } from './SubscriberStatementSummary';
import { useSubscriberStatement } from './use-subscriber-statement';

const mockStatement = jest.fn();
const mockDocuments = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    billingApi: {
      statement: (...args: unknown[]) => mockStatement(...args),
      documents: (...args: unknown[]) => mockDocuments(...args),
      document: jest.fn(),
      documentPdf: jest.fn(),
      issue: jest.fn(),
      voidDocument: jest.fn(),
    },
  };
});

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    let ctx: Record<string, unknown> | undefined;
    return () => (ctx ??= { hasPermission: () => false });
  })(),
}));

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/dashboard/crm/subscribers/1',
  useRouter: (() => {
    let router: Record<string, unknown> | undefined;
    return () => (router ??= { replace: jest.fn(), push: jest.fn() });
  })(),
}));

const STATEMENT: BillingAccountStatement = {
  subscriberId: '55555555-5555-4555-8555-555555555555',
  buyerProtected: false,
  impersonationHold: false,
  totalInvoiced: '119.00',
  totalPaid: '95.00',
  totalPending: '24.00',
  creditBalance: '25.00',
  documents: [],
  payments: [],
  contractSummaries: [],
};

const EMPTY_PAGE = {
  data: [],
  meta: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasMore: false,
    mode: 'page',
    nextCursor: null,
    totalIsEstimate: false,
    capabilities: { randomAccess: true, sortableFields: [] },
    sort: null,
  },
};

function Harness({ enabled }: { enabled: boolean }) {
  const statement = useSubscriberStatement(STATEMENT.subscriberId, enabled);
  return (
    <>
      <SubscriberStatementSummary statement={statement} onOpenBilling={() => undefined} />
      <SubscriberBillingTab
        subscriberId={STATEMENT.subscriberId}
        contracts={[]}
        statement={statement}
      />
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDocuments.mockResolvedValue(EMPTY_PAGE);
});

describe('carga compartida del estado de cuenta (CA-2, CA-8)', () => {
  it('una sola petición alimenta el resumen y la pestaña', async () => {
    mockStatement.mockResolvedValue(STATEMENT);
    render(<Harness enabled />);
    await waitFor(() => expect(screen.getByText('Saldo a favor disponible')).toBeInTheDocument());
    const summary = screen.getByRole('region', { name: 'Estado de cuenta' });
    expect(within(summary).getByText('Saldo a favor')).toBeInTheDocument();
    expect(mockStatement).toHaveBeenCalledTimes(1);
  });

  it('un reintento desde el resumen actualiza también la pestaña', async () => {
    const user = userEvent.setup();
    mockStatement.mockRejectedValueOnce(new Error('caída')).mockResolvedValueOnce(STATEMENT);
    render(<Harness enabled />);
    const retries = await screen.findAllByRole('button', { name: 'Reintentar' });
    await user.click(retries[0]);
    await waitFor(() => expect(screen.getByText('Saldo a favor disponible')).toBeInTheDocument());
    const summary = screen.getByRole('region', { name: 'Estado de cuenta' });
    expect(within(summary).getByText('Saldo a favor')).toBeInTheDocument();
    expect(mockStatement).toHaveBeenCalledTimes(2);
  });

  it('deshabilitado, no llama al estado de cuenta', async () => {
    render(<Harness enabled={false} />);
    await waitFor(() => expect(mockStatement).not.toHaveBeenCalled());
  });
});
```

- [ ] **Paso 2: Correrla**

```bash
cd apps/portal && pnpm exec jest src/components/billing/subscriber-statement-sharing.spec.tsx
```

Esperado: PASS, 3 pruebas.

---

### Tarea 5: Conectar el panel en la ficha

**Archivos:**
- Modificar: `apps/portal/src/components/crm/subscribers/SubscriberOverviewTab.tsx:33-38, 120-125, 500-513`
- Modificar: `apps/portal/src/components/crm/subscribers/SubscriberDetailClient.tsx:11-12, 63, 167-174, 200-212` y dependencias del `useMemo` de `tabs`
- Modificar: `apps/portal/src/components/crm/subscribers/SubscriberDetailClient.mod05-deuda.portal.spec.tsx` (prueba nueva al final del `describe`)

- [ ] **Paso 1: Escribir la prueba del contenedor (CA-2)**

Al final del `describe` de `SubscriberDetailClient.mod05-deuda.portal.spec.tsx` (el mock de permisos ya niega todo), agregar `billingApi` al import de `@/lib/api-client` y:

```tsx
  it('sin permiso de facturación no muestra el estado de cuenta ni lo consulta', async () => {
    jest.spyOn(subscribersApi, 'get360').mockResolvedValue(buildSubscriber360(buildSubscriber()));
    const statementSpy = jest.spyOn(billingApi, 'statement');

    render(<SubscriberDetailClient mode="detail" />);

    expect(
      await screen.findByRole('heading', { name: 'Titular sintético Apellido sintético' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Estado de cuenta' })).not.toBeInTheDocument();
    expect(statementSpy).not.toHaveBeenCalled();
  });
```

- [ ] **Paso 2: Vista general: recibir el panel**

En `SubscriberOverviewTab.tsx`, agregar a `SubscriberOverviewTabProps`:

```ts
  /** Panel de estado de cuenta; lo arma la ficha solo si existe la pestaña Facturación. */
  accountSummary?: ReactNode;
```

Agregar `accountSummary` a la desestructuración de props y reemplazar el `return` final por:

```tsx
  // Estado de cuenta arriba y a todo el ancho; debajo, dos columnas independientes.
  return (
    <div className="space-y-6">
      {accountSummary}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {servicesPanel}
          {contactPanel}
        </div>
        <div className="space-y-6">
          {billingPanel}
          {originPanel}
          {privacyPanel}
        </div>
      </div>
    </div>
  );
```

- [ ] **Paso 3: Ficha: usar el hook y entregar la carga**

En `SubscriberDetailClient.tsx`:

```tsx
import { SubscriberStatementSummary } from '@/components/billing/SubscriberStatementSummary';
import { useSubscriberStatement } from '@/components/billing/use-subscriber-statement';
```

Después de `const subscriberId = ...`:

```tsx
  const statement = useSubscriberStatement(subscriberId, mode === 'detail' && canReadBilling);
```

En la pestaña `vista-general`:

```tsx
          <SubscriberOverviewTab
            subscriber360={subscriber360}
            canReadPrivacy={canReadPrivacy}
            onNavigate={selectSubscriberTab}
            onReload={() => loadSubscriber(true)}
            accountSummary={
              canReadBilling ? (
                <SubscriberStatementSummary
                  statement={statement}
                  onOpenBilling={() => selectSubscriberTab('facturacion')}
                />
              ) : undefined
            }
          />
```

En la pestaña `facturacion`:

```tsx
                <SubscriberBillingTab
                  key={subscriber.id}
                  subscriberId={subscriber.id}
                  contracts={subscriber360?.contracts ?? []}
                  statement={statement}
                />
```

Agregar `statement` a las dependencias del `useMemo` de `tabs` (y `canReadBilling` si no está).

- [ ] **Paso 4: Tipos y pruebas de la ficha**

```bash
cd apps/portal && pnpm exec tsc --noEmit -p . && pnpm exec jest src/components/crm/subscribers src/components/billing
```

Esperado: `tsc` sin errores; Jest en PASS con la prueba nueva incluida.

---

### Tarea 6: Valores heredados en la política del contrato

**Archivos:**
- Crear: `apps/portal/src/components/billing/billing-contract-policy.spec.tsx`
- Modificar: `apps/portal/src/components/billing/BillingContractPolicy.tsx`

- [ ] **Paso 1: Escribir las pruebas**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BillingContractPolicyResponse, BillingPolicy } from '@iwana/shared';
import { BillingContractPolicy } from './BillingContractPolicy';

const mockContractPolicy = jest.fn();
const mockTenantPolicy = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    billingApi: {
      contractPolicy: (...args: unknown[]) => mockContractPolicy(...args),
      getPolicy: (...args: unknown[]) => mockTenantPolicy(...args),
      updateContractPolicy: (...args: unknown[]) => mockUpdate(...args),
    },
  };
});

const CONTRACT_ID = '44444444-4444-4444-8444-444444444444';

const CONTRACT_POLICY: BillingContractPolicyResponse['data'] = {
  contractId: CONTRACT_ID,
  periodTiming: null,
  generationLeadDays: null,
  paymentTermDays: null,
  graceDays: null,
  cutoffEnabled: null,
  firstPeriodMode: null,
  billingStartDate: null,
  updatedBy: null,
  updatedAt: null,
};

const TENANT_POLICY: BillingPolicy = {
  tenantId: '22222222-2222-4222-8222-222222222222',
  periodTiming: 'ANTICIPADO',
  generationLeadDays: 3,
  cutoffMode: 'DIA_FIJO_CICLO',
  paymentTermDays: 14,
  graceDays: 2,
  cutoffEnabled: true,
  minimumUnpaidForCutoff: 0,
  prorationMethod: 'DIAS_REALES',
  firstPeriodMode: 'SEPARADO',
  automaticGeneration: false,
  approvalMode: 'BORRADOR',
  autoApplyCredit: true,
  generationHour: 6,
  documentPrefix: 'DC',
};

function renderPolicy() {
  return render(
    <BillingContractPolicy
      contractId={CONTRACT_ID}
      contractLabel="Internet hogar"
      canManage
      onClose={jest.fn()}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockContractPolicy.mockResolvedValue(CONTRACT_POLICY);
  mockUpdate.mockResolvedValue(CONTRACT_POLICY);
});

describe('BillingContractPolicy: valores heredados (spec 2026-11-09 §4)', () => {
  it('CA-9: rotula cada campo heredable con el valor de la empresa', async () => {
    mockTenantPolicy.mockResolvedValue(TENANT_POLICY);
    renderPolicy();

    expect(
      await screen.findByRole('option', { name: 'Heredar de la empresa: Cobro anticipado' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Heredar de la empresa: Habilitado' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Heredar de la empresa: Documento inicial separado' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Plazo para pagar (días)')).toHaveAccessibleDescription(
      'Vacío: se usa el valor de la empresa (14 días).',
    );
    expect(screen.getByLabelText('Días de gracia tras vencimiento')).toHaveAccessibleDescription(
      'Vacío: se usa el valor de la empresa (2 días).',
    );
    expect(screen.getByLabelText('Días de anticipación para generar')).toHaveAccessibleDescription(
      'Vacío: se usa el valor de la empresa (3 días).',
    );
    expect(screen.getByLabelText('Fecha de inicio de cobro')).toHaveAccessibleDescription(
      'Vacía: el cobro empieza en la fecha de activación del servicio.',
    );
  });

  it('CA-10: si la empresa no responde, vuelve a «Heredar», avisa y deja guardar', async () => {
    const user = userEvent.setup();
    mockTenantPolicy.mockRejectedValue(new Error('caída'));
    renderPolicy();

    expect(
      await screen.findByText('No fue posible consultar los valores de la empresa'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('option', { name: 'Heredar' })).toHaveLength(3);
    expect(screen.getByLabelText('Plazo para pagar (días)')).toHaveAccessibleDescription(
      'Vacío: se usa el valor de la empresa.',
    );
    await user.type(screen.getByLabelText('Plazo para pagar (días)'), '20');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Paso 2: Comprobar que fallan**

```bash
cd apps/portal && pnpm exec jest src/components/billing/billing-contract-policy.spec.tsx
```

Esperado: FAIL en las dos pruebas (no existen las opciones rotuladas ni el aviso).

- [ ] **Paso 3: Implementar**

En `BillingContractPolicy.tsx`:

Imports:

```tsx
import { useCallback, useId, useState, type FormEvent } from 'react';
import {
  BillingContractPolicyUpdateSchema,
  type BillingContractPolicyResponse,
  type BillingFirstPeriodMode,
  type BillingPeriodTiming,
  type BillingPolicy,
} from '@iwana/shared';
```

Después de `type Policy = ...`:

```tsx
const TIMING_LABELS = {
  ANTICIPADO: 'Cobro anticipado',
  VENCIDO: 'Cobro al final del periodo',
} satisfies Record<BillingPeriodTiming, string>;

const FIRST_PERIOD_LABELS = {
  SEPARADO: 'Documento inicial separado',
  JUNTO_AL_SIGUIENTE: 'Unir al siguiente periodo',
} satisfies Record<BillingFirstPeriodMode, string>;

function inheritOption(value: string | undefined): string {
  return value ? `Heredar de la empresa: ${value}` : 'Heredar';
}
```

En `BillingContractPolicy`, después de `useBillingLoad(load)`:

```tsx
  const loadCompany = useCallback(() => billingApi.getPolicy(), []);
  const company = useBillingLoad(loadCompany);
```

Dentro de `PortalSidePeek`, antes de `{data ? (`:

```tsx
      {company.error ? (
        <PortalAlert variant="warning" title="No fue posible consultar los valores de la empresa" />
      ) : null}
```

y pasar `company={company.data}` a `PolicyForm`.

En `PolicyForm`: agregar la prop `company: BillingPolicy | null` (tipo y desestructuración), `const helpId = useId();` y reemplazar el `<fieldset>` completo por:

```tsx
      <fieldset disabled={mutation.busy || !canManage} className="space-y-3">
        <label className="block space-y-1 text-sm">
          Momento del cobro
          <select
            className={billingInputClass}
            value={draft.periodTiming}
            onChange={(event) => set('periodTiming', event.target.value)}
          >
            <option value="">
              {inheritOption(company ? TIMING_LABELS[company.periodTiming] : undefined)}
            </option>
            <option value="ANTICIPADO">{TIMING_LABELS.ANTICIPADO}</option>
            <option value="VENCIDO">{TIMING_LABELS.VENCIDO}</option>
          </select>
        </label>
        {(
          [
            ['generationLeadDays', 'Días de anticipación para generar', 15],
            ['paymentTermDays', 'Plazo para pagar (días)', 60],
            ['graceDays', 'Días de gracia tras vencimiento', 30],
          ] as const
        ).map(([key, label, max]) => (
          <div key={key} className="space-y-1 text-sm">
            <label className="block space-y-1">
              {label}
              <input
                type="number"
                min={0}
                max={max}
                placeholder="Heredar"
                aria-describedby={`${helpId}-${key}`}
                className={billingInputClass}
                value={draft[key]}
                onChange={(event) => set(key, event.target.value)}
              />
            </label>
            <p id={`${helpId}-${key}`} className="text-xs text-gray-600 dark:text-gray-300">
              {company
                ? `Vacío: se usa el valor de la empresa (${company[key]} días).`
                : 'Vacío: se usa el valor de la empresa.'}
            </p>
          </div>
        ))}
        <label className="block space-y-1 text-sm">
          Corte programado
          <select
            className={billingInputClass}
            value={draft.cutoffEnabled}
            onChange={(event) => set('cutoffEnabled', event.target.value)}
          >
            <option value="">
              {inheritOption(
                company ? (company.cutoffEnabled ? 'Habilitado' : 'Deshabilitado') : undefined,
              )}
            </option>
            <option value="true">Habilitado</option>
            <option value="false">Deshabilitado</option>
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          Primer periodo incompleto
          <select
            className={billingInputClass}
            value={draft.firstPeriodMode}
            onChange={(event) => set('firstPeriodMode', event.target.value)}
          >
            <option value="">
              {inheritOption(company ? FIRST_PERIOD_LABELS[company.firstPeriodMode] : undefined)}
            </option>
            <option value="SEPARADO">{FIRST_PERIOD_LABELS.SEPARADO}</option>
            <option value="JUNTO_AL_SIGUIENTE">{FIRST_PERIOD_LABELS.JUNTO_AL_SIGUIENTE}</option>
          </select>
        </label>
        <div className="space-y-1 text-sm">
          <label className="block space-y-1">
            Fecha de inicio de cobro
            <input
              type="date"
              aria-describedby={`${helpId}-billingStartDate`}
              className={billingInputClass}
              value={draft.billingStartDate}
              onChange={(event) => set('billingStartDate', event.target.value)}
            />
          </label>
          <p id={`${helpId}-billingStartDate`} className="text-xs text-gray-600 dark:text-gray-300">
            Vacía: el cobro empieza en la fecha de activación del servicio.
          </p>
        </div>
      </fieldset>
```

`submit` no cambia (R-B6).

- [ ] **Paso 4: Correr las pruebas**

```bash
cd apps/portal && pnpm exec jest src/components/billing/billing-contract-policy.spec.tsx
```

Esperado: PASS, 2 pruebas.

---

### Tarea 7: E2E del flujo real (CA-11)

**Archivos:**
- Modificar: `e2e/tests/portal-billing-flow.spec.ts`, caso «ficha con métricas y aviso de adicionales; agenda en Pagado» (hoy en la línea 650)

- [ ] **Paso 1: Ampliar el caso, antes de navegar a la agenda**

En ese punto el flujo ya registró el pago con remanente: el saldo a favor es `$ 31,00` y no quedan documentos pendientes. Agregar, justo antes de `await page.goto(\`/dashboard/crm/subscribers/agenda-corte...`:

```ts
    // Spec 2026-11-09 §3 (CA-11): estado de cuenta en la Vista general; abrir la pestaña no vuelve a pedirlo.
    const statementRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes(`/billing/subscribers/${subscriberId}/statement`)) {
        statementRequests.push(request.url());
      }
    });
    await page.goto(`/dashboard/crm/subscribers/${subscriberId}?tab=vista-general`);
    const summary = page.getByRole('region', { name: 'Estado de cuenta' });
    await expect(summary.getByText('$ 31,00')).toBeVisible();
    await expect(summary.getByText('No hay documentos de cobro pendientes')).toBeVisible();
    const requestsBeforeTab = statementRequests.length;
    expect(requestsBeforeTab).toBeGreaterThan(0);
    await summary.getByRole('button', { name: 'Ver facturación' }).click();
    await expect(page.getByRole('tab', { name: 'Facturación' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByText('Saldo a favor disponible')).toBeVisible();
    expect(statementRequests).toHaveLength(requestsBeforeTab);
```

- [ ] **Paso 2: Correr el caso contra el entorno que ya está levantado**

La configuración `e2e/playwright.portal.config.ts` levanta el portal en modo producción (`next-standalone-e2e.mjs`, puerto 3002); la API y la base deben estar arriba. Si no lo están, pedir al usuario que las levante. No ejecutar `dev.mjs`. Se compara el conteo antes y después de abrir la pestaña, y no un total fijo, para no depender de cuántas veces se monte la página.

```bash
pnpm test:e2e:portal -- e2e/tests/portal-billing-flow.spec.ts
```

Esperado: todos los casos del archivo en PASS. Si falla, clasificar con `e2e-triage` antes de tocar código o la prueba. Las capturas no se escriben en `docs/` salvo con `E2E_EVIDENCIA=1`.

---

### Tarea 8: Gates, revisión y cierre

- [ ] **Paso 1: Lint y tipos del portal**

```bash
cd apps/portal && pnpm lint && pnpm typecheck
```

Esperado: sin errores.

- [ ] **Paso 2: Suite completa del portal y comparación con la línea base**

```bash
cd apps/portal && pnpm exec jest --silent 2>&1 | tail -n 6
```

Esperado: `Tests` y `Test Suites` iguales a la línea base de la Tarea 0 más las nuevas (3 archivos de prueba nuevos y 1 prueba nueva en el contenedor: +3 suites, +12 pruebas) y sin fallos nuevos. `Skipped` no sube.

- [ ] **Paso 3: Auditoría visual (CA-12)**

```bash
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/crm/subscribers apps/portal/src/components/billing
```

Esperado: P0 0 y P1 0.

- [ ] **Paso 4: Revisión de la prueba ajustada**

Pasar `subscriber-billing-tab.spec.tsx` a `test-change-reviewer`: solo cambió el arnés de render, sin tocar expectativas. Registrar su veredicto en el informe.

- [ ] **Paso 5: Informe de cierre**

Crear `docs/informes/INFORME-MOD05-FICHA-ESTADO-CUENTA-CIERRE-v1.0.md` con: alcance entregado (A y B), conteos reales de la Tarea 0 y del Paso 2, resultado del E2E, audit-ui, veredicto de `test-change-reviewer` y una línea de omisiones y riesgos.

- [ ] **Paso 6: Commit local (solo cuando el usuario lo pida)**

Commitear solo las rutas de este plan, sin `stash` y sin `apps/portal/next-env.d.ts`:

```bash
git add apps/portal/src/components/billing/billing-copy.ts \
  apps/portal/src/components/billing/use-subscriber-statement.ts \
  apps/portal/src/components/billing/SubscriberBillingTab.tsx \
  apps/portal/src/components/billing/subscriber-billing-tab.spec.tsx \
  apps/portal/src/components/billing/SubscriberStatementSummary.tsx \
  apps/portal/src/components/billing/subscriber-statement-summary.spec.tsx \
  apps/portal/src/components/billing/subscriber-statement-sharing.spec.tsx \
  apps/portal/src/components/billing/BillingContractPolicy.tsx \
  apps/portal/src/components/billing/billing-contract-policy.spec.tsx \
  apps/portal/src/components/crm/subscribers/SubscriberOverviewTab.tsx \
  apps/portal/src/components/crm/subscribers/SubscriberDetailClient.tsx \
  apps/portal/src/components/crm/subscribers/SubscriberDetailClient.mod05-deuda.portal.spec.tsx \
  apps/portal/src/components/crm/subscribers/SubscriberDetailClient.estado-cuenta.portal.spec.tsx \
  e2e/tests/portal-billing-flow.spec.ts \
  docs/referencias/REFERENCIA-UISP-CRM-MOD05-v1.1.md docs/referencias/README.md \
  docs/specs/2026-11-09-mod05-ficha-estado-de-cuenta-ux.md \
  docs/plans/2026-11-09-mod05-ficha-estado-de-cuenta.md \
  docs/informes/INFORME-MOD05-FICHA-ESTADO-CUENTA-CIERRE-v1.0.md
git commit -m "feat(crm): show the account statement on the subscriber overview"
```

Antes de `git add`, revisar con `git diff` cada archivo. Si `subscriber-billing-tab.spec.tsx` o `SubscriberDetailClient.mod05-deuda.portal.spec.tsx` todavía traen el cambio de mocks de la otra sesión (ver «Reglas de ejecución»), parar y preguntar al usuario. Lo mismo con cualquier otro archivo que traiga cambios ajenos. El push sale por tren (ADR-107).

---

## Cobertura de la spec

| Regla o criterio | Tarea |
|---|---|
| R-A1, CA-2 | 4 (hook deshabilitado), 5 (contenedor sin permiso) |
| R-A2, R-A3, CA-8 | 2, 4, 5, 7 (conteo de peticiones) |
| R-A4 a R-A6, R-A8, R-A12, CA-1, CA-3, CA-5 | 3 |
| R-A7, CA-4 | 3 (enlaces), 5 (`selectSubscriberTab('facturacion')`), 7 |
| R-A9, R-A10, CA-7 | 3 (`BillingLoadState`) |
| R-A11, CA-6 | 1, 3 |
| R-B1 a R-B6, CA-9, CA-10 | 6 |
| CA-11 | 7 |
| CA-12 | 8 |

Omitido: no se ajusta el `useMemo` de `tabs` para evitar recálculos (la carga devuelve un objeto nuevo en cada render; el costo es menor). Sin verificar al redactar: que `GET /billing/policy` devuelva la política completa en un tenant sin fila guardada; la Tarea 6 lo cubre con `company.error` y la Tarea 7 lo ejercita en el entorno real.
