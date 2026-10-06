// Ayuda de pruebas de la captura de firma (R2). jsdom no implementa el lienzo ni
// `PointerEvent`: este módulo instala dobles del contexto 2D, de `toBlob` y del
// evento de puntero. Solo lo importan specs; no entra en el código productivo.
import { fireEvent } from '@testing-library/react';

export class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string }) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'touch';
  }
}

export function installPointerEvent(): void {
  Object.defineProperty(window, 'PointerEvent', { value: TestPointerEvent, configurable: true });
}

export interface CanvasMocks {
  context: {
    beginPath: jest.Mock;
    moveTo: jest.Mock;
    lineTo: jest.Mock;
    stroke: jest.Mock;
    clearRect: jest.Mock;
    fillRect: jest.Mock;
    save: jest.Mock;
    restore: jest.Mock;
    lineWidth: number;
    lineCap: string;
    lineJoin: string;
    strokeStyle: string;
    fillStyle: string;
    globalCompositeOperation: string;
  };
  toBlob: jest.Mock;
}

/** Instala el lienzo simulado; vuelve a llamarla en cada `beforeEach` (los mocks se reinician). */
export function installCanvasMocks(): CanvasMocks {
  const context = {
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    strokeStyle: '',
    fillStyle: '',
    globalCompositeOperation: '',
  };
  const toBlob = jest.fn((callback: BlobCallback) =>
    callback(new Blob(['png'], { type: 'image/png' })),
  );
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
  HTMLCanvasElement.prototype.toBlob = toBlob;
  return { context, toBlob };
}

/** Un trazo completo: apoyar, arrastrar y soltar. */
export function drawStroke(surface: HTMLElement, pointerId = 1): void {
  fireEvent.pointerDown(surface, { pointerId, clientX: 10, clientY: 10, button: 0 });
  fireEvent.pointerMove(surface, { pointerId, clientX: 40, clientY: 25 });
  fireEvent.pointerUp(surface, { pointerId, clientX: 40, clientY: 25 });
}
