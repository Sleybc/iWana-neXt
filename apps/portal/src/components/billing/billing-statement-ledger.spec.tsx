/**
 * Estado de cuenta como libro con saldo corrido (spec MOD05↔MOD14 2026-11-13 D4, D7, R2, CA-2):
 * filtros → from/to, «Saldo anterior», marcas de pago tardío, PDF y envío al cliente.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessPermissionKey, type BillingStatementLedger as Ledger } from '@iwana/shared';
import { BillingStatementLedger, lateLabel, ledgerRows } from './BillingStatementLedger';
import { formatBillingMoney } from './billing-copy';
import { civilDate, ledgerPeriodId, ledgerPeriodQuery, monthsBefore } from './ledger-period';

const mockSearch = { current: '' };
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearch.current),
  usePathname: () => '/dashboard/crm/subscribers/1',
  useRouter: (() => {
    const router = { replace: (...args: unknown[]) => mockReplace(...args), push: jest.fn() };
    return () => router;
  })(),
}));

const mockGranted = { current: new Set<AccessPermissionKey>() };
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    const ctx = { hasPermission: (key: AccessPermissionKey) => mockGranted.current.has(key) };
    return () => ctx;
  })(),
}));

const mockLedger = jest.fn();
const mockLedgerPdf = jest.fn();
const mockSend = jest.fn();
const mockEmailLog = jest.fn();
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    billingApi: {
      statementLedger: (...args: unknown[]) => mockLedger(...args),
      statementLedgerPdf: (...args: unknown[]) => mockLedgerPdf(...args),
      sendStatementEmail: (...args: unknown[]) => mockSend(...args),
      emailLog: (...args: unknown[]) => mockEmailLog(...args),
    },
  };
});

const SUBSCRIBER_ID = '55555555-5555-4555-8555-555555555555';
const DOC_LATE_OPEN = '11111111-1111-4111-8111-111111111111';
const DOC_LATE_PAID = '11111111-1111-4111-8111-111111111112';
const PAYMENT_ID = '66666666-6666-4666-8666-666666666666';
const TODAY = new Date(2026, 10, 13);
const money = (value: string) => formatBillingMoney(value).replace(/\s/gu, ' ');

const row = (overrides: Partial<Ledger['rows'][number]>): Ledger['rows'][number] => ({
  kind: 'DOCUMENTO',
  date: '2026-09-01',
  reference: null,
  debit: '0.00',
  credit: '0.00',
  balance: '0.00',
  documentId: null,
  paymentId: null,
  dueDate: null,
  ...overrides,
});

const LEDGER: Ledger = {
  subscriberId: SUBSCRIBER_ID,
  from: '2026-08-13',
  to: '2026-11-13',
  openingBalance: '20.00',
  closingBalance: '-30.00',
  buyerProtected: false,
  rows: [
    row({ kind: 'SALDO_ANTERIOR', date: '2026-08-13', balance: '20.00' }),
    row({
      kind: 'DOCUMENTO',
      date: '2026-09-01',
      reference: 'DC-1',
      debit: '100.00',
      balance: '120.00',
      documentId: DOC_LATE_PAID,
      dueDate: '2026-09-15',
      late: true,
    }),
    row({
      kind: 'PAGO',
      date: '2026-09-20',
      reference: 'TR-9',
      credit: '96.00',
      balance: '24.00',
      paymentId: PAYMENT_ID,
      method: 'TRANSFERENCIA',
      receiptNumber: 12,
    }),
    row({
      kind: 'RETENCION',
      date: '2026-09-20',
      reference: 'RETE_ICA',
      credit: '4.00',
      balance: '20.00',
      paymentId: PAYMENT_ID,
      documentId: DOC_LATE_PAID,
    }),
    row({
      kind: 'DOCUMENTO',
      date: '2026-10-01',
      reference: 'DC-2',
      debit: '50.00',
      balance: '70.00',
      documentId: DOC_LATE_OPEN,
      dueDate: '2026-10-15',
      late: true,
    }),
    row({ kind: 'CORTESIA', date: '2026-10-02', credit: '100.00', balance: '-30.00' }),
  ],
};

const DOCUMENTS = [
  { id: DOC_LATE_OPEN, pendingAmount: '50.00' },
  { id: DOC_LATE_PAID, pendingAmount: '0.00' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch.current = 'tab=facturacion&sub=estado';
  window.history.replaceState({}, '', '/dashboard/crm/subscribers/1?tab=facturacion&sub=estado');
  mockGranted.current = new Set([
    AccessPermissionKey.BILLING_INVOICES_READ,
    AccessPermissionKey.BILLING_INVOICES_MANAGE,
  ]);
  mockLedger.mockResolvedValue(LEDGER);
  mockEmailLog.mockResolvedValue({ subscriberId: SUBSCRIBER_ID, entries: [] });
  URL.createObjectURL = jest.fn(() => 'blob:estado');
  URL.revokeObjectURL = jest.fn();
});

describe('ledgerPeriodQuery (D4)', () => {
  it('Todo no envía fechas', () => {
    expect(ledgerPeriodQuery('todo', TODAY)).toEqual({ ok: true, query: {} });
  });
  it.each([
    ['3m', '2026-08-13'],
    ['6m', '2026-05-13'],
    ['12m', '2025-11-13'],
  ] as const)('%s → from %s y sin to', (period, from) => {
    expect(ledgerPeriodQuery(period, TODAY)).toEqual({ ok: true, query: { from } });
  });
  it('un mes más corto usa su último día', () => {
    expect(monthsBefore(new Date(2026, 4, 31), 3)).toBe('2026-02-28');
    expect(civilDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('el rango envía las fechas elegidas y valida el orden', () => {
    expect(ledgerPeriodQuery('rango', TODAY, { from: '2026-01-01', to: '2026-06-30' })).toEqual({
      ok: true,
      query: { from: '2026-01-01', to: '2026-06-30' },
    });
    expect(ledgerPeriodQuery('rango', TODAY, { from: '', to: '2026-06-30' })).toEqual({
      ok: true,
      query: { to: '2026-06-30' },
    });
    expect(ledgerPeriodQuery('rango', TODAY, { from: '2026-07-01', to: '2026-06-30' })).toEqual({
      ok: false,
      error: 'La fecha inicial no puede ser posterior a la final.',
    });
    expect(ledgerPeriodQuery('rango', TODAY, { from: '', to: '' }).ok).toBe(false);
  });
});

describe('ledgerPeriodId', () => {
  it.each([
    [null, 'todo'],
    ['3m', '3m'],
    ['12m', '12m'],
    ['rango', 'rango'],
    ['1y', 'todo'],
  ] as const)('%p → %p', (value, expected) => {
    expect(ledgerPeriodId(value)).toBe(expected);
  });
});

describe('ledgerRows y lateLabel', () => {
  it('con filtro y sin la fila de la API, abre con el saldo inicial', () => {
    const rows = ledgerRows({ ...LEDGER, rows: LEDGER.rows.slice(1) });
    expect(rows[0]).toMatchObject({ kind: 'SALDO_ANTERIOR', balance: '20.00', date: '2026-08-13' });
    expect(ledgerRows({ ...LEDGER, from: null, rows: [] })).toEqual([]);
  });
  it('distingue «Vencido» de «Pagó tarde» por el saldo del documento', () => {
    expect(lateLabel({ late: true, documentId: DOC_LATE_OPEN }, DOCUMENTS)).toBe('Vencida');
    expect(lateLabel({ late: true, documentId: DOC_LATE_PAID }, DOCUMENTS)).toBe('Pagó tarde');
    expect(lateLabel({ late: false, documentId: DOC_LATE_OPEN }, DOCUMENTS)).toBeNull();
  });
});

function renderLedger() {
  return render(
    <BillingStatementLedger subscriberId={SUBSCRIBER_ID} documents={DOCUMENTS} today={TODAY} />,
  );
}

describe('BillingStatementLedger', () => {
  it('carga todo el historial por defecto y aplica 3 meses como from', async () => {
    const user = userEvent.setup();
    renderLedger();
    await waitFor(() => expect(mockLedger).toHaveBeenCalledWith(SUBSCRIBER_ID, {}));
    const group = screen.getByRole('group', { name: 'Periodo del estado de cuenta' });
    expect(within(group).getByRole('button', { name: 'Todo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(group).getByRole('button', { name: '3 meses' }));
    await waitFor(() =>
      expect(mockLedger).toHaveBeenLastCalledWith(SUBSCRIBER_ID, { from: '2026-08-13' }),
    );
  });

  it('el filtro elegido se escribe en la URL y conserva tab y sub', async () => {
    const user = userEvent.setup();
    renderLedger();
    await waitFor(() => expect(mockLedger).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Últimos 12 meses' }));
    const url = new URL(String(mockReplace.mock.calls.at(-1)?.[0]), 'http://portal.test');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      tab: 'facturacion',
      sub: 'estado',
      periodo: '12m',
    });
    await waitFor(() =>
      expect(mockLedger).toHaveBeenLastCalledWith(SUBSCRIBER_ID, { from: '2025-11-13' }),
    );
  });

  it.each([
    ['periodo=6m', '6 meses', { from: '2026-05-13' }],
    [
      'periodo=rango&desde=2026-01-01&hasta=2026-06-30',
      'Rango de fechas',
      { from: '2026-01-01', to: '2026-06-30' },
    ],
    ['periodo=otro', 'Todo', {}],
  ])('montado con %s abre ese filtro', async (search, chip, query) => {
    mockSearch.current = `tab=facturacion&sub=estado&${search}`;
    renderLedger();
    await waitFor(() => expect(mockLedger).toHaveBeenCalledWith(SUBSCRIBER_ID, query));
    expect(screen.getByRole('button', { name: chip })).toHaveAttribute('aria-pressed', 'true');
  });

  it('un rango inválido no consulta y lo anuncia junto a los campos', async () => {
    const user = userEvent.setup();
    renderLedger();
    await waitFor(() => expect(mockLedger).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Rango de fechas' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Hasta'), '2026-06-30');
    await user.type(screen.getByLabelText('Desde'), '2026-07-01');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('La fecha inicial no puede ser posterior a la final.');
    for (const label of ['Desde', 'Hasta']) {
      const field = screen.getByLabelText(label);
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field).toHaveAccessibleDescription(
        'La fecha inicial no puede ser posterior a la final.',
      );
    }
    expect(mockLedger).not.toHaveBeenCalledWith(SUBSCRIBER_ID, {
      from: '2026-07-01',
      to: '2026-06-30',
    });
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeDisabled();
  });

  it('el rango pide fechas válidas antes de consultar', async () => {
    const user = userEvent.setup();
    renderLedger();
    await waitFor(() => expect(mockLedger).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Rango de fechas' }));
    expect(screen.getByText('Elige la fecha inicial, la final o ambas.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeDisabled();
    await user.type(screen.getByLabelText('Desde'), '2026-01-01');
    await user.type(screen.getByLabelText('Hasta'), '2026-06-30');
    await waitFor(() =>
      expect(mockLedger).toHaveBeenLastCalledWith(SUBSCRIBER_ID, {
        from: '2026-01-01',
        to: '2026-06-30',
      }),
    );
  });

  it('muestra saldo anterior, filas con cargo, abono y saldo, marcas y saldo final', async () => {
    renderLedger();
    const table = await screen.findByRole('region', { name: 'Movimientos del estado de cuenta' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Fecha', 'Concepto', 'Referencia', 'Cargo', 'Abono', 'Saldo']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toHaveTextContent('Saldo anterior');
    expect(rows[1]).toHaveTextContent('Factura');
    expect(rows[1]).toHaveTextContent('Vence el 15 de septiembre de 2026');
    expect(rows[1]).toHaveTextContent('Pagó tarde');
    expect(rows[1]).toHaveTextContent('DC-1');
    expect(rows[2]).toHaveTextContent('Transferencia bancaria · Recibo N.º 12');
    expect(rows[3]).toHaveTextContent('Retención de ICA');
    expect(rows[3]).not.toHaveTextContent('RETE_ICA');
    expect(rows[4]).toHaveTextContent('Vencida');
    expect(rows[5]).toHaveTextContent(`${money('30')} a favor`);
    expect(
      screen.getByText('Del 13 de agosto de 2026 al 13 de noviembre de 2026'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Saldo final:/u)).toHaveTextContent(
      `Saldo final: ${money('30')} a favor`,
    );
  });

  it('descarga el PDF y envía al cliente con el periodo elegido', async () => {
    const user = userEvent.setup();
    mockLedgerPdf.mockResolvedValue(new Blob(['%PDF']));
    mockSend.mockResolvedValue({
      id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
      subscriberId: SUBSCRIBER_ID,
      kind: 'ESTADO_CUENTA',
      documentId: null,
      paymentId: null,
      periodFrom: '2026-05-13',
      periodTo: '2026-11-13',
      recipientMasked: null,
      subject: 'Estado de cuenta',
      status: 'RECHAZADO',
      reasonCode: 'TITULAR_RESTRINGIDO',
      resend: false,
      requestedBy: '77777777-7777-4777-8777-777777777777',
      createdAt: '2026-11-13T15:00:00.000Z',
      processedAt: '2026-11-13T15:00:00.000Z',
    });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderLedger();
    await screen.findByText('Aún no hay envíos por correo.');
    await user.click(screen.getByRole('button', { name: '6 meses' }));
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    await waitFor(() =>
      expect(mockLedgerPdf).toHaveBeenCalledWith(SUBSCRIBER_ID, { from: '2026-05-13' }),
    );
    await user.click(screen.getByRole('button', { name: 'Enviar al cliente' }));
    expect(mockSend).toHaveBeenCalledWith(SUBSCRIBER_ID, { from: '2026-05-13' });
    expect(await screen.findByText('No se envió el correo')).toBeInTheDocument();
    expect(
      screen.getByText('Los datos del titular están restringidos: no se le envían correos.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(mockEmailLog).toHaveBeenCalledTimes(2));
    click.mockRestore();
  });

  it('sin permiso de gestión no ofrece el envío', async () => {
    mockGranted.current = new Set([AccessPermissionKey.BILLING_INVOICES_READ]);
    renderLedger();
    await screen.findByRole('region', { name: 'Movimientos del estado de cuenta' });
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar al cliente' })).not.toBeInTheDocument();
  });
});
