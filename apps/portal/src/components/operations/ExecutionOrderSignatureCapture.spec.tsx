// SLOT R2 — captura de firma en lienzo nativo. jsdom no implementa el lienzo ni
// `PointerEvent`: se simulan el contexto 2D, `toBlob` y el evento de puntero. Lo
// que se verifica es el comportamiento del componente (trazo, limpiar, guardar,
// errores, teclado, foco y anuncios), no el dibujo real.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import {
  drawStroke,
  installCanvasMocks,
  installPointerEvent,
  type CanvasMocks,
} from './execution-order-canvas.test-helper';
import { ExecutionOrderSignatureCapture } from './ExecutionOrderSignatureCapture';

let context: CanvasMocks['context'];
let toBlob: CanvasMocks['toBlob'];

beforeAll(installPointerEvent);

beforeEach(() => {
  jest.clearAllMocks();
  ({ context, toBlob } = installCanvasMocks());
});

function canvas(): HTMLCanvasElement {
  return screen.getByRole('img', { name: 'Área de firma' }) as HTMLCanvasElement;
}

function draw(pointerId = 1) {
  drawStroke(canvas(), pointerId);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('ExecutionOrderSignatureCapture', () => {
  describe('estructura y accesibilidad', () => {
    it('asocia las instrucciones a la región y al lienzo, y anuncia el estado', () => {
      render(<ExecutionOrderSignatureCapture onSave={jest.fn()} />);

      const region = screen.getByRole('group', { name: 'Captura de firma del cliente' });
      const instructions = screen.getByText(/Pide al cliente que firme el acta de conformidad/);
      expect(region).toHaveAccessibleDescription(instructions.textContent ?? '');
      expect(canvas()).toHaveAccessibleDescription(
        expect.stringContaining('Pide al cliente que firme el acta de conformidad'),
      );
      expect(screen.getByRole('status')).toHaveTextContent('Todavía no hay firma dibujada.');
    });

    it('ofrece Limpiar y Guardar firma como botones nativos de 44 px, y Cancelar solo si se pide', () => {
      const { rerender } = render(<ExecutionOrderSignatureCapture onSave={jest.fn()} />);
      expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();

      const onCancel = jest.fn();
      rerender(<ExecutionOrderSignatureCapture onSave={jest.fn()} onCancel={onCancel} />);
      for (const name of ['Limpiar', 'Guardar firma', 'Cancelar']) {
        const button = screen.getByRole('button', { name });
        expect(button.tagName).toBe('BUTTON');
        expect(button).toHaveClass('min-h-11');
      }
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('no ofrece escribir un nombre como firma: no hay campos de texto', () => {
      render(<ExecutionOrderSignatureCapture onSave={jest.fn()} onCancel={jest.fn()} />);
      expect(screen.queryByRole('textbox')).toBeNull();
    });

    it('recorre los controles con el teclado y los activa con Enter y Espacio', async () => {
      const user = userEvent.setup();
      const onSave = jest.fn().mockResolvedValue(true);
      render(<ExecutionOrderSignatureCapture onSave={onSave} onCancel={jest.fn()} />);
      draw();

      await user.tab();
      expect(screen.getByRole('button', { name: 'Limpiar' })).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', { name: 'Guardar firma' })).toHaveFocus();
      await user.tab();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();

      await user.tab({ shift: true });
      await user.keyboard('{Enter}');
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

      await user.tab({ shift: true });
      expect(screen.getByRole('button', { name: 'Limpiar' })).toHaveFocus();
      await user.keyboard(' ');
      expect(screen.getByRole('status')).toHaveTextContent(
        'Firma limpiada. Puedes volver a firmar.',
      );
    });

    it('no tiene violaciones de accesibilidad detectables con axe', async () => {
      const { container } = render(
        <ExecutionOrderSignatureCapture onSave={jest.fn()} onCancel={jest.fn()} />,
      );
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe('trazo', () => {
    it('dibuja con el puntero, escala al mapa de bits y anuncia la firma dibujada', () => {
      render(<ExecutionOrderSignatureCapture onSave={jest.fn()} />);
      const surface = canvas();
      surface.getBoundingClientRect = () =>
        ({ left: 100, top: 50, width: 400, height: 160 }) as DOMRect;

      fireEvent.pointerDown(surface, { pointerId: 1, clientX: 140, clientY: 90, button: 0 });
      fireEvent.pointerMove(surface, { pointerId: 1, clientX: 200, clientY: 130 });
      fireEvent.pointerUp(surface, { pointerId: 1, clientX: 200, clientY: 130 });

      // El lienzo mide 800x320 y se ve a 400x160: factor 2.
      expect(context.moveTo).toHaveBeenNthCalledWith(1, 80, 80);
      expect(context.lineTo).toHaveBeenLastCalledWith(200, 160);
      expect(context.stroke).toHaveBeenCalled();
      expect(context.strokeStyle).toBe('currentColor');
      expect(context.lineCap).toBe('round');
      expect(screen.getByRole('status')).toHaveTextContent(
        'Firma dibujada. Puedes guardarla o limpiarla.',
      );
    });

    it('un toque sin movimiento también deja marca', () => {
      render(<ExecutionOrderSignatureCapture onSave={jest.fn()} />);
      const surface = canvas();
      fireEvent.pointerDown(surface, { pointerId: 1, clientX: 5, clientY: 5, button: 0 });
      fireEvent.pointerUp(surface, { pointerId: 1, clientX: 5, clientY: 5 });
      expect(screen.getByRole('status')).toHaveTextContent('Firma dibujada.');
    });

    it('ignora el botón secundario del ratón y los punteros ajenos al trazo', () => {
      render(<ExecutionOrderSignatureCapture onSave={jest.fn()} />);
      const surface = canvas();

      fireEvent.pointerDown(surface, { pointerId: 1, pointerType: 'mouse', button: 2 });
      expect(context.stroke).not.toHaveBeenCalled();

      fireEvent.pointerDown(surface, { pointerId: 1, clientX: 1, clientY: 1, button: 0 });
      const strokes = context.stroke.mock.calls.length;
      fireEvent.pointerMove(surface, { pointerId: 2, clientX: 9, clientY: 9 });
      fireEvent.pointerUp(surface, { pointerId: 2 });
      expect(context.stroke).toHaveBeenCalledTimes(strokes);
      expect(screen.getByRole('status')).toHaveTextContent('Todavía no hay firma dibujada.');
    });

    it('no dibuja mientras está bloqueada (envío en curso o sin conexión)', () => {
      render(<ExecutionOrderSignatureCapture onSave={jest.fn()} disabled />);
      draw();
      expect(context.stroke).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Limpiar' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Guardar firma' })).toBeDisabled();
    });

    it('no revienta si el navegador no entrega contexto 2D', () => {
      jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      render(<ExecutionOrderSignatureCapture onSave={jest.fn()} />);
      expect(() => draw()).not.toThrow();
      expect(screen.getByRole('status')).toHaveTextContent('Todavía no hay firma dibujada.');
    });
  });

  describe('limpiar', () => {
    it('borra el lienzo y vuelve a exigir una firma antes de guardar', () => {
      const onSave = jest.fn();
      render(<ExecutionOrderSignatureCapture onSave={onSave} />);
      draw();

      fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
      expect(context.clearRect).toHaveBeenCalledWith(0, 0, 800, 320);
      expect(screen.getByRole('status')).toHaveTextContent(
        'Firma limpiada. Puedes volver a firmar.',
      );

      fireEvent.click(screen.getByRole('button', { name: 'Guardar firma' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Dibuja la firma antes de guardarla.');
      expect(onSave).not.toHaveBeenCalled();
    });
  });

  describe('guardar', () => {
    it('con el lienzo vacío avisa y no exporta ni envía', () => {
      const onSave = jest.fn();
      render(<ExecutionOrderSignatureCapture onSave={onSave} />);

      fireEvent.click(screen.getByRole('button', { name: 'Guardar firma' }));

      expect(screen.getByRole('alert')).toHaveTextContent('Dibuja la firma antes de guardarla.');
      expect(toBlob).not.toHaveBeenCalled();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('exporta un PNG con fondo blanco detrás del trazo y lo entrega como archivo', async () => {
      const onSave = jest.fn().mockResolvedValue(true);
      render(<ExecutionOrderSignatureCapture onSave={onSave} />);
      draw();

      fireEvent.click(screen.getByRole('button', { name: 'Guardar firma' }));

      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
      expect(context.globalCompositeOperation).toBe('destination-over');
      expect(context.fillStyle).toBe('white');
      expect(context.fillRect).toHaveBeenCalledWith(0, 0, 800, 320);
      const file = onSave.mock.calls[0]![0] as File;
      expect(file).toBeInstanceOf(File);
      expect(file.type).toBe('image/png');
      expect(file.name).toBe('firma-cliente.png');
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('mientras guarda bloquea Limpiar y Cancelar y marca el botón como ocupado', async () => {
      const pending = deferred<boolean>();
      const onSave = jest.fn().mockReturnValue(pending.promise);
      render(<ExecutionOrderSignatureCapture onSave={onSave} onCancel={jest.fn()} />);
      draw();

      fireEvent.click(screen.getByRole('button', { name: 'Guardar firma' }));
      await waitFor(() => expect(onSave).toHaveBeenCalled());

      expect(screen.getByRole('button', { name: 'Guardar firma' })).toHaveAttribute(
        'aria-busy',
        'true',
      );
      expect(screen.getByRole('button', { name: 'Limpiar' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();

      await act(async () => pending.resolve(true));
      expect(screen.getByRole('button', { name: 'Limpiar' })).toBeEnabled();
    });

    it('si el guardado no termina conserva el trazo, reenvía el mismo archivo sin volver a exportar y devuelve el foco', async () => {
      const onSave = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      render(<ExecutionOrderSignatureCapture onSave={onSave} />);
      draw();
      const save = screen.getByRole('button', { name: 'Guardar firma' });

      fireEvent.click(save);
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(save).toHaveFocus());
      expect(context.clearRect).not.toHaveBeenCalled();

      fireEvent.click(save);
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
      expect(toBlob).toHaveBeenCalledTimes(1);
      expect(onSave.mock.calls[1]![0]).toBe(onSave.mock.calls[0]![0]);
    });

    it('si el trazo cambió tras un intento fallido exporta un archivo nuevo', async () => {
      const onSave = jest.fn().mockResolvedValue(false);
      render(<ExecutionOrderSignatureCapture onSave={onSave} />);
      draw();
      fireEvent.click(screen.getByRole('button', { name: 'Guardar firma' }));
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

      draw();
      fireEvent.click(screen.getByRole('button', { name: 'Guardar firma' }));
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));

      expect(toBlob).toHaveBeenCalledTimes(2);
      expect(onSave.mock.calls[1]![0]).not.toBe(onSave.mock.calls[0]![0]);
    });

    it('si el envío lanza un error lo anuncia con el copy cerrado y conserva la captura', async () => {
      const onSave = jest.fn().mockRejectedValue(new Error('red'));
      render(<ExecutionOrderSignatureCapture onSave={onSave} />);
      draw();

      fireEvent.click(screen.getByRole('button', { name: 'Guardar firma' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No pudimos guardar la firma. Intenta de nuevo.',
      );
      expect(context.clearRect).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Guardar firma' })).toBeEnabled();
    });

    it('si el navegador no logra exportar el PNG avisa y no envía nada', async () => {
      toBlob.mockImplementation((callback: BlobCallback) => callback(null));
      const onSave = jest.fn();
      render(<ExecutionOrderSignatureCapture onSave={onSave} />);
      draw();

      fireEvent.click(screen.getByRole('button', { name: 'Guardar firma' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No pudimos guardar la firma. Intenta de nuevo.',
      );
      expect(onSave).not.toHaveBeenCalled();
    });
  });
});
