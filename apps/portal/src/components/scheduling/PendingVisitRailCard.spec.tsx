import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  WfmWorkType,
  WorkOrderPriority,
  WorkOrderSourceContext,
  VisitRequestStatus,
} from '@iwana/shared';
import { PendingVisitRailCard } from './PendingVisitRailCard';

const visitRequest = {
  id: 'visit-1',
  tenantId: 'tenant-1',
  status: VisitRequestStatus.READY_TO_SCHEDULE,
  originContext: WorkOrderSourceContext.CRM,
  originRef: 'exp-1',
  originLabel: 'Cliente Luis Alberto Segura Corredor',
  customerDisplayName: 'Luis Alberto Segura Corredor',
  workType: WfmWorkType.INSTALLATION,
  priority: WorkOrderPriority.NORMAL,
  title: 'Instalación fibra',
  description: null,
  requestedWindowStartAt: null,
  requestedWindowEndAt: null,
  slaDueAt: '2026-06-20T12:00:00.000Z',
  address: 'Calle 1',
  municipality: 'El Colegio',
  sector: 'Vda la Virginia',
  latitude: null,
  longitude: null,
  organizationSiteId: 'site-1',
  expedienteId: null,
  subscriberId: null,
  ticketId: null,
  contractId: null,
  scheduleEventId: null,
  workOrderId: null,
  requestedByUserId: 'user-1',
  scheduledByUserId: null,
  scheduledAt: null,
  cancelledAt: null,
  cancelledByUserId: null,
  cancelReason: null,
  createdAt: '2026-06-05T08:00:00.000Z',
  updatedAt: '2026-06-05T08:00:00.000Z',
  deletedAt: null,
};

describe('PendingVisitRailCard', () => {
  it('muestra cliente, ubicación, fecha de creación y tipo sin duplicar referencia', () => {
    render(<PendingVisitRailCard visitRequest={visitRequest as any} />);

    expect(screen.getByText('Luis Alberto Segura Corredor')).toBeInTheDocument();
    expect(screen.getByText(/El Colegio · Vda la Virginia/i)).toBeInTheDocument();
    expect(screen.getByText(/Creada /i)).toBeInTheDocument();
    expect(screen.getByText('Instalación')).toBeInTheDocument();
    expect(screen.queryByText('Cliente Luis Alberto Segura Corredor')).not.toBeInTheDocument();
    expect(screen.queryByText(/Compromiso/i)).not.toBeInTheDocument();
  });

  describe('con onClick provisto', () => {
    it('tiene role button y es activable con click', async () => {
      const handleClick = jest.fn();
      render(<PendingVisitRailCard visitRequest={visitRequest as any} onClick={handleClick} />);
      const card = screen.getByRole('button');
      await userEvent.click(card);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('responde a Enter en el teclado', async () => {
      const handleClick = jest.fn();
      render(<PendingVisitRailCard visitRequest={visitRequest as any} onClick={handleClick} />);
      const card = screen.getByRole('button');
      card.focus();
      await userEvent.keyboard('{Enter}');
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('sin onClick', () => {
    it('no tiene role button', () => {
      render(<PendingVisitRailCard visitRequest={visitRequest as any} />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });
});
