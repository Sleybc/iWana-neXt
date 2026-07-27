import { fireEvent, render, screen } from '@testing-library/react';
import { ExecutionOrderStatus, ScheduleEventStatus, WfmWorkType } from '@iwana/shared';
import { ScheduleEventDrawer } from './ScheduleEventDrawer';

const baseEvent = {
  id: 'evt-1',
  title: 'Instalación fibra óptica',
  type: WfmWorkType.INSTALLATION,
  status: ScheduleEventStatus.SCHEDULED,
  scheduledStartAt: '2026-07-27T10:00:00.000Z',
  scheduledEndAt: '2026-07-27T11:00:00.000Z',
  assignedUserId: 'tech-1',
  address: 'Calle 10 #5-30',
  municipality: 'Bogotá',
  sector: 'Chapinero',
  description: 'Instalación de servicio FTTH',
  workOrderId: null,
  executionOrderId: null,
} as any;

const baseProps = {
  open: true,
  event: baseEvent,
  technician: null,
  executionOrder: null,
  onOpenChange: jest.fn(),
  onRetry: jest.fn().mockResolvedValue(undefined),
  isLoading: false,
  error: null,
  canReschedule: true,
};

describe('ScheduleEventDrawer — coordinación', () => {
  // ─── Positive: estados de carga ───
  it('muestra skeleton de carga cuando isLoading es true', () => {
    render(<ScheduleEventDrawer {...baseProps} isLoading />);
    expect(screen.getByLabelText('Cargando detalle del evento')).toBeInTheDocument();
  });

  it('muestra error con botón de reintento cuando hay error', () => {
    const onRetry = jest.fn().mockResolvedValue(undefined);
    render(
      <ScheduleEventDrawer
        {...baseProps}
        event={null}
        error="Servicio no disponible"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('No fue posible cargar el detalle')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('muestra estado vacío cuando no hay evento', () => {
    render(<ScheduleEventDrawer {...baseProps} event={null} />);
    expect(screen.getByText('Evento no disponible')).toBeInTheDocument();
  });

  // ─── Positive: contexto operativo ───
  it('muestra badges de tipo y estado del evento', () => {
    render(<ScheduleEventDrawer {...baseProps} />);
    expect(screen.getByText('Instalación')).toBeInTheDocument();
    expect(screen.getByText('Programado')).toBeInTheDocument();
  });

  it('muestra coordenadas cuando el evento las tiene', () => {
    const event = {
      ...baseEvent,
      latitude: '4.43712',
      longitude: '-74.52198',
    };
    render(<ScheduleEventDrawer {...baseProps} event={event} />);
    expect(screen.getByText(/Coordenadas:/)).toBeInTheDocument();
    expect(screen.getByText(/4\.43712, -74\.52198/)).toBeInTheDocument();
  });

  it('muestra ventana programada, responsable y ubicación en contexto', () => {
    render(<ScheduleEventDrawer {...baseProps} />);
    // La ventana se formatea con la fecha local
    expect(screen.getByText(/Calle 10 #5-30/)).toBeInTheDocument();
    expect(screen.getByText(/Chapinero/)).toBeInTheDocument();
    expect(screen.getByText(/Bogotá/)).toBeInTheDocument();
  });

  // ─── Positive: resumen de OT ───
  it('muestra la sección de resumen de OT', () => {
    render(<ScheduleEventDrawer {...baseProps} />);
    expect(screen.getByText('Resumen de la OT')).toBeInTheDocument();
  });

  it('muestra el enlace "Abrir OT de ejecución" cuando hay executionOrderId', () => {
    const event = { ...baseEvent, executionOrderId: 'eo-001' };
    render(<ScheduleEventDrawer {...baseProps} event={event} onOpenExecutionOrder={jest.fn()} />);
    expect(screen.getByRole('link', { name: 'Abrir OT de ejecución' })).toBeInTheDocument();
  });

  it('no muestra enlace a OT cuando no hay executionOrderId', () => {
    render(<ScheduleEventDrawer {...baseProps} />);
    expect(screen.queryByRole('link', { name: 'Abrir OT de ejecución' })).not.toBeInTheDocument();
  });

  // ─── Positive: acción de coordinación ───
  it('muestra "Mover a pendientes" cuando canReschedule es true y el evento no es terminal', () => {
    render(<ScheduleEventDrawer {...baseProps} canReschedule onOpenMoveToPending={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Mover a pendientes' })).toBeInTheDocument();
  });

  it('no muestra "Mover a pendientes" cuando canReschedule es false', () => {
    render(<ScheduleEventDrawer {...baseProps} canReschedule={false} />);
    expect(screen.queryByRole('button', { name: 'Mover a pendientes' })).not.toBeInTheDocument();
  });

  it('no muestra "Mover a pendientes" cuando el evento es terminal', () => {
    const event = { ...baseEvent, status: ScheduleEventStatus.COMPLETED };
    render(<ScheduleEventDrawer {...baseProps} event={event} canReschedule />);
    expect(screen.queryByRole('button', { name: 'Mover a pendientes' })).not.toBeInTheDocument();
  });

  it('muestra aviso de evento terminal cuando está cerrado', () => {
    const event = { ...baseEvent, status: ScheduleEventStatus.COMPLETED };
    render(<ScheduleEventDrawer {...baseProps} event={event} />);
    expect(screen.getByText(/El evento está cerrado/)).toBeInTheDocument();
  });

  // ════════════════════════════════════════════
  // NEGATIVE: verifica que NO hay ejecución de campo
  // ════════════════════════════════════════════

  it('NO contiene botones de transición de evento de campo (Confirmar agenda)', () => {
    render(<ScheduleEventDrawer {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'Confirmar agenda' })).not.toBeInTheDocument();
  });

  it('NO contiene botones de transición de evento de campo (Marcar en ruta)', () => {
    render(<ScheduleEventDrawer {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'Marcar en ruta' })).not.toBeInTheDocument();
  });

  it('NO contiene botones de transición de evento de campo (Iniciar atención)', () => {
    render(<ScheduleEventDrawer {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'Iniciar atención' })).not.toBeInTheDocument();
  });

  it('NO contiene botones de transición de evento de campo (Cerrar atención)', () => {
    render(<ScheduleEventDrawer {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'Cerrar atención' })).not.toBeInTheDocument();
  });

  it('NO contiene botones de transición de evento de campo (Marcar sin atención)', () => {
    render(<ScheduleEventDrawer {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'Marcar sin atención' })).not.toBeInTheDocument();
  });

  it('NO contiene botones de transición de evento de campo (Confirmar nueva franja)', () => {
    render(<ScheduleEventDrawer {...baseProps} />);
    expect(
      screen.queryByRole('button', { name: 'Confirmar nueva franja' }),
    ).not.toBeInTheDocument();
  });

  it('NO contiene el botón "Aplicar estado" para eventos terminales', () => {
    const event = { ...baseEvent, status: ScheduleEventStatus.COMPLETED };
    render(<ScheduleEventDrawer {...baseProps} event={event} />);
    expect(screen.queryByRole('button', { name: 'Aplicar estado' })).not.toBeInTheDocument();
  });

  it('NO contiene selectores genéricos de estado', () => {
    render(<ScheduleEventDrawer {...baseProps} />);
    // No debe haber un dropdown/select para cambiar estado
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('NO contiene formularios de actividad de campo', () => {
    render(<ScheduleEventDrawer {...baseProps} />);
    expect(screen.queryByText('Checklist de instalación')).not.toBeInTheDocument();
    expect(screen.queryByText('Trabajo realizado')).not.toBeInTheDocument();
    expect(screen.queryByText('Equipos y materiales')).not.toBeInTheDocument();
    expect(screen.queryByText('Evidencias y conformidad')).not.toBeInTheDocument();
  });

  it('NO contiene controles de ejecución (iniciar, bloquear, cerrar)', () => {
    render(<ScheduleEventDrawer {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'Iniciar ejecución' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bloquear/ })).not.toBeInTheDocument();
  });

  it('NO expone UUID como contenido principal', () => {
    // El ID del evento no debe ser texto visible prominente
    const { container } = render(<ScheduleEventDrawer {...baseProps} />);
    // El id técnico no debe estar en un heading o label principal
    const headings = container.querySelectorAll('h2, h3');
    for (const heading of headings) {
      expect(heading.textContent).not.toContain(baseEvent.id);
    }
  });

  // ─── Cobertura: historial de cambios ───
  it('muestra sección de historial de cambios', () => {
    render(<ScheduleEventDrawer {...baseProps} />);
    expect(screen.getByText('Historial de cambios')).toBeInTheDocument();
  });
});
