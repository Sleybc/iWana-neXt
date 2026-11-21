// packages/ui/src/components/Badge.tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

/**
 * Componente Badge del sistema de diseño iWana neXt.
 * Usado principalmente en tablas para estados de tenants y usuarios.
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        success: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
        warning: 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400',
        error: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
        info: 'bg-iwana-primary-100 text-iwana-primary dark:bg-iwana-primary-800/50 dark:text-iwana-primary-200',
        neutral: 'bg-gray-100 text-gray-600 dark:bg-dark-surface-4 dark:text-gray-300',
        primary:
          'bg-iwana-primary-100 text-iwana-primary dark:bg-iwana-primary-800/50 dark:text-iwana-primary-200',
        lime: 'bg-iwana-secondary-100 text-iwana-secondary-900 dark:bg-iwana-secondary-700/20 dark:text-iwana-secondary-400',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
