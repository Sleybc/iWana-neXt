'use client';

import * as React from 'react';
import { cn } from '../lib/utils';
import { interactiveFocusClassName } from '../focus';

export interface RadioCardOptionBase {
  value: string;
  title: string;
  description?: string;
  meta?: string;
}

export type RadioCardOption =
  | (RadioCardOptionBase & { disabled?: false; disabledReason?: never })
  | (RadioCardOptionBase & { disabled: true; disabledReason: string });

export interface RadioCardGroupProps {
  legend: string;
  name: string;
  value: string | null;
  onChange: (value: string) => void;
  options: readonly RadioCardOption[];
  density?: 'comfortable' | 'compact';
  disabled?: boolean;
}

/** Grupo controlado de radios nativos con opciones presentadas como tarjetas. */
export function RadioCardGroup({
  legend,
  name,
  value,
  onChange,
  options,
  density = 'comfortable',
  disabled = false,
}: RadioCardGroupProps) {
  const idPrefix = React.useId();

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-2">
      <legend className="text-sm font-medium text-gray-700 dark:text-gray-200">{legend}</legend>
      <div className="grid gap-2">
        {options.map((option, index) => {
          const checked = value === option.value;
          const reasonId = `${idPrefix}-reason-${index}`;

          return (
            <label
              key={option.value}
              className={cn(
                'flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-xl border text-sm transition-colors active:scale-[0.995]',
                density === 'comfortable' ? 'px-3 py-3' : 'px-3 py-2',
                checked
                  ? 'border-iwana-primary bg-iwana-primary/5 dark:bg-dark-surface-3'
                  : 'border-gray-200 bg-white hover:bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-2 dark:hover:bg-dark-surface-3',
                !disabled &&
                  !option.disabled &&
                  'hover:border-gray-300 dark:hover:border-dark-border-2',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-iwana-primary has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-white dark:has-[:focus-visible]:ring-iwana-primary-300 dark:has-[:focus-visible]:ring-offset-dark-surface-2',
                (disabled || option.disabled) && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                disabled={disabled || option.disabled === true}
                aria-describedby={option.disabled ? reasonId : undefined}
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0 accent-iwana-primary',
                  interactiveFocusClassName,
                )}
                onChange={() => onChange(option.value)}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-gray-900 dark:text-white">
                  {option.title}
                </span>
                {option.description ? (
                  <span className="mt-0.5 block text-xs text-gray-600 dark:text-gray-300">
                    {option.description}
                  </span>
                ) : null}
                {option.meta ? (
                  <span className="mt-1 block font-mono text-xs text-gray-500 dark:text-gray-400">
                    {option.meta}
                  </span>
                ) : null}
                {option.disabled ? (
                  <span
                    id={reasonId}
                    className="mt-1 block text-xs text-gray-600 dark:text-gray-300"
                  >
                    {option.disabledReason}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
