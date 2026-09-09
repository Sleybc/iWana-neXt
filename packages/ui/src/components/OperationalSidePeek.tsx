'use client';

import { useCallback, useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { Button } from './Button';
import { ModalLayer } from './ModalLayer';
import { overlayEdgeClassName } from './ModalLayer';
import { cn } from '../lib/utils';

export interface OperationalSidePeekProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  size?: 'default' | 'wide';
  busy?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  footer?: ReactNode;
  onBeforeClose?: () => boolean | Promise<boolean>;
  children: ReactNode;
  className?: string;
}

/** Superficie lateral accesible para coordinación y ejecución operativa. */
export function OperationalSidePeek({
  open,
  onOpenChange,
  title,
  description,
  eyebrow,
  size = 'default',
  busy = false,
  initialFocusRef,
  footer,
  onBeforeClose,
  children,
  className,
}: OperationalSidePeekProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const onBeforeCloseRef = useRef(onBeforeClose);

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
    onBeforeCloseRef.current = onBeforeClose;
  }, [onBeforeClose, onOpenChange]);

  const focusables = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return [] as HTMLElement[];
    return Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.tabIndex >= 0 && !element.hasAttribute('disabled'));
  }, []);

  const requestClose = useCallback(async () => {
    if (busy) return;
    if (onBeforeCloseRef.current && !(await onBeforeCloseRef.current())) return;
    onOpenChangeRef.current(false);
  }, [busy]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousFocusRef.current = opener;
    const frame = window.requestAnimationFrame(() => {
      // El foco inicial se difiere un frame para que el panel ya esté pintado,
      // pero ese frame puede caer DESPUÉS de la primera interacción del
      // operador. Si para entonces alguien más reclamó el foco —un desplegable
      // recién abierto (el menú del Select vive en un portal fuera del panel y
      // se cierra al perder el foco), un campo que se está tecleando— reubicarlo
      // aquí cierra el desplegable o descarta lo escrito. Solo se enfoca cuando
      // el foco sigue donde estaba al abrir: el documento en reposo o el propio
      // disparador del panel.
      const active = document.activeElement;
      const untouched =
        active == null ||
        active === document.body ||
        active === document.documentElement ||
        active === opener;
      if (!untouched) return;
      const explicitTarget = initialFocusRef?.current;
      (explicitTarget ?? focusables()[0] ?? panelRef.current)?.focus();
    });
    document.body.classList.add('overflow-hidden');
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.classList.remove('overflow-hidden');
      previousFocusRef.current?.focus();
    };
  }, [focusables, initialFocusRef, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void requestClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      const panel = panelRef.current;
      if (!panel || items.length === 0) {
        event.preventDefault();
        panel?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [focusables, open, requestClose]);

  if (!open) return null;

  // Portal, escalón, velo y alineación viven en `ModalLayer`: una sola capa en
  // `--z-modal` con el velo `absolute` dentro de ella y el panel como hermano
  // posterior. La guarda de `busy` no viaja a la capa —`requestClose` ya la
  // aplica—, así que el velo conserva exactamente el comportamiento de cierre
  // que tenía como botón.
  return (
    <ModalLayer align="end" onVeilClick={() => void requestClose()}>
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby={titleId}
        {...(description ? { 'aria-describedby': descriptionId } : {})}
        tabIndex={-1}
        // Sin z literal (ADR-075 §2): el panel pinta sobre el velo por orden de
        // documento — es hermano posterior y está posicionado.
        className={cn(
          overlayEdgeClassName,
          'relative flex h-full w-full flex-col border-l bg-white shadow-iwana-soft dark:bg-dark-surface-2 md:max-w-[32rem]',
          size === 'wide' && 'md:max-w-[48rem]',
          className,
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-dark-border">
          <div className="min-w-0">
            {eyebrow ? <p className="portal-eyebrow">{eyebrow}</p> : null}
            <h2 id={titleId} className="text-base font-semibold text-gray-900 dark:text-white">
              {title}
            </h2>
            {description ? (
              <div
                id={descriptionId}
                className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400"
              >
                {description}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {busy ? (
              <span
                role="status"
                aria-live="polite"
                className="text-xs text-gray-600 dark:text-gray-300"
              >
                Procesando…
              </span>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11"
              aria-label="Cerrar"
              disabled={busy}
              onClick={() => void requestClose()}
            >
              <span aria-hidden="true" className="text-lg leading-none">
                ×
              </span>
            </Button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="shrink-0 border-t border-gray-100 px-5 py-4 dark:border-dark-border">
            {footer}
          </footer>
        ) : null}
      </aside>
    </ModalLayer>
  );
}
