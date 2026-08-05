import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  VisitRequestStatus,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WfmWorkType,
} from '@iwana/shared';
import type { WfmVisitRequest } from '@/lib/api-client';
import { ExhaustedAttemptsDecisionDialog } from './ExhaustedAttemptsDecisionDialog';

jest.mock('@iwana/ui', () => {
  const React = require('react') as typeof import('react');
  return {
    Button: ({
      children,
      disabled,
      onClick,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button type="button" disabled={disabled} onClick={onClick} {...props}>
        {children}
      </button>
    ),
    Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
      open ? <div>{children}</div> : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  };
});

jest.mock('@/components/shared/portal-ui', () => ({
  PortalAlert: ({ title, description }: { title: string; description: string }) => (
    <div role="alert">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  ),
}));

function buildVisitRequest(overrides: Partial<WfmVisitRequest> = {}): WfmVisitRequest {
  return {
    id: 'vr-exhausted-1',
    tenantId: 'tenant-1',
    status: VisitRequestStatus.REQUIRES_RESCHEDULE,
    originContext: WorkOrderSourceContext.CRM,
    originRef: 'exp-1',
    originLabel: 'Cliente Ana Pérez',
    customerDisplayName: 'Ana Pérez',
    workType: WfmWorkType.INSTALLATION,
    priority: WorkOrderPriority.NORMAL,
    title: 'Instalación Ana Pérez',
    description: null,
    requestedWindowStartAt: null,
    requestedWindowEndAt: null,
    slaDueAt: null,
    address: 'Calle 1',
    municipality: 'EL_COLEGIO',
    sector: null,
    latitude: null,
    longitude: null,
    expedienteId: 'exp-1',
    subscriberId: null,
    ticketId: null,
    contractId: null,
    scheduleEventId: 'evt-1',
    workOrderId: null,
    requestedByUserId: 'user-1',
    scheduledByUserId: null,
    scheduledAt: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancelReason: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-04T10:00:00.000Z',
    deletedAt: null,
    retryCount: 3,
    lastNonRealizationCauseLabel: 'El cliente no estaba',
    ...overrides,
  };
}

describe('ExhaustedAttemptsDecisionDialog', () => {
  it('no preselecciona ninguna decisión y exige motivo para cerrar', async () => {
    const onConfirm = jest.fn();

    render(
      <ExhaustedAttemptsDecisionDialog
        open
        visitRequest={buildVisitRequest()}
        onOpenChange={jest.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('Se agotaron los tres intentos')).toBeInTheDocument();
    expect(screen.getByText('Reprogramar de todas formas')).toBeInTheDocument();
    expect(screen.getByText('Cerrar el caso')).toBeInTheDocument();

    const confirmButton = screen.getByRole('button', { name: 'Confirmar decisión' });
    expect(confirmButton).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/Cerrar el caso/i));
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Motivo del cierre'), {
      target: { value: 'El cliente desistió' },
    });

    expect(confirmButton).not.toBeDisabled();
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith('CLOSE_CASE', 'El cliente desistió');
    });
  });

  it('permite forzar reprogramación sin motivo', async () => {
    const onConfirm = jest.fn();

    render(
      <ExhaustedAttemptsDecisionDialog
        open
        visitRequest={buildVisitRequest()}
        onOpenChange={jest.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByLabelText(/Reprogramar de todas formas/i));
    const confirmButton = screen.getByRole('button', { name: 'Confirmar decisión' });
    expect(confirmButton).not.toBeDisabled();
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith('FORCE_RESCHEDULE', undefined);
    });
  });
});
