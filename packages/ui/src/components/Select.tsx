'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
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
  menuClassName?: string | undefined;
  menuWidth?: number | undefined;
  menuMaxHeight?: string | undefined;
  menuHorizontalAlign?: 'start' | 'center' | 'end' | undefined;
  /** Muestra burbuja con el texto completo al pasar el mouse sobre el valor seleccionado. */
  selectedHoverHint?: boolean | 'whenTruncated';
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
      menuClassName,
      menuWidth,
      menuMaxHeight,
      menuHorizontalAlign = 'start',
      selectedHoverHint,
      children,
      value,
      defaultValue,
      onChange,
      onBlur,
      disabled,
      name,
      required,
      autoComplete,
      title,
      'aria-label': ariaLabel,
      'aria-describedby': ariaDescribedBy,
      'aria-labelledby': ariaLabelledBy,
      ...props
    },
    ref,
  ) => {
    const generatedId = React.useId();
    const selectId = id ?? generatedId;
    const nativeSelectId = `${selectId}-native`;
    const labelId = `${selectId}-label`;
    const invalidState = error ? ({ 'aria-invalid': 'true' } as const) : {};
    const describedBy =
      [
        ariaDescribedBy,
        error ? `${selectId}-error` : undefined,
        !error && helperText ? `${selectId}-helper` : undefined,
      ]
        .filter(Boolean)
        .join(' ') || undefined;
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
    const [menuStyle, setMenuStyle] = React.useState<React.CSSProperties | null>(null);
    const expandedState = open
      ? ({ 'aria-expanded': 'true' } as const)
      : ({ 'aria-expanded': 'false' } as const);
    const [highlightedIndex, setHighlightedIndex] = React.useState(0);

    const wrapperRef = React.useRef<HTMLDivElement>(null);
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const hiddenSelectRef = React.useRef<HTMLSelectElement>(null);
    const menuRef = React.useRef<HTMLDivElement>(null);
    const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
    const selectedLabelRef = React.useRef<HTMLSpanElement>(null);

    const [hoverHintOpen, setHoverHintOpen] = React.useState(false);
    const [hoverHintPosition, setHoverHintPosition] = React.useState<{
      top: number;
      left: number;
    } | null>(null);
    const [isSelectedLabelTruncated, setIsSelectedLabelTruncated] = React.useState(false);

    const currentValue = isControlled ? String(value ?? '') : internalValue;
    const selectedOption = normalizedOptions.find((option) => option.value === currentValue);
    const selectedLabel = selectedOption?.label ?? '';

    const shouldShowSelectedHoverHint =
      Boolean(selectedHoverHint) &&
      selectedLabel.length > 0 &&
      (selectedHoverHint === true ||
        (selectedHoverHint === 'whenTruncated' && isSelectedLabelTruncated));

    const updateSelectedLabelTruncation = React.useCallback(() => {
      const labelNode = selectedLabelRef.current;
      if (!labelNode) {
        setIsSelectedLabelTruncated(false);
        return;
      }

      setIsSelectedLabelTruncated(labelNode.scrollWidth > labelNode.clientWidth + 1);
    }, []);

    const updateHoverHintPosition = React.useCallback(() => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const gap = 8;
      const maxWidth = 320;
      const viewportPadding = 12;
      const left = Math.min(
        Math.max(rect.left, viewportPadding),
        Math.max(viewportPadding, window.innerWidth - maxWidth - viewportPadding),
      );

      setHoverHintPosition({
        top: rect.bottom + gap,
        left,
      });
    }, []);

    React.useLayoutEffect(() => {
      updateSelectedLabelTruncation();
    }, [selectedLabel, updateSelectedLabelTruncation]);

    React.useEffect(() => {
      const labelNode = selectedLabelRef.current;
      if (!labelNode || typeof ResizeObserver === 'undefined') {
        return;
      }

      const observer = new ResizeObserver(() => {
        updateSelectedLabelTruncation();
      });

      observer.observe(labelNode);
      return () => observer.disconnect();
    }, [selectedLabel, updateSelectedLabelTruncation]);

    React.useEffect(() => {
      if (!shouldShowSelectedHoverHint || !hoverHintOpen) {
        return;
      }

      const handleReposition = () => updateHoverHintPosition();
      window.addEventListener('resize', handleReposition);
      window.addEventListener('scroll', handleReposition, true);
      return () => {
        window.removeEventListener('resize', handleReposition);
        window.removeEventListener('scroll', handleReposition, true);
      };
    }, [hoverHintOpen, shouldShowSelectedHoverHint, updateHoverHintPosition]);

    React.useEffect(() => {
      if (open) {
        setHoverHintOpen(false);
      }
    }, [open]);

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

    React.useLayoutEffect(() => {
      if (!open) {
        setMenuStyle(null);
        return;
      }

      const updateMenuPosition = () => {
        const trigger = triggerRef.current;
        if (!trigger) {
          return;
        }

        const rect = trigger.getBoundingClientRect();
        const gap = 8;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const resolvedWidth = Math.max(
          menuWidth ?? 160,
          Math.min(menuWidth ?? rect.width, viewportWidth - 16),
        );
        const preferredLeft =
          menuHorizontalAlign === 'center'
            ? rect.left + (rect.width - resolvedWidth) / 2
            : menuHorizontalAlign === 'end'
              ? rect.right - resolvedWidth
              : rect.left;
        const left = Math.min(
          Math.max(preferredLeft, 8),
          Math.max(8, viewportWidth - resolvedWidth - 8),
        );
        const spaceBelow = viewportHeight - rect.bottom - gap;
        const spaceAbove = rect.top - gap;
        const placeAbove = spaceBelow < 220 && spaceAbove > spaceBelow;

        setMenuStyle({
          position: 'fixed',
          left,
          width: resolvedWidth,
          // Debe superar overlays/modales que usan z-index alto en apps web/portal.
          zIndex: 11000,
          maxHeight: menuMaxHeight ?? '38vh',
          ...(placeAbove
            ? {
                bottom: Math.max(gap, viewportHeight - rect.top + gap),
              }
            : {
                top: rect.bottom + gap,
              }),
        });
      };

      updateMenuPosition();
      window.addEventListener('resize', updateMenuPosition);
      window.addEventListener('scroll', updateMenuPosition, true);
      return () => {
        window.removeEventListener('resize', updateMenuPosition);
        window.removeEventListener('scroll', updateMenuPosition, true);
      };
    }, [open, normalizedOptions.length, menuHorizontalAlign, menuMaxHeight, menuWidth]);

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
          if (!wrapperRef.current?.contains(nextTarget) && !menuRef.current?.contains(nextTarget)) {
            setOpen(false);
            emitBlur();
          }
        }}
      >
        {label && (
          <label
            id={labelId}
            htmlFor={selectId}
            className="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {label}
          </label>
        )}

        <div className="relative">
          <select
            id={nativeSelectId}
            ref={(element) => {
              hiddenSelectRef.current = element;
              if (typeof ref === 'function') {
                ref(element);
              } else if (ref) {
                ref.current = element;
              }
            }}
            hidden
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
            id={selectId}
            ref={triggerRef}
            type="button"
            role="combobox"
            aria-haspopup="listbox"
            aria-controls={`${selectId}-listbox`}
            aria-describedby={describedBy}
            aria-labelledby={ariaLabelledBy ?? (label ? labelId : undefined)}
            aria-label={ariaLabel}
            title={title}
            disabled={disabled}
            {...expandedState}
            {...invalidState}
            className={cn(
              'flex h-11 w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-left text-sm text-iwana-primary shadow-iwana-soft transition-all duration-200',
              'focus:border-iwana-secondary focus:outline-none focus:ring-2 focus:ring-iwana-secondary/50',
              'disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 dark:disabled:border-dark-border dark:disabled:bg-dark-surface-3 dark:disabled:text-gray-400',
              'dark:border-iwana-neutral-600 dark:bg-dark-surface-3 dark:text-white/90',
              'dark:focus:border-iwana-secondary dark:focus:ring-iwana-secondary/30',
              open && 'border-iwana-secondary ring-2 ring-iwana-secondary/20',
              error && 'border-iwana-error focus:ring-iwana-error/50',
              !selectedOption && 'text-gray-500 dark:text-gray-400',
              className,
            )}
            onClick={() => {
              if (open) {
                setOpen(false);
              } else {
                openListbox();
              }
            }}
            onMouseEnter={() => {
              if (!shouldShowSelectedHoverHint || open) {
                return;
              }

              updateHoverHintPosition();
              setHoverHintOpen(true);
            }}
            onMouseLeave={() => {
              setHoverHintOpen(false);
            }}
            onFocus={() => {
              if (!shouldShowSelectedHoverHint || open) {
                return;
              }

              updateHoverHintPosition();
              setHoverHintOpen(true);
            }}
            onBlur={() => {
              setHoverHintOpen(false);
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
            <span ref={selectedLabelRef} className="truncate">
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

          {open && normalizedOptions.length > 0 && menuStyle
            ? createPortal(
                <div
                  ref={menuRef}
                  id={`${selectId}-listbox`}
                  role="listbox"
                  aria-labelledby={label ? labelId : ariaLabelledBy}
                  aria-label={label ?? placeholder ?? 'Opciones'}
                  className={cn(
                    'max-h-[38vh] overflow-y-auto overscroll-contain rounded-[28px] border border-white/90 bg-white/98 p-2 shadow-(--shadow-iwana-lg) ring-1 ring-black/5 backdrop-blur-md sm:max-h-72 dark:border-dark-border dark:bg-dark-surface-2/98 dark:ring-white/10',
                    menuClassName,
                  )}
                  style={menuStyle}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                  }}
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
                          option.disabled && 'cursor-not-allowed text-gray-400 dark:text-gray-400',
                          !option.disabled &&
                            isHighlighted &&
                            'bg-iwana-secondary-50 text-iwana-primary dark:bg-dark-surface-3',
                          !option.disabled &&
                            !isHighlighted &&
                            'text-gray-700 hover:bg-iwana-primary-50 dark:text-gray-200 dark:hover:bg-dark-surface-3',
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
                        onMouseEnter={() => {
                          if (!option.disabled) {
                            setHighlightedIndex(index);
                          }
                        }}
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
                </div>,
                document.body,
              )
            : null}

          {hoverHintOpen && hoverHintPosition && shouldShowSelectedHoverHint && !open
            ? createPortal(
                <div
                  role="tooltip"
                  style={{
                    position: 'fixed',
                    top: hoverHintPosition.top,
                    left: hoverHintPosition.left,
                    zIndex: 11000,
                    width: 'min(320px, calc(100vw - 24px))',
                  }}
                  className="rounded-2xl border border-gray-200 bg-white/98 px-3.5 py-2.5 text-sm font-medium leading-snug text-gray-900 shadow-(--shadow-iwana-lg) ring-1 ring-black/5 backdrop-blur-md dark:border-dark-border dark:bg-dark-surface-2/98 dark:text-white dark:ring-white/10"
                  onMouseEnter={() => setHoverHintOpen(true)}
                  onMouseLeave={() => setHoverHintOpen(false)}
                >
                  {selectedLabel}
                </div>,
                document.body,
              )
            : null}
        </div>

        {error ? (
          <p id={`${selectId}-error`} className="text-xs text-iwana-error-700 dark:text-red-300">
            {error}
          </p>
        ) : null}
        {!error && helperText ? (
          <p id={`${selectId}-helper`} className="text-xs text-gray-500 dark:text-gray-400">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  },
);

Select.displayName = 'Select';

export { Select };
