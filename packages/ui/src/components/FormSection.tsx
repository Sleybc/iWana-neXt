// packages/ui/src/components/FormSection.tsx
import * as React from 'react';
import { cn } from '../lib/utils';

function FormPanel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-gray-100 bg-white p-5 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2 dark:shadow-none',
        className,
      )}
      {...props}
    />
  );
}

function FormSectionTitle({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        'text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400',
        className,
      )}
      {...props}
    />
  );
}

export interface FormFieldsetProps extends React.FieldsetHTMLAttributes<HTMLFieldSetElement> {
  legend: string;
  title?: string;
}

function FormFieldset({ className, legend, title, children, ...props }: FormFieldsetProps) {
  return (
    <fieldset
      className={cn(
        'rounded-2xl border border-gray-100 bg-gray-50/60 p-4 dark:border-dark-border dark:bg-dark-surface-3/60',
        className,
      )}
      {...props}
    >
      <legend className="sr-only">{legend}</legend>
      {title && (
        <p className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">{title}</p>
      )}
      {children}
    </fieldset>
  );
}

export { FormPanel, FormSectionTitle, FormFieldset };
