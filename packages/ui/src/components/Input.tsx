// packages/ui/src/components/Input.tsx
'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

/**
 * Componente Input del sistema de diseño iWana neXt.
 * Con soporte para label, helper text, error message y password toggle.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  helperText?: React.ReactNode;
  error?: React.ReactNode | undefined;
  requiredIndicator?: boolean;
  containerClassName?: string;
  startIcon?: React.ReactNode;
  startIconClassName?: string;
  /** Contenido absoluto a la derecha del control (p. ej. limpiar, acción secundaria). */
  endAdornment?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      containerClassName,
      label,
      helperText,
      error,
      id,
      type,
      requiredIndicator = false,
      startIcon,
      startIconClassName,
      endAdornment,
      ...props
    },
    ref,
  ) => {
    const [showPassword, setShowPassword] = React.useState(false);
    const generatedId = React.useId();
    const inputId = id || generatedId;
    const isPassword = type === 'password';
    const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

    return (
      <div className={cn('flex flex-col gap-1.5 w-full', containerClassName)}>
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {label}
            {requiredIndicator && (
              <span className="ml-1 text-red-500" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}
        <div className="relative">
          {startIcon && (
            <span
              className={cn(
                'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400',
                startIconClassName,
              )}
              aria-hidden="true"
            >
              {startIcon}
            </span>
          )}
          <input
            id={inputId}
            type={inputType}
            ref={ref}
            className={cn(
              'flex h-10 w-full rounded-xl border bg-white px-3 py-2 text-sm text-gray-900 dark:bg-dark-surface-3 dark:text-white dark:placeholder:text-gray-400',
              'transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:border-transparent dark:focus-visible:ring-iwana-primary-300',
              'disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-500 disabled:placeholder:text-gray-400 dark:disabled:border-dark-border dark:disabled:bg-dark-surface-3 dark:disabled:text-gray-400 dark:disabled:placeholder:text-gray-400',
              error
                ? 'border-red-500 dark:border-red-500 focus-visible:ring-red-500'
                : 'border-gray-300 dark:border-iwana-neutral-600 hover:border-gray-400 dark:hover:border-gray-500',
              startIcon && 'pl-9',
              endAdornment ? 'pr-16' : isPassword ? 'pr-10' : undefined,
              className,
            )}
            aria-invalid={error ? true : undefined}
            aria-describedby={
              error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
            }
            {...props}
          />
          {endAdornment ? (
            <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1">
              {endAdornment}
            </div>
          ) : null}
          {isPassword && !endAdornment && (
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300 focus:outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-gray-300 dark:disabled:text-gray-400"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              disabled={props.disabled}
            >
              {showPassword ? (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21"
                  />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              )}
            </button>
          )}
        </div>
        {error && (
          <p
            id={`${inputId}-error`}
            role="alert"
            className="flex items-center gap-1 text-xs text-iwana-error"
          >
            <svg
              className="h-3 w-3 shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={`${inputId}-helper`} className="text-xs text-gray-500 dark:text-gray-400">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';

export { Input };
