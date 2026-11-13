import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BillingDocumentInstallationBreakdown, BillingDocumentResponse } from '@iwana/shared';
import { BillingInstallationBreakdown } from './BillingInstallationBreakdown';
import { BillingDocumentTable } from './BillingDocumentTable';
import { formatBillingMoneyExact } from './billing-copy';

const mockDocument = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ApiError: actual.ApiError,
    billingApi: {
      document: (...args: unknown[]) => mockDocument(...args),
      documentPdf: jest.fn(),
      issue: jest.fn(),
      voidDocument: jest.fn(),
    },
  };
});

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    const ctx = { hasPermission: () => false };
    return () => ctx;
  })(),
}));

const money = (value: string) => formatBillingMoneyExact(value).replace(/\s/gu, ' ');

const BREAKDOWN: BillingDocumentInstallationBreakdown = {
  executionOrders: [{ executionOrderNumber: 'OT-2026-0042', closedAt: '2026-11-10T15:00:00.000Z' }],
  items: [
    {
      executionOrderNumber: 'OT-2026-0042',
      position: 1,
      description: 'Cable de fibra drop',
      quantity: '60.00',
      unitOfMeasure: 'METER',
      unitReferenceValue: '1200.00',
      referenceValue: '72000.00',
      valueSource: 'PRECIO_COMERCIAL',
      isLoan: false,
      serialNumbers: [],
    },
    {
      executionOrderNumber: 'OT-2026-0042',
      position: 2,
      description: 'Router Wi-Fi 6',
      quantity: '1.00',
      unitOfMeasure: 'UND',
      unitReferenceValue: '180000.00',
      referenceValue: '180000.00',
      valueSource: 'COSTO_PROMEDIO',
      isLoan: true,
      serialNumbers: ['SN-ABC-123'],
    },
    {
      executionOrderNumber: 'OT-2026-0042',
      position: 3,
      description: 'Conector SC/APC',
      quantity: '2.00',
      unitOfMeasure: 'UNIT',
      unitReferenceValue: null,
      referenceValue: null,
      valueSource: 'SIN_VALOR',
      isLoan: false,
      serialNumbers: [],
    },
  ],
  realValue: '252000.00',
  chargedValue: '119000.00',
  itemsWithoutValue: 1,
  serialsProtected: false,
};

describe('BillingInstallationBreakdown (spec MOD14 2026-11-13 R3, R4)', () => {
  it('muestra ítems, comodato, seriales, valor real frente a valor cobrado y la nota sin valor', () => {
    render(<BillingInstallationBreakdown breakdown={BREAKDOWN} />);
    const section = screen.getByRole('region', {
      name: 'Valor real de la instalación (informativo, no se cobra)',
    });
    expect(within(section).getByText(/OT-2026-0042 \(cerrada el/u)).toBeInTheDocument();
    const table = within(section).getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Descripción', 'Cantidad', 'Unidad', 'Valor unitario', 'Total']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('Cable de fibra drop')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('60')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Metro')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Precio comercial vigente')).toBeInTheDocument();
    expect(within(rows[0]!).getByText(money('72000'))).toBeInTheDocument();
    // CA-3: el router en comodato con su valor de referencia y su serial.
    expect(within(rows[1]!).getByText('En comodato')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Serial: SN-ABC-123')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Unidad')).toBeInTheDocument();
    expect(within(rows[1]!).getAllByText(money('180000'))).toHaveLength(2);
    expect(within(rows[2]!).getByText('Sin valor de referencia')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('—')).toBeInTheDocument();

    expect(within(section).getByText('Valor real').nextSibling).toHaveTextContent(money('252000'));
    expect(within(section).getByText('Valor cobrado').nextSibling).toHaveTextContent(
      money('119000'),
    );
    expect(
      within(section).getByText('1 ítem no tiene valor de referencia y no suma en el valor real.'),
    ).toBeInTheDocument();
    expect(within(section).getByText(/equipos en comodato/u)).toBeInTheDocument();
  });

  it('oculta los seriales si están protegidos y lo explica', () => {
    render(<BillingInstallationBreakdown breakdown={{ ...BREAKDOWN, serialsProtected: true }} />);
    expect(screen.queryByText(/SN-ABC-123/u)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Los seriales no se muestran porque los datos del titular están protegidos.',
      ),
    ).toBeInTheDocument();
  });
});

describe('Detalle del documento con desglose de instalación', () => {
  const DOCUMENT: BillingDocumentResponse = {
    id: '11111111-1111-4111-8111-111111111111',
    tenantId: '22222222-2222-4222-8222-222222222222',
    periodId: '33333333-3333-4333-8333-333333333333',
    contractId: '44444444-4444-4444-8444-444444444444',
    subscriberId: '55555555-5555-4555-8555-555555555555',
    status: 'EMITIDO',
    number: 'DC-000301',
    dueDate: '2026-11-25',
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    coveredStart: '2026-11-10',
    paymentState: 'PENDIENTE',
    buyerProtected: false,
    subtotal: '100000.00',
    taxTotal: '19000.00',
    total: '119000.00',
    unbilledAdditionalCount: 0,
    createdAt: '2026-11-11T12:00:00.000Z',
    updatedAt: '2026-11-11T12:00:00.000Z',
    pendingAmount: '119000.00',
  };

  beforeEach(() => mockDocument.mockReset());

  it('el side peek muestra el desglose sin cambiar el total del documento (CA-1)', async () => {
    mockDocument.mockResolvedValue({ ...DOCUMENT, installationBreakdown: BREAKDOWN });
    render(<BillingDocumentTable documents={[DOCUMENT]} onChanged={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));
    expect(
      await screen.findByRole('heading', {
        name: 'Valor real de la instalación (informativo, no se cobra)',
      }),
    ).toBeInTheDocument();
    const total = screen.getAllByText('Total').find((node) => node.tagName === 'DT');
    expect(total?.nextSibling).toHaveTextContent(money('119000'));
  });

  it('sin desglose no muestra la sección', async () => {
    mockDocument.mockResolvedValue({ ...DOCUMENT, installationBreakdown: null });
    render(<BillingDocumentTable documents={[DOCUMENT]} onChanged={jest.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));
    expect(await screen.findByText('Adquirente')).toBeInTheDocument();
    expect(screen.queryByText(/Valor real de la instalación/u)).not.toBeInTheDocument();
  });
});
