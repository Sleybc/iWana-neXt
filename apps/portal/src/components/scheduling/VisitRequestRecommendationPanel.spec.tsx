import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  UserRole,
  VisitRequestStatus,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WfmWorkType,
} from '@iwana/shared';
import type { ComponentProps } from 'react';
import type { InternalUser } from '@/lib/api-client';
import { VisitRequestRecommendationPanel } from './VisitRequestRecommendationPanel';

const useOperatingWindowMock = jest.fn();

jest.mock('./useOperatingWindow', () => ({
  useOperatingWindow: (...args: unknown[]) => useOperatingWindowMock(...args),
  getOperatingWindowMessage: (
    window: {
      status?: 'OPEN' | 'CLOSED';
      startTime?: string | null;
      endTime?: string | null;
      reason?: string | null;
    } | null,
  ) => {
    if (!window) {
      return null;
    }

    if (window.status === 'OPEN' && window.startTime && window.endTime) {
      return `Ventana operativa vigente: ${window.startTime} a ${window.endTime}.`;
    }

    return window.reason ?? null;
  },
}));

function buildVisitRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'vr-1',
    tenantId: 'tenant-1',
    status: VisitRequestStatus.READY_TO_SCHEDULE,
    originContext: WorkOrderSourceContext.CRM,
    originRef: 'EXP-001',
    originLabel: 'Oportunidad EXP-001',
    workType: WfmWorkType.INSTALLATION,
    priority: WorkOrderPriority.HIGH,
    title: 'Instalación GPON barrio norte',
    description: 'Cliente listo para ventana PM.',
    requestedWindowStartAt: '2026-06-01T13:00:00.000Z',
    requestedWindowEndAt: '2026-06-01T18:00:00.000Z',
    slaDueAt: '2026-06-02T23:59:59.000Z',
    address: 'Cra 10 # 10 - 10',
    municipality: 'Bogotá',
    sector: 'Chapinero',
    latitude: null,
    longitude: null,
    operatingSiteId: '66666666-6666-4666-8666-666666666666',
    organizationSiteId: '77777777-7777-4777-8777-777777777777',
    expedienteId: '550e8400-e29b-41d4-a716-446655440111',
    subscriberId: null,
    ticketId: 'TK-100',
    contractId: null,
    scheduleEventId: null,
    workOrderId: null,
    requestedByUserId: 'user-1',
    scheduledByUserId: null,
    scheduledAt: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancelReason: null,
    createdAt: '2026-05-31T10:00:00.000Z',
    updatedAt: '2026-05-31T10:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function buildTechnician(overrides: Partial<InternalUser> = {}): InternalUser {
  return {
    id: 'tech-1',
    email: 'tecnico@demo.co',
    role: UserRole.TECHNICIAN,
    status: 'ACTIVE',
    tenantId: 'tenant-1',
    mfaEnabled: true,
    mfaRequired: false,
    emailVerified: true,
    passwordResetRequired: false,
    lastLoginAt: '2026-05-31T10:00:00.000Z',
    createdAt: '2026-05-31T10:00:00.000Z',
    updatedAt: '2026-05-31T10:00:00.000Z',
    deletedAt: null,
    firstName: 'Luisa',
    lastName: 'Campos',
    phone: null,
    jobTitle: 'Técnico GPON',
    documentType: null,
    documentNumber: null,
    avatarUrl: null,
    ...overrides,
  };
}

const noopAsync = async () => {};
const noop = () => {};

function buildPanelProps(
  overrides: Partial<ComponentProps<typeof VisitRequestRecommendationPanel>> = {},
) {
  const technician = buildTechnician();
  const techniciansById = new Map([[technician.id, technician]]);

  return {
    selectedVisitRequest: buildVisitRequest(),
    customerDisplayName: 'María Gómez',
    techniciansById,
    recommendations: [],
    selectedRecommendationId: null,
    isLoadingRecommendations: false,
    recommendationError: null,
    isSavingContext: false,
    onRecommend: noopAsync,
    onSelectRecommendation: noop,
    onManualSelectionChange: noop,
    onSaveContext: noopAsync,
    onOpenConfirm: noop,
    onClose: noop,
    ...overrides,
  };
}

describe('VisitRequestRecommendationPanel - agenda manual', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useOperatingWindowMock.mockReturnValue({
      operatingWindow: {
        status: 'OPEN',
        source: 'COMPANY_HOURS',
        startTime: '07:00',
        endTime: '18:00',
        reason: null,
      },
      isLoadingOperatingWindow: false,
      operatingWindowError: null,
    });
  });

  it('abre el formulario manual al pulsar el toggle y muestra los campos requeridos', async () => {
    const props = buildPanelProps();
    render(<VisitRequestRecommendationPanel {...props} />);

    expect(
      screen.queryByRole('button', { name: /Prefiero agendar manualmente/i }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Técnico')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Prefiero agendar manualmente/i }));

    expect(await screen.findByLabelText('Técnico')).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha')).toBeInTheDocument();
    expect(screen.getByLabelText('Hora de inicio')).toBeInTheDocument();
    expect(screen.getByLabelText('Duración (min)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revisar agenda manual' })).toBeInTheDocument();
  });

  it('muestra mensajes de validación si se confirma con campos vacíos', async () => {
    const onOpenConfirm = jest.fn();
    const props = buildPanelProps({ onOpenConfirm });
    render(<VisitRequestRecommendationPanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /Prefiero agendar manualmente/i }));

    fireEvent.change(await screen.findByLabelText('Fecha'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Duración (min)'), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: 'Revisar agenda manual' }));

    expect(await screen.findByText('Selecciona un técnico para continuar.')).toBeInTheDocument();
    expect(screen.getByText('Define una fecha válida para la agenda manual.')).toBeInTheDocument();
    expect(
      screen.getByText('Define una hora de inicio válida para la agenda manual.'),
    ).toBeInTheDocument();
    expect(screen.getByText('La duración mínima es de 15 minutos.')).toBeInTheDocument();
    expect(onOpenConfirm).not.toHaveBeenCalled();
  });

  it('rechaza la confirmación cuando la duración es menor a 15 minutos', async () => {
    const onOpenConfirm = jest.fn();
    const props = buildPanelProps({ onOpenConfirm });
    render(<VisitRequestRecommendationPanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /Prefiero agendar manualmente/i }));

    const techSelect = await screen.findByRole('combobox', { name: 'Técnico' });
    fireEvent.click(techSelect);
    fireEvent.click(await screen.findByRole('option', { name: 'Luisa Campos' }));

    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-06-01' } });

    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '14:00' } });

    fireEvent.change(screen.getByLabelText('Duración (min)'), { target: { value: '10' } });

    fireEvent.click(screen.getByRole('button', { name: 'Revisar agenda manual' }));

    expect(await screen.findByText('La duración mínima es de 15 minutos.')).toBeInTheDocument();
    expect(onOpenConfirm).not.toHaveBeenCalled();
  });

  it('prepara el draft manual y abre la confirmación con técnico, fecha, hora y duración válidas', async () => {
    const onOpenConfirm = jest.fn();
    const onManualSelectionChange = jest.fn();
    const props = buildPanelProps({ onOpenConfirm, onManualSelectionChange });
    render(<VisitRequestRecommendationPanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /Prefiero agendar manualmente/i }));

    const techSelect = await screen.findByRole('combobox', { name: 'Técnico' });
    fireEvent.click(techSelect);
    fireEvent.click(await screen.findByRole('option', { name: 'Luisa Campos' }));

    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-06-01' } });

    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '14:00' } });

    fireEvent.change(screen.getByLabelText('Duración (min)'), { target: { value: '120' } });

    fireEvent.click(screen.getByRole('button', { name: 'Revisar agenda manual' }));

    await waitFor(() => {
      expect(onOpenConfirm).toHaveBeenCalledTimes(1);
      expect(onManualSelectionChange).toHaveBeenCalled();
    });

    const payload = onManualSelectionChange.mock.calls.at(-1)?.[0] as {
      technicianId: string;
      date: string;
      startTime: string;
      duration: string;
      source: string;
    };

    expect(payload.technicianId).toBe('tech-1');
    expect(payload.date).toBe('2026-06-01');
    expect(payload.startTime).toBe('14:00');
    expect(payload.duration).toBe('120');
    expect(payload.source).toBe('manual');
  });
});
