// packages/ui/src/components/DropdownMenu.tsx
'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cva, type VariantProps } from 'class-variance-authority';
import { buttonVariants } from './Button';
import { cn } from '../lib/utils';

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | null>(null);

function useDropdownMenuContext(componentName: string): DropdownMenuContextValue {
  const context = React.useContext(DropdownMenuContext);
  if (!context) {
    throw new Error(`${componentName} debe usarse dentro de <DropdownMenu />`);
  }
  return context;
}

export interface DropdownMenuProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function DropdownMenu({ open, defaultOpen = false, onOpenChange, children }: DropdownMenuProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const isControlled = open !== undefined;
  const resolvedOpen = isControlled ? open : internalOpen;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setInternalOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const value = React.useMemo(
    () => ({ open: resolvedOpen ?? false, setOpen, triggerRef }),
    [resolvedOpen, setOpen],
  );

  return <DropdownMenuContext.Provider value={value}>{children}</DropdownMenuContext.Provider>;
}

export interface DropdownMenuTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const DropdownMenuTrigger = React.forwardRef<HTMLButtonElement, DropdownMenuTriggerProps>(
  ({ className, onClick, ...props }, ref) => {
    const { open, setOpen, triggerRef } = useDropdownMenuContext('DropdownMenuTrigger');

    return (
      <button
        ref={(node) => {
          triggerRef.current = node;
          if (typeof ref === 'function') {
            ref(node);
            return;
          }
          if (ref) {
            ref.current = node;
          }
        }}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), className)}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            setOpen(!open);
          }
        }}
        {...props}
      />
    );
  },
);
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger';

export interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
}

const DropdownMenuContent = React.forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ className, align = 'end', sideOffset = 6, children, ...props }, ref) => {
    const { open, setOpen, triggerRef } = useDropdownMenuContext('DropdownMenuContent');
    const contentRef = React.useRef<HTMLDivElement | null>(null);
    const [style, setStyle] = React.useState<React.CSSProperties>({});
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
      setMounted(true);
    }, []);

    React.useLayoutEffect(() => {
      if (!open || !triggerRef.current || !contentRef.current) {
        return;
      }

      const updatePosition = () => {
        const triggerRect = triggerRef.current!.getBoundingClientRect();
        const contentRect = contentRef.current!.getBoundingClientRect();
        const menuWidth = contentRect.width;
        const menuHeight = contentRect.height;
        const maxLeft = window.innerWidth - menuWidth - 8;
        const spaceBelow = window.innerHeight - triggerRect.bottom;
        const top =
          spaceBelow < menuHeight + sideOffset
            ? Math.max(8, triggerRect.top - menuHeight - sideOffset)
            : triggerRect.bottom + sideOffset;
        const rawLeft =
          align === 'start'
            ? triggerRect.left
            : align === 'center'
              ? triggerRect.left + triggerRect.width / 2 - menuWidth / 2
              : triggerRect.right - menuWidth;

        setStyle({
          position: 'fixed',
          top,
          left: Math.min(Math.max(8, rawLeft), maxLeft),
          zIndex: 1200,
        });
      };

      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }, [align, open, sideOffset, triggerRef]);

    React.useEffect(() => {
      if (!open) {
        return;
      }

      const handlePointerDown = (event: MouseEvent) => {
        const target = event.target as Node;
        if (contentRef.current?.contains(target) || triggerRef.current?.contains(target)) {
          return;
        }
        setOpen(false);
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
        }
      };

      document.addEventListener('mousedown', handlePointerDown);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handlePointerDown);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [open, setOpen, triggerRef]);

    if (!open || !mounted) {
      return null;
    }

    return createPortal(
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
        role="menu"
        style={style}
        className={cn(
          'w-52 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg outline-none dark:border-gray-700 dark:bg-dark-surface-2',
          className,
        )}
        {...props}
      >
        {children}
      </div>,
      document.body,
    );
  },
);
DropdownMenuContent.displayName = 'DropdownMenuContent';

const dropdownMenuItemVariants = cva(
  'flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'text-gray-700 hover:bg-gray-50 focus-visible:bg-gray-50 dark:text-gray-300 dark:hover:bg-dark-surface-3 dark:focus-visible:bg-dark-surface-3',
        danger:
          'text-red-700 hover:bg-red-50 focus-visible:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 dark:focus-visible:bg-red-500/10',
        success:
          'text-emerald-700 hover:bg-emerald-50 focus-visible:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10 dark:focus-visible:bg-emerald-500/10',
        warning:
          'text-amber-700 hover:bg-amber-50 focus-visible:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10 dark:focus-visible:bg-amber-500/10',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface DropdownMenuItemProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof dropdownMenuItemVariants> {}

const DropdownMenuItem = React.forwardRef<HTMLButtonElement, DropdownMenuItemProps>(
  ({ className, variant, onClick, ...props }, ref) => {
    const { setOpen } = useDropdownMenuContext('DropdownMenuItem');

    return (
      <button
        ref={ref}
        type="button"
        role="menuitem"
        className={cn(dropdownMenuItemVariants({ variant }), className)}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            setOpen(false);
          }
        }}
        {...props}
      />
    );
  },
);
DropdownMenuItem.displayName = 'DropdownMenuItem';

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  dropdownMenuItemVariants,
};
