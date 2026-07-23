'use client';

import {
  type ComponentType,
  type ReactNode,
  type ThHTMLAttributes,
  useCallback,
  useEffect,
  useId,
  useRef,
} from 'react';
import { AlertTriangle, CheckCircle2, CircleAlert, Info, Search } from 'lucide-react';
import { Button, Input, SkeletonBlock, cn, interactiveFocusClassName } from '@iwana/ui';

export { interactiveFocusClassName };

export const portalTextareaClassName = cn(
  'portal-input-surface min-h-24 w-full px-3 py-2 text-sm text-gray-900 dark:text-white',
  interactiveFocusClassName,
);

export const portalTableRowHoverClassName =
  'transition-colors hover:bg-iwana-surface-soft/80 dark:hover:bg-dark-surface-3';

export const portalDataTableShellClassName =
  'overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-dark-border dark:bg-dark-surface-2';

/** Encabezado de columna para tablas operativas del portal — alineado a `.portal-eyebrow-muted`. */
export const portalDataTableHeadClassName = 'px-4 py-3 text-left portal-eyebrow-muted';

/** Encabezado compacto para tablas anidadas o secundarias. */
export const portalDataTableNestedHeadClassName = 'px-3 py-2 text-left portal-eyebrow-muted';

/** Celda estándar para tablas operativas del portal. */
export const portalDataTableCellClassName =
  'px-4 py-3 align-middle text-sm text-gray-700 dark:text-gray-200';

export interface PortalDataTableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  children: ReactNode;
}

/** `<th>` operativo con `scope="col"` por construcción (SPEC-PORTAL-SIDEPEEK-A11Y §3). */
export function PortalDataTableHead({
  children,
  className,
  scope = 'col',
  ...props
}: PortalDataTableHeadProps) {
  return (
    <th scope={scope} className={cn(portalDataTableHeadClassName, className)} {...props}>
      {children}
    </th>
  );
}

interface PortalSearchFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

export function PortalSearchField({
  id,
  value,
  onChange,
  placeholder,
  label,
  className,
}: PortalSearchFieldProps) {
  return (
    <div className={cn('relative min-w-[200px]', className)}>
      <label htmlFor={id} className="sr-only">
        {label ?? placeholder ?? 'Buscar'}
      </label>
      <Search
        className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
        aria-hidden="true"
      />
      <Input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 pl-11"
      />
    </div>
  );
}

export const portalTabActiveClassName =
  'border-b-2 border-iwana-primary text-iwana-primary dark:text-iwana-secondary';

export const portalTabInactiveClassName =
  'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200';

/** Navegación modular agrupada — contenedor elevado con pista interna de alto contraste. */
export const portalModuleTabsShellClassName =
  'flex h-auto flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-border dark:bg-dark-surface-2 md:flex-row md:items-stretch md:gap-6';

export const portalModuleTabsGroupClassName = 'min-w-0 flex-1 space-y-2';

export const portalModuleTabsDividerClassName =
  'h-px w-full shrink-0 bg-gray-200 dark:bg-dark-border md:h-auto md:w-px md:self-stretch';

export const portalModuleTabsTrackClassName =
  'flex flex-wrap gap-1 rounded-xl bg-gray-100/90 p-1 dark:bg-dark-surface-3';

export const portalModuleTabTriggerClassName = cn(
  'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200',
  'data-[state=active]:bg-iwana-primary data-[state=active]:text-white data-[state=active]:shadow-sm',
  'dark:data-[state=active]:bg-iwana-primary dark:data-[state=active]:text-white',
  interactiveFocusClassName,
);

export type PortalMetricCardAccent = 'neutral' | 'primary' | 'warning' | 'danger';

export const portalMetricCardShellClassName =
  'flex h-full flex-col rounded-3xl border px-4 py-4 shadow-sm';

export function portalMetricCardAccentClassName(
  accent: PortalMetricCardAccent,
  options?: { isActive?: boolean; emphasized?: boolean },
): string {
  const base =
    accent === 'primary'
      ? 'border-iwana-primary/20 bg-iwana-primary-50/70 dark:border-iwana-primary-400/30 dark:bg-iwana-primary-900/15'
      : accent === 'warning'
        ? 'border-amber-200 bg-amber-50/80 dark:border-amber-500/20 dark:bg-amber-950/20'
        : accent === 'danger'
          ? 'border-rose-200 bg-rose-50/80 dark:border-rose-500/20 dark:bg-rose-950/20'
          : 'border-gray-200 bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-3';

  return cn(
    base,
    options?.isActive && 'ring-2 ring-iwana-primary/40',
    options?.emphasized && !options?.isActive && 'ring-2 ring-iwana-primary/25',
  );
}

/** Campo de formulario canónico del portal (input/select surface + foco). */
export const portalFieldClassName = cn(
  'portal-input-surface w-full px-3 py-2 text-sm text-gray-900 dark:text-white',
  interactiveFocusClassName,
);

export const portalSelectTriggerClassName = portalFieldClassName;

/** Chip de filtro (categoría / estado) — lima AA solo en activo. */
export function portalFilterChipClassName(active: boolean): string {
  return cn(
    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
    interactiveFocusClassName,
    active
      ? 'border-iwana-secondary-700 bg-iwana-secondary-50 text-iwana-secondary-700 dark:border-iwana-secondary dark:bg-iwana-secondary/15 dark:text-iwana-secondary-300'
      : 'border-gray-200 text-gray-600 hover:border-iwana-secondary/40 hover:text-iwana-primary dark:border-dark-border dark:text-gray-300',
  );
}

export const portalFilterChipCountClassName =
  'rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600 dark:bg-dark-surface-3 dark:text-gray-300';

export const portalFilterChipGroupClassName =
  'flex flex-wrap gap-2 rounded-2xl border border-gray-100 bg-white p-3 dark:border-dark-border dark:bg-dark-surface-2';

export const portalResultsStripClassName =
  'flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-gray-100 bg-iwana-surface-soft px-4 py-3 shadow-sm dark:border-dark-border dark:bg-dark-surface-3';

interface PortalMetricCardProps {
  eyebrow: string;
  value: ReactNode;
  total?: ReactNode | undefined;
  title: string;
  description?: ReactNode | undefined;
  accent?: PortalMetricCardAccent | undefined;
  emphasized?: boolean | undefined;
  isActive?: boolean | undefined;
  onClick?: (() => void) | undefined;
  className?: string | undefined;
  minHeightClassName?: string | undefined;
}

/** KPI card Firma §2.1 — eyebrow, cifra mono, título, descripción muted. */
export function PortalMetricCard({
  eyebrow,
  value,
  total,
  title,
  description,
  accent = 'neutral',
  emphasized = false,
  isActive = false,
  onClick,
  className,
  minHeightClassName = 'min-h-[148px]',
}: PortalMetricCardProps) {
  const shellClassName = cn(
    portalMetricCardShellClassName,
    minHeightClassName,
    portalMetricCardAccentClassName(accent, { emphasized, isActive }),
    onClick ? interactiveFocusClassName : null,
    className,
  );

  const body = (
    <>
      <p className="portal-eyebrow-muted">{eyebrow}</p>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-white">
        {value}
        {total !== undefined && total !== null && (
          <span className="ml-1 text-sm font-normal text-gray-500 dark:text-gray-400">
            / {total}
          </span>
        )}
      </p>
      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{title}</p>
      {description ? (
        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={cn(shellClassName, 'w-full text-left')} onClick={onClick}>
        {body}
      </button>
    );
  }

  return <article className={shellClassName}>{body}</article>;
}

interface PortalFilterChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: ReactNode | undefined;
  className?: string | undefined;
}

export function PortalFilterChip({
  active,
  onClick,
  children,
  count,
  className,
}: PortalFilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(portalFilterChipClassName(active), className)}
      aria-pressed={active}
    >
      {children}
      {count !== undefined && count !== null ? (
        <span className={portalFilterChipCountClassName}>{count}</span>
      ) : null}
    </button>
  );
}

interface PortalResultsStripProps {
  badge: ReactNode;
  className?: string | undefined;
}

export function PortalResultsStrip({ badge, className }: PortalResultsStripProps) {
  return <div className={cn(portalResultsStripClassName, className)}>{badge}</div>;
}

interface PortalSidePeekProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode | undefined;
  eyebrow?: string | undefined;
  children: ReactNode;
  footer?: ReactNode | undefined;
  className?: string | undefined;
}

const openSidePeekLayers: number[] = [];
let nextSidePeekLayerId = 0;

function registerOpenSidePeekLayer(layerId: number): void {
  if (!openSidePeekLayers.includes(layerId)) {
    openSidePeekLayers.push(layerId);
  }
}

function unregisterOpenSidePeekLayer(layerId: number): void {
  const index = openSidePeekLayers.lastIndexOf(layerId);
  if (index >= 0) {
    openSidePeekLayers.splice(index, 1);
  }
}

function isTopMostSidePeekLayer(layerId: number): boolean {
  return openSidePeekLayers[openSidePeekLayers.length - 1] === layerId;
}

/** Panel lateral de detalle/edición (Firma §2.7) — mantiene contexto de tabla. */
export function PortalSidePeek({
  open,
  onClose,
  title,
  description,
  eyebrow,
  children,
  footer,
  className,
}: PortalSidePeekProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const layerIdRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);

  if (layerIdRef.current === null) {
    nextSidePeekLayerId += 1;
    layerIdRef.current = nextSidePeekLayerId;
  }
  const layerId = layerIdRef.current;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const getFocusableElements = useCallback(() => {
    const container = panelRef.current;
    if (!container) {
      return [] as HTMLElement[];
    }

    return Array.from(
      container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute('disabled') && element.tabIndex !== -1);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusFrame = window.requestAnimationFrame(() => {
      const focusTarget = getFocusableElements()[0] ?? panelRef.current;
      focusTarget?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
    };
  }, [getFocusableElements, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopMostSidePeekLayer(layerId)) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const container = panelRef.current;
      if (!container) {
        return;
      }

      const focusableElements = getFocusableElements();

      if (focusableElements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (!firstElement || !lastElement) {
        return;
      }

      if (!activeElement || !container.contains(activeElement)) {
        event.preventDefault();
        firstElement.focus();
        return;
      }

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [getFocusableElements, layerId, open]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return;
    }

    registerOpenSidePeekLayer(layerId);
    document.body.classList.add('overflow-hidden');

    return () => {
      unregisterOpenSidePeekLayer(layerId);
      if (openSidePeekLayers.length === 0) {
        document.body.classList.remove('overflow-hidden');
      }

      const previousActiveElement = previousActiveElementRef.current;
      if (previousActiveElement?.isConnected) {
        previousActiveElement.focus();
      }
    };
  }, [layerId, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="presentation">
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/60"
        aria-hidden="true"
        onMouseDown={() => {
          if (!isTopMostSidePeekLayer(layerId)) {
            return;
          }
          onClose();
        }}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...(description ? { 'aria-describedby': descriptionId } : {})}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex h-full w-full max-w-lg flex-col border-l border-gray-200 bg-white shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2',
          className,
        )}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-dark-border">
          <div className="min-w-0">
            {eyebrow ? <p className="portal-eyebrow">{eyebrow}</p> : null}
            <h2
              id={titleId}
              className={cn(
                'text-base font-semibold text-gray-900 dark:text-white',
                eyebrow && 'mt-1',
              )}
            >
              {title}
            </h2>
            {description ? (
              <p
                id={descriptionId}
                className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400"
              >
                {description}
              </p>
            ) : null}
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Cerrar" onClick={onClose}>
            <span aria-hidden="true" className="text-lg leading-none">
              ×
            </span>
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="shrink-0 border-t border-gray-100 px-5 py-4 dark:border-dark-border">
            {footer}
          </footer>
        ) : null}
      </aside>
    </div>
  );
}

const panelBaseClassName =
  'rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-2';

type PortalAlertVariant = 'error' | 'warning' | 'success' | 'info';

interface PortalPanelProps {
  as?: 'div' | 'section';
  eyebrow?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  actions?: ReactNode | undefined;
  className?: string | undefined;
  headerClassName?: string | undefined;
  contentClassName?: string | undefined;
  children: ReactNode;
}

interface PortalSectionHeaderProps {
  eyebrow?: string | undefined;
  title: string;
  description?: string | undefined;
  actions?: ReactNode | undefined;
  className?: string | undefined;
}

interface PortalActionToolbarProps {
  children: ReactNode;
  className?: string | undefined;
  compact?: boolean | undefined;
  align?: 'start' | 'end' | undefined;
}

interface PortalAlertProps {
  variant: PortalAlertVariant;
  title: string;
  description?: ReactNode | undefined;
  action?: ReactNode | undefined;
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }> | undefined;
  className?: string | undefined;
}

interface PortalEmptyStateProps {
  title: string;
  description: ReactNode;
  action?: ReactNode | undefined;
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }> | undefined;
  className?: string | undefined;
}

interface PortalSkeletonBlockProps {
  className?: string | undefined;
}

const alertVariantStyles: Record<
  PortalAlertVariant,
  {
    root: string;
    iconWrap: string;
    iconColor: string;
    eyebrowColor: string;
    titleColor: string;
    bodyColor: string;
    defaultIcon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  }
> = {
  error: {
    root: 'border-red-200 bg-red-50/90 dark:border-red-900/70 dark:bg-red-950/30',
    iconWrap: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
    iconColor: 'text-red-600 dark:text-red-300',
    eyebrowColor: 'text-red-700 dark:text-red-300',
    titleColor: 'text-red-900 dark:text-red-100',
    bodyColor: 'text-red-700 dark:text-red-200/90',
    defaultIcon: CircleAlert,
  },
  warning: {
    root: 'border-amber-200 bg-amber-50/90 dark:border-amber-900/70 dark:bg-amber-950/25',
    iconWrap: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    iconColor: 'text-amber-600 dark:text-amber-300',
    eyebrowColor: 'text-amber-700 dark:text-amber-300',
    titleColor: 'text-amber-900 dark:text-amber-100',
    bodyColor: 'text-amber-800 dark:text-amber-200/90',
    defaultIcon: AlertTriangle,
  },
  success: {
    root: 'border-emerald-200 bg-emerald-50/90 dark:border-emerald-900/70 dark:bg-emerald-950/25',
    iconWrap: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    iconColor: 'text-emerald-600 dark:text-emerald-300',
    eyebrowColor: 'text-emerald-700 dark:text-emerald-300',
    titleColor: 'text-emerald-900 dark:text-emerald-100',
    bodyColor: 'text-emerald-800 dark:text-emerald-200/90',
    defaultIcon: CheckCircle2,
  },
  info: {
    root: 'border-gray-200 bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-3',
    iconWrap:
      'bg-iwana-primary/8 text-iwana-primary dark:bg-iwana-primary-400/20 dark:text-iwana-primary-300',
    iconColor: 'text-iwana-primary dark:text-iwana-primary-300',
    eyebrowColor: 'text-iwana-secondary-700 dark:text-iwana-secondary-400',
    titleColor: 'text-gray-900 dark:text-white',
    bodyColor: 'text-gray-600 dark:text-gray-300',
    defaultIcon: Info,
  },
};

export function PortalPanel({
  as = 'section',
  eyebrow,
  title,
  description,
  actions,
  className,
  headerClassName,
  contentClassName,
  children,
}: PortalPanelProps) {
  const Component = as;

  return (
    <Component className={cn(panelBaseClassName, 'p-5', className)}>
      {(eyebrow || title || description || actions) && (
        <div
          className={cn(
            'flex flex-col gap-3 border-b border-gray-100 pb-4 dark:border-dark-border',
            actions && 'md:flex-row md:items-start md:justify-between',
            headerClassName,
          )}
        >
          <div className="min-w-0">
            {eyebrow && <p className="portal-eyebrow">{eyebrow}</p>}
            {title && (
              <h2
                className={cn(
                  'text-base font-semibold text-gray-900 dark:text-white',
                  eyebrow && 'mt-1',
                )}
              >
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div
        className={cn(title || eyebrow || description || actions ? 'pt-4' : '', contentClassName)}
      >
        {children}
      </div>
    </Component>
  );
}

export function PortalSectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PortalSectionHeaderProps) {
  return (
    <div
      className={cn('flex flex-col gap-3 md:flex-row md:items-start md:justify-between', className)}
    >
      <div className="min-w-0">
        {eyebrow && <p className="portal-eyebrow">{eyebrow}</p>}
        <h2
          className={cn('text-base font-semibold text-gray-900 dark:text-white', eyebrow && 'mt-1')}
        >
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PortalActionToolbar({
  children,
  className,
  compact = false,
  align = 'start',
}: PortalActionToolbarProps) {
  return (
    <div
      className={cn(
        'flex w-full flex-col items-stretch rounded-2xl border border-gray-200/80 bg-iwana-surface-soft/90 p-1 dark:border-dark-border dark:bg-dark-surface-3/60 sm:w-auto sm:flex-row sm:items-center',
        compact ? 'gap-1' : 'gap-2',
        align === 'end' && 'sm:justify-end',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PortalAlert({
  variant,
  title,
  description,
  action,
  icon,
  className,
}: PortalAlertProps) {
  const styles = alertVariantStyles[variant];
  const Icon = icon ?? styles.defaultIcon;
  const liveRole = variant === 'error' || variant === 'warning' ? 'alert' : 'status';
  const liveMode = liveRole === 'alert' ? 'assertive' : 'polite';

  return (
    <div
      role={liveRole}
      aria-live={liveMode}
      aria-atomic="true"
      className={cn('flex items-start gap-3 rounded-2xl border px-4 py-3', styles.root, className)}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl',
          styles.iconWrap,
        )}
      >
        <Icon className={cn('h-5 w-5', styles.iconColor)} aria-hidden={true} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn('portal-eyebrow', styles.eyebrowColor)}>{title}</p>
        {description && (
          <div className="mt-1 space-y-2">
            <div className={cn('text-sm', styles.titleColor)}>{description}</div>
            {action && <div>{action}</div>}
          </div>
        )}
        {!description && action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

interface PortalSuccessAlertProps {
  /** Mensaje de éxito (preferido). */
  message?: string | undefined;
  /** Alias de `message` para migraciones desde PortalAlert. */
  description?: string | undefined;
  onDismiss: () => void;
  className?: string | undefined;
}

/** Alerta de éxito dismissible — carril rápido portal-local (no promover a @iwana/ui aún). */
export function PortalSuccessAlert({
  message,
  description,
  onDismiss,
  className,
}: PortalSuccessAlertProps) {
  const body = message ?? description;
  if (!body) {
    return null;
  }

  return (
    <PortalAlert
      variant="success"
      title="Operación completada"
      description={body}
      icon={CheckCircle2}
      {...(className ? { className } : {})}
      action={
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          Cerrar
        </Button>
      }
    />
  );
}

export function PortalEmptyState({
  title,
  description,
  action,
  icon: Icon = Info,
  className,
}: PortalEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-2xl border border-gray-200 bg-iwana-surface-soft px-4 py-4 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300',
        className,
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-iwana-primary/8 text-iwana-primary dark:bg-iwana-primary-400/20 dark:text-iwana-primary-300">
        <Icon className="h-5 w-5" aria-hidden={true} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900 dark:text-white">{title}</p>
        <div className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</div>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

export function PortalSkeletonBlock({ className }: PortalSkeletonBlockProps) {
  return <SkeletonBlock className={className} />;
}

/** Footer sticky compartido en flujos create-mode (compras, salidas, recepciones). */
export const createModeStickyFooterClassName =
  'sticky bottom-0 z-20 rounded-2xl border border-gray-200 bg-iwana-surface-soft px-4 py-3 shadow-sm dark:border-dark-border dark:bg-dark-surface-3';

export interface CreateModeSummaryFooterProps {
  title?: string;
  summary: string;
  secondaryAction?: ReactNode;
  primaryLabel: string;
  primaryLoadingLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  onPrimaryClick: () => void;
}

export function CreateModeSummaryFooter({
  title = 'Resumen previo al envío',
  summary,
  secondaryAction,
  primaryLabel,
  primaryLoadingLabel,
  loading = false,
  disabled = false,
  onPrimaryClick,
}: CreateModeSummaryFooterProps) {
  return (
    <div className={cn(createModeStickyFooterClassName, 'text-sm')}>
      <p className="font-medium text-gray-900 dark:text-white">{title}</p>
      <p className="mt-1 text-gray-600 tabular-nums dark:text-gray-300">{summary}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {secondaryAction}
        <Button
          type="button"
          loading={loading}
          disabled={disabled || loading}
          onClick={onPrimaryClick}
        >
          {loading && primaryLoadingLabel ? primaryLoadingLabel : primaryLabel}
        </Button>
      </div>
    </div>
  );
}

export interface CreateModeMobileStepIndicatorProps {
  currentStep: number;
  totalSteps?: number;
}

export function CreateModeMobileStepIndicator({
  currentStep,
  totalSteps = 2,
}: CreateModeMobileStepIndicatorProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-iwana-surface-soft px-4 py-3 text-sm font-medium text-gray-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200">
      Paso {currentStep} de {totalSteps}
    </div>
  );
}

export interface CreateModeMobileCaptureFooterProps {
  summary: string;
  reviewLabel?: string;
  disabled?: boolean;
  onReview: () => void;
}

export function CreateModeMobileCaptureFooter({
  summary,
  reviewLabel = 'Revisar selección',
  disabled = false,
  onReview,
}: CreateModeMobileCaptureFooterProps) {
  return (
    <div className={createModeStickyFooterClassName}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-600 dark:text-gray-300">{summary}</p>
        <Button type="button" disabled={disabled} onClick={onReview}>
          {reviewLabel}
        </Button>
      </div>
    </div>
  );
}
