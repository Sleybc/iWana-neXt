// packages/ui/src/components/DropdownMenu.tsx
'use client';

import * as React from 'react';
import { overlayEdgeClassName } from './ModalLayer';
import { createPortal } from 'react-dom';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { buttonVariants } from './Button';
import { cn } from '../lib/utils';

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | null>(null);

function useDropdownMenuContext(componentName: string): DropdownMenuContextValue {
  const context = React.useContext(DropdownMenuContext);
  if (!context) {
    throw new Error(`${componentName} debe usarse dentro de <DropdownMenu />`);
  }
  return context;
}

/** Items enfocables: salta `disabled` nativo y `aria-disabled="true"`. */
function getFocusableMenuItems(container: HTMLElement | null): HTMLElement[] {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter((item) => {
    if (item.hasAttribute('disabled') || (item as HTMLButtonElement).disabled) {
      return false;
    }
    return item.getAttribute('aria-disabled') !== 'true';
  });
}

function focusMenuItemAt(items: HTMLElement[], index: number) {
  if (items.length === 0) {
    return;
  }
  const bounded = ((index % items.length) + items.length) % items.length;
  items[bounded]?.focus();
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
  const contentRef = React.useRef<HTMLDivElement | null>(null);
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
    () => ({ open: resolvedOpen ?? false, setOpen, triggerRef, contentRef }),
    [resolvedOpen, setOpen],
  );

  return <DropdownMenuContext.Provider value={value}>{children}</DropdownMenuContext.Provider>;
}

/**
 * Composición local de refs (patrón Radix; no toca lib/utils): compone la ref
 * interna del trigger con la ref del consumidor cuando se usa `asChild`.
 */
function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>): (node: T) => void {
  return (node) => {
    for (const ref of refs) {
      if (!ref) {
        continue;
      }
      if (typeof ref === 'function') {
        ref(node);
      } else {
        (ref as React.RefObject<T | null>).current = node;
      }
    }
  };
}

export interface DropdownMenuTriggerProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  asChild?: boolean;
  children?: React.ReactNode;
}

const DropdownMenuTrigger = React.forwardRef<HTMLButtonElement, DropdownMenuTriggerProps>(
  ({ className, asChild = false, onClick, onKeyDown, children, ...props }, ref) => {
    const { open, setOpen, triggerRef, contentRef } = useDropdownMenuContext('DropdownMenuTrigger');

    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
      onClick?.(event);
      if (!event.defaultPrevented) {
        setOpen(!open);
      }
    };

    const handleKeyDown: React.KeyboardEventHandler<HTMLButtonElement> = (event) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!open) {
          setOpen(true);
        }
        window.requestAnimationFrame(() => {
          const items = getFocusableMenuItems(contentRef.current);
          focusMenuItemAt(items, 0);
        });
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (!open) {
          setOpen(true);
        }
        window.requestAnimationFrame(() => {
          const items = getFocusableMenuItems(contentRef.current);
          focusMenuItemAt(items, items.length - 1);
        });
      }
    };

    if (asChild) {
      return (
        <Slot
          ref={composeRefs(triggerRef, ref)}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className={className}
          {...props}
        >
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={composeRefs(triggerRef, ref)}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), className)}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        {...props}
      >
        {children}
      </button>
    );
  },
);
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger';

export interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  width?: string;
}

const DropdownMenuContent = React.forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ className, align = 'end', sideOffset = 6, width = 'w-52', children, ...props }, ref) => {
    const { open, setOpen, triggerRef, contentRef } = useDropdownMenuContext('DropdownMenuContent');
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
          zIndex: 'var(--z-popover)',
        });
      };

      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }, [align, open, sideOffset, triggerRef, contentRef]);

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
          return;
        }

        const active = document.activeElement as HTMLElement | null;
        const inMenu = !!active && !!contentRef.current?.contains(active);
        if (!inMenu) {
          return;
        }

        const items = getFocusableMenuItems(contentRef.current);
        if (items.length === 0) {
          return;
        }

        const currentIndex = active ? items.indexOf(active) : -1;

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          focusMenuItemAt(items, currentIndex < 0 ? 0 : currentIndex + 1);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          focusMenuItemAt(items, currentIndex < 0 ? items.length - 1 : currentIndex - 1);
          return;
        }
        if (event.key === 'Home') {
          event.preventDefault();
          focusMenuItemAt(items, 0);
          return;
        }
        if (event.key === 'End') {
          event.preventDefault();
          focusMenuItemAt(items, items.length - 1);
        }
      };

      document.addEventListener('mousedown', handlePointerDown);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handlePointerDown);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [open, setOpen, triggerRef, contentRef]);

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
          overlayEdgeClassName,
          'overflow-hidden rounded-xl border bg-white py-1 shadow-lg outline-none dark:bg-dark-surface-2',
          width,
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
  'flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-gray-400 dark:disabled:text-gray-400',
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
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>,
    VariantProps<typeof dropdownMenuItemVariants> {
  asChild?: boolean;
  children?: React.ReactNode;
}

const DropdownMenuItem = React.forwardRef<HTMLButtonElement, DropdownMenuItemProps>(
  ({ className, variant, asChild = false, onClick, children, disabled, ...props }, ref) => {
    const { setOpen } = useDropdownMenuContext('DropdownMenuItem');

    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
      onClick?.(event);
      if (!event.defaultPrevented) {
        setOpen(false);
      }
    };

    if (asChild) {
      return (
        <Slot
          ref={ref}
          role="menuitem"
          className={cn(dropdownMenuItemVariants({ variant }), className)}
          onClick={handleClick}
          {...props}
        >
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        type="button"
        role="menuitem"
        disabled={disabled}
        className={cn(dropdownMenuItemVariants({ variant }), className)}
        onClick={handleClick}
        {...props}
      >
        {children}
      </button>
    );
  },
);
DropdownMenuItem.displayName = 'DropdownMenuItem';

export interface DropdownMenuHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
}

const DropdownMenuHeader = React.forwardRef<HTMLDivElement, DropdownMenuHeaderProps>(
  ({ title, subtitle, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('border-b border-gray-100 px-4 py-3 dark:border-dark-border-2', className)}
      {...props}
    >
      <p className="text-sm font-medium text-gray-800 dark:text-white">{title}</p>
      {subtitle ? <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
    </div>
  ),
);
DropdownMenuHeader.displayName = 'DropdownMenuHeader';

export interface DropdownMenuSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {}

const DropdownMenuSeparator = React.forwardRef<HTMLDivElement, DropdownMenuSeparatorProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="separator"
      className={cn('my-1 h-px bg-gray-100 dark:bg-dark-border-2', className)}
      {...props}
    />
  ),
);
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuHeader,
  DropdownMenuSeparator,
  dropdownMenuItemVariants,
};
