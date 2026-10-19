/** @jest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useDeferredInitialFocus } from './use-deferred-initial-focus';

type FocusScheduler = (target: HTMLElement | null, isEligible?: () => boolean) => () => void;

let scheduler: FocusScheduler;
let container: HTMLDivElement;
let root: Root;
let nextFrameId: number;
let frames: Map<number, FrameRequestCallback>;
let originalRequestFrame: PropertyDescriptor | undefined;
let originalCancelFrame: PropertyDescriptor | undefined;

function HookHarness() {
  scheduler = useDeferredInitialFocus();
  return null;
}

function runNextFrame(frameId: number): void {
  const callback = frames.get(frameId);
  if (!callback) throw new Error(`No existe el frame ${frameId}`);
  frames.delete(frameId);
  act(() => callback(performance.now()));
}

function setActiveElementForTest(activeElement: Element | null): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(document, 'activeElement');
  Object.defineProperty(document, 'activeElement', {
    configurable: true,
    get: () => activeElement,
  });

  return () => {
    if (descriptor) {
      Object.defineProperty(document, 'activeElement', descriptor);
    } else {
      Reflect.deleteProperty(document, 'activeElement');
    }
  };
}

describe('useDeferredInitialFocus', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
      configurable: true,
      writable: true,
      value: true,
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    frames = new Map();
    nextFrameId = 0;
    originalRequestFrame = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
    originalCancelFrame = Object.getOwnPropertyDescriptor(window, 'cancelAnimationFrame');
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        const frameId = ++nextFrameId;
        frames.set(frameId, callback);
        return frameId;
      },
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      value: (frameId: number) => frames.delete(frameId),
    });
    act(() => root.render(createElement(HookHarness)));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    if (originalRequestFrame) {
      Object.defineProperty(window, 'requestAnimationFrame', originalRequestFrame);
    } else {
      Reflect.deleteProperty(window, 'requestAnimationFrame');
    }
    if (originalCancelFrame) {
      Object.defineProperty(window, 'cancelAnimationFrame', originalCancelFrame);
    } else {
      Reflect.deleteProperty(window, 'cancelAnimationFrame');
    }
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
  });

  it('enfoca en el siguiente frame si el foco sigue en el elemento inicial', () => {
    const opener = document.createElement('button');
    const target = document.createElement('h2');
    target.tabIndex = -1;
    document.body.append(opener, target);
    opener.focus();
    const focus = jest.spyOn(target, 'focus');

    let cleanup: () => void = () => {};
    act(() => {
      cleanup = scheduler(target);
    });

    expect(focus).not.toHaveBeenCalled();
    runNextFrame(1);
    expect(focus).toHaveBeenCalledTimes(1);
    cleanup();
    opener.remove();
    target.remove();
  });

  it('tolera un scheduler de pruebas que ejecuta RAF de forma inmediata', () => {
    const target = document.createElement('button');
    document.body.append(target);
    const focus = jest.spyOn(target, 'focus');
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback) => {
        callback(performance.now());
        return ++nextFrameId;
      },
    });

    expect(() => scheduler(target)).not.toThrow();
    expect(focus).toHaveBeenCalledTimes(1);
    target.remove();
  });

  it('no mueve el foco si otro control lo reclamó antes del frame', () => {
    const opener = document.createElement('button');
    const target = document.createElement('h2');
    const otherControl = document.createElement('input');
    document.body.append(opener, target, otherControl);
    opener.focus();
    const focus = jest.spyOn(target, 'focus');

    act(() => scheduler(target));
    otherControl.focus();
    runNextFrame(1);

    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(otherControl);
    opener.remove();
    target.remove();
    otherControl.remove();
  });

  it.each([null, document.body, document.documentElement])(
    'permite el foco cuando el documento está en reposo (%s)',
    (idleElement) => {
      const target = document.createElement('button');
      document.body.append(target);
      const restoreActiveElement = setActiveElementForTest(idleElement);
      const focus = jest.spyOn(target, 'focus');

      act(() => scheduler(target));
      runNextFrame(1);

      expect(focus).toHaveBeenCalledTimes(1);
      restoreActiveElement();
      target.remove();
    },
  );

  it('cancela el frame anterior y un cleanup antiguo no cancela la nueva petición', () => {
    const firstTarget = document.createElement('button');
    const secondTarget = document.createElement('button');
    document.body.append(firstTarget, secondTarget);
    const firstFocus = jest.spyOn(firstTarget, 'focus');
    const secondFocus = jest.spyOn(secondTarget, 'focus');

    let oldCleanup: () => void = () => {};
    act(() => {
      oldCleanup = scheduler(firstTarget);
    });
    act(() => scheduler(secondTarget));
    oldCleanup();
    expect(frames.size).toBe(1);
    runNextFrame(2);

    expect(firstFocus).not.toHaveBeenCalled();
    expect(secondFocus).toHaveBeenCalledTimes(1);
    firstTarget.remove();
    secondTarget.remove();
  });

  it('cancela el frame pendiente al ejecutar el cleanup', () => {
    const target = document.createElement('button');
    document.body.append(target);
    const focus = jest.spyOn(target, 'focus');
    let cleanup: () => void = () => {};

    act(() => {
      cleanup = scheduler(target);
    });
    cleanup();

    expect(frames.size).toBe(0);
    expect(focus).not.toHaveBeenCalled();
    target.remove();
  });

  it('cancela el frame pendiente al desmontarse', () => {
    const target = document.createElement('button');
    document.body.append(target);
    const focus = jest.spyOn(target, 'focus');

    act(() => scheduler(target));
    act(() => root.unmount());

    expect(frames.size).toBe(0);
    expect(focus).not.toHaveBeenCalled();
    target.remove();
  });

  it('no agenda un frame si el destino es nulo', () => {
    const cleanup = scheduler(null);

    expect(frames.size).toBe(0);
    expect(() => cleanup()).not.toThrow();
  });

  it('evalúa isEligible dentro del frame y omite el foco si devuelve false', () => {
    const target = document.createElement('button');
    document.body.append(target);
    const focus = jest.spyOn(target, 'focus');
    const isEligible = jest.fn(() => false);

    act(() => scheduler(target, isEligible));
    expect(isEligible).not.toHaveBeenCalled();
    runNextFrame(1);

    expect(isEligible).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalled();
    target.remove();
  });
});
