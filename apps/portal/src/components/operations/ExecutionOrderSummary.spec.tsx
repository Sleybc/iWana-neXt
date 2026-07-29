import { render, screen } from '@testing-library/react';
import { ExecutionOrderSummary } from './ExecutionOrderSummary';

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
    expect(screen.getByRole('alert')).toHaveTextContent('Visita sin OT de ejecución vinculada');
    expect(screen.queryByRole('button', { name: 'Sincronizar visita' })).not.toBeInTheDocument();
    expect(screen.getByText(/No hay una acción de sincronización disponible/)).toBeInTheDocument();
  });

  it('ofrece sincronizar la visita cuando existe un handler', async () => {
    const onSyncVisit = jest.fn().mockResolvedValue(undefined);
    render(
      <ExecutionOrderSummary order={null} availability="unlinked" onSyncVisit={onSyncVisit} />,
    );

    const button = screen.getByRole('button', { name: 'Sincronizar visita' });
    button.click();
    expect(onSyncVisit).toHaveBeenCalledTimes(1);
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
      screen.getByText(/La información estará disponible cuando se sincronice nuevamente/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
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
      status: 'ASSIGNED',
      workType: 'INSTALLATION',
      plannedWindowStartAt: '2026-07-27T14:00:00.000Z',
      plannedWindowEndAt: '2026-07-27T16:00:00.000Z',
      customerDisplayLabel: 'Sitio autorizado',
      assignedTechnicianId: null,
      result: null,
    } as never;
    render(<ExecutionOrderSummary order={order} readonly canOpen onOpen={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Abrir OT de ejecución' })).toBeInTheDocument();
  });
});
