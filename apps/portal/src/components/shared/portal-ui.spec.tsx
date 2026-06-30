import { render, screen } from '@testing-library/react';
import { PortalAlert, PortalEmptyState } from './portal-ui';

describe('portal-ui', () => {
  it('should expose polite live regions for success alerts', () => {
    render(
      <PortalAlert
        variant="success"
        title="Operación completada"
        description="Los cambios se guardaron correctamente."
      />,
    );

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'true');
  });

  it('should expose assertive live regions for error alerts', () => {
    render(
      <PortalAlert
        variant="error"
        title="No fue posible completar la operación"
        description="Intenta nuevamente."
      />,
    );

    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
    expect(screen.getByRole('alert')).toHaveAttribute('aria-atomic', 'true');
  });

  it('should use the shared token class in empty states', () => {
    const { container } = render(
      <PortalEmptyState
        title="Sin resultados"
        description="No encontramos elementos para mostrar."
      />,
    );

    expect(container.firstChild).toHaveClass('bg-iwana-surface-soft');
  });
});
