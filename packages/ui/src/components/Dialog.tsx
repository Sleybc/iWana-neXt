'use client';

import * as React from 'react';
import { ModalLayer } from './ModalLayer';
import { overlayEdgeClassName } from './ModalLayer';
import { cn } from '../lib/utils';
import { useDeferredInitialFocus } from '../hooks/use-deferred-initial-focus';

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
    const scheduleInitialFocus = useDeferredInitialFocus();

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

      return scheduleInitialFocus(focusTarget);
    }, [getFocusableElements, initialFocusRef, open, scheduleInitialFocus]);

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

    // El velo vive en `ModalLayer`, no en esta capa. Antes el `backdrop-blur-sm`
    // se pintaba SOBRE el elemento `fixed inset-0`: ese `backdrop-filter`
    // convertía la capa en contexto de apilamiento y en bloque contenedor de
    // sus descendientes `fixed`, así que atrapaba exactamente a los
    // `--z-popover` que el comentario del panel (más abajo) se cuidaba de no
    // atrapar — el ancestro ya lo hacía (ADR-075 §2ter).
    //
    // El velo es hermano del panel y su `absolute inset-0` resuelve contra la
    // caja de relleno de la capa, así que sigue cubriendo el `px-4 py-6`: el
    // cierre por clic en el margen se conserva.
    return (
      <ModalLayer
        align="center"
        className="px-4 py-6"
        onVeilClick={() => {
          if (!isTopMostDialogLayer(layerId)) {
            return;
          }

          // Interacción sobre el velo equivale a interacción fuera del contenido.
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
              // Sin z: el contenido es descendiente de la capa `--z-modal` y
              // pinta sobre el velo por orden de documento. Un z propio aquí
              // crearía un contexto de apilamiento que atraparía a los
              // descendientes en `--z-popover` que no se portalan (Popover).
              overlayEdgeClassName,
              'relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-white p-6 shadow-2xl dark:bg-dark-surface-2',

              className,
            )}
            {...props}
          >
            {children}
          </div>
        </DialogContentContext.Provider>
      </ModalLayer>
    );
  },
);

DialogContent.displayName = 'DialogContent';

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4 space-y-1', className)} {...props} />;
}

export const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => {
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
      ref={ref}
      id={resolvedId}
      className={cn('text-lg font-semibold text-gray-900 dark:text-white', className)}
      {...props}
    />
  );
});

DialogTitle.displayName = 'DialogTitle';

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
