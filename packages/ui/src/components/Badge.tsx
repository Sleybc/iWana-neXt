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
        success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
        error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
        neutral: 'bg-gray-100 text-gray-600 dark:bg-dark-surface-4 dark:text-gray-300',
        primary:
          'bg-[#EEEEFA] text-[#17163A] dark:bg-iwana-primary-800/50 dark:text-iwana-primary-200',
        lime: 'bg-[#EAF5CC] text-[#6A7A1C] dark:bg-iwana-secondary-700/20 dark:text-iwana-secondary-400',
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
