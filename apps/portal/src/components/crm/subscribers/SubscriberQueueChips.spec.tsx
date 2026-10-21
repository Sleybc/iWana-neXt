import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SubscriberQueueCounts } from '@iwana/shared';
import { SubscriberQueueChips } from './SubscriberQueueChips';

const counts: SubscriberQueueCounts = {
  active: 12,
  suspended: 0,
  contactPending: 3,
  fiscalIncomplete: 4,
  withoutLiveServices: 5,
};

describe('SubscriberQueueChips', () => {
  it('anuncia carga sin presentar conteos como cero', () => {
    render(
      <SubscriberQueueChips
        counts={null}
        loading
        error={false}
        selected={null}
        onSelect={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Cargando conteos de las colas…');
    expect(
      screen.queryByRole('button', { name: /Activos, 0 suscriptores/ }),
    ).not.toBeInTheDocument();
  });

  it('muestra conteos globales, conserva el cero y permite una sola selección accesible', () => {
    const onSelect = jest.fn();
    render(
      <SubscriberQueueChips
        counts={counts}
        loading={false}
        error={false}
        selected="suspended"
        onSelect={onSelect}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Activos, 12 suscriptores' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Suspendidos, 0 suscriptores' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('button', { name: 'Sin servicios vigentes, 5 suscriptores' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Suspendidos, 0 suscriptores' }));
    expect(onSelect).toHaveBeenCalledWith('suspended');
  });

  it('mantiene los chips en una fila desplazable y lleva el activo a la vista sin mover el foco', async () => {
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.hasAttribute('data-subscriber-queue-rail')) {
        return {
          x: 0,
          y: 0,
          top: 0,
          right: 100,
          bottom: 48,
          left: 0,
          width: 100,
          height: 48,
          toJSON: () => ({}),
        };
      }
      if (this.getAttribute('aria-pressed') === 'true') {
        return {
          x: 140,
          y: 0,
          top: 0,
          right: 200,
          bottom: 48,
          left: 140,
          width: 60,
          height: 48,
          toJSON: () => ({}),
        };
      }
      return originalGetBoundingClientRect.call(this);
    });

    render(
      <SubscriberQueueChips
        counts={counts}
        loading={false}
        error={false}
        selected="suspended"
        onSelect={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    const rail = screen.getByRole('group', { name: 'Colas de trabajo' }).parentElement;
    expect(rail).toHaveClass('overflow-x-auto');
    expect(screen.getByRole('group', { name: 'Colas de trabajo' })).toHaveClass(
      'flex-nowrap',
      'md:flex-wrap',
    );
    await waitFor(() => expect(rail?.scrollLeft).toBeGreaterThan(0));
    expect(document.activeElement).toBe(document.body);

    jest.restoreAllMocks();
  });

  it('ofrece reintento sin ocultar la lista cuando fallan los conteos', () => {
    const onRetry = jest.fn();
    render(
      <SubscriberQueueChips
        counts={null}
        loading={false}
        error
        selected={null}
        onSelect={jest.fn()}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('No pudimos cargar los conteos de las colas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar conteos' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
