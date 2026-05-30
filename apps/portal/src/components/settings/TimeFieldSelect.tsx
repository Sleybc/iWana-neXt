'use client';

import { useState } from 'react';
import { Check, ChevronDown, Clock3 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@iwana/ui';

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

type TimeFieldPart = 'hour' | 'minute';

interface TimeFieldSelectProps {
  id?: string;
  value: string;
  disabled: boolean;
  ariaLabel: string;
  onChange: (nextValue: string) => void;
  compact?: boolean;
  dataTestId?: string;
}

function splitTimeValue(value: string): { hour: string; minute: string } {
  const [rawHour = '', rawMinute = ''] = value.split(':');

  return {
    hour: /^\d{2}$/.test(rawHour) ? rawHour : '',
    minute: /^\d{2}$/.test(rawMinute) ? rawMinute : '',
  };
}

function mergeTimeValue(currentValue: string, part: TimeFieldPart, nextPartValue: string): string {
  if (!nextPartValue) {
    return '';
  }

  const current = splitTimeValue(currentValue);
  const nextHour = part === 'hour' ? nextPartValue : current.hour || '00';
  const nextMinute = part === 'minute' ? nextPartValue : current.minute || '00';

  return `${nextHour}:${nextMinute}`;
}

function buildTriggerClassName(compact: boolean, disabled: boolean): string {
  const base =
    'inline-flex items-center justify-between rounded-2xl border bg-white text-left text-sm text-gray-900 transition focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 dark:border-dark-border dark:bg-dark-surface-2 dark:text-white';
  const sizing = compact
    ? 'h-10 w-[98px] gap-1.5 px-2.5 py-2 text-sm'
    : 'h-11 w-full gap-2 px-3.5 py-2.5 text-sm';
  const state = disabled
    ? 'cursor-not-allowed border-gray-200 text-gray-400 dark:text-gray-500'
    : 'border-gray-200 shadow-sm hover:border-iwana-primary/25';

  return `${base} ${sizing} ${state}`;
}

function buildOptionClassName(selected: boolean): string {
  const base =
    'flex h-10 w-full items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-sm tabular-nums transition focus:outline-none focus:ring-2 focus:ring-iwana-primary/20';

  if (selected) {
    return `${base} bg-iwana-surface-soft font-semibold text-iwana-primary`;
  }

  return `${base} text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-dark-surface-3`;
}

export function TimeFieldSelect({
  id,
  value,
  disabled,
  ariaLabel,
  onChange,
  compact = false,
  dataTestId,
}: TimeFieldSelectProps) {
  const [open, setOpen] = useState(false);
  const current = splitTimeValue(value);
  const displayValue =
    current.hour && current.minute ? `${current.hour}:${current.minute}` : '--:--';

  function handleSelect(part: TimeFieldPart, nextPartValue: string) {
    const nextValue = mergeTimeValue(value, part, nextPartValue);
    onChange(nextValue);

    if (part === 'minute' || (part === 'hour' && current.minute)) {
      setOpen(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={(nextOpen) => !disabled && setOpen(nextOpen)}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          className={buildTriggerClassName(compact, disabled)}
          disabled={disabled}
          data-testid={dataTestId}
        >
          <span
            className={
              value
                ? 'font-medium tabular-nums text-gray-900 dark:text-white'
                : 'tabular-nums text-gray-400 dark:text-gray-500'
            }
          >
            {displayValue}
          </span>
          <span
            className={
              compact
                ? 'flex items-center gap-0.5 text-gray-400 dark:text-gray-500'
                : 'flex items-center gap-1 text-gray-400 dark:text-gray-500'
            }
          >
            <Clock3 className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
            <ChevronDown className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[212px] rounded-[1.35rem] border border-gray-200 p-2.5 shadow-lg dark:border-dark-border dark:bg-dark-surface-2"
      >
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
              Hora
            </p>
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-3">
              <div className="max-h-56 overflow-y-auto p-1 [scrollbar-gutter:stable]">
                <div className="space-y-1 pr-1">
                  {HOURS.map((hour) => {
                    const selected = hour === current.hour;

                    return (
                      <button
                        key={hour}
                        type="button"
                        className={buildOptionClassName(selected)}
                        onClick={() => handleSelect('hour', hour)}
                        data-testid={dataTestId ? `${dataTestId}-hour-${hour}` : undefined}
                      >
                        <span>{hour}</span>
                        {selected ? <Check className="h-3.5 w-3.5" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
              Min.
            </p>
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-3">
              <div className="max-h-56 overflow-y-auto p-1 [scrollbar-gutter:stable]">
                <div className="space-y-1 pr-1">
                  {MINUTES.map((minute) => {
                    const selected = minute === current.minute;

                    return (
                      <button
                        key={minute}
                        type="button"
                        className={buildOptionClassName(selected)}
                        onClick={() => handleSelect('minute', minute)}
                        data-testid={dataTestId ? `${dataTestId}-minute-${minute}` : undefined}
                      >
                        <span>{minute}</span>
                        {selected ? <Check className="h-3.5 w-3.5" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
