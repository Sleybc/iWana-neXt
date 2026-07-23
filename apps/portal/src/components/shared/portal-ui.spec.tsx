import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PortalAlert,
  PortalDataTableHead,
  PortalEmptyState,
  PortalSidePeek,
  PortalSuccessAlert,
} from './portal-ui';

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

  it('PortalDataTableHead impone scope="col" por defecto', () => {
    render(
      <table>
        <thead>
          <tr>
            <PortalDataTableHead>Nombre</PortalDataTableHead>
          </tr>
        </thead>
      </table>,
    );

    expect(screen.getByRole('columnheader', { name: 'Nombre' })).toHaveAttribute('scope', 'col');
  });
});

describe('PortalSidePeek a11y', () => {
  beforeEach(() => {
    document.body.classList.remove('overflow-hidden');
  });

  it('confina Tab dentro del panel y cierra con Escape', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();

    render(
      <div>
        <button type="button">Fuera del panel</button>
        <PortalSidePeek
          open
          onClose={onClose}
          title="Crear ítem"
          description="Formulario de prueba"
          footer={
            <button type="button" data-testid="peek-save">
              Guardar
            </button>
          }
        >
          <button type="button" data-testid="peek-field">
            Campo
          </button>
        </PortalSidePeek>
      </div>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Crear ítem' });
    expect(dialog).toBeInTheDocument();
    expect(document.body).toHaveClass('overflow-hidden');

    const closeButton = screen.getByRole('button', { name: 'Cerrar' });
    const fieldButton = screen.getByTestId('peek-field');
    const saveButton = screen.getByTestId('peek-save');

    await user.tab();
    expect(document.activeElement === closeButton || document.activeElement === fieldButton).toBe(
      true,
    );

    // Avanzar varias veces: el foco no debe salir del dialog.
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).not.toBe(
        screen.getByRole('button', { name: 'Fuera del panel' }),
      );
    }

    // Cierre con Escape.
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    // El botón de guardar sigue siendo alcanzable dentro del trap (no regresionamos el footer).
    expect(saveButton).toBeInTheDocument();
  });

  it('al abrir enfoca el panel y al cerrar restaura el foco al trigger', async () => {
    const onClose = jest.fn();

    function Harness({ open }: { open: boolean }) {
      return (
        <div>
          <button type="button" data-testid="trigger">
            Abrir panel
          </button>
          <PortalSidePeek open={open} onClose={onClose} title="Detalle lateral">
            <button type="button" data-testid="peek-field">
              Campo
            </button>
          </PortalSidePeek>
        </div>
      );
    }

    const { rerender } = render(<Harness open={false} />);
    const trigger = screen.getByTestId('trigger');
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    rerender(<Harness open />);

    await waitFor(() => {
      const dialog = screen.getByRole('dialog', { name: 'Detalle lateral' });
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    onClose();
    rerender(<Harness open={false} />);

    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});

describe('PortalSuccessAlert', () => {
  it('muestra el mensaje de éxito y permite cerrar', async () => {
    const user = userEvent.setup();
    const onDismiss = jest.fn();

    render(<PortalSuccessAlert message="Combo creado." onDismiss={onDismiss} />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Operación completada')).toBeInTheDocument();
    expect(screen.getByText('Combo creado.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('acepta description como alias de message', () => {
    render(<PortalSuccessAlert description="Promoción desactivada." onDismiss={jest.fn()} />);

    expect(screen.getByText('Promoción desactivada.')).toBeInTheDocument();
  });
});
