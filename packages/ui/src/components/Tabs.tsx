// packages/ui/src/components/Tabs.tsx
'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

interface TabsContextValue {
  value: string;
  setValue: (next: string) => void;
  baseId: string;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext(componentName: string): TabsContextValue {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error(`${componentName} debe usarse dentro de <Tabs />`);
  }
  return context;
}

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

function Tabs({ value, defaultValue, onValueChange, className, children, ...props }: TabsProps) {
  const generatedId = React.useId();
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? '');
  const isControlled = value !== undefined;
  const resolvedValue = isControlled ? value : internalValue;

  const setValue = React.useCallback(
    (next: string) => {
      if (!isControlled) {
        setInternalValue(next);
      }
      onValueChange?.(next);
    },
    [isControlled, onValueChange],
  );

  const contextValue = React.useMemo(
    () => ({ value: resolvedValue ?? '', setValue, baseId: generatedId }),
    [generatedId, resolvedValue, setValue],
  );

  return (
    <TabsContext.Provider value={contextValue}>
      <div className={cn('w-full', className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cn('flex gap-1 rounded-xl bg-gray-100/80 p-1 dark:bg-dark-surface-3', className)}
      {...props}
    />
  );
}

const tabsTriggerVariants = cva(
  'relative inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-gray-400 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm data-[state=active]:dark:bg-dark-surface-2 data-[state=active]:dark:text-white dark:disabled:text-gray-500',
  {
    variants: {
      variant: {
        default: 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
        danger: 'text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface TabsTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof tabsTriggerVariants> {
  value: string;
  hasIndicator?: boolean;
  indicatorLabel?: string;
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  (
    {
      className,
      value,
      variant,
      hasIndicator = false,
      indicatorLabel = 'Tiene errores',
      children,
      onClick,
      ...props
    },
    ref,
  ) => {
    const { value: activeValue, setValue, baseId } = useTabsContext('TabsTrigger');
    const selected = activeValue === value;
    const triggerId = `${baseId}-trigger-${value}`;
    const contentId = `${baseId}-content-${value}`;

    return (
      <button
        ref={ref}
        id={triggerId}
        role="tab"
        type="button"
        aria-selected={selected}
        aria-controls={contentId}
        data-state={selected ? 'active' : 'inactive'}
        className={cn(tabsTriggerVariants({ variant }), className)}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            setValue(value);
          }
        }}
        {...props}
      >
        {children}
        {hasIndicator && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            <span className="sr-only">{indicatorLabel}</span>!
          </span>
        )}
      </button>
    );
  },
);
TabsTrigger.displayName = 'TabsTrigger';

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  forceMount?: boolean;
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, forceMount = false, children, ...props }, ref) => {
    const { value: activeValue, baseId } = useTabsContext('TabsContent');
    const selected = activeValue === value;

    if (!selected && !forceMount) {
      return null;
    }

    return (
      <div
        ref={ref}
        id={`${baseId}-content-${value}`}
        role="tabpanel"
        aria-labelledby={`${baseId}-trigger-${value}`}
        hidden={!selected}
        className={cn('mt-4 focus-visible:outline-none', className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsTriggerVariants };
