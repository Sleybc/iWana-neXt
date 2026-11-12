import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BillingAccountStatement, BillingDocumentResponse } from '@iwana/shared';
import { BillingPaymentDialog } from './BillingPaymentDialog';
import { formatBillingMoney } from './billing-copy';

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    const ctx = { hasPermission: () => true };
    return () => ctx;
  })(),
}));

jest.mock('@/lib/api-client', () => ({
  billingApi: { statement: jest.fn(), registerPayment: jest.fn() },
  tenantSelfApi: { getSettings: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }) },
}));

const SUBSCRIBER_ID = '55555555-5555-4555-8555-555555555555';
const money = (value: string) => formatBillingMoney(value).replace(/\s/gu, ' ');

function document(id: string, pending: string): BillingDocumentResponse {
  return {
    id,
    tenantId: '22222222-2222-4222-8222-222222222222',
    periodId: '33333333-3333-4333-8333-333333333333',
    contractId: '44444444-4444-4444-8444-444444444444',
    subscriberId: SUBSCRIBER_ID,
    status: 'EMITIDO',
    number: `DC-${id.slice(0, 4)}`,
    dueDate: '2026-11-25',
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
    coveredStart: '2026-10-30',
    paymentState: 'PENDIENTE',
    buyerProtected: false,
    subtotal: pending,
    taxTotal: '0.00',
    total: pending,
    unbilledAdditionalCount: 0,
    createdAt: '2026-11-11T12:00:00.000Z',
    updatedAt: '2026-11-11T12:00:00.000Z',
    pendingAmount: pending,
  };
}

// Caso real: octubre con prorrateo heredado en centavos + noviembre completo.
const STATEMENT: BillingAccountStatement = {
  subscriberId: SUBSCRIBER_ID,
  buyerProtected: false,
  impersonationHold: false,
  totalInvoiced: '108548.39',
  totalPaid: '0.00',
  totalPending: '108548.39',
  creditBalance: '0.00',
  documents: [
    document('11111111-1111-4111-8111-111111111111', '53548.39'),
    document('11111112-1111-4111-8111-111111111111', '55000.00'),
  ],
  payments: [],
  contractSummaries: [],
};

describe('BillingPaymentDialog — saldo exacto', () => {
  it('«Pagar el saldo completo» llena el monto exacto con centavos', async () => {
    render(
      <BillingPaymentDialog
        statement={STATEMENT}
        subscriberId={SUBSCRIBER_ID}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
    expect(await screen.findByText(`Saldo pendiente: ${money('108548.39')}`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pagar el saldo completo' }));
    expect(screen.getByLabelText('Monto del pago (COP)')).toHaveValue('108548.39');
  });

  it('avisa cuando un monto redondeado deja centavos sin pagar', async () => {
    render(
      <BillingPaymentDialog
        statement={STATEMENT}
        subscriberId={SUBSCRIBER_ID}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
    await userEvent.type(await screen.findByLabelText('Monto del pago (COP)'), '108548');
    expect(
      screen.getByText(`Quedan ${money('0.39')} sin pagar: un documento quedará con pago parcial.`),
    ).toBeInTheDocument();
  });
});
