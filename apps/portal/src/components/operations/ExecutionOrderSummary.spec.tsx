import { render, screen } from '@testing-library/react';
import { ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';
import { ExecutionOrderSummary } from './ExecutionOrderSummary';
import type { ExecutionOrderDetailResponse } from '@/lib/api-client';

describe('ExecutionOrderSummary', () => {
  it('muestra skeleton durante la carga', () => {
    render(<ExecutionOrderSummary order={null} loading />);
    expect(screen.getByRole('region', { name: 'Cargando resumen de la OT' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(document.querySelectorAll('.animate-pulse')).toHaveLength(3);
  });

  it('muestra una alerta de advertencia cuando la visita no tiene OT vinculada', () => {
    render(<ExecutionOrderSummary order={null} availability="unlinked" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Visita sin OT vinculada');
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
    expect(screen.queryByRole('button', { name: 'Abrir OT' })).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Abrir OT' })).toBeInTheDocument();
  });

  it('mantiene el resumen seguro cuando la plantilla no está disponible', () => {
    const order: ExecutionOrderDetailResponse = {
      id: 'eo-001',
      number: 'OT-001',
      version: 1,
      status: ExecutionOrderStatus.ASSIGNED,
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
});
