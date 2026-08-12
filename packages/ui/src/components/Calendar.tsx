'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import type { DropdownProps } from 'react-day-picker';
import { es } from 'react-day-picker/locale';

import { cn } from '../lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Dropdown custom para navegación de mes/año en el Calendar.
 * Reemplaza el <select> nativo para aplicar el design system iWana.
 */
function CalendarDropdown({ value, onChange, options, ...rest }: DropdownProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // Cierra al hacer click fuera
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options?.find((o) => o.value === Number(value));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded px-1.5 py-1 text-sm font-semibold text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-dark-surface-3"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={rest['aria-label']}
      >
        {selected?.label}
        <ChevronDown className="h-3 w-3 opacity-50" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute top-full left-0 z-10 mt-1 max-h-52 min-w-[6rem] overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-dark-border-2 dark:bg-dark-surface-2"
        >
          {options?.map((opt) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === Number(value)}
              aria-disabled={opt.disabled}
              className={cn(
                'cursor-pointer px-3 py-1.5 text-sm transition-colors',
                opt.value === Number(value)
                  ? 'bg-iwana-primary font-medium text-white'
                  : 'text-gray-800 hover:bg-gray-100 dark:text-white dark:hover:bg-dark-surface-3',
                opt.disabled && 'cursor-not-allowed opacity-40',
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                if (!opt.disabled && onChange) {
                  const synth = {
                    target: { value: String(opt.value) },
                  } as React.ChangeEvent<HTMLSelectElement>;
                  onChange(synth);
                  setOpen(false);
                }
              }}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Calendario del design system iWana neXt.
 * react-day-picker v9 · locale español · dropdown mes/año custom · tokens iWana.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'dropdown',
  startMonth = new Date(2020, 0),
  endMonth = new Date(2035, 11),
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      locale={es}
      captionLayout={captionLayout}
      navLayout="around"
      startMonth={startMonth}
      endMonth={endMonth}
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        root: 'w-full',
        months: 'flex flex-col sm:flex-row sm:space-x-4',
        // navLayout="around" coloca los botones prev/next DENTRO de Month, en flujo normal.
        // Usamos CSS grid para: [prev] [caption] [next] en la primera fila y [grid] en la segunda.
        month: 'grid grid-cols-[auto_1fr_auto] items-center gap-x-1 gap-y-4',

        // Cabecera: ocupa la columna central del grid
        month_caption: 'flex h-9 items-center justify-center',
        // Ocultar la caption_label — los dropdowns ya muestran mes y año
        caption_label: 'hidden',

        // Contenedor de dropdowns (mes + año lado a lado)
        dropdowns: 'flex items-center gap-1',
        dropdown_root: '',
        dropdown: 'hidden', // ocultar el <select> nativo; usamos el custom

        // nav no se renderiza con navLayout="around"; dejarlo vacío por si acaso
        nav: '',
        button_previous: cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md',
          'border border-gray-300 bg-white text-gray-700 hover:bg-gray-100',
          'dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-white dark:hover:bg-dark-surface-2',
          'disabled:opacity-30 disabled:cursor-not-allowed',
        ),
        button_next: cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md',
          'border border-gray-300 bg-white text-gray-700 hover:bg-gray-100',
          'dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-white dark:hover:bg-dark-surface-2',
          'disabled:opacity-30 disabled:cursor-not-allowed',
        ),

        // month_grid ocupa las 3 columnas del grid
        month_grid: 'col-span-3 w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 text-center text-[0.72rem] font-normal text-gray-400 dark:text-gray-400',
        weeks: 'w-full',
        week: 'flex w-full mt-1',

        // Celda y botón de día
        day: 'h-9 w-9 p-0 text-center text-sm',
        day_button: cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-normal',
          'text-gray-900 dark:text-white',
          'hover:bg-gray-100 dark:hover:bg-dark-surface-3',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary',
          'transition-colors duration-150',
        ),

        // Estados
        selected:
          '[&>button]:bg-iwana-primary [&>button]:text-white [&>button]:rounded-lg [&>button]:hover:bg-iwana-primary',
        today: '[&>button]:font-bold [&>button]:text-iwana-primary',
        outside: '[&>button]:text-gray-300 dark:[&>button]:text-gray-400',
        disabled: '[&>button]:opacity-30 [&>button]:cursor-not-allowed',
        range_middle: 'bg-gray-100 dark:bg-dark-surface-3',
        range_end: 'rounded-r-lg',
        range_start: 'rounded-l-lg',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: cls }) => {
          if (orientation === 'left') return <ChevronLeft className={cn('h-4 w-4', cls)} />;
          if (orientation === 'right') return <ChevronRight className={cn('h-4 w-4', cls)} />;
          return <span className={cls} />;
        },
        Dropdown: CalendarDropdown,
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
