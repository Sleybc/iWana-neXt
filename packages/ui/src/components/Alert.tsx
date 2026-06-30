// packages/ui/src/components/Alert.tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const alertVariants = cva(
  'rounded-2xl border px-4 py-3 text-sm shadow-iwana-soft dark:shadow-none',
  {
    variants: {
      variant: {
        neutral:
          'border-gray-200 bg-gray-50 text-gray-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300',
        info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300',
        success:
          'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
        warning:
          'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
        error:
          'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  icon?: React.ReactNode;
}

function Alert({ className, variant, icon, children, role, ...props }: AlertProps) {
  const resolvedRole = role ?? (variant === 'error' ? 'alert' : 'status');

  return (
    <div
      className={cn(alertVariants({ variant }), icon && 'flex items-start gap-3', className)}
      role={resolvedRole}
      {...props}
    >
      {icon && (
        <span className="mt-0.5 shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-sm font-semibold', className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 text-sm', className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription, alertVariants };
