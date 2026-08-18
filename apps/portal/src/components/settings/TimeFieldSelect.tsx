'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { Clock3, ChevronDown } from 'lucide-react';
import { Button, Popover, PopoverContent, PopoverTrigger, cn } from '@iwana/ui';
import { interactiveFocusClassName } from '@/components/shared/portal-ui';

interface TimeFieldSelectProps {
  id?: string;
  value: string;
  disabled: boolean;
  onChange: (nextValue: string) => void;
  compact?: boolean;
  ariaLabel?: string;
  ariaInvalid?: boolean | undefined;
  ariaDescribedBy?: string | undefined;
  dataTestId?: string;
}

type TimeColumn = 'hour' | 'minute';

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);
const EMPTY_COMPACT_PLACEHOLDER = '--:--';
const EMPTY_DEFAULT_PLACEHOLDER = 'Selecciona una hora';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function parseTime(value: string): { hour: number | null; minute: number | null } {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { hour: null, minute: null };

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return { hour: null, minute: null };
  }

  return { hour, minute };
}

function focusOption(refs: RefObject<HTMLButtonElement[]>, index: number): void {
  const option = refs.current[index];
  option?.focus();
  option?.scrollIntoView?.({ block: 'nearest' });
}

function getMovedOptionIndex(column: TimeColumn, index: number, delta: number): number {
  const options = column === 'hour' ? HOURS : MINUTES;
  return Math.min(options.length - 1, Math.max(0, index + delta));
}

/** Selector de hora iWana con popover accesible y formato de 24 horas. */
export function TimeFieldSelect({
  id,
  value,
  disabled,
  onChange,
  compact = false,
  ariaLabel,
  ariaInvalid = false,
  ariaDescribedBy,
  dataTestId,
}: TimeFieldSelectProps) {
  const [open, setOpen] = useState(false);
  const [draftHour, setDraftHour] = useState<number | null>(null);
  const [draftMinute, setDraftMinute] = useState<number | null>(null);
  const [activeColumn, setActiveColumn] = useState<TimeColumn>('hour');
  const [activeIndexes, setActiveIndexes] = useState<Record<TimeColumn, number>>({
    hour: 0,
    minute: 0,
  });
  const hourRefs = useRef<HTMLButtonElement[]>([]);
  const minuteRefs = useRef<HTMLButtonElement[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = id ? `${id}-popover` : undefined;
  const generatedId = useId();
  const optionIdPrefix = id ?? generatedId;

  const refs = { hour: hourRefs, minute: minuteRefs };
  const selectedValue =
    draftHour !== null && draftMinute !== null ? `${pad(draftHour)}:${pad(draftMinute)}` : '';
  const emptyPlaceholder = compact ? EMPTY_COMPACT_PLACEHOLDER : EMPTY_DEFAULT_PLACEHOLDER;

  useEffect(() => {
    if (!open) return;
    const index = activeIndexes[activeColumn];
    const targetRefs = activeColumn === 'hour' ? hourRefs : minuteRefs;
    requestAnimationFrame(() => focusOption(targetRefs, index));
  }, [activeColumn, activeIndexes, open]);

  function handleOpenChange(nextOpen: boolean): void {
    if (nextOpen) {
      const parsed = parseTime(value);
      setDraftHour(parsed.hour);
      setDraftMinute(parsed.minute);
      setActiveIndexes({ hour: parsed.hour ?? 0, minute: parsed.minute ?? 0 });
      setActiveColumn(parsed.hour === null ? 'hour' : 'minute');
    }
    setOpen(nextOpen);
    if (!nextOpen) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  function selectHour(hour: number): void {
    setDraftHour(hour);
    setActiveIndexes((current) => ({ ...current, hour }));
    setActiveColumn('minute');
  }

  function selectMinute(minute: number): void {
    const hour = draftHour ?? 0;
    setDraftHour(hour);
    setDraftMinute(minute);
    setActiveIndexes((current) => ({ ...current, minute }));
    onChange(`${pad(hour)}:${pad(minute)}`);
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handleOptionKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    column: TimeColumn,
    index: number,
  ): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const nextIndex = getMovedOptionIndex(column, index, event.key === 'ArrowDown' ? 1 : -1);
      setActiveIndexes((current) => ({ ...current, [column]: nextIndex }));
      focusOption(refs[column], nextIndex);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const lastIndex = column === 'hour' ? HOURS.length - 1 : MINUTES.length - 1;
      const nextIndex = event.key === 'Home' ? 0 : lastIndex;
      setActiveIndexes((current) => ({ ...current, [column]: nextIndex }));
      focusOption(refs[column], nextIndex);
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const nextColumn = event.key === 'ArrowLeft' ? 'hour' : 'minute';
      setActiveColumn(nextColumn);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (column === 'hour') selectHour(index);
      else selectMinute(index);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          id={id}
          variant="outline"
          disabled={disabled}
          data-testid={dataTestId}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid || undefined}
          aria-describedby={ariaDescribedBy}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={popoverId}
          className={cn(
            'rounded-xl border-gray-300 text-left font-normal text-gray-900 shadow-none dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-white',
            interactiveFocusClassName,
            compact
              ? 'h-8 w-[5.5rem] justify-center gap-1 px-1.5 text-xs'
              : 'h-10 w-full justify-start px-3',
            !value && 'text-gray-500 dark:text-gray-400',
          )}
        >
          {compact ? null : <Clock3 className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />}
          <span className="font-mono tabular-nums">{value || emptyPlaceholder}</span>
          <ChevronDown
            className={cn('shrink-0 text-gray-400', compact ? 'h-3 w-3' : 'ml-auto h-4 w-4')}
            aria-hidden="true"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        id={popoverId}
        role="dialog"
        aria-label="Selecciona una hora"
        align="start"
        sideOffset={4}
        className="w-44 rounded-xl border border-gray-200 p-1.5 shadow-iwana-active dark:border-dark-border dark:bg-dark-surface-2"
      >
        <div className="mb-1.5 flex justify-end">
          <span className="font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
            {selectedValue || 'HH:mm'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <TimeOptionList
            heading="Hora"
            listboxLabel="Hora"
            values={HOURS}
            selected={draftHour}
            active={activeColumn === 'hour'}
            refs={hourRefs}
            activeIndex={activeIndexes.hour}
            idPrefix={`${optionIdPrefix}-hour`}
            onSelect={selectHour}
            onKeyDown={(event, index) => handleOptionKeyDown(event, 'hour', index)}
          />
          <TimeOptionList
            heading="Min"
            listboxLabel="Minutos"
            values={MINUTES}
            selected={draftMinute}
            active={activeColumn === 'minute'}
            refs={minuteRefs}
            activeIndex={activeIndexes.minute}
            idPrefix={`${optionIdPrefix}-minute`}
            onSelect={selectMinute}
            onKeyDown={(event, index) => handleOptionKeyDown(event, 'minute', index)}
          />
        </div>
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {value ? `Hora seleccionada: ${value}` : 'No hay una hora seleccionada'}
        </p>
      </PopoverContent>
    </Popover>
  );
}

interface TimeOptionListProps {
  heading: string;
  listboxLabel: string;
  values: number[];
  selected: number | null;
  active: boolean;
  activeIndex: number;
  idPrefix: string;
  refs: RefObject<HTMLButtonElement[]>;
  onSelect: (value: number) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
}

function TimeOptionList({
  heading,
  listboxLabel,
  values,
  selected,
  active,
  activeIndex,
  idPrefix,
  refs,
  onSelect,
  onKeyDown,
}: TimeOptionListProps) {
  return (
    <div>
      <p className="portal-eyebrow-muted mb-1 px-1">{heading}</p>
      <div className="overflow-hidden rounded-lg border border-gray-100 dark:border-dark-border">
        <div
          className="max-h-32 overflow-y-auto bg-white p-0.5 dark:bg-dark-surface-2"
          role="listbox"
          aria-label={listboxLabel}
        >
          {values.map((item, index) => {
            const isSelected = selected === item;
            return (
              <button
                key={item}
                ref={(element) => {
                  if (element) refs.current[index] = element;
                }}
                type="button"
                id={`${idPrefix}-${item}`}
                role="option"
                aria-selected={isSelected}
                tabIndex={active && index === activeIndex ? 0 : -1}
                className={cn(
                  'flex h-7 min-h-7 w-full items-center justify-center rounded-md px-1 font-mono text-xs tabular-nums transition-colors',
                  interactiveFocusClassName,
                  isSelected
                    ? 'bg-iwana-primary font-semibold text-white'
                    : 'text-gray-700 hover:bg-iwana-surface-soft dark:text-gray-200 dark:hover:bg-dark-surface-3',
                )}
                onClick={() => onSelect(item)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                {pad(item)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
