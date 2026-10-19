import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, type ReactNode } from 'react';
import { usePortalSideDrawerA11y } from './use-portal-side-drawer-a11y';

let nextFrameId: number;
let frames: Map<number, FrameRequestCallback>;
let originalRequestFrame: PropertyDescriptor | undefined;
let originalCancelFrame: PropertyDescriptor | undefined;

interface DrawerProps {
  id: string;
  open: boolean;
  onClose: () => void;
  children?: ReactNode;
}

function Drawer({ id, open, onClose, children }: DrawerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  usePortalSideDrawerA11y(open, containerRef, onClose);

  return (
    <div ref={containerRef} data-testid={id} tabIndex={-1}>
      {children}
    </div>
  );
}

function SingleDrawer({
  open,
  onClose,
  controls = true,
}: Omit<DrawerProps, 'id'> & {
  controls?: boolean;
}) {
  return (
    <>
      <button type="button">Abrir panel</button>
      <Drawer id="panel" open={open} onClose={onClose}>
        {controls ? (
          <>
            <button type="button">Primero</button>
            <button type="button">Último</button>
          </>
        ) : null}
      </Drawer>
    </>
  );
}

function NestedDrawers({
  outerOpen,
  innerOpen,
  onOuterClose,
  onInnerClose,
}: {
  outerOpen: boolean;
  innerOpen: boolean;
  onOuterClose: () => void;
  onInnerClose: () => void;
}) {
  return (
    <>
      <button type="button">Abrir panel exterior</button>
      <Drawer id="exterior" open={outerOpen} onClose={onOuterClose}>
        <button type="button">Primero exterior</button>
      </Drawer>
      <Drawer id="interior" open={innerOpen} onClose={onInnerClose}>
        <button type="button">Primero interior</button>
      </Drawer>
    </>
  );
}

function runNextFrame(frameId?: number): void {
  const nextId = frameId ?? frames.keys().next().value;
  if (nextId === undefined) throw new Error('No hay un frame de foco pendiente.');
  const callback = frames.get(nextId);
  if (!callback) throw new Error(`No existe el frame ${nextId}.`);
  frames.delete(nextId);
  act(() => callback(performance.now()));
}

describe('usePortalSideDrawerA11y', () => {
  beforeEach(() => {
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
  });

  afterEach(() => {
    cleanup();
    document.body.classList.remove('overflow-hidden');
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
  });

  it('bloquea el scroll, contiene Tab y devuelve el foco al elemento que abrió el panel', () => {
    const onClose = jest.fn();
    const { rerender } = render(<SingleDrawer open={false} onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Abrir panel' });
    opener.focus();

    rerender(<SingleDrawer open onClose={onClose} />);
    expect(document.body).toHaveClass('overflow-hidden');
    expect(frames.size).toBe(1);
    runNextFrame();

    const first = screen.getByRole('button', { name: 'Primero' });
    const last = screen.getByRole('button', { name: 'Último' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();

    opener.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();

    rerender(<SingleDrawer open={false} onClose={onClose} />);
    expect(document.body).not.toHaveClass('overflow-hidden');
    expect(opener).toHaveFocus();
  });

  it('conserva la interacción anterior al frame y usa el callback de cierre vigente', () => {
    const staleOnClose = jest.fn();
    const currentOnClose = jest.fn();
    const { rerender } = render(<SingleDrawer open={false} onClose={staleOnClose} />);
    const opener = screen.getByRole('button', { name: 'Abrir panel' });
    opener.focus();

    rerender(<SingleDrawer open onClose={staleOnClose} />);
    expect(frames.size).toBe(1);
    const last = screen.getByRole('button', { name: 'Último' });
    last.focus();

    rerender(<SingleDrawer open onClose={currentOnClose} />);
    expect(frames.size).toBe(1);
    runNextFrame();
    expect(last).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(currentOnClose).toHaveBeenCalledTimes(1);
    expect(staleOnClose).not.toHaveBeenCalled();
  });

  it('enfoca el contenedor y lo conserva al tabular si no hay controles', () => {
    const onClose = jest.fn();
    const { rerender } = render(<SingleDrawer open={false} onClose={onClose} controls={false} />);
    const opener = screen.getByRole('button', { name: 'Abrir panel' });
    opener.focus();

    rerender(<SingleDrawer open onClose={onClose} controls={false} />);
    const panel = screen.getByTestId('panel');
    runNextFrame();
    expect(panel).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(panel).toHaveFocus();
  });

  it('solo deja que el drawer superior gestione foco y Escape', () => {
    const onOuterClose = jest.fn();
    const onInnerClose = jest.fn();
    const { rerender } = render(
      <NestedDrawers outerOpen innerOpen onOuterClose={onOuterClose} onInnerClose={onInnerClose} />,
    );

    expect(frames.size).toBe(2);
    runNextFrame();
    expect(screen.getByRole('button', { name: 'Primero exterior' })).not.toHaveFocus();
    runNextFrame();
    expect(screen.getByRole('button', { name: 'Primero interior' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onInnerClose).toHaveBeenCalledTimes(1);
    expect(onOuterClose).not.toHaveBeenCalled();

    rerender(
      <NestedDrawers
        outerOpen
        innerOpen={false}
        onOuterClose={onOuterClose}
        onInnerClose={onInnerClose}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOuterClose).toHaveBeenCalledTimes(1);
  });
});
