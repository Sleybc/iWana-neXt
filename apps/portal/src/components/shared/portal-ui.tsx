import type { ComponentType, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleAlert, Info, Search } from 'lucide-react';
import { Input, cn } from '@iwana/ui';

export const interactiveFocusClassName =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-dark-surface-2';

export const portalTextareaClassName = cn(
  'portal-input-surface min-h-24 w-full px-3 py-2 text-sm text-gray-900 dark:text-white',
  interactiveFocusClassName,
);

export const portalTableRowHoverClassName =
  'transition-colors hover:bg-iwana-surface-soft/80 dark:hover:bg-dark-surface-3';

export const portalDataTableShellClassName =
  'overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-dark-border dark:bg-dark-surface-2';

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
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3', className)}
    />
  );
}
