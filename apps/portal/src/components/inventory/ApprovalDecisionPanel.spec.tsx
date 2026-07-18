import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PurchaseRequestStatus, PurchaseRequestType } from '@iwana/shared';
import type { PurchaseRequestDetailRecord } from '@/lib/api-client';
import { ApprovalDecisionPanel } from './ApprovalDecisionPanel';

function buildDetail(overrides?: {
  request?: Partial<PurchaseRequestDetailRecord['request']>;
  approvalPolicy?: Partial<PurchaseRequestDetailRecord['approvalPolicy']>;
  quotes?: PurchaseRequestDetailRecord['quotes'];
}): PurchaseRequestDetailRecord {
  return {
    request: {
      id: 'pr-001',
      tenantId: 'tenant-001',
      requestNumber: 'PR-1',
      title: 'Solicitud demo',
      status: PurchaseRequestStatus.PENDING_APPROVAL,
      requestType: PurchaseRequestType.REPLENISHMENT,
      priority: 'NORMAL' as never,
      requestedByUserId: 'user-1',
      requestingArea: null,
      justification: null,
      operationalRefType: null,
      operationalRefId: null,
      exceptionReason: null,
      approvedByUserId: null,
      neededByDate: null,
      notes: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      ...overrides?.request,
    },
    lines: [],
    quotes: overrides?.quotes ?? [
      {
        id: 'quote-1',
        tenantId: 'tenant-001',
        purchaseRequestId: 'pr-001',
        partyRefId: 'party-1',
        quoteNumber: 'Q-100',
        amount: '100000.00',
        shippingCost: '10000.00',
        currency: 'COP',
        validUntil: null,
        notes: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    ],
    awards: [],
    orders: [],
    estimatedAmount: 110000,
    approvalPolicy: {
      canApprove: true,
      requiresException: false,
      blockingReason: null,
      approvalLevel: 'BUYER_MANAGER',
      ...overrides?.approvalPolicy,
    },
    rfq: null,
  };
}

describe('ApprovalDecisionPanel', () => {
  it('muestra monto, nivel y comparación (CA-21-01)', () => {
    render(
      <ApprovalDecisionPanel
        detail={buildDetail()}
        exceptionReason=""
        onExceptionReasonChange={jest.fn()}
        approvalNotes=""
        onApprovalNotesChange={jest.fn()}
        canApproveNow
      />,
    );

    expect(screen.getByText(/Monto estimado/i)).toBeInTheDocument();
    expect(screen.getByText(/Jefe de compras/i)).toBeInTheDocument();
    expect(screen.getByText(/Q-100/)).toBeInTheDocument();
    expect(screen.getByText('Proveedor no identificado')).toBeInTheDocument();
    expect(screen.getByText(/Total con envío/i)).toBeInTheDocument();
  });

  it('permite editar notas de aprobación (CA-21-02)', async () => {
    const user = userEvent.setup();
    const onNotes = jest.fn();
    render(
      <ApprovalDecisionPanel
        detail={buildDetail()}
        exceptionReason=""
        onExceptionReasonChange={jest.fn()}
        approvalNotes=""
        onApprovalNotesChange={onNotes}
        canApproveNow
      />,
    );

    await user.type(screen.getByLabelText(/Notas de aprobación/i), 'Autorizado por presupuesto');
    expect(onNotes).toHaveBeenCalled();
  });

  it('muestra ficha terminal con motivo (CA-21-03)', () => {
    render(
      <ApprovalDecisionPanel
        detail={buildDetail({
          request: {
            status: PurchaseRequestStatus.REJECTED,
            resolutionReason: 'Cotizaciones fuera de presupuesto',
          },
        })}
        exceptionReason=""
        onExceptionReasonChange={jest.fn()}
        approvalNotes=""
        onApprovalNotesChange={jest.fn()}
        canApproveNow={false}
      />,
    );

    expect(screen.getByText(/Rechazada/i)).toBeInTheDocument();
    expect(screen.getByText(/Cotizaciones fuera de presupuesto/i)).toBeInTheDocument();
  });

  it('muestra motivo de excepción cuando la política lo exige (CA-21-04)', () => {
    render(
      <ApprovalDecisionPanel
        detail={buildDetail({
          approvalPolicy: {
            canApprove: false,
            requiresException: true,
            blockingReason: 'Requiere excepción',
            approvalLevel: 'BUYER',
          },
        })}
        exceptionReason=""
        onExceptionReasonChange={jest.fn()}
        approvalNotes=""
        onApprovalNotesChange={jest.fn()}
        canApproveNow
      />,
    );

    expect(screen.getByLabelText(/Motivo de excepción/i)).toBeInTheDocument();
  });
});
