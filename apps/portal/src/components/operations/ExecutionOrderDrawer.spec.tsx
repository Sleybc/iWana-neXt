import { render, screen } from '@testing-library/react';
import { ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';
import { ExecutionOrderDrawer } from './ExecutionOrderDrawer';

describe('ExecutionOrderDrawer', () => {
  it('renders execution order summary and field work sections', () => {
    render(
      <ExecutionOrderDrawer
        open={true}
        order={{
          id: 'eo-001',
          tenantId: 'tenant-001',
          executionOrderNumber: 'OTE-20260624-001',
          visitRequestId: 'vr-001',
          scheduleEventId: 'se-001',
          assignedTechnicianId: 'tech-001',
          assignedCrewId: null,
          originContext: 'TASKS',
          originRefId: 'task-001',
          customerDisplayLabel: 'Cliente Torre Norte',
          serviceAddress: 'Calle 1 # 2 - 3',
          municipality: 'Bogotá',
          sector: 'Centro',
          workType: WfmWorkType.INSTALLATION,
          workSummary: 'Instalar ONU',
          workInstructions: 'Coordinar acceso con portería',
          plannedWindowStartAt: '2026-06-24T14:00:00.000Z',
          plannedWindowEndAt: '2026-06-24T16:00:00.000Z',
          status: ExecutionOrderStatus.IN_PROGRESS,
          result: null,
          startedAt: null,
          closedAt: null,
          closeNotes: null,
          createdByUserId: 'support-001',
          updatedByUserId: 'support-001',
          createdAt: '2026-06-24T13:00:00.000Z',
          updatedAt: '2026-06-24T13:30:00.000Z',
        }}
        activities={[]}
        itemUsage={[]}
        isLoading={false}
        isSubmitting={false}
        error={null}
        onClose={() => undefined}
        onStart={async () => undefined}
        onRegisterFieldWork={async () => undefined}
        onRegisterItemUsage={async () => undefined}
        onCloseOrder={async () => undefined}
      />,
    );

    expect(screen.getByText('Cliente Torre Norte')).toBeInTheDocument();
    expect(screen.getByText('Trabajo realizado')).toBeInTheDocument();
    expect(screen.getByText('Equipos y materiales')).toBeInTheDocument();
    expect(screen.getByText('Cierre técnico')).toBeInTheDocument();
  });
});
