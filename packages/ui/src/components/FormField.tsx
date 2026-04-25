// packages/ui/src/components/FormField.tsx
import * as React from 'react';
import { cn } from '../lib/utils';

interface FormFieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Envoltorio de campo de formulario del sistema iWana neXt.
 * Provee label accesible (uppercase, gris, tracking) + mensaje de error o pista.
 * El id del input hijo es vinculado automáticamente si el hijo expone htmlFor
 * o mediante React.cloneElement con id generado.
 */
function FormField({ label, error, hint, required, className, children }: FormFieldProps) {
  const fieldId = React.useId();

  // Inyectar id y aria-describedby al primer hijo si es un elemento React
  const child = React.Children.only(children);
  const describedBy = error
    ? `${fieldId}-error`
    : hint
      ? `${fieldId}-hint`
      : undefined;

  const enrichedChild = React.isValidElement(child)
    ? React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
        id: (child.props as Record<string, unknown>).id ?? fieldId,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })
    : child;

  return (
    <div className={cn('flex flex-col gap-1.5 w-full', className)}>
      <label
        htmlFor={(children as React.ReactElement<{ id?: string }>).props?.id ?? fieldId}
        className="text-[11px] font-bold text-gray-400 uppercase tracking-wider"
      >
        {label}
        {required && (
          <span className="ml-1 text-iwana-error" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {enrichedChild}
      {error && (
        <p id={`${fieldId}-error`} role="alert" className="text-xs text-iwana-error">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${fieldId}-hint`} className="text-xs text-gray-400">
          {hint}
        </p>
      )}
    </div>
  );
}

export { FormField };
