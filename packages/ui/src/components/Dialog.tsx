'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

interface DialogContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

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
}

export const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, onInteractOutside, ...props }, ref) => {
    const { open, setOpen } = useDialogContext('DialogContent');
    const contentRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
      if (!open) return;

      const handleKeyDown = (event: KeyboardEvent) => {
        // Cierra con Escape para cumplir expectativa de accesibilidad básica de dialogs.
        if (event.key === 'Escape') {
          event.preventDefault();
          setOpen(false);
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open, setOpen]);

    if (!open) {
      return null;
    }

    return (
      <div
        className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4 py-6"
        onMouseDown={() => {
          // Click sobre el overlay equivale a interacción fuera del contenido.
          onInteractOutside?.();
          setOpen(false);
        }}
      >
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
          className={cn(
            'relative z-[1001] max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-dark-border dark:bg-dark-surface-2',

            className,
          )}
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          {...props}
        >
          {children}
        </div>
      </div>
    );
  },
);

DialogContent.displayName = 'DialogContent';

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4 space-y-1', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn('text-lg font-semibold text-gray-900 dark:text-white', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-gray-500 dark:text-gray-400', className)} {...props} />;
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
