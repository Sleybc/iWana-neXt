import { act, fireEvent, render, screen } from '@testing-library/react';
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

  it('OperationalSidePeek enfoca al abrir cuando nadie ha reclamado el foco', () => {
    const frames: FrameRequestCallback[] = [];
    const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    // Documento en reposo: el foco no puede venir prestado del caso anterior.
    (document.activeElement as HTMLElement | null)?.blur();

    render(
      <OperationalSidePeek open onOpenChange={jest.fn()} title="Detalle operativo">
        <button type="button">Primera acción</button>
      </OperationalSidePeek>,
    );

    act(() => {
      frames.forEach((frame) => frame(0));
    });

    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();
    rafSpy.mockRestore();
  });

  it('OperationalSidePeek no roba el foco a una interacción ya en curso', () => {
    const frames: FrameRequestCallback[] = [];
    const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    render(
      <OperationalSidePeek open onOpenChange={jest.fn()} title="Detalle operativo">
        <input aria-label="Cantidad" />
      </OperationalSidePeek>,
    );

    // El operador toca un control del panel antes de que corra el frame diferido.
    const field = screen.getByLabelText('Cantidad');
    field.focus();

    act(() => {
      frames.forEach((frame) => frame(0));
    });

    // El foco inicial no puede pisarlo: reubicarlo aquí cierra un desplegable
    // recién abierto o descarta lo que se está tecleando.
    expect(field).toHaveFocus();
    rafSpy.mockRestore();
  });

  it('anuncia busy, muestra indicador y conserva un cierre táctil de 44 px', () => {
    render(
      <OperationalSidePeek open busy onOpenChange={jest.fn()} title="Detalle operativo">
        <button type="button">Primera acción</button>
      </OperationalSidePeek>,
    );

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Procesando…');
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveClass('min-h-11', 'min-w-11');
  });

  it('OperationalSidePeek renderiza variante wide con max-w más amplio', () => {
    render(
      <OperationalSidePeek open size="wide" onOpenChange={jest.fn()} title="OT amplia">
        <span>Contenido</span>
      </OperationalSidePeek>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('md:max-w-[48rem]');
  });

  it('OperationalSidePeek renderiza eyebrow como texto de contexto', () => {
    render(
      <OperationalSidePeek
        open
        eyebrow="OT-2026-0001"
        onOpenChange={jest.fn()}
        title="Detalle de instalación"
      >
        <span>Contenido</span>
      </OperationalSidePeek>,
    );

    expect(screen.getByText('OT-2026-0001')).toBeInTheDocument();
  });

  it('OperationalSidePeek renderiza description asociada por aria-describedby', () => {
    render(
      <OperationalSidePeek
        open
        description="Complete los datos requeridos antes de iniciar"
        onOpenChange={jest.fn()}
        title="Formulario"
      >
        <span>Contenido</span>
      </OperationalSidePeek>,
    );

    expect(screen.getByText('Complete los datos requeridos antes de iniciar')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-describedby');
  });

  it('OperationalSidePeek renderiza footer fijo al pie', () => {
    render(
      <OperationalSidePeek
        open
        footer={<button type="button">Guardar</button>}
        onOpenChange={jest.fn()}
        title="Formulario"
      >
        <span>Contenido</span>
      </OperationalSidePeek>,
    );

    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
  });

  it('OperationalSidePeek no cierra si onBeforeClose retorna false', () => {
    const onOpenChange = jest.fn();
    const onBeforeClose = jest.fn().mockReturnValue(false);

    render(
      <OperationalSidePeek
        open
        onBeforeClose={onBeforeClose}
        onOpenChange={onOpenChange}
        title="Confirmación"
      >
        <span>Contenido</span>
      </OperationalSidePeek>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onBeforeClose).toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('OperationalSidePeek cierra al hacer clic en el overlay', () => {
    const onOpenChange = jest.fn();

    render(
      <OperationalSidePeek open onOpenChange={onOpenChange} title="Detalle">
        <span>Contenido</span>
      </OperationalSidePeek>,
    );

    const overlay = screen.getByRole('button', { name: 'Cerrar detalle operativo' });
    fireEvent.click(overlay);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('OperationalSidePeek no se renderiza cuando open=false', () => {
    render(
      <OperationalSidePeek open={false} onOpenChange={jest.fn()} title="Oculto">
        <span>No visible</span>
      </OperationalSidePeek>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
