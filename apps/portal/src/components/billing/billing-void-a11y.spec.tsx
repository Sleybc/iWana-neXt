import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { BillingDocumentResponse } from '@iwana/shared';
import { BillingConfirmation } from './BillingConfirmation';
import { BillingDocumentTable } from './BillingDocumentTable';
import { BillingPaymentTable } from './BillingPaymentsClient';
import { DOCUMENT_VOID_REASONS } from './billing-copy';

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    billingApi: {
      document: jest.fn(),
      documentPdf: jest.fn(),
      issue: jest.fn(),
      voidDocument: jest.fn(),
      voidPayment: jest.fn(),
    },
  };
});

const DOCUMENT: BillingDocumentResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  periodId: '33333333-3333-4333-8333-333333333333',
  contractId: '44444444-4444-4444-8444-444444444444',
  subscriberId: '55555555-5555-4555-8555-555555555555',
  status: 'BORRADOR',
  number: null,
  issueDate: null,
  dueDate: '2026-11-19',
  periodStart: '2026-10-05',
  periodEnd: '2026-11-04',
  coveredStart: '2026-10-05',
  paymentState: null,
  buyerProtected: true,
  subtotal: '100.00',
  taxTotal: '19.00',
  total: '119.00',
  unbilledAdditionalCount: 0,
  blockingReason: null,
  buyerSnapshot: {
    displayName: '[Dato protegido por custodia legal]',
    documentType: null,
    documentNumber: null,
    address: null,
    rutResponsibilities: [],
  },
  createdAt: '2026-11-05T12:00:00.000Z',
  updatedAt: '2026-11-05T12:00:00.000Z',
  lines: [],
  paidAmount: '0.00',
  pendingAmount: '119.00',
};

describe('BillingConfirmation — motivo de anulación (CA-UX-FAC-08)', () => {
  it('incluye Suplantación de identidad (Ley 2573) y exige motivo', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    render(
      <BillingConfirmation
        title="Anular documento de cobro DC-000101"
        description="El consecutivo quedará en el historial contable."
        confirm="Confirmar anulación"
        reasons={DOCUMENT_VOID_REASONS}
        onClose={() => undefined}
        onConfirm={onConfirm}
      />,
    );
    const select = screen.getByLabelText('Motivo de anulación');
    expect(select).toHaveDisplayValue('Selecciona un motivo');
    fireEvent.change(select, { target: { value: 'SUPLANTACION' } });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirmar anulación' })).toBeEnabled(),
    );
    expect(
      screen.getByRole('option', {
        name: 'Suplantación de identidad (falsedad personal - Ley 2573)',
      }),
    ).toBeInTheDocument();
  });

  it('bloquea la confirmación sin motivo elegido', () => {
    render(
      <BillingConfirmation
        title="Anular documento de cobro"
        description="Consecutivo en historial."
        confirm="Confirmar anulación"
        reasons={DOCUMENT_VOID_REASONS}
        onClose={() => undefined}
        onConfirm={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Confirmar anulación' })).toBeDisabled();
  });
});

describe('Facturación — accesibilidad de controles (CA-UX-FAC-15)', () => {
  it('tabla de documentos con máscara sin violaciones de axe', async () => {
    const { container } = render(
      <BillingDocumentTable documents={[DOCUMENT]} onChanged={() => undefined} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('tabla de pagos con titular protegido sin violaciones de axe', async () => {
    const { container } = render(
      <BillingPaymentTable
        payments={[
          {
            id: '66666666-6666-4666-8666-666666666666',
            tenantId: DOCUMENT.tenantId,
            subscriberId: DOCUMENT.subscriberId,
            subscriberDisplayName: null,
            subscriberProtected: true,
            method: 'TRANSFERENCIA',
            amount: '119.00',
            paidAt: '2026-11-06',
            idempotencyKey: 'clave-sintetica',
            status: 'REGISTRADO',
            createdBy: '77777777-7777-4777-8777-777777777777',
            createdAt: '2026-11-06T12:00:00.000Z',
            allocatedAmount: '119.00',
            unallocatedAmount: '0.00',
          },
        ]}
        onChanged={() => undefined}
        showSubscriber
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('modal de anulación sin violaciones de axe', async () => {
    const { container } = render(
      <BillingConfirmation
        title="Anular documento de cobro"
        description="Consecutivo en historial."
        confirm="Confirmar anulación"
        reasons={DOCUMENT_VOID_REASONS}
        onClose={() => undefined}
        onConfirm={jest.fn()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
