'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';

interface DialogContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

interface DialogContentContextValue {
  titleId: string | undefined;
  descriptionId: string | undefined;
  registerTitleId: (id: string | undefined) => void;
  registerDescriptionId: (id: string | undefined) => void;
}

const DialogContentContext = React.createContext<DialogContentContextValue | null>(null);
const openDialogLayers: number[] = [];
let nextDialogLayerId = 0;

function registerOpenDialogLayer(layerId: number): void {
  if (!openDialogLayers.includes(layerId)) {
    openDialogLayers.push(layerId);
  }
}

function unregisterOpenDialogLayer(layerId: number): void {
  const index = openDialogLayers.lastIndexOf(layerId);

  if (index >= 0) {
    openDialogLayers.splice(index, 1);
  }
}

function isTopMostDialogLayer(layerId: number): boolean {
  return openDialogLayers[openDialogLayers.length - 1] === layerId;
}

function useDialogContext(componentName: string): DialogContextValue {
  const ctx = React.useContext(DialogContext);
  if (!ctx) {
    throw new Error(`${componentName} debe usarse dentro de <Dialog />`);
  }
  return ctx;
}

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, defaultOpen = false, onOpenChange, children }: DialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const resolvedOpen = isControlled ? open : internalOpen;

  const setOpen = React.useCallback(
    (next: boolean) => {
      // Soporta modo controlado/no controlado para mantener API simple en el portal.
      if (!isControlled) {
        setInternalOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const value = React.useMemo(() => ({ open: resolvedOpen, setOpen }), [resolvedOpen, setOpen]);

  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}

export interface DialogTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  children: React.ReactNode;
}

export const DialogTrigger = React.forwardRef<HTMLButtonElement, DialogTriggerProps>(
  ({ asChild = false, onClick, children, ...props }, ref) => {
    const { setOpen } = useDialogContext('DialogTrigger');

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<React.HTMLAttributes<HTMLElement>>;
      return React.cloneElement(child, {
        onClick: (event: React.MouseEvent<HTMLElement>) => {
          child.props.onClick?.(event);
          onClick?.(event as unknown as React.MouseEvent<HTMLButtonElement>);
          if (!event.defaultPrevented) {
            setOpen(true);
          }
        },
      });
    }

    return (
      <button
        ref={ref}
        type="button"
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            setOpen(true);
          }
        }}
        {...props}
      >
        {children}
      </button>
    );
  },
);

DialogTrigger.displayName = 'DialogTrigger';

export interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  onInteractOutside?: () => void;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  enableFocusTrap?: boolean;
}

export const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  (
    { className, children, onInteractOutside, initialFocusRef, enableFocusTrap = true, ...props },
    ref,
  ) => {
    const { open, setOpen } = useDialogContext('DialogContent');
    const contentRef = React.useRef<HTMLDivElement | null>(null);
    const previousActiveElementRef = React.useRef<HTMLElement | null>(null);
    const layerIdRef = React.useRef<number | null>(null);
    const [mounted, setMounted] = React.useState(false);
    const [titleId, setTitleId] = React.useState<string | undefined>(undefined);
    const [descriptionId, setDescriptionId] = React.useState<string | undefined>(undefined);

    if (layerIdRef.current === null) {
      nextDialogLayerId += 1;
      layerIdRef.current = nextDialogLayerId;
    }
    const layerId = layerIdRef.current as number;

    const contentContextValue = React.useMemo<DialogContentContextValue>(
      () => ({
        titleId,
        descriptionId,
        registerTitleId: setTitleId,
        registerDescriptionId: setDescriptionId,
      }),
      [descriptionId, titleId],
    );

    const getFocusableElements = React.useCallback(() => {
      const container = contentRef.current;

      if (!container) {
        return [] as HTMLElement[];
      }

      return Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('disabled') && element.tabIndex !== -1);
    }, []);

    React.useEffect(() => {
      setMounted(true);
      return () => setMounted(false);
    }, []);

    React.useEffect(() => {
      if (!open) {
        return;
      }

      const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      previousActiveElementRef.current = opener;

      const focusTarget =
        initialFocusRef?.current ?? getFocusableElements()[0] ?? contentRef.current;

      if (!focusTarget) {
        return;
      }

      const focusFrame = window.requestAnimationFrame(() => {
        // El foco de apertura se difiere un frame para que el diálogo ya esté
        // pintado, pero ese frame puede caer DESPUÉS de la primera interacción
        // del operador. Si para entonces alguien más reclamó el foco —un
        // desplegable recién abierto (el menú del `Select` vive en un portal
        // fuera del panel y su `onBlurCapture` lo cierra al perder el foco), un
        // campo que se está tecleando— reubicarlo aquí cierra el desplegable o
        // le arranca el foco a la captura en curso. Medido sobre este mismo
        // componente: `activeElement` pasaba del `combobox` al primer botón del
        // diálogo y las opciones portaladas caían de 2 a 0.
        //
        // Solo se enfoca cuando el foco sigue donde estaba al abrir: el
        // documento en reposo o el propio disparador. El foco de apertura
        // (accesibilidad) se conserva íntegro en el camino normal; en el camino
        // suprimido la trampa de Tab devuelve el foco al diálogo en la primera
        // pulsación, porque `handleKeyDown` reenfoca cuando el activo no está
        // contenido en el panel.
        //
        // Misma guarda que `OperationalSidePeek` y `usePortalSideDrawerA11y`
        // (commit 8fe22a87). Los tres sitios deben moverse juntos.
        const active = document.activeElement;
        const untouched =
          active == null ||
          active === document.body ||
          active === document.documentElement ||
          active === opener;

        if (!untouched) {
          return;
        }

        focusTarget.focus();
      });

      return () => {
        window.cancelAnimationFrame(focusFrame);
      };
    }, [getFocusableElements, initialFocusRef, open]);

    React.useEffect(() => {
      if (!open) return;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (!isTopMostDialogLayer(layerId)) {
          return;
        }

        // Cierra con Escape para cumplir expectativa de accesibilidad básica de dialogs.
        if (event.key === 'Escape') {
          event.preventDefault();
          setOpen(false);
        }

        if (event.key !== 'Tab' || !enableFocusTrap) {
          return;
        }

        const container = contentRef.current;

        if (!container) {
          return;
        }

        const focusableElements = getFocusableElements();

        if (focusableElements.length === 0) {
          event.preventDefault();
          container.focus();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;

        if (!firstElement || !lastElement) {
          return;
        }

        if (!activeElement || !container.contains(activeElement)) {
          event.preventDefault();
          firstElement.focus();
          return;
        }

        if (event.shiftKey && activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
          return;
        }

        if (!event.shiftKey && activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [enableFocusTrap, getFocusableElements, layerId, open, setOpen]);

    React.useEffect(() => {
      if (!open || typeof document === 'undefined') {
        return;
      }

      registerOpenDialogLayer(layerId);
      document.body.classList.add('overflow-hidden');

      return () => {
        unregisterOpenDialogLayer(layerId);
        if (openDialogLayers.length === 0) {
          document.body.classList.remove('overflow-hidden');
        }

        const previousActiveElement = previousActiveElementRef.current;

        if (previousActiveElement?.isConnected) {
          previousActiveElement.focus();
        }
      };
    }, [layerId, open]);

    if (!open || !mounted || typeof document === 'undefined') {
      return null;
    }

    return createPortal(
      <div
        className="fixed inset-0 z-10000 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm"
        onMouseDown={() => {
          if (!isTopMostDialogLayer(layerId)) {
            return;
          }

          // Click sobre el overlay equivale a interacción fuera del contenido.
          onInteractOutside?.();
          setOpen(false);
        }}
      >
        <DialogContentContext.Provider value={contentContextValue}>
          <div
            ref={(node) => {
              contentRef.current = node;
              if (typeof ref === 'function') {
                ref(node);
                return;
              }
              if (ref) {
                ref.current = node;
              }
            }}
            role="dialog"
            aria-modal="true"
            {...(titleId ? { 'aria-labelledby': titleId } : {})}
            {...(descriptionId ? { 'aria-describedby': descriptionId } : {})}
            tabIndex={-1}
            className={cn(
              'relative z-10001 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-dark-border dark:bg-dark-surface-2',

              className,
            )}
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            {...props}
          >
            {children}
          </div>
        </DialogContentContext.Provider>
      </div>,
      document.body,
    );
  },
);

DialogContent.displayName = 'DialogContent';

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4 space-y-1', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const dialogContentContext = React.useContext(DialogContentContext);
  const generatedId = React.useId();
  const resolvedId = props.id ?? generatedId;

  React.useEffect(() => {
    dialogContentContext?.registerTitleId(resolvedId);

    return () => {
      dialogContentContext?.registerTitleId(undefined);
    };
  }, [dialogContentContext, resolvedId]);

  return (
    <h2
      id={resolvedId}
      className={cn('text-lg font-semibold text-gray-900 dark:text-white', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  const dialogContentContext = React.useContext(DialogContentContext);
  const generatedId = React.useId();
  const resolvedId = props.id ?? generatedId;

  React.useEffect(() => {
    dialogContentContext?.registerDescriptionId(resolvedId);

    return () => {
      dialogContentContext?.registerDescriptionId(undefined);
    };
  }, [dialogContentContext, resolvedId]);

  return (
    <p
      id={resolvedId}
      className={cn('text-sm text-gray-500 dark:text-gray-400', className)}
      {...props}
    />
  );
}

export interface DialogCloseProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  children: React.ReactNode;
}

export const DialogClose = React.forwardRef<HTMLButtonElement, DialogCloseProps>(
  ({ asChild = false, onClick, children, ...props }, ref) => {
    const { setOpen } = useDialogContext('DialogClose');

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<React.HTMLAttributes<HTMLElement>>;
      return React.cloneElement(child, {
        onClick: (event: React.MouseEvent<HTMLElement>) => {
          child.props.onClick?.(event);
          onClick?.(event as unknown as React.MouseEvent<HTMLButtonElement>);
          if (!event.defaultPrevented) {
            setOpen(false);
          }
        },
      });
    }

    return (
      <button
        ref={ref}
        type="button"
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            setOpen(false);
          }
        }}
        {...props}
      >
        {children}
      </button>
    );
  },
);

DialogClose.displayName = 'DialogClose';
