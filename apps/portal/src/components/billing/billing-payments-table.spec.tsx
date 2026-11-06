import { render, screen } from '@testing-library/react';
import { suggestFifoAllocations } from '@iwana/shared';
import type { BillingPaymentResponse } from '@iwana/shared';
import { BillingPaymentTable } from './BillingPaymentsClient';
import { pendingDocuments } from './BillingPaymentDialog';
import {
  additionalNotice,
  formatBillingMoney,
  moneyCents,
  PROTECTED_LABEL,
  PROTECTED_NOTICE,
} from './billing-copy';

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

const PAYMENT: BillingPaymentResponse = {
  id: '66666666-6666-4666-8666-666666666666',
  tenantId: '22222222-2222-4222-8222-222222222222',
  subscriberId: '55555555-5555-4555-8555-555555555555',
  method: 'TRANSFERENCIA',
  amount: '120.00',
  paidAt: '2026-11-06',
  idempotencyKey: 'clave-sintetica',
  status: 'REGISTRADO',
  createdBy: '77777777-7777-4777-8777-777777777777',
  createdAt: '2026-11-06T12:00:00.000Z',
  allocatedAmount: '95.00',
  unallocatedAmount: '25.00',
};

describe('Pagos y FIFO (CA-UX-FAC-09, 10, 13)', () => {
  it('reparte FIFO con remanente a saldo a favor', () => {
    const allocations = suggestFifoAllocations('120.00', [
      {
        documentId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa1',
        dueDate: '2026-11-19',
        pendingAmount: '95.00',
      },
      {
        documentId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa2',
        dueDate: '2026-12-19',
        pendingAmount: '80.00',
      },
    ]);
    const applied = allocations.reduce((total, item) => total + moneyCents(item.amount), 0);
    expect(allocations).toEqual([
      { documentId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa1', amount: '95.00' },
      { documentId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa2', amount: '25.00' },
    ]);
    expect(applied).toBe(moneyCents('95.00') + moneyCents('25.00'));
    expect(formatBillingMoney('25.00')).toContain('25');
  });

  it('ordena los pendientes por vencimiento para la sugerencia', () => {
    const ordered = pendingDocuments([
      {
        id: 'b',
        dueDate: '2026-12-19',
        status: 'EMITIDO',
        pendingAmount: '10.00',
      } as never,
      {
        id: 'a',
        dueDate: '2026-11-19',
        status: 'EMITIDO',
        pendingAmount: '10.00',
      } as never,
      { id: 'c', dueDate: '2026-11-19', status: 'BORRADOR', pendingAmount: '10.00' } as never,
    ]);
    expect(ordered.map((document) => document.id)).toEqual(['a', 'b']);
  });

  it('muestra la máscara del suscriptor protegido y el aviso de custodia', () => {
    render(
      <BillingPaymentTable
        payments={[{ ...PAYMENT, subscriberDisplayName: 'Nombre Real', subscriberProtected: true }]}
        onChanged={() => undefined}
        showSubscriber
      />,
    );
    expect(screen.getByText(PROTECTED_LABEL)).toBeInTheDocument();
    expect(screen.getByText('Datos protegidos')).toBeInTheDocument();
    expect(screen.queryByText('Nombre Real')).not.toBeInTheDocument();
    expect(screen.getByText(PROTECTED_NOTICE)).toBeInTheDocument();
  });

  it('muestra el aviso de adicionales con el conteo del documento', () => {
    expect(additionalNotice(3)).toContain('3 adicionales');
  });
});
