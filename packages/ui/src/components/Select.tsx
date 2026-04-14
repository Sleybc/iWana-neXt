'use client';

import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
  error?: string;
  options?: SelectOption[];
  placeholder?: string;
}

interface NormalizedOption {
  value: string;
  label: string;
  disabled?: boolean | undefined;
}

function normalizeChildOptions(children: React.ReactNode): NormalizedOption[] {
  return React.Children.toArray(children)
    .filter(React.isValidElement)
    .flatMap((child) => {
      if (child.type !== 'option') {
        return [];
      }

      const optionChild = child as React.ReactElement<
        React.OptionHTMLAttributes<HTMLOptionElement>
      >;
      return [
        {
          value: String(optionChild.props.value ?? ''),
          label:
            typeof optionChild.props.children === 'string'
              ? optionChild.props.children
              : String(optionChild.props.children ?? ''),
          disabled: optionChild.props.disabled,
        },
      ];
    });
}

function resolveInitialValue(
  value: React.SelectHTMLAttributes<HTMLSelectElement>['value'],
  defaultValue: React.SelectHTMLAttributes<HTMLSelectElement>['defaultValue'],
) {
  if (value != null) {
    return String(value);
  }
  if (defaultValue != null) {
    return String(defaultValue);
  }
  return '';
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      label,
      helperText,
      error,
      id,
      options,
      placeholder,
      children,
      value,
      defaultValue,
      onChange,
      onBlur,
      disabled,
      name,
      required,
      autoComplete,
      ...props
    },
    ref,
  ) => {
    const selectId = id ?? React.useId();
    const invalidState = error ? ({ 'aria-invalid': 'true' } as const) : {};
    const describedBy = error ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined;
    const normalizedOptions = React.useMemo(() => {
      if (options?.length) {
        return options.map<NormalizedOption>((option) => ({
          value: option.value,
          label: option.label,
          disabled: undefined,
        }));
      }

      return normalizeChildOptions(children);
    }, [children, options]);

    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = React.useState(() =>
      resolveInitialValue(value, defaultValue),
    );
    const [open, setOpen] = React.useState(false);
    const expandedState = open
      ? ({ 'aria-expanded': 'true' } as const)
      : ({ 'aria-expanded': 'false' } as const);
    const [highlightedIndex, setHighlightedIndex] = React.useState(0);

    const wrapperRef = React.useRef<HTMLDivElement>(null);
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const hiddenSelectRef = React.useRef<HTMLSelectElement>(null);
    const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

    const currentValue = isControlled ? String(value ?? '') : internalValue;
    const selectedOption = normalizedOptions.find((option) => option.value === currentValue);

    React.useEffect(() => {
      if (isControlled) {
        setInternalValue(String(value ?? ''));
      }
    }, [isControlled, value]);

    React.useEffect(() => {
      if (!open) {
        return;
      }

      const onPointerDown = (event: MouseEvent) => {
        if (!wrapperRef.current?.contains(event.target as Node)) {
          setOpen(false);
          triggerRef.current?.focus();
        }
      };

      document.addEventListener('mousedown', onPointerDown);
      return () => document.removeEventListener('mousedown', onPointerDown);
    }, [open]);

    React.useEffect(() => {
      if (!open) {
        return;
      }

      optionRefs.current[highlightedIndex]?.focus();
    }, [highlightedIndex, open]);

    const emitChange = React.useCallback(
      (nextValue: string) => {
        if (!hiddenSelectRef.current) {
          return;
        }

        hiddenSelectRef.current.value = nextValue;
        onChange?.({
          target: hiddenSelectRef.current,
          currentTarget: hiddenSelectRef.current,
        } as React.ChangeEvent<HTMLSelectElement>);
      },
      [onChange],
    );

    const emitBlur = React.useCallback(() => {
      if (!hiddenSelectRef.current) {
        return;
      }

      onBlur?.({
        target: hiddenSelectRef.current,
        currentTarget: hiddenSelectRef.current,
      } as React.FocusEvent<HTMLSelectElement>);
    }, [onBlur]);

    const enabledIndices = React.useMemo(
      () =>
        normalizedOptions
          .map((option, index) => ({ option, index }))
          .filter(({ option }) => !option.disabled),
      [normalizedOptions],
    );

    const moveHighlight = React.useCallback(
      (direction: 1 | -1) => {
        if (enabledIndices.length === 0) {
          return;
        }

        const currentEnabledIndex = enabledIndices.findIndex(
          ({ index }) => index === highlightedIndex,
        );
        const nextEnabledIndex =
          currentEnabledIndex === -1
            ? 0
            : (currentEnabledIndex + direction + enabledIndices.length) % enabledIndices.length;
        const target = enabledIndices[nextEnabledIndex];
        if (target) {
          setHighlightedIndex(target.index);
        }
      },
      [enabledIndices, highlightedIndex],
    );

    const openListbox = React.useCallback(() => {
      if (disabled || enabledIndices.length === 0) {
        return;
      }

      const selectedIndex = enabledIndices.find(
        ({ option }) => option.value === currentValue,
      )?.index;
      setHighlightedIndex(selectedIndex ?? enabledIndices[0]!.index);
      setOpen(true);
    }, [currentValue, disabled, enabledIndices]);

    const commitValue = React.useCallback(
      (nextValue: string) => {
        if (!isControlled) {
          setInternalValue(nextValue);
        }

        emitChange(nextValue);
        setOpen(false);
        triggerRef.current?.focus();
      },
      [emitChange, isControlled],
    );

    return (
      <div
        ref={wrapperRef}
        className="flex w-full flex-col gap-1.5"
        onBlurCapture={(event) => {
          const nextTarget = event.relatedTarget as Node | null;
          if (!wrapperRef.current?.contains(nextTarget)) {
            setOpen(false);
            emitBlur();
          }
        }}
      >
        {label && (
          <label
            htmlFor={selectId}
            className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500"
          >
            {label}
          </label>
        )}

        <div className="relative">
          <select
            id={selectId}
            ref={(element) => {
              hiddenSelectRef.current = element;
              if (typeof ref === 'function') {
                ref(element);
              } else if (ref) {
                ref.current = element;
              }
            }}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            name={name}
            value={currentValue}
            required={required}
            autoComplete={autoComplete}
            disabled={disabled}
            onChange={() => undefined}
            {...invalidState}
            {...props}
          >
            {placeholder ? (
              <option value="" disabled>
                {placeholder}
              </option>
            ) : null}
            {normalizedOptions.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="listbox"
            aria-controls={`${selectId}-listbox`}
            aria-describedby={describedBy}
            disabled={disabled}
            {...expandedState}
            className={cn(
              'flex h-11 w-full items-center justify-between rounded-[24px] border border-gray-200 bg-white px-4 py-2.5 text-left text-sm text-iwana-primary shadow-iwana-soft transition-all duration-200',
              'focus:border-iwana-secondary focus:outline-none focus:ring-2 focus:ring-iwana-secondary/50',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'dark:border-dark-border dark:bg-dark-surface-3 dark:text-white/90',
              'dark:focus:border-iwana-secondary dark:focus:ring-iwana-secondary/30',
              open && 'border-iwana-secondary ring-2 ring-iwana-secondary/20',
              error && 'border-iwana-error focus:ring-iwana-error/50',
              !selectedOption && 'text-gray-400 dark:text-gray-500',
              className,
            )}
            onClick={() => {
              if (open) {
                setOpen(false);
              } else {
                openListbox();
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (!open) {
                  openListbox();
                  return;
                }
                moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (!open) {
                  openListbox();
                }
              }
              if (event.key === 'Escape' && open) {
                event.preventDefault();
                setOpen(false);
              }
            }}
          >
            <span className="truncate">
              {selectedOption?.label ?? placeholder ?? 'Selecciona una opción'}
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-gray-400 transition-transform',
                open && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </button>

          {open && normalizedOptions.length > 0 ? (
            <div
              id={`${selectId}-listbox`}
              role="listbox"
              aria-label={label ?? placeholder ?? 'Opciones'}
              className="absolute left-0 top-full z-[70] mt-2 max-h-[38vh] w-full overflow-y-auto overscroll-contain rounded-[28px] border border-white/90 bg-white/98 p-2 shadow-[var(--shadow-iwana-lg)] ring-1 ring-black/5 backdrop-blur-md sm:max-h-72 dark:border-dark-border dark:bg-dark-surface-2/98 dark:ring-white/10"
            >
              {normalizedOptions.map((option, index) => {
                const isSelected = option.value === currentValue;
                const isHighlighted = index === highlightedIndex;
                const optionState = isSelected
                  ? ({ 'aria-selected': 'true' } as const)
                  : ({ 'aria-selected': 'false' } as const);

                return (
                  <button
                    key={`${selectId}-${option.value}`}
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    id={`${selectId}-option-${index}`}
                    type="button"
                    role="option"
                    disabled={option.disabled}
                    {...optionState}
                    className={cn(
                      'flex w-full items-center justify-between rounded-[20px] px-4 py-3 text-left text-sm transition',
                      option.disabled && 'cursor-not-allowed opacity-50',
                      !option.disabled &&
                        isHighlighted &&
                        'bg-[#f4f8ea] text-iwana-primary dark:bg-dark-surface-3',
                      !option.disabled &&
                        !isHighlighted &&
                        'text-gray-700 hover:bg-[#f8faf5] dark:text-gray-200 dark:hover:bg-dark-surface-3',
                      isSelected && 'font-semibold text-iwana-primary dark:text-white',
                    )}
                    onClick={() => {
                      if (!option.disabled) {
                        commitValue(option.value);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        moveHighlight(1);
                      }
                      if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        moveHighlight(-1);
                      }
                      if (event.key === 'Home' && enabledIndices.length > 0) {
                        event.preventDefault();
                        setHighlightedIndex(enabledIndices[0]!.index);
                      }
                      if (event.key === 'End' && enabledIndices.length > 0) {
                        event.preventDefault();
                        setHighlightedIndex(enabledIndices[enabledIndices.length - 1]!.index);
                      }
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        if (!option.disabled) {
                          commitValue(option.value);
                        }
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setOpen(false);
                        triggerRef.current?.focus();
                      }
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected ? (
                      <Check
                        className="h-4 w-4 shrink-0 text-iwana-secondary-700 dark:text-iwana-secondary"
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {error ? (
          <p id={`${selectId}-error`} className="text-xs text-iwana-error">
            {error}
          </p>
        ) : null}
        {!error && helperText ? (
          <p id={`${selectId}-helper`} className="text-xs text-gray-400">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  },
);

Select.displayName = 'Select';

export { Select };
