import { render, screen, waitFor } from '@testing-library/react';
import {
  ScheduleEventStatus,
  VisitRequestStatus,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WfmWorkType,
} from '@iwana/shared';
import type { WfmVisitRequest } from '@/lib/api-client';
import { UnrealizedVisitsView } from './UnrealizedVisitsView';

const listVisitRequestsMock = jest.fn();
const listEventsMock = jest.fn();
const listCausesMock = jest.fn();
const listAssigneesMock = jest.fn();

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('@iwana/ui', () => {
  const React = require('react') as typeof import('react');
  return {
    Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    Button: ({
      children,
      onClick,
      asChild,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
      asChild ? (
        <>{children}</>
      ) : (
        <button type="button" onClick={onClick} {...props}>
          {children}
        </button>
      ),
    Select: ({
      id,
      label,
      value,
      onChange,
      options = [],
    }: {
      id: string;
      label: string;
      value: string;
      onChange: (event: { target: { value: string } }) => void;
      options?: Array<{ value: string; label: string }>;
    }) => (
      <label>
        {label}
        <select
          id={id}
          aria-label={label}
          value={value}
          onChange={(event) => onChange({ target: { value: event.target.value } })}
        >
          {options.map((option) => (
            <option key={option.value || 'all'} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    ),
    Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
      open ? <div>{children}</div> : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  };
});

jest.mock('@/components/layout/PageHeader', () => ({
  PageHeader: ({
    title,
    subtitle,
    actions,
  }: {
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
  }) => (
    <header>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
      {actions}
    </header>
  ),
}));

jest.mock('@/components/shared/portal-ui', () => ({
  PortalAlert: ({ title, description }: { title: string; description: string }) => (
    <div role="alert">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  ),
  PortalEmptyState: ({ title, description }: { title: string; description: string }) => (
    <div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  ),
  PortalPanel: ({
    title,
    description,
    children,
  }: {
    title: string;
    description?: string;
    children: React.ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {children}
    </section>
  ),
  PortalResultsStrip: ({ badge }: { badge: React.ReactNode }) => <div>{badge}</div>,
  PortalSkeletonBlock: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
  PortalTablePagination: () => <div data-testid="pagination" />,
}));

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  wfmApi: {
    nonRealizationCauses: {
      list: (...args: unknown[]) => listCausesMock(...args),
    },
    eligibleAssignees: {
      list: (...args: unknown[]) => listAssigneesMock(...args),
    },
    visitRequests: {
      list: (...args: unknown[]) => listVisitRequestsMock(...args),
      cancel: jest.fn(),
    },
    events: {
      list: (...args: unknown[]) => listEventsMock(...args),
      reviewCause: jest.fn(),
    },
  },
}));

function buildVisitRequest(overrides: Partial<WfmVisitRequest> = {}): WfmVisitRequest {
  return {
    id: 'vr-1',
    tenantId: 'tenant-1',
    status: VisitRequestStatus.REQUIRES_RESCHEDULE,
    originContext: WorkOrderSourceContext.ASSURANCE,
    originRef: 'ticket-1',
    originLabel: 'Ticket ticket-1',
    workType: WfmWorkType.SUPPORT,
    priority: WorkOrderPriority.NORMAL,
    title: 'Soporte en sitio',
    description: null,
    requestedWindowStartAt: null,
    requestedWindowEndAt: null,
    slaDueAt: null,
    address: 'Calle 2',
    municipality: 'EL_COLEGIO',
    sector: null,
    latitude: null,
    longitude: null,
    expedienteId: null,
    subscriberId: null,
    ticketId: 'ticket-1',
    contractId: null,
    scheduleEventId: 'evt-1',
    workOrderId: null,
    requestedByUserId: 'user-1',
    scheduledByUserId: 'tech-1',
    scheduledAt: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancelReason: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-04T10:00:00.000Z',
    deletedAt: null,
    retryCount: 2,
    nonRealizationCauseId: 'cause-1',
    lastNonRealizationCauseLabel: 'El cliente no estaba',
    ...overrides,
  };
}

describe('UnrealizedVisitsView', () => {
  beforeEach(() => {
    listCausesMock.mockResolvedValue([
      {
        id: 'cause-1',
        code: 'CUSTOMER_ABSENT',
        label: 'El cliente no estaba',
        category: 'CUSTOMER',
        requiresEvidence: true,
      },
    ]);
    listAssigneesMock.mockResolvedValue([
      {
        id: 'tech-1',
        firstName: 'Luis',
        lastName: 'Mora',
        email: 'luis@example.com',
        role: 'TECHNICIAN',
      },
    ]);
    listVisitRequestsMock.mockResolvedValue({
      items: [buildVisitRequest()],
      meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
    });
    listEventsMock.mockImplementation(({ status }: { status: ScheduleEventStatus }) => {
      if (status === ScheduleEventStatus.EXPIRED) {
        return Promise.resolve({
          data: [
            {
              id: 'evt-expired-1',
              tenantId: 'tenant-1',
              workOrderId: null,
              type: WfmWorkType.SUPPORT,
              status: ScheduleEventStatus.EXPIRED,
              title: 'Visita vencida sin reporte',
              description: null,
              scheduledStartAt: '2026-08-03T14:00:00.000Z',
              scheduledEndAt: '2026-08-03T15:00:00.000Z',
              assignedUserId: 'tech-1',
              assignedTeamId: null,
              address: null,
              municipality: null,
              sector: null,
              latitude: null,
              longitude: null,
              expedienteId: null,
              subscriberId: null,
              organizationSiteId: null,
              ticketId: null,
              contractId: null,
              createdBy: 'user-1',
              updatedBy: null,
              createdAt: '2026-08-03T10:00:00.000Z',
              updatedAt: '2026-08-03T16:00:00.000Z',
              deletedAt: null,
            },
          ],
          meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
        });
      }
      return Promise.resolve({
        data: [],
        meta: { total: 0, page: 1, limit: 100, totalPages: 0 },
      });
    });
  });

  it('monta la vista con copy E2 y acciones de decisión', async () => {
    render(<UnrealizedVisitsView />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Visitas sin realizar' }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(listVisitRequestsMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: VisitRequestStatus.REQUIRES_RESCHEDULE }),
      );
    });

    expect(await screen.findByText('Soporte en sitio')).toBeInTheDocument();
    expect(screen.getByText('Visita vencida sin reporte')).toBeInTheDocument();
    expect(screen.getByText('Sin reporte')).toBeInTheDocument();
    expect(screen.getByText('Intento 2 de 3')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Reprogramar Soporte en sitio/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Cerrar el caso de Soporte en sitio/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a pendientes' })).toHaveAttribute(
      'href',
      '/dashboard/scheduling/pending-visits',
    );
  });

  it('muestra chip Requiere decisión con status REQUIRES_RESCHEDULE real', async () => {
    listVisitRequestsMock.mockResolvedValue({
      items: [
        buildVisitRequest({
          status: VisitRequestStatus.REQUIRES_RESCHEDULE,
          retryCount: 3,
        }),
      ],
      meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
    });

    render(<UnrealizedVisitsView />);

    expect(await screen.findByText('Requiere decisión')).toBeInTheDocument();
  });
});
