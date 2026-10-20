import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  UserRole,
  VisitRequestStatus,
  WorkOrderPriority,
  WorkOrderSourceContext,
  WfmWorkType,
} from '@iwana/shared';
import { useState, type ComponentProps } from 'react';
import type { InternalUser, WfmScheduleRecommendation } from '@/lib/api-client';
import type { MatrixManualScheduleDraft } from './matrix-scheduling-selection';
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
    requestedWindowStartAt: '2026-07-15T13:00:00.000Z',
    requestedWindowEndAt: '2026-07-15T18:00:00.000Z',
    slaDueAt: '2026-07-16T23:59:59.000Z',
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
    isOperationalResource: true,
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
  const operationalTechnician = buildTechnician();
  const commercialUser = buildTechnician({
    id: 'sales-1',
    email: 'asesora@demo.co',
    role: UserRole.SALES,
    isOperationalResource: false,
    firstName: 'Laura',
    lastName: 'Ventas',
  });
  const techniciansById = new Map([
    [operationalTechnician.id, operationalTechnician],
    [commercialUser.id, commercialUser],
  ]);

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

// El panel rechaza franjas anteriores al momento actual (isScheduleStartInPast),
// por lo que la fecha fija de los fixtures debe evaluarse contra un "ahora" determinista.
const SYSTEM_TIME = new Date('2026-07-10T08:00:00');

describe('VisitRequestRecommendationPanel - agenda manual', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(SYSTEM_TIME);
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

  afterEach(() => {
    jest.useRealTimers();
  });

  it('prioriza el flujo por recomendaciones antes de abrir la salida manual', async () => {
    const props = buildPanelProps();
    render(<VisitRequestRecommendationPanel {...props} />);

    expect(screen.getByText('Paso 1')).toBeInTheDocument();
    expect(screen.getByText('Define duración y búsqueda')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calcular recomendaciones' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revisar agenda manual' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Prefiero agendar manualmente/i }));

    expect(await screen.findByLabelText('Técnico')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revisar agenda manual' })).toBeInTheDocument();
  });

  it('limita la salida manual a recursos operativos elegibles', async () => {
    const props = buildPanelProps();
    render(<VisitRequestRecommendationPanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /Prefiero agendar manualmente/i }));

    const techSelect = await screen.findByRole('combobox', { name: 'Técnico' });
    fireEvent.click(techSelect);

    expect(await screen.findByRole('option', { name: 'Luisa Campos' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Laura Ventas' })).not.toBeInTheDocument();
  });

  it('muestra mensajes de validación si se confirma con campos vacíos', async () => {
    const onOpenConfirm = jest.fn();
    const props = buildPanelProps({
      onOpenConfirm,
      selectedVisitRequest: buildVisitRequest({ requestedWindowStartAt: null }),
    });
    render(<VisitRequestRecommendationPanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /Prefiero agendar manualmente/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Personalizada' }));
    fireEvent.change(screen.getByLabelText('Horas'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Minutos'), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: 'Revisar agenda manual' }));

    expect(await screen.findByText('Selecciona un técnico para continuar.')).toBeInTheDocument();
    expect(screen.getByText('Define una fecha válida para la agenda manual.')).toBeInTheDocument();
    expect(
      screen.getByText('Define una hora de inicio válida para la agenda manual.'),
    ).toBeInTheDocument();
    expect(screen.getByText('La duración mínima es de 15 minutos.')).toBeInTheDocument();
    expect(onOpenConfirm).not.toHaveBeenCalled();
  });

  it('impide confirmar una franja manual que ya quedó en el pasado', async () => {
    const onOpenConfirm = jest.fn();
    render(
      <VisitRequestRecommendationPanel
        {...buildPanelProps({
          onOpenConfirm,
          selectedVisitRequest: buildVisitRequest({
            requestedWindowStartAt: '2026-07-09T13:00:00.000Z',
          }),
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Prefiero agendar manualmente/i }));
    fireEvent.click(await screen.findByRole('combobox', { name: 'Técnico' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Luisa Campos' }));
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar agenda manual' }));

    expect(
      await screen.findByText(/No se pueden agendar tareas en una fecha u hora anterior/i),
    ).toBeInTheDocument();
    expect(onOpenConfirm).not.toHaveBeenCalled();
  });

  it('ofrece duración rápida y duración personalizada en horas y minutos', async () => {
    render(<VisitRequestRecommendationPanel {...buildPanelProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /Prefiero agendar manualmente/i }));

    expect(await screen.findByRole('group', { name: 'Duración rápida' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 h' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button', { name: 'Personalizada' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Personalizada' }));

    expect(screen.getByLabelText('Horas')).toHaveValue(2);
    expect(screen.getByLabelText('Minutos')).toHaveValue(0);
    expect(screen.getByText('Definida en el paso 1')).toBeInTheDocument();
  });

  it('permite cancelar las recomendaciones calculadas', () => {
    const onCancelRecommendations = jest.fn();
    const recommendation: WfmScheduleRecommendation = {
      technicianId: 'tech-1',
      scheduledStartAt: '2026-07-15T15:00:00.000Z',
      scheduledEndAt: '2026-07-15T17:00:00.000Z',
      score: 90,
      labels: [],
      scoreBreakdown: {
        distance: 20,
        municipality: 20,
        sector: 20,
        routeContinuity: 20,
        load: 5,
        earliest: 5,
      },
      distanceKm: 1.2,
      nearestEventId: null,
      totalScheduledMinutes: 120,
      eventCount: 1,
    };

    render(
      <VisitRequestRecommendationPanel
        {...buildPanelProps({
          recommendations: [recommendation],
          selectedRecommendationId: 'tech-1::2026-07-15T15:00:00.000Z',
          onCancelRecommendations,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar recomendaciones' }));

    expect(onCancelRecommendations).toHaveBeenCalledTimes(1);
  });

  it('solicita recomendaciones con la duración, el horizonte y el contexto guardado', async () => {
    const onSaveContext = jest.fn().mockResolvedValue(undefined);
    const onRecommend = jest.fn().mockResolvedValue(undefined);
    render(
      <VisitRequestRecommendationPanel {...buildPanelProps({ onSaveContext, onRecommend })} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Calcular recomendaciones' }));

    await waitFor(() => {
      expect(onSaveContext).toHaveBeenCalledWith(
        expect.objectContaining({
          address: 'Cra 10 # 10 - 10',
          municipality: 'Bogotá',
          sector: 'Chapinero',
        }),
      );
      expect(onRecommend).toHaveBeenCalledWith(
        expect.objectContaining({
          durationMinutes: 120,
          searchHorizonDays: 7,
          municipality: 'Bogotá',
          sector: 'Chapinero',
        }),
      );
    });
  });

  it('selecciona una recomendación y permite confirmar su franja desde la agenda manual', async () => {
    const recommendation: WfmScheduleRecommendation = {
      technicianId: 'tech-1',
      scheduledStartAt: '2026-07-15T15:00:00.000Z',
      scheduledEndAt: '2026-07-15T17:00:00.000Z',
      score: 90,
      labels: ['Continuidad de ruta'],
      scoreBreakdown: {
        distance: 20,
        municipality: 20,
        sector: 20,
        routeContinuity: 20,
        load: 5,
        earliest: 5,
      },
      distanceKm: null,
      nearestEventId: null,
      totalScheduledMinutes: 120,
      eventCount: 1,
    };
    const recommendationKey = 'tech-1::2026-07-15T15:00:00.000Z';
    const onSelectRecommendation = jest.fn();
    const onOpenConfirm = jest.fn();
    render(
      <VisitRequestRecommendationPanel
        {...buildPanelProps({
          recommendations: [recommendation],
          selectedRecommendationId: recommendationKey,
          onSelectRecommendation,
          onOpenConfirm,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Luisa Campos/ }));
    expect(onSelectRecommendation).toHaveBeenCalledWith(recommendationKey);

    fireEvent.click(screen.getByRole('button', { name: /Prefiero agendar manualmente/i }));
    fireEvent.click(await screen.findByRole('combobox', { name: 'Técnico' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Luisa Campos' }));
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar agenda manual' }));

    await waitFor(() => expect(onOpenConfirm).toHaveBeenCalledTimes(1));
  });

  it('precarga el contexto operativo guardado en la solicitud', async () => {
    render(<VisitRequestRecommendationPanel {...buildPanelProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /Ajustes de contexto/i }));

    expect(await screen.findByLabelText('Dirección operativa')).toHaveValue('Cra 10 # 10 - 10');
    expect(screen.getByLabelText('Municipio')).toHaveValue('Bogotá');
    expect(screen.getByLabelText('Sector')).toHaveValue('Chapinero');
  });

  it('limpia los campos opcionales y muestra el error si falla el guardado del contexto', async () => {
    const onSaveContext = jest
      .fn()
      .mockRejectedValue(new Error('No fue posible guardar el contexto ahora.'));
    render(<VisitRequestRecommendationPanel {...buildPanelProps({ onSaveContext })} />);

    fireEvent.click(screen.getByRole('button', { name: /Ajustes de contexto/i }));
    fireEvent.change(screen.getByLabelText('Dirección operativa'), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText('Municipio'), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText('Sector'), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText('Nota operativa'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar formulario' }));

    fireEvent.click(screen.getByRole('button', { name: 'Guardar contexto' }));

    await waitFor(() => {
      expect(onSaveContext).toHaveBeenCalledWith({
        description: null,
        address: null,
        municipality: null,
        sector: null,
        requestedWindowStartAt: null,
        requestedWindowEndAt: null,
      });
    });
    expect(
      await screen.findByText('No fue posible guardar el contexto ahora.'),
    ).toBeInTheDocument();
  });

  it('guarda los cambios de fecha y hora de la franja preferida del cliente', async () => {
    const onSaveContext = jest.fn().mockResolvedValue(undefined);
    render(<VisitRequestRecommendationPanel {...buildPanelProps({ onSaveContext })} />);

    fireEvent.click(screen.getByRole('button', { name: /Ajustes de contexto/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Desde (fecha)' }));
    fireEvent.click(screen.getByRole('gridcell', { name: '16' }).querySelector('button')!);
    fireEvent.click(
      screen.getByRole('combobox', { name: 'Desde qué hora puede recibir la visita' }),
    );
    fireEvent.click(await screen.findByRole('option', { name: '10:00' }));

    fireEvent.click(screen.getByRole('button', { name: 'Hasta (fecha)' }));
    fireEvent.click(screen.getByRole('gridcell', { name: '17' }).querySelector('button')!);
    fireEvent.click(
      screen.getByRole('combobox', { name: 'Hasta qué hora puede recibir la visita' }),
    );
    fireEvent.click(await screen.findByRole('option', { name: '16:00' }));

    fireEvent.click(screen.getByRole('button', { name: 'Guardar contexto' }));

    await waitFor(() => {
      expect(onSaveContext).toHaveBeenCalledWith(
        expect.objectContaining({
          requestedWindowStartAt: new Date(2026, 6, 16, 10).toISOString(),
          requestedWindowEndAt: new Date(2026, 6, 17, 16).toISOString(),
        }),
      );
    });
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

    fireEvent.click(screen.getByRole('button', { name: '10:00' }));

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
    expect(payload.date).toBe('2026-07-15');
    expect(payload.startTime).toBe('10:00');
    expect(payload.duration).toBe('120');
    expect(payload.source).toBe('manual');
  });

  it('conserva la fecha elegida en la agenda manual y la valida con el borrador controlado', async () => {
    const onOpenConfirm = jest.fn();
    const onManualSelectionChange = jest.fn();
    const props = buildPanelProps({
      onOpenConfirm,
      selectedVisitRequest: buildVisitRequest({
        requestedWindowStartAt: '2026-07-11T13:00:00.000Z',
      }),
    });

    function StatefulPanel() {
      const [manualSelectionDraft, setManualSelectionDraft] =
        useState<MatrixManualScheduleDraft | null>(null);

      return (
        <VisitRequestRecommendationPanel
          {...props}
          manualSelectionDraft={manualSelectionDraft}
          onManualSelectionChange={(draft) => {
            onManualSelectionChange(draft);
            setManualSelectionDraft(draft);
          }}
        />
      );
    }

    render(<StatefulPanel />);

    fireEvent.click(screen.getByRole('button', { name: /Prefiero agendar manualmente/i }));

    const techSelect = await screen.findByRole('combobox', { name: 'Técnico' });
    fireEvent.click(techSelect);
    fireEvent.click(await screen.findByRole('option', { name: 'Luisa Campos' }));

    fireEvent.click(screen.getByRole('button', { name: 'Fecha' }));
    const selectedDay = screen.getByRole('gridcell', { name: '11' });
    fireEvent.click(selectedDay.querySelector('button') as HTMLButtonElement);

    expect(screen.getByRole('button', { name: 'Fecha' })).toHaveTextContent('11/07/2026');

    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar agenda manual' }));

    await waitFor(() => {
      expect(onOpenConfirm).toHaveBeenCalledTimes(1);
      expect(onManualSelectionChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ date: '2026-07-11' }),
      );
    });
  });

  it('expone los riesgos de la selección de matriz y el aviso de una hora libre', () => {
    const matrixCellSelection = {
      technicianId: 'tech-retirado',
      date: '2026-07-15',
      dayLabel: 'Miércoles 15 de julio',
      availabilityLabel: 'Con cruces pendientes',
      riskMessages: ['Hay una orden abierta en esta franja.'],
    };
    const manualSelectionDraft: MatrixManualScheduleDraft = {
      ...matrixCellSelection,
      startTime: '10:00',
      duration: '120',
      source: 'manual',
    };
    render(
      <VisitRequestRecommendationPanel
        {...buildPanelProps({ matrixCellSelection, manualSelectionDraft })}
      />,
    );

    expect(screen.getByText('tech-retirado · Miércoles 15 de julio')).toBeInTheDocument();
    expect(screen.getByText('Con cruces pendientes')).toBeInTheDocument();
    expect(screen.getByText('Hay una orden abierta en esta franja.')).toBeInTheDocument();
    expect(screen.getByText('Hora definida manualmente')).toBeInTheDocument();
    expect(screen.getByText('10:00 · libre')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Confirmar agenda seleccionada' }),
    ).toBeInTheDocument();
  });

  it('bloquea recomendaciones cuando la ventana operativa está cerrada', () => {
    useOperatingWindowMock.mockReturnValue({
      operatingWindow: {
        status: 'CLOSED',
        source: 'COMPANY_HOURS',
        startTime: null,
        endTime: null,
        reason: 'La fecha no tiene horario de atención.',
      },
      isLoadingOperatingWindow: false,
      operatingWindowError: null,
    });
    render(<VisitRequestRecommendationPanel {...buildPanelProps()} />);

    expect(screen.getByText('Fecha cerrada para recomendar')).toBeInTheDocument();
    expect(screen.getAllByText('La fecha no tiene horario de atención.')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Calcular recomendaciones' })).toBeDisabled();
  });

  it('usa los controles visuales iWana en lugar de calendarios nativos', async () => {
    const { container } = render(<VisitRequestRecommendationPanel {...buildPanelProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /Prefiero agendar manualmente/i }));

    expect(await screen.findByRole('button', { name: 'Fecha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hora de inicio' })).toBeInTheDocument();
    expect(container.querySelector('input[type="date"]')).toBeNull();
    expect(container.querySelector('input[type="time"]')).toBeNull();
  });

  it('en modo peek usa el cajón operativo sin chrome duplicado', () => {
    const onClose = jest.fn();
    render(
      <VisitRequestRecommendationPanel
        {...buildPanelProps({ presentation: 'peek', open: true, onClose })}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'María Gómez' })).toBeInTheDocument();
    expect(screen.getByText('Despacho de la solicitud')).toBeInTheDocument();
    expect(screen.getByText('Paso 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar panel' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
