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
  value?: Date | undefined;
  onChange?: (date: Date | undefined) => void;
  label?: string;
  error?: string | undefined;
  helperText?: string | undefined;
  className?: string;
  disabled?: boolean;
}

export function DatePicker({
  value,
  onChange,
  label,
  error,
  helperText,
  className,
  disabled = false,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className={cn('flex flex-col gap-1.5 w-full', className)}>
      {label && (
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            className={cn(
              'w-full justify-start text-left font-normal rounded-xl h-10 px-3',
              !value && 'text-gray-500 dark:text-gray-400',
              error && 'border-red-500 focus-visible:ring-red-500',
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? format(value, 'PPP', { locale: es }) : <span>Seleccionar fecha</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
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
        <p className="text-xs text-[#EF4444] flex items-center gap-1">
          <svg className="h-3 w-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
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
        <p className="text-xs text-gray-500 dark:text-gray-400">{helperText}</p>
      )}
    </div>
  );
}
