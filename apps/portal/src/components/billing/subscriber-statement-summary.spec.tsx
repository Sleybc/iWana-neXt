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

/** Testing Library colapsa el espacio duro de la moneda en el nodo, no en el texto esperado. */
const money = (value: string) => formatBillingMoney(value).replace(/\s/gu, ' ');

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
      buildDocument({
        id: 'a1111111-1111-4111-8111-111111111111',
        number: 'DC-4',
        dueDate: '2026-12-19',
      }),
      buildDocument({
        id: 'a2222222-2222-4222-8222-222222222222',
        number: 'DC-1',
        dueDate: '2026-09-19',
      }),
      buildDocument({
        id: 'a3333333-3333-4333-8333-333333333333',
        number: 'DC-3',
        dueDate: '2026-11-19',
      }),
      buildDocument({
        id: 'a4444444-4444-4444-8444-444444444444',
        number: 'DC-2',
        dueDate: '2026-10-19',
      }),
    ];
    const { region } = renderSummary(loaded({ ...STATEMENT, totalPending: '500.00', documents }));

    expect(within(region).getByText('Deuda pendiente')).toBeInTheDocument();
    expect(within(region).getByText(money('500.00'))).toBeInTheDocument();
    expect(within(region).getByText('Saldo a favor')).toBeInTheDocument();
    expect(within(region).getByText(money('25.00'))).toBeInTheDocument();
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
    expect(within(region).getByText('Tiene facturas vencidas')).toBeInTheDocument();
    expect(within(within(region).getByRole('listitem')).getByText('Vencida')).toBeInTheDocument();
  });

  it('CA-3: sin vencidos no muestra el aviso', () => {
    const { region } = renderSummary(loaded({ ...STATEMENT, documents: [buildDocument({})] }));
    expect(within(region).queryByText('Tiene facturas vencidas')).not.toBeInTheDocument();
    expect(within(region).queryByText('Vencida')).not.toBeInTheDocument();
  });

  it('CA-4: enlaza a Facturación desde el encabezado y desde «Ver los N documentos»', async () => {
    const user = userEvent.setup();
    const dueDates = ['2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01'];
    const documents = dueDates.map((dueDate, index) =>
      buildDocument({
        id: `b${index}111111-1111-4111-8111-111111111111`,
        number: `DC-${index}`,
        dueDate,
      }),
    );
    const { onOpenBilling, region } = renderSummary(loaded({ ...STATEMENT, documents }));

    await user.click(within(region).getByRole('button', { name: 'Ver las 5 facturas pendientes' }));
    await user.click(within(region).getByRole('button', { name: 'Ver facturación' }));
    expect(onOpenBilling).toHaveBeenCalledTimes(2);
  });

  it('CA-5: sin pendientes lo dice y mantiene las métricas', () => {
    const { region } = renderSummary(loaded({ ...STATEMENT, totalPending: '0.00' }));
    expect(within(region).getByText('No hay facturas pendientes')).toBeInTheDocument();
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

  it('D14: cuenta la deuda IMPORTADO como pendiente, con número de origen y sin periodo', () => {
    const imported = buildDocument({
      id: 'b1111111-1111-4111-8111-111111111111',
      status: 'IMPORTADO',
      number: null,
      externalNumber: 'UISP-778',
      periodId: null,
      periodStart: null,
      periodEnd: null,
      coveredStart: null,
      dueDate: '2026-08-01',
      pendingAmount: '50.00',
    } as Partial<BillingDocumentResponse>);
    const settled = buildDocument({
      id: 'b2222222-2222-4222-8222-222222222222',
      status: 'IMPORTADO',
      number: null,
      externalNumber: 'UISP-779',
      pendingAmount: '0.00',
    } as Partial<BillingDocumentResponse>);
    const { region } = renderSummary(loaded({ ...STATEMENT, documents: [imported, settled] }));
    const items = within(region).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('UISP-778');
    expect(items[0]).toHaveTextContent('Sin periodo');
    expect(items[0]).toHaveTextContent(money('50.00'));
    expect(within(region).queryByText('UISP-779')).not.toBeInTheDocument();
  });
});

describe('SubscriberStatementSummary: cortesías (spec MOD14 2026-11-12 R4)', () => {
  const COURTESY = {
    id: 'c1111111-1111-4111-8111-111111111111',
    documentId: '11111111-1111-4111-8111-111111111111',
    subscriberId: '55555555-5555-4555-8555-555555555555',
    application: 'AJUSTE_SOBRE_EMITIDO',
    target: 'VALOR',
    sourceLineId: null,
    lineId: null,
    amount: '20.00',
    reasonCode: 'FALLA_DEL_SERVICIO',
    note: null,
    status: 'ACTIVA',
    voidReasonCode: null,
    voidNote: null,
    voidedAt: null,
    voidedBy: null,
    createdBy: '66666666-6666-4666-8666-666666666666',
    createdAt: '2026-11-10T12:00:00.000Z',
  } as const;

  it('muestra el total, la cortesía del documento y el detalle de cortesías', () => {
    const document = buildDocument({ courtesyAmount: '20.00', pendingAmount: '99.00' });
    const { region } = renderSummary(
      loaded({
        ...STATEMENT,
        totalCourtesy: '20.00',
        documents: [document],
        courtesies: [COURTESY],
      }),
    );
    expect(region).toHaveTextContent('Cortesías otorgadas:');
    expect(within(region).getByText(`Cortesía −${money('20.00')}`)).toBeInTheDocument();
    const detail = within(region).getByRole('region', { name: 'Detalle de cortesías' });
    expect(detail).toHaveTextContent('Compensación por falla del servicio');
    expect(detail).toHaveTextContent(formatBillingDate(COURTESY.createdAt));
    expect(detail).toHaveTextContent('Aplicada');
    expect(detail).toHaveTextContent(money('20.00'));
  });
});
