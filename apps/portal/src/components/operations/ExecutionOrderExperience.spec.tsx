import { fireEvent, render, screen } from '@testing-library/react';
import { ProgressMeter, OperationalSidePeek } from '@iwana/ui';

describe('componentes de ejecución', () => {
  it('permite personalizar la etiqueta visible y accesible del progreso', () => {
    render(
      <ProgressMeter
        value={40}
        label="Requisitos de instalación"
        ariaLabel="Avance de requisitos"
      />,
    );

    expect(screen.getByText('Requisitos de instalación')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Avance de requisitos' })).toHaveValue(40);
  });

  it('OperationalSidePeek atrapa foco, cierra con Escape y devuelve el foco', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Abrir';
    document.body.append(trigger);
    trigger.focus();
    const onOpenChange = jest.fn();

    render(
      <OperationalSidePeek open onOpenChange={onOpenChange} title="Detalle operativo">
        <button type="button">Primera acción</button>
      </OperationalSidePeek>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
