'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';

import { cn } from '../lib/utils';
import { Button } from './Button';
import { Calendar } from './Calendar';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

export interface DatePickerProps {
  id?: string;
  name?: string;
  value?: Date | undefined;
  onChange?: (date: Date | undefined) => void;
  onBlur?: React.FocusEventHandler<HTMLButtonElement>;
  label?: string;
  error?: string | undefined;
  helperText?: string | undefined;
  placeholder?: string;
  requiredIndicator?: boolean;
  formatLabel?: (date: Date) => string;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
}

export function DatePicker({
  id,
  name,
  value,
  onChange,
  onBlur,
  label,
  error,
  helperText,
  placeholder = 'Seleccionar fecha',
  requiredIndicator = false,
  formatLabel,
  className,
  buttonClassName,
  disabled = false,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const generatedId = React.useId();
  const triggerId = id ?? generatedId;
  const labelId = `${triggerId}-label`;
  const helperId = `${triggerId}-helper`;
  const errorId = `${triggerId}-error`;

  return (
    <div className={cn('flex flex-col gap-1.5 w-full', className)}>
      {label && (
        <label
          id={labelId}
          htmlFor={triggerId}
          className="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {label}
          {requiredIndicator && (
            <span className="ml-1 text-red-500" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            id={triggerId}
            name={name}
            variant="outline"
            disabled={disabled}
            className={cn(
              'w-full h-10 justify-start rounded-xl border-gray-300 px-3 text-left font-normal text-gray-900 shadow-none',
              'dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-white',
              'focus-visible:ring-iwana-primary',
              !value && 'text-gray-500 dark:text-gray-400',
              error && 'border-red-500 focus-visible:ring-red-500',
              buttonClassName,
            )}
            onBlur={onBlur}
            aria-labelledby={label ? labelId : undefined}
            aria-describedby={error ? errorId : helperText ? helperId : undefined}
            {...(error ? { 'aria-invalid': 'true' } : {})}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? (
              formatLabel ? (
                formatLabel(value)
              ) : (
                format(value, 'dd/MM/yyyy', { locale: es })
              )
            ) : (
              <span>{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto rounded-2xl border border-gray-200 p-0 shadow-xl dark:border-dark-border"
          align="start"
          sideOffset={6}
        >
          <Calendar
            mode="single"
            selected={value}
            onSelect={(date) => {
              onChange?.(date);
              setOpen(false);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      {error && (
        <p
          id={errorId}
          className="flex items-center gap-1 text-xs text-iwana-error-700 dark:text-red-300"
          role="alert"
        >
          <svg className="h-3 w-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
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
        <p id={helperId} className="text-xs text-gray-500 dark:text-gray-400">
          {helperText}
        </p>
      )}
    </div>
  );
}
