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

  it('muestra empty cuando no hay OT vinculada', () => {
    render(<ExecutionOrderSummary order={null} availability="unlinked" />);
    expect(screen.getByText('Aún no hay una orden de trabajo vinculada')).toBeInTheDocument();
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
