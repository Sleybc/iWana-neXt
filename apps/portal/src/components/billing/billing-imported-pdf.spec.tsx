/**
 * PDF de un histórico importado (ADR-110 D5) desde Facturación → Facturas. Antes se probaba en la
 * pestaña Documentos; la spec MOD05↔MOD14 2026-11-13 (D1, CA-1) lo trasladó a la tabla de cobros.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessPermissionKey, type BillingDocumentResponse } from '@iwana/shared';
import { ApiError } from '@/lib/api-client';
import { BillingDocumentTable } from './BillingDocumentTable';

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    const ctx = {
      hasPermission: (key: AccessPermissionKey) =>
        key === AccessPermissionKey.BILLING_INVOICES_READ,
    };
    return () => ctx;
  })(),
}));

const mockDocumentPdf = jest.fn();
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    billingApi: { documentPdf: (...args: unknown[]) => mockDocumentPdf(...args) },
  };
});

const IMPORTED: BillingDocumentResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  periodId: null,
  contractId: '44444444-4444-4444-8444-444444444444',
  subscriberId: '55555555-5555-4555-8555-555555555555',
  status: 'IMPORTADO',
  number: null,
  externalNumber: 'UISP-2024-0042',
  dueDate: '2024-05-15',
  periodStart: null,
  periodEnd: null,
  coveredStart: null,
  paymentState: 'PAGADO',
  buyerProtected: false,
  subtotal: '100.00',
  taxTotal: '0.00',
  total: '100.00',
  pendingAmount: '0.00',
  unbilledAdditionalCount: 0,
  issueDate: '2024-05-01',
  createdAt: '2026-11-12T10:00:00.000Z',
  updatedAt: '2026-11-12T10:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  URL.createObjectURL = jest.fn(() => 'blob:pdf');
  URL.revokeObjectURL = jest.fn();
});
afterEach(() => jest.restoreAllMocks());

describe('Facturas — PDF del histórico importado', () => {
  it('se descarga con su número externo', async () => {
    const user = userEvent.setup();
    const names: string[] = [];
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    mockDocumentPdf.mockResolvedValue(new Blob(['%PDF']));
    render(<BillingDocumentTable documents={[IMPORTED]} onChanged={jest.fn()} />);
    expect(screen.getByText('UISP-2024-0042')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    await waitFor(() => expect(mockDocumentPdf).toHaveBeenCalledWith(IMPORTED.id));
    await waitFor(() => expect(names).toEqual(['factura-importada-UISP-2024-0042.pdf']));
  });

  it('explica cuando el PDF no se trajo en la importación', async () => {
    const user = userEvent.setup();
    mockDocumentPdf.mockRejectedValue(new ApiError(404, 'BILLING_IMPORTED_PDF_NOT_AVAILABLE', 'x'));
    render(<BillingDocumentTable documents={[IMPORTED]} onChanged={jest.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));
    expect(
      await screen.findByText('El PDF de esta factura histórica no se trajo en la importación.'),
    ).toBeInTheDocument();
  });
});
