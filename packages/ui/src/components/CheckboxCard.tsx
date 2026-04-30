// packages/ui/src/components/CheckboxCard.tsx
'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

export interface CheckboxCardProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'children'
> {
  label: React.ReactNode;
  description?: React.ReactNode;
  inputClassName?: string;
  labelClassName?: string;
  descriptionClassName?: string;
}

const CheckboxCard = React.forwardRef<HTMLInputElement, CheckboxCardProps>(
  (
    {
      className,
      inputClassName,
      labelClassName,
      descriptionClassName,
      label,
      description,
      disabled,
      ...props
    },
    ref,
  ) => (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3 transition-colors hover:border-gray-200 hover:bg-gray-50 dark:border-dark-border dark:bg-dark-surface-3/60 dark:hover:bg-dark-surface-3',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        disabled={disabled}
        className={cn(
          'mt-0.5 h-4 w-4 rounded border-gray-300 accent-iwana-primary',
          inputClassName,
        )}
        {...props}
      />
      <span className="min-w-0">
        <span
          className={cn('block text-sm font-medium text-gray-900 dark:text-white', labelClassName)}
        >
          {label}
        </span>
        {description && (
          <span
            className={cn(
              'mt-0.5 block text-xs text-gray-500 dark:text-gray-400',
              descriptionClassName,
            )}
          >
            {description}
          </span>
        )}
      </span>
    </label>
  ),
);
CheckboxCard.displayName = 'CheckboxCard';

export { CheckboxCard };
