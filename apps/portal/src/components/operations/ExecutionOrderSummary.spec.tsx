import { render, screen } from '@testing-library/react';
import { ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';
import { ExecutionOrderSummary } from './ExecutionOrderSummary';
import type { ExecutionOrderDetailResponse, ExecutionOrderRecord } from '@/lib/api-client';

describe('ExecutionOrderSummary', () => {
  it('muestra skeleton durante la carga', () => {
    render(<ExecutionOrderSummary order={null} loading />);
    expect(
      screen.getByRole('region', { name: 'Cargando resumen de la orden de trabajo' }),
    ).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelectorAll('.animate-pulse')).toHaveLength(3);
  });

  it('muestra una alerta de advertencia cuando la visita no tiene OT vinculada', () => {
    render(<ExecutionOrderSummary order={null} availability="unlinked" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Visita sin orden vinculada');
    expect(screen.queryByRole('button', { name: 'Actualizar detalle' })).not.toBeInTheDocument();
    expect(
      screen.getByText(/No hay una acción para actualizar el detalle disponible/),
    ).toBeInTheDocument();
  });

  it('ofrece actualizar el detalle cuando existe un handler', async () => {
    const onRefreshDetail = jest.fn().mockResolvedValue(undefined);
    render(
      <ExecutionOrderSummary
        order={null}
        availability="unlinked"
        onRefreshDetail={onRefreshDetail}
      />,
    );

    const button = screen.getByRole('button', { name: 'Actualizar detalle' });
    button.click();
    expect(onRefreshDetail).toHaveBeenCalledTimes(1);
  });

  it('muestra error recuperable y reintento', () => {
    render(
      <ExecutionOrderSummary
        order={null}
        error="No fue posible consultar la OT"
        onRetry={jest.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('No fue posible cargar el resumen');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('muestra copy informativo sin CTA cuando la OT no está disponible', () => {
    render(<ExecutionOrderSummary order={null} availability="unavailable" />);

    expect(
      screen.getByText(/La información estará disponible cuando se actualice el detalle/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('prioriza reintentar o actualizar detalle antes de abrir la OT ante un error', () => {
    render(
      <ExecutionOrderSummary
        order={null}
        availability="unavailable"
        canOpen
        onOpen={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Abrir orden de trabajo' }),
    ).not.toBeInTheDocument();
  });

  it('muestra success sin ocultar el resumen', () => {
    render(<ExecutionOrderSummary order={null} successMessage="La orden quedó sincronizada." />);
    expect(screen.getByText('Operación completada')).toBeInTheDocument();
    expect(screen.getByText('La orden quedó sincronizada.')).toBeInTheDocument();
  });

  it('mantiene la apertura disponible en modo solo lectura', () => {
    const order = {
      id: 'ot-001',
      executionOrderNumber: 'OT-001',
      status: ExecutionOrderStatus.ASSIGNED,
      workType: WfmWorkType.INSTALLATION,
      plannedWindowStartAt: '2026-07-27T14:00:00.000Z',
      plannedWindowEndAt: '2026-07-27T16:00:00.000Z',
      customerDisplayLabel: 'Sitio autorizado',
      assignedTechnicianId: null,
      result: null,
    } as never;
    render(<ExecutionOrderSummary order={order} readonly canOpen onOpen={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Abrir orden de trabajo' })).toBeInTheDocument();
  });

  it('tolera una orden de agenda sin id de evento ni ventana planificada', () => {
    const order: ExecutionOrderRecord = {
      id: 'ot-sin-agenda',
      tenantId: 'tenant-1',
      executionOrderNumber: 'OT-2026-001',
      visitRequestId: null,
      scheduleEventId: null,
      assignedTechnicianId: null,
      assignedCrewId: null,
      originContext: 'manual',
      originRefId: null,
      customerDisplayLabel: 'Sitio autorizado',
      serviceAddress: null,
      municipality: null,
      sector: null,
      workType: WfmWorkType.INSTALLATION,
      workSummary: 'Instalación de equipo',
      workInstructions: null,
      plannedWindowStartAt: null,
      plannedWindowEndAt: null,
      status: ExecutionOrderStatus.ASSIGNED,
      result: null,
      startedAt: null,
      closedAt: null,
      closeNotes: null,
      createdByUserId: null,
      updatedByUserId: null,
      createdAt: '2026-10-05T12:00:00.000Z',
      updatedAt: '2026-10-05T12:00:00.000Z',
    };

    render(<ExecutionOrderSummary order={order} />);

    const block = screen.getByText('Ventana planificada').parentElement;
    expect(block).toHaveTextContent('Por programar');
    expect(block).toHaveTextContent(
      'Esta orden no tiene una ventana planificada. Coordina su programación con el equipo de programación.',
    );
    expect(block).not.toHaveTextContent('Invalid Date');
  });

  it('mantiene el resumen seguro cuando la plantilla no está disponible', () => {
    const order: ExecutionOrderDetailResponse = {
      id: 'eo-001',
      number: 'OT-001',
      version: 1,
      status: ExecutionOrderStatus.ASSIGNED,
      // MOD11 T2 (contrato v1.4): el discriminador viaja siempre en el detalle.
      annulled: false,
      workType: WfmWorkType.INSTALLATION,
      template: null,
      schedule: {
        eventId: 'event-001',
        window: {
          startAt: '2026-07-27T14:00:00.000Z',
          endAt: '2026-07-27T16:00:00.000Z',
        },
      },
      site: { id: 'site-001', label: 'Sitio autorizado' },
      completion: { progress: 40, completed: 2, total: 5 },
      syncState: 'IN_SYNC',
      inventoryReconciliation: 'NOT_REQUIRED',
      allowedActions: [],
      createdAt: '2026-07-27T12:00:00.000Z',
      updatedAt: '2026-07-27T12:00:00.000Z',
    };

    render(<ExecutionOrderSummary order={order} />);

    expect(screen.getByText('Plantilla no disponible')).toBeInTheDocument();
    expect(screen.getByText('2 de 5 requisitos completados')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveValue(40);
  });

  describe('ventana nula (E4, UX consola v1.1 §7.3)', () => {
    const WINDOW_HELP =
      'Esta orden no tiene una ventana planificada. Coordina su programación con el equipo de programación.';

    function buildWindowlessOrder(status: ExecutionOrderStatus): ExecutionOrderDetailResponse {
      return {
        id: 'eo-002',
        number: 'OT-002',
        version: 1,
        status,
        annulled: false,
        workType: WfmWorkType.INSTALLATION,
        template: null,
        schedule: { eventId: null, window: null },
        site: { id: 'site-001', label: 'Sitio autorizado' },
        completion: { progress: 0 },
        syncState: 'IN_SYNC',
        inventoryReconciliation: 'NOT_REQUIRED',
        allowedActions: [],
        createdAt: '2026-07-27T12:00:00.000Z',
        updatedAt: '2026-07-27T12:00:00.000Z',
      };
    }

    it.each([
      ExecutionOrderStatus.CREATED,
      ExecutionOrderStatus.ASSIGNED,
      ExecutionOrderStatus.EN_ROUTE,
      ExecutionOrderStatus.IN_PROGRESS,
      ExecutionOrderStatus.BLOCKED,
    ])('estado abierto %s: «Ventana planificada: Por programar» y la ayuda aprobada', (status) => {
      render(<ExecutionOrderSummary order={buildWindowlessOrder(status)} />);

      const block = screen.getByText('Ventana planificada').parentElement;
      expect(block).toHaveTextContent('Por programar');
      expect(block).toHaveTextContent(WINDOW_HELP);
      expect(block).not.toHaveTextContent('—');
      expect(block).not.toHaveTextContent('Sin ventana planificada');
    });

    it.each([
      ExecutionOrderStatus.COMPLETED,
      ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
      ExecutionOrderStatus.NOT_EXECUTED,
      ExecutionOrderStatus.CANCELLED,
    ])('estado terminal %s: «Sin ventana planificada» y sin ayuda', (status) => {
      render(<ExecutionOrderSummary order={buildWindowlessOrder(status)} />);

      const block = screen.getByText('Ventana planificada').parentElement;
      expect(block).toHaveTextContent('Sin ventana planificada');
      expect(block).not.toHaveTextContent('Por programar');
      expect(screen.queryByText(WINDOW_HELP)).not.toBeInTheDocument();
    });

    it('con ventana conserva el intervalo y no muestra texto de estado ni ayuda', () => {
      const order = {
        ...buildWindowlessOrder(ExecutionOrderStatus.ASSIGNED),
        schedule: {
          eventId: 'event-001',
          window: {
            startAt: '2026-07-27T14:00:00.000Z',
            endAt: '2026-07-27T16:00:00.000Z',
          },
        },
      };
      const fmt = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

      render(<ExecutionOrderSummary order={order} />);

      const block = screen.getByText('Ventana planificada').parentElement;
      expect(block).toHaveTextContent(
        `${fmt.format(new Date('2026-07-27T14:00:00.000Z'))} – ${fmt.format(new Date('2026-07-27T16:00:00.000Z'))}`,
      );
      expect(block).not.toHaveTextContent('Por programar');
      expect(screen.queryByText(WINDOW_HELP)).not.toBeInTheDocument();
    });

    it('CREATED sin ventana no invita a reclamarla ni ofrece acciones nuevas', () => {
      render(<ExecutionOrderSummary order={buildWindowlessOrder(ExecutionOrderStatus.CREATED)} />);

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.queryByText(/reclam|tomar|asígnate|autoasign/i)).not.toBeInTheDocument();
    });

    it('la variante compacta de agenda no repite ventana ni ayuda (se coordinan arriba)', () => {
      render(
        <ExecutionOrderSummary
          order={buildWindowlessOrder(ExecutionOrderStatus.CREATED)}
          variant="agenda-compact"
        />,
      );

      expect(screen.queryByText('Ventana planificada')).not.toBeInTheDocument();
      expect(screen.queryByText(WINDOW_HELP)).not.toBeInTheDocument();
    });

    it('no pinta enums crudos en el resumen sin ventana', () => {
      render(<ExecutionOrderSummary order={buildWindowlessOrder(ExecutionOrderStatus.CREATED)} />);

      expect(screen.queryByText(/\b[A-Z]+_[A-Z_]+\b/)).not.toBeInTheDocument();
    });
  });

  it('muestra Sincronizada cuando el estado está mapeado a synced', () => {
    const order = {
      id: 'eo-001',
      number: 'OT-001',
      version: 1,
      status: ExecutionOrderStatus.ASSIGNED,
      // MOD11 T2 (contrato v1.4): el discriminador viaja siempre en el detalle.
      annulled: false,
      workType: WfmWorkType.INSTALLATION,
      template: null,
      schedule: {
        eventId: 'event-001',
        window: {
          startAt: '2026-07-27T14:00:00.000Z',
          endAt: '2026-07-27T16:00:00.000Z',
        },
      },
      site: { id: 'site-001', label: 'Sitio autorizado' },
      completion: { progress: 0 },
      syncState: 'IN_SYNC',
      inventoryReconciliation: 'NOT_REQUIRED',
      allowedActions: [],
      createdAt: '2026-07-27T12:00:00.000Z',
      updatedAt: '2026-07-27T12:00:00.000Z',
    } as ExecutionOrderDetailResponse;

    render(<ExecutionOrderSummary order={order} syncState="synced" />);

    expect(screen.getByRole('status')).toHaveTextContent('Sincronizada');
  });
});
