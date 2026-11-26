/** @jest-environment jsdom */
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Dialog, DialogClose, DialogContent, DialogTitle } from './Dialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let opener: HTMLButtonElement;
let root: Root;
let frames: Map<number, FrameRequestCallback>;

const runFrames = () =>
  act(() => {
    const pending = Array.from(frames.values());
    frames.clear();
    pending.forEach((callback) => callback(0));
  });

function BornOpen({ withRef = true }: { withRef?: boolean }) {
  const target = useRef<HTMLInputElement>(null);
  return (
    <Dialog defaultOpen>
      <DialogContent {...(withRef ? { initialFocusRef: target } : {})}>
        <DialogTitle>Diálogo</DialogTitle>
        <DialogClose>Cerrar</DialogClose>
        <input ref={target} aria-label="Destino" />
      </DialogContent>
    </Dialog>
  );
}

const closeButton = () =>
  document.querySelector<HTMLButtonElement>('[role="dialog"] button') as HTMLButtonElement;

beforeEach(() => {
  frames = new Map();
  let frameId = 0;
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
  opener = document.createElement('button');
  container = document.createElement('div');
  document.body.append(opener, container);
  root = createRoot(container);
  opener.focus();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  opener.remove();
  jest.restoreAllMocks();
});

describe('Dialog que nace abierto', () => {
  it('lleva el foco inicial a initialFocusRef', () => {
    act(() => root.render(<BornOpen />));
    runFrames();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Destino');
  });

  it('sin initialFocusRef enfoca el primer control', () => {
    act(() => root.render(<BornOpen withRef={false} />));
    runFrames();
    expect(closeButton()).not.toBeNull();
    expect(document.activeElement).toBe(closeButton());
  });

  it('devuelve el foco al elemento previo al cerrarse', () => {
    act(() => root.render(<BornOpen />));
    runFrames();
    expect(document.activeElement).not.toBe(opener);
    act(() => closeButton().click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('devuelve el foco también si se desmonta abierto', () => {
    act(() => root.render(<BornOpen />));
    runFrames();
    expect(document.activeElement).not.toBe(opener);
    act(() => root.render(null));
    expect(document.activeElement).toBe(opener);
  });
});
