import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BillingDocumentResponse } from '@iwana/shared';
import { ApiError } from '@/lib/api-client';
import { BillingDocumentTable } from './BillingDocumentTable';
import { PROTECTED_LABEL, PROTECTED_NOTICE, additionalNotice } from './billing-copy';

const mockDocument = jest.fn();
const mockDocumentPdf = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    ApiError: actual.ApiError,
    billingApi: {
      document: (...args: unknown[]) => mockDocument(...args),
      documentPdf: (...args: unknown[]) => mockDocumentPdf(...args),
      issue: jest.fn(),
      voidDocument: jest.fn(),
    },
  };
});

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

const BASE: BillingDocumentResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  periodId: '33333333-3333-4333-8333-333333333333',
  contractId: '44444444-4444-4444-8444-444444444444',
  subscriberId: '55555555-5555-4555-8555-555555555555',
  status: 'EMITIDO',
  number: 'DC-000101',
  issueDate: '2026-11-05',
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
  blockingReason: null,
  buyerSnapshot: {
    displayName: 'Titular Sintético',
    documentType: 'NIT',
    documentNumber: '900000001',
    address: 'Calle Sintética 1',
    rutResponsibilities: ['R-99-PN'],
  },
  issuerSnapshot: { legalName: 'Operador Sintético', nit: '900000000' },
  createdAt: '2026-11-05T12:00:00.000Z',
  updatedAt: '2026-11-05T12:00:00.000Z',
  lines: [],
  paidAmount: '0.00',
  pendingAmount: '119.00',
};

function renderTable(documents: BillingDocumentResponse[]) {
  return render(<BillingDocumentTable documents={documents} onChanged={() => undefined} />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BillingDocumentTable (CA-UX-FAC-05, 07, 13)', () => {
  it('oculta al adquirente con la máscara legal sin intentar reconstruirlo', () => {
    renderTable([{ ...BASE, buyerProtected: true }]);
    const cells = screen.getAllByText(PROTECTED_LABEL);
    expect(cells.length).toBeGreaterThan(0);
    expect(screen.queryByText('Titular Sintético')).not.toBeInTheDocument();
  });

  it.each([
    ['PAGADO', 'Pagado'],
    ['PARCIAL', 'Pago parcial'],
    ['PENDIENTE', 'Pendiente'],
    ['VENCIDO', 'Vencido'],
    ['SIN_DOCUMENTO', 'Sin documento'],
  ] as const)('muestra la píldora de estado de pago %s', (state, label) => {
    renderTable([{ ...BASE, paymentState: state }]);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('muestra un guion cuando el documento no tiene estado de pago', () => {
    renderTable([{ ...BASE, status: 'BORRADOR', paymentState: null, number: null }]);
    expect(screen.getByText('Sin número')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('deshabilita la emisión del borrador bloqueado con el motivo visible', () => {
    renderTable([
      {
        ...BASE,
        status: 'BORRADOR',
        number: null,
        paymentState: null,
        blockingReason: 'SIN_PRECIO',
        buyerProtected: false,
      },
    ]);
    expect(screen.getByText('Falta tarifa vigente en el catálogo comercial')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Emitir' })).toBeDisabled();
  });

  it('muestra el aviso de adicionales sin cobrar en el detalle', async () => {
    mockDocument.mockResolvedValue({ ...BASE, unbilledAdditionalCount: 2 });
    renderTable([{ ...BASE, unbilledAdditionalCount: 2 }]);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));
    await waitFor(() => expect(screen.getByText(additionalNotice(2))).toBeInTheDocument());
  });

  it('muestra el aviso de custodia en el detalle sin revelar el nombre', async () => {
    mockDocument.mockResolvedValue({ ...BASE, buyerProtected: true });
    renderTable([{ ...BASE, buyerProtected: true }]);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));
    await waitFor(() => expect(screen.getByText(PROTECTED_NOTICE)).toBeInTheDocument());
    expect(screen.queryByText('Titular Sintético')).not.toBeInTheDocument();
  });

  it('muestra el texto de auditoría no disponible ante el 503 de custodia', async () => {
    mockDocument.mockRejectedValue(
      new ApiError(503, 'PRIVACY_AUDIT_UNAVAILABLE', 'No fue posible auditar.'),
    );
    renderTable([{ ...BASE }]);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));
    await waitFor(() =>
      expect(
        screen.getByText(
          'No fue posible auditar la consulta de datos protegidos. Por seguridad, la información permanece oculta.',
        ),
      ).toBeInTheDocument(),
    );
  });
});

describe('BillingDocumentTable — línea de instalación (fase 2, CA-4/CA-5)', () => {
  it('muestra el tipo «Instalación» y el descuento por permanencia de la descripción', async () => {
    const line = {
      id: '66666666-6666-4666-8666-666666666666',
      documentId: BASE.id,
      kind: 'INSTALACION' as const,
      description: 'Instalación (cargo $ 120.000, descuento por permanencia $ 120.000)',
      quantity: '1.0000',
      unitPrice: '120000.00',
      baseAmount: '0.00',
      taxAmount: '0.00',
      total: '0.00',
      vatTreatment: 'GRAVADO',
      vatRate: '19.0000',
      position: 1,
    };
    mockDocument.mockResolvedValue({ ...BASE, lines: [line] });
    renderTable([BASE]);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));
    expect(await screen.findByText('Instalación')).toBeInTheDocument();
    expect(screen.getByText(/descuento por permanencia/)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Tipo' })).toBeInTheDocument();
  });
});
