import { randomUUID } from 'node:crypto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type {
  BillingAccountStatement,
  BillingFirstChargeResult,
  BillingGenerationSummary,
} from '@iwana/shared';
import { ApiError } from '@/lib/api-client';
import {
  BILLING_NOT_STARTED_ASK,
  BILLING_NOT_STARTED_NOTICE,
  BILLING_NOT_STARTED_TITLE,
  firstChargeResultMessage,
} from './BillingNotStartedNotice';
import { SubscriberBillingTab } from './SubscriberBillingTab';
import { SubscriberStatementSummary } from './SubscriberStatementSummary';
import { useSubscriberStatement } from './use-subscriber-statement';
import type { SubscriberStatementLoad } from './use-subscriber-statement';

/** Spec 2026-11-11 «Contrato activo sin cobros» (R2, R3, CA-1, CA-4). */

const mockStatement = jest.fn();
const mockDocuments = jest.fn();
const mockFirstCharge = jest.fn();
let mockCanManage = true;

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    billingApi: {
      statement: (...args: unknown[]) => mockStatement(...args),
      documents: (...args: unknown[]) => mockDocuments(...args),
      generateFirstCharge: (...args: unknown[]) => mockFirstCharge(...args),
      document: jest.fn(),
      documentPdf: jest.fn(),
      issue: jest.fn(),
      voidDocument: jest.fn(),
    },
  };
});

jest.mock('@/components/access-control/permissions-context', () => {
  const { AccessPermissionKey } =
    jest.requireActual<typeof import('@iwana/shared')>('@iwana/shared');
  const ctx = {
    hasPermission: (key: string) =>
      key === AccessPermissionKey.BILLING_INVOICES_MANAGE ? mockCanManage : true,
  };
  return { usePermissions: () => ctx };
});

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/dashboard/crm/subscribers/1',
  useRouter: (() => {
    let router: Record<string, unknown> | undefined;
    return () => (router ??= { replace: jest.fn(), push: jest.fn() });
  })(),
}));

const SUBSCRIBER_ID = '55555555-5555-4555-8555-555555555555';
const CONTRACT_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_CONTRACT_ID = '66666666-6666-4666-8666-666666666666';
const CONTRACTS = [
  { id: CONTRACT_ID, alias: 'Hogar Centro' },
  { id: OTHER_CONTRACT_ID, alias: 'Oficina' },
];

const NOT_STARTED = {
  contractId: CONTRACT_ID,
  totalInvoiced: '0.00',
  totalPaid: '0.00',
  totalPending: '0.00',
  periodState: 'SIN_DOCUMENTO' as const,
  billingNotStarted: true,
};

const STATEMENT: BillingAccountStatement = {
  subscriberId: SUBSCRIBER_ID,
  buyerProtected: false,
  impersonationHold: false,
  totalInvoiced: '0.00',
  totalPaid: '0.00',
  totalPending: '0.00',
  creditBalance: '0.00',
  documents: [],
  payments: [],
  contractSummaries: [NOT_STARTED],
};

const STARTED: BillingAccountStatement = {
  ...STATEMENT,
  contractSummaries: [{ ...NOT_STARTED, periodState: 'PENDIENTE', billingNotStarted: false }],
};

const SUMMARY: BillingGenerationSummary = {
  generated: 1,
  failed: 0,
  notDue: 0,
  existing: 0,
  omittedImpersonation: 0,
  omittedTermination: 0,
  blocked: 0,
  withoutCycle: 0,
  unbilledAdditionalDocuments: 0,
};

function firstCharge(overrides: Partial<BillingFirstChargeResult> = {}): BillingFirstChargeResult {
  return {
    contractId: CONTRACT_ID,
    anchorDate: '2026-10-30',
    anchorSource: 'ACTIVATION_EVENT',
    installationFee: { outcome: 'FROZEN', amount: '50000.00' },
    fiscalData: { outcome: 'ALREADY_SET', frozenFields: [], missingFields: [] },
    summary: SUMMARY,
    regularizedDrafts: { unblocked: 0, rescheduled: 0 },
    ...overrides,
  };
}

const EMPTY_DOCUMENTS = {
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

/** Testing Library colapsa el espacio duro de la moneda. */
const normalized = (node: Element | null) => (node?.textContent ?? '').replace(/\s/gu, ' ');

function loaded(data: BillingAccountStatement, reload = jest.fn()): SubscriberStatementLoad {
  return { data, loading: false, error: null, reload };
}

function renderSummary(statement: SubscriberStatementLoad) {
  return render(
    <SubscriberStatementSummary
      statement={statement}
      contracts={CONTRACTS}
      onOpenBilling={jest.fn()}
    />,
  );
}

function TabWithStatement() {
  const statement = useSubscriberStatement(SUBSCRIBER_ID, true);
  return <SubscriberBillingTab subscriberId={SUBSCRIBER_ID} contracts={[]} statement={statement} />;
}

// jsdom no expone crypto.randomUUID; la clave de idempotencia la necesita al confirmar.
const originalUuid = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: randomUUID });
  mockCanManage = true;
  mockDocuments.mockResolvedValue(EMPTY_DOCUMENTS);
});

afterEach(() => {
  if (originalUuid) Object.defineProperty(globalThis.crypto, 'randomUUID', originalUuid);
  else Reflect.deleteProperty(globalThis.crypto, 'randomUUID');
});

describe('Estado de cuenta de la Vista general — contrato activo sin cobros', () => {
  it('CA-1: con un contrato sin periodos muestra el aviso compacto con el servicio', () => {
    renderSummary(loaded(STATEMENT));
    const region = screen.getByRole('region', { name: 'Estado de cuenta' });
    expect(within(region).getByText(BILLING_NOT_STARTED_TITLE)).toBeInTheDocument();
    expect(
      within(region).getByText(`Hogar Centro · ${BILLING_NOT_STARTED_NOTICE}`),
    ).toBeInTheDocument();
    expect(
      within(region).getByRole('button', { name: 'Generar primer cobro de Hogar Centro' }),
    ).toBeInTheDocument();
  });

  it('CA-1: con periodos generados no aparece el aviso', () => {
    renderSummary(loaded(STARTED));
    expect(screen.queryByText(BILLING_NOT_STARTED_TITLE)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Generar primer cobro/u })).not.toBeInTheDocument();
  });

  it('CA-4: sin permiso de documentos solo muestra el aviso y a quién pedirlo', () => {
    mockCanManage = false;
    renderSummary(loaded(STATEMENT));
    expect(screen.getByText(BILLING_NOT_STARTED_TITLE)).toBeInTheDocument();
    expect(
      screen.getByText(`Hogar Centro · ${BILLING_NOT_STARTED_NOTICE} ${BILLING_NOT_STARTED_ASK}`),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Generar primer cobro/u })).not.toBeInTheDocument();
  });

  it('confirma desde la activación, genera, informa el cargo de instalación y recarga', async () => {
    const user = userEvent.setup();
    const reload = jest.fn();
    mockFirstCharge.mockResolvedValue(firstCharge());
    renderSummary(loaded(STATEMENT, reload));

    await user.click(screen.getByRole('button', { name: 'Generar primer cobro de Hogar Centro' }));
    const dialog = await screen.findByRole('dialog', { name: 'Generar primer cobro' });
    expect(within(dialog).getByText(/desde la activación del contrato/u)).toBeInTheDocument();
    expect(within(dialog).getByText(/«Hogar Centro»/u)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Generar primer cobro' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockFirstCharge).toHaveBeenCalledTimes(1);
    const [command, key] = mockFirstCharge.mock.calls[0] as [unknown, unknown];
    expect(command).toEqual({ contractId: CONTRACT_ID });
    expect(typeof key).toBe('string');
    expect(reload).toHaveBeenCalledTimes(1);

    const title = screen.getByText('Se generó el primer cobro');
    const result = title.closest('[role="status"]');
    expect(normalized(result)).toContain('Se cobra desde el 30 de octubre de 2026.');
    expect(normalized(result)).toMatch(/Se fijó el cargo de instalación en \$ 50\.000\./u);
    expect(normalized(result)).not.toMatch(/FROZEN|ACTIVATION_EVENT|CONTRACT_/u);
    // El botón desaparece con la recarga: el foco queda en el resultado.
    await waitFor(() => expect(result?.parentElement).toHaveFocus());
  });

  it('el resultado sigue visible mientras el estado de cuenta recarga y se puede cerrar', async () => {
    const user = userEvent.setup();
    mockFirstCharge.mockResolvedValue(firstCharge());
    const { rerender } = renderSummary(loaded(STATEMENT));
    await user.click(screen.getByRole('button', { name: /Generar primer cobro/u }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Generar primer cobro' }));
    await screen.findByText('Se generó el primer cobro');

    rerender(
      <SubscriberStatementSummary
        statement={{ data: null, loading: true, error: null, reload: jest.fn() }}
        contracts={CONTRACTS}
        onOpenBilling={jest.fn()}
      />,
    );
    expect(screen.getByText('Se generó el primer cobro')).toBeInTheDocument();
    rerender(
      <SubscriberStatementSummary
        statement={loaded(STARTED)}
        contracts={CONTRACTS}
        onOpenBilling={jest.fn()}
      />,
    );
    expect(screen.getByText('Se generó el primer cobro')).toBeInTheDocument();
    expect(screen.queryByText(BILLING_NOT_STARTED_TITLE)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cerrar mensaje del primer cobro' }));
    expect(screen.queryByText('Se generó el primer cobro')).not.toBeInTheDocument();
  });

  it('un error de la API se explica en español dentro del diálogo, sin códigos', async () => {
    const user = userEvent.setup();
    const reload = jest.fn();
    mockFirstCharge.mockRejectedValue(
      new ApiError(
        422,
        'ACTIVATION_DATE_UNKNOWN',
        'No se pudo determinar la fecha de activación del contrato.',
      ),
    );
    renderSummary(loaded(STATEMENT, reload));
    await user.click(screen.getByRole('button', { name: /Generar primer cobro/u }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Generar primer cobro' }));

    expect(
      await within(dialog).findByText(
        'El contrato no tiene una fecha de activación registrada, así que no podemos calcular desde cuándo cobrar.',
      ),
    ).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('ACTIVATION_DATE_UNKNOWN');
    expect(reload).not.toHaveBeenCalled();
  });

  it('un contrato sin servicio conocido usa el texto genérico y nombra cada botón', () => {
    renderSummary(
      loaded({
        ...STATEMENT,
        contractSummaries: [
          NOT_STARTED,
          { ...NOT_STARTED, contractId: OTHER_CONTRACT_ID },
          { ...NOT_STARTED, contractId: '77777777-7777-4777-8777-777777777777' },
        ],
      }),
    );
    expect(screen.getAllByText(BILLING_NOT_STARTED_TITLE)).toHaveLength(3);
    expect(screen.getByText(BILLING_NOT_STARTED_NOTICE)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generar primer cobro de Oficina' }),
    ).toBeInTheDocument();
  });

  it('no tiene violaciones de accesibilidad con el aviso', async () => {
    const { container } = renderSummary(loaded(STATEMENT));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('Pestaña Facturación — contrato activo sin cobros', () => {
  it('muestra el aviso, la insignia del servicio y refresca estado de cuenta y documentos', async () => {
    const user = userEvent.setup();
    mockStatement.mockResolvedValueOnce(STATEMENT).mockResolvedValue(STARTED);
    mockFirstCharge.mockResolvedValue(firstCharge());
    render(<TabWithStatement />);

    expect(await screen.findByText(BILLING_NOT_STARTED_TITLE)).toBeInTheDocument();
    await waitFor(() => expect(mockDocuments).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Generar primer cobro' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/este contrato/u)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Generar primer cobro' }));

    expect(await screen.findByText('Se generó el primer cobro')).toBeInTheDocument();
    await waitFor(() => expect(mockStatement).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockDocuments).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText(BILLING_NOT_STARTED_TITLE)).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Se generó el primer cobro')).toBeInTheDocument();
  });

  it('marca el servicio como «Sin cobros emitidos» en vez de su estado de pago', async () => {
    mockStatement.mockResolvedValue(STATEMENT);
    render(
      <SubscriberBillingTab
        subscriberId={SUBSCRIBER_ID}
        contracts={[
          {
            id: CONTRACT_ID,
            alias: 'Hogar Centro',
            billingCycleDay: 5,
          } as Parameters<typeof SubscriberBillingTab>[0]['contracts'][number],
        ]}
        statement={loaded(STATEMENT)}
      />,
    );
    const services = await screen.findByText('Facturación por servicio');
    const panel = services.closest('section') ?? document.body;
    expect(within(panel as HTMLElement).getByText('Sin cobros emitidos')).toBeInTheDocument();
    expect(within(panel as HTMLElement).queryByText('Sin documento')).not.toBeInTheDocument();
  });
});

describe('firstChargeResultMessage', () => {
  it('cargo ya fijado en cero: dice que el contrato no cobra instalación', () => {
    const message = firstChargeResultMessage(
      firstCharge({ installationFee: { outcome: 'ALREADY_SET', amount: '0.00' } }),
    );
    expect(message.variant).toBe('success');
    expect(message.description).toContain('El contrato no tiene cargo de instalación.');
  });

  it('cargo ya fijado con valor: lo informa', () => {
    const message = firstChargeResultMessage(
      firstCharge({ installationFee: { outcome: 'ALREADY_SET', amount: '50000.00' } }),
    );
    expect(message.description.replace(/\s/gu, ' ')).toMatch(
      /El cargo de instalación ya estaba fijado en \$ 50\.000\./u,
    );
  });

  it('plan sin cargo vigente y documentos incompletos: aviso de revisión', () => {
    const message = firstChargeResultMessage(
      firstCharge({
        installationFee: { outcome: 'UNRESOLVED', amount: null },
        summary: { ...SUMMARY, generated: 2, blocked: 1 },
      }),
    );
    expect(message.variant).toBe('warning');
    expect(message.title).toBe('Se generaron 2 documentos de cobro');
    expect(message.description).toContain('no se incluyó');
    expect(message.description).toContain('revísalos en Facturación');
  });

  it('repetida sobre un contrato con periodos: no duplica y lo dice', () => {
    const message = firstChargeResultMessage(
      firstCharge({
        anchorDate: null,
        anchorSource: null,
        installationFee: { outcome: 'NOT_APPLICABLE', amount: null },
        summary: { ...SUMMARY, generated: 0, existing: 1 },
      }),
    );
    expect(message).toEqual({
      variant: 'warning',
      title: 'El contrato ya tenía cobros generados',
      description: '',
    });
  });

  it('R7/R8: congela datos fiscales, desbloquea borradores y corrige vencimientos', () => {
    const message = firstChargeResultMessage(
      firstCharge({
        anchorDate: null,
        anchorSource: null,
        installationFee: { outcome: 'ALREADY_SET', amount: '50000.00' },
        fiscalData: {
          outcome: 'FROZEN',
          frozenFields: ['NAME', 'DOCUMENT', 'ADDRESS'],
          missingFields: [],
        },
        summary: { ...SUMMARY, generated: 0, existing: 1 },
        regularizedDrafts: { unblocked: 2, rescheduled: 1 },
      }),
    );
    expect(message.variant).toBe('success');
    expect(message.title).toBe('Se regularizaron los cobros en borrador');
    expect(message.description).toContain('datos fiscales que le faltaban');
    expect(message.description).toContain('2 borradores quedaron listos para emitir.');
    expect(message.description).toContain('vencen ahora según el plazo de pago');
    expect(message.description).not.toMatch(/FROZEN|NAME|DOCUMENT/u);
  });

  it('R7: datos fiscales sin resolver piden completarlos en la ficha', () => {
    const message = firstChargeResultMessage(
      firstCharge({
        fiscalData: { outcome: 'UNRESOLVED', frozenFields: [], missingFields: ['DOCUMENT'] },
        summary: { ...SUMMARY, blocked: 1, generated: 1 },
      }),
    );
    expect(message.variant).toBe('warning');
    expect(message.description).toContain('Faltan datos fiscales del titular');
  });
});
