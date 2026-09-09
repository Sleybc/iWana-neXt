'use client';

import {
  Fragment,
  type ComponentType,
  type ReactNode,
  type Ref,
  type ThHTMLAttributes,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Info,
  Search,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  ModalLayer,
  Select,
  SkeletonBlock,
  cn,
  interactiveFocusClassName,
  overlayEdgeClassName,
} from '@iwana/ui';
import {
  usePortalModalDrawerBroadcast,
  usePortalModalDrawerOpen,
} from './use-portal-modal-drawer-broadcast';
import { PORTAL_DEFAULT_PAGE_SIZE, PORTAL_PAGE_SIZE_OPTIONS } from '@/lib/portal-page-size';
import type { PortalSortDirection } from '@/lib/use-table-query-state';

export { interactiveFocusClassName };
export { PORTAL_DEFAULT_PAGE_SIZE, PORTAL_PAGE_SIZE_OPTIONS };
export type { PortalSortDirection };

export const portalTextareaClassName = cn(
  'portal-input-surface min-h-24 w-full px-3 py-2 text-sm text-gray-900 dark:text-white',
  interactiveFocusClassName,
);

export const portalTableRowHoverClassName =
  'transition-colors hover:bg-iwana-surface-soft/80 dark:hover:bg-dark-surface-3';

export const portalDataTableShellClassName =
  'overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-dark-border dark:bg-dark-surface-2';

/** Fila `<thead>` / `<tr>` de tablas operativas (fondo soft). */
export const portalDataTableHeadRowClassName =
  'border-b border-gray-100 bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-3';

/** Cuerpo `<tbody>` — divisores soft (alineados a `border-gray-100` del thead); fondo opaco = shell. */
export const portalDataTableBodyClassName =
  'divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface-2';

/**
 * Fila inactiva (`!isActive`) — estado NO exento (contrato de estados atenuados
 * §4.3, docs/specs/2026-07-26-estados-atenuados-contraste-ds-contrato.md):
 * escalón de token aplicado sobre los `<td>`, NUNCA opacidad (la opacidad
 * compone el texto contra el fondo y destruye el contraste, §3). El estado lo
 * confirma además el `Badge` de la columna de estado (SC 1.4.1).
 * La variante `[&_td]:` es obligatoria: cada `<td>` fija su propio token de
 * texto, así que un token sobre el `<tr>` no tendría efecto (§3.3).
 */
export const portalDataTableInactiveRowClassName = '[&_td]:text-gray-500 dark:[&_td]:text-gray-400';

/**
 * Atenuación única del sistema para controles `disabled` (§4.1 del mismo
 * contrato): `opacity-50` sobre el token normal del control, nunca apilada
 * sobre un token de texto ya atenuado. Exige `disabled` o `aria-disabled`
 * declarado en el DOM; sin eso el estado no está exento de contraste.
 */
export const portalDisabledControlClassName = 'opacity-50';

/**
 * Región de datos durante la carga (`refreshing`/`aria-busy`) — estado NO
 * exento (§4.2 del mismo contrato): la señal la portan los controles
 * `disabled`, `aria-busy="true"`, el anuncio `aria-live` y este cursor.
 * PROHIBIDO aplicar `opacity-*` a esta región: el texto debe permanecer en su
 * token pleno. Si el contenido debe ceder visiblemente, se sustituye por
 * `SkeletonBlock`, nunca se atenúa.
 */
export const portalDataBusyRegionClassName = 'cursor-progress';

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

export interface PortalDataTableSortableHeadProps extends Omit<
  PortalDataTableHeadProps,
  'onClick' | 'children'
> {
  /** Campo lógico de esta columna; debe estar en meta.capabilities.sortableFields. */
  field: string;
  /** Rótulo visible; alimenta también el nombre accesible del botón. */
  children: ReactNode;
  /** Orden vigente de la tabla; null = orden por defecto del recurso. */
  activeSort: { by: string; dir: PortalSortDirection } | null;
  /** `null` = tercer paso del ciclo: volver al orden por defecto. */
  onSortChange: (next: { by: string; dir: PortalSortDirection } | null) => void;
  /** Orden en vuelo: control disabled. Default false. */
  loading?: boolean | undefined;
  /** Alineación del contenido; en columnas numéricas el control va a la derecha. */
  align?: 'left' | 'right' | undefined;
}

function sortableLabelText(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  return 'columna';
}

function nextSortState(
  field: string,
  activeSort: { by: string; dir: PortalSortDirection } | null,
): { by: string; dir: PortalSortDirection } | null {
  if (activeSort?.by !== field) {
    return { by: field, dir: 'asc' };
  }
  if (activeSort.dir === 'asc') {
    return { by: field, dir: 'desc' };
  }
  return null;
}

function sortButtonAccessibleName(label: string, activeDir: PortalSortDirection | null): string {
  if (activeDir === 'asc') return `Ordenar por ${label}, descendente`;
  if (activeDir === 'desc') return `Quitar orden por ${label}`;
  return `Ordenar por ${label}, ascendente`;
}

function useMinWidth(query: string, serverSnapshot = true): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => undefined;
      }
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(query).matches,
    () => serverSnapshot,
  );
}

function useMinWidthSm(): boolean {
  return useMinWidth('(min-width: 640px)');
}

function useMinWidthLg(): boolean {
  return useMinWidth('(min-width: 1024px)');
}

/**
 * Encabezado ordenable (ADR-065 §5-bis). Extiende `PortalDataTableHead`;
 * el ciclo `sin orden → asc → desc → sin orden` lo calcula el primitive.
 * Bajo `sm` el botón no se renderiza (orden vía Select en barra de filtros).
 */
export function PortalDataTableSortableHead({
  field,
  children,
  activeSort,
  onSortChange,
  loading = false,
  align = 'left',
  className,
  ...props
}: PortalDataTableSortableHeadProps) {
  const isSmUp = useMinWidthSm();
  const label = sortableLabelText(children);
  const isActive = activeSort?.by === field;
  const activeDir = isActive ? activeSort.dir : null;
  const ariaSort = isActive ? (activeDir === 'asc' ? 'ascending' : 'descending') : 'none';
  const Icon = activeDir === 'desc' ? ChevronDown : ChevronUp;

  if (!isSmUp) {
    return (
      <PortalDataTableHead
        aria-sort={ariaSort}
        className={cn(align === 'right' ? 'text-right' : undefined, className)}
        {...props}
      >
        {children}
      </PortalDataTableHead>
    );
  }

  return (
    <PortalDataTableHead
      aria-sort={ariaSort}
      className={cn(align === 'right' ? 'text-right' : undefined, className)}
      {...props}
    >
      <button
        type="button"
        className={cn(
          'group inline-flex h-full min-h-11 w-full items-center justify-start gap-1.5 rounded-lg text-left transition-colors',
          interactiveFocusClassName,
          'disabled:pointer-events-none disabled:opacity-50',
          align === 'right' && 'justify-end flex-row-reverse text-right',
          isActive
            ? 'font-semibold text-iwana-primary dark:text-white'
            : 'hover:text-iwana-primary dark:hover:text-white',
        )}
        disabled={loading}
        aria-label={sortButtonAccessibleName(label, activeDir)}
        onClick={() => onSortChange(nextSortState(field, activeSort))}
      >
        <span>{children}</span>
        <Icon
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            isActive
              ? 'text-iwana-primary dark:text-white'
              : 'text-gray-300 group-hover:text-iwana-primary dark:text-dark-border-2',
          )}
          aria-hidden="true"
        />
      </button>
    </PortalDataTableHead>
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

/** Subrayado lima de «estoy aquí» (firma #1) para tiras de tabs, no fill navy. */
export const portalTabLimeActiveClassName =
  'border-b-2 border-iwana-secondary text-iwana-primary dark:border-iwana-secondary dark:text-iwana-primary-200';

export const portalTabInactiveClassName =
  'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200';

/** Subtabs de un mismo recurso (receta Oportunidades): tira + borde inferior, no pista navy. */
export const portalResourceTabListClassName =
  'flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-gray-100 bg-transparent p-0 shadow-none dark:border-dark-border';

export function portalResourceTabTriggerClassName(active: boolean): string {
  return cn(
    'flex min-h-11 items-center gap-2 rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-sm font-medium shadow-none',
    'data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent',
    interactiveFocusClassName,
    active ? portalTabLimeActiveClassName : portalTabInactiveClassName,
  );
}

export function portalResourceTabIconClassName(active: boolean): string {
  return active
    ? 'h-4 w-4 shrink-0 text-iwana-secondary-700 dark:text-iwana-secondary'
    : 'h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500';
}

/** Navegación modular agrupada — contenedor elevado con pista interna de alto contraste. */
export const portalModuleTabsShellClassName =
  'flex h-auto flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-border dark:bg-dark-surface-2 md:flex-row md:items-stretch md:gap-6';

export const portalModuleTabsGroupClassName = 'min-w-0 flex-1 space-y-2';

export const portalModuleTabsDividerClassName =
  'h-px w-full shrink-0 bg-gray-200 dark:bg-dark-border md:h-auto md:w-px md:self-stretch';

export const portalModuleTabsTrackClassName =
  'flex flex-wrap items-center gap-1 rounded-xl bg-gray-100/90 p-1 dark:bg-dark-surface-3';

/** Píldora inset en la pista (`rounded-lg` + `p-1`). Activo = navy, no lima. */
export const portalModuleTabTriggerClassName = cn(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
  'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200',
  'data-[state=active]:bg-iwana-primary data-[state=active]:text-white data-[state=active]:shadow-sm',
  'dark:data-[state=active]:bg-iwana-primary dark:data-[state=active]:text-white',
  interactiveFocusClassName,
);

export type PortalMetricCardAccent = 'neutral' | 'primary' | 'warning' | 'danger';

export const portalMetricCardShellClassName =
  'flex h-full flex-col rounded-3xl border px-4 py-4 shadow-iwana-soft';

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

/** Eyebrow de métrica — tipografía muted; color por matriz DS §1.7. */
export function portalMetricEyebrowClassName(accent: PortalMetricCardAccent = 'neutral'): string {
  return cn(
    'portal-eyebrow-muted',
    (accent === 'danger' || accent === 'warning') && 'text-gray-700 dark:text-gray-200',
  );
}

/**
 * Texto muted de cuerpo en métrica (description y afines) — DS §1.7 v1.2.
 * Mismo escalón que el eyebrow sobre shells `danger`/`warning`.
 */
export function portalMetricMutedTextClassName(accent: PortalMetricCardAccent = 'neutral'): string {
  return accent === 'danger' || accent === 'warning'
    ? 'text-gray-700 dark:text-gray-200'
    : 'text-gray-500 dark:text-gray-400';
}

/** Enlace de texto secundario del portal (CTAs «Ver más») — par dark AA + anillo iWana. */
export const portalInlineTextLinkClassName = cn(
  'inline-flex min-h-11 items-center text-sm font-medium text-iwana-primary underline-offset-4 hover:underline dark:text-iwana-primary-300',
  interactiveFocusClassName,
);

/** Campo de formulario canónico del portal (input/select surface + foco). */
export const portalFieldClassName = cn(
  'portal-input-surface w-full px-3 py-2 text-sm text-gray-900 dark:text-white',
  interactiveFocusClassName,
);

export const portalSelectTriggerClassName = portalFieldClassName;

/** Checkbox de formulario del portal — acento iWana (lima solo si el contrato lo exige). */
export const portalCheckboxClassName = cn(
  'h-4 w-4 shrink-0 accent-iwana-primary dark:accent-iwana-secondary',
  interactiveFocusClassName,
);

/** Superficie "well" para sub-bloques dentro de un PortalPanel (estado/selector/form). */
export const portalWellClassName =
  'rounded-2xl border border-gray-200 bg-iwana-surface-soft px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3';

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
  'flex flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-iwana-surface-soft px-4 py-3 shadow-sm dark:border-dark-border dark:bg-dark-surface-3';

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
      <p className={portalMetricEyebrowClassName(accent)}>{eyebrow}</p>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-white">
        {value}
        {total !== undefined && total !== null && (
          <span className={cn('ml-1 text-sm font-normal', portalMetricMutedTextClassName(accent))}>
            / {total}
          </span>
        )}
      </p>
      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{title}</p>
      {description ? (
        <p className={cn('mt-1 text-sm leading-6', portalMetricMutedTextClassName(accent))}>
          {description}
        </p>
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

export type PortalDashboardMetricState = 'idle' | 'loading' | 'error';

/** Tono del delta. `progress` es la ÚNICA puerta al lima en este componente. */
export type PortalDashboardMetricDeltaTone = 'progress' | 'neutral' | 'warning' | 'danger';

export interface PortalDashboardMetricDelta {
  /** Texto ya legible. Nunca un enum ni un signo suelto. */
  label: string;
  tone: PortalDashboardMetricDeltaTone;
}

interface PortalDashboardMetricBaseProps {
  /**
   * Ranura 1 — categoría del indicador (opcional, DS v1.3 / B-1).
   * Omitida o vacía → no se renderiza la ranura; el resto del orden se mantiene.
   */
  eyebrow?: string;
  /** Ranura 3 — rótulo legible; nombre accesible. */
  label: string;
  /**
   * Ranura 2. `null` = no hay fuente para este número.
   * NUNCA se sustituye por 0 ni por un guion.
   */
  value: number | null;
  /** Denominador opcional. Si `value` es null, no se renderiza. */
  total?: number | null;
  /** Texto de la ranura de cifra cuando `value === null`. */
  emptyLabel?: string;
  /** Override de formato. Default: miles es-CO sin decimales. */
  formatValue?: (value: number) => string;
  /** Ranura 5. */
  description?: ReactNode;
  /** Superficie del acento. Sin casilla lima. */
  accent?: PortalMetricCardAccent;
  /** Ranura 4 — badge tonal. */
  delta?: PortalDashboardMetricDelta;
  /** Ciclo de vida del bloque. */
  state?: PortalDashboardMetricState;
  /** Texto visible en la cifra cuando `state === 'error'`. */
  errorLabel?: string;
  /** Acción de recuperación. Solo con `state === 'error'`. */
  onRetry?: () => void;
  /** Ícono decorativo; tono derivado de `accent`. */
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /**
   * Serie real para sparkline. Omitida, vacía o con <2 puntos → no se pinta trazo.
   * Prohibido interpolar o inventar valores.
   */
  sparkline?: readonly number[];
  /**
   * Densidad de cáscara (DS v1.7 / UX U-D3). `'default'` = póster v1.4 (Assurance).
   * `'compact'` = KPI vertical min-h-28, cifra title — solo home B1.
   */
  density?: 'default' | 'compact';
  className?: string;
}

export type PortalDashboardMetricProps = PortalDashboardMetricBaseProps &
  (
    | { href: string; onClick?: never }
    | { onClick: () => void; href?: never }
    | { href?: never; onClick?: never }
  );

const portalDashboardMetricIconToneClassName: Record<PortalMetricCardAccent, string> = {
  neutral: 'bg-white text-gray-500 dark:bg-dark-surface-4 dark:text-gray-300',
  primary:
    'bg-iwana-primary-50 text-iwana-primary dark:bg-iwana-primary-800/40 dark:text-iwana-primary-200',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  danger: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
};

const portalDashboardMetricDeltaBadgeVariant: Record<
  PortalDashboardMetricDeltaTone,
  'lime' | 'neutral' | 'warning' | 'error'
> = {
  progress: 'lime',
  neutral: 'neutral',
  warning: 'warning',
  danger: 'error',
};

const defaultPortalDashboardMetricFormat = (value: number) =>
  new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);

function PortalMetricSparkline({ values }: { values: readonly number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const width = 72;
  const height = 28;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-2 h-7 w-[4.5rem] text-iwana-primary dark:text-iwana-primary-200"
      aria-hidden={true}
      data-testid="portal-metric-sparkline"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

/** Indicador del home del portal — contrato DS §1 (sin acento lima). */
export function PortalDashboardMetric({
  eyebrow,
  label,
  value,
  total,
  emptyLabel = 'Sin dato disponible',
  formatValue = defaultPortalDashboardMetricFormat,
  description,
  accent = 'neutral',
  delta,
  href,
  onClick,
  state = 'idle',
  errorLabel = 'No disponible',
  onRetry,
  icon: Icon,
  density = 'default',
  sparkline,
  className,
}: PortalDashboardMetricProps) {
  const isInteractive = Boolean(href || onClick);
  const isLoading = state === 'loading';
  const isError = state === 'error';
  const isCompact = density === 'compact';

  const shellClassName = cn(
    'flex flex-col justify-center border px-4 py-3 shadow-iwana-soft',
    isCompact ? 'min-h-28 rounded-2xl' : 'min-h-24 rounded-3xl',
    portalMetricCardAccentClassName(accent),
    isInteractive && interactiveFocusClassName,
    isInteractive && 'transition-shadow hover:shadow-iwana-active',
    className,
  );

  const valueClassName = isCompact
    ? 'mt-0.5 font-thin-exo text-3xl tabular-nums tracking-tight text-iwana-primary dark:text-white'
    : 'mt-0.5 font-mono text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-white';

  let valueSlot: ReactNode;
  if (isLoading) {
    valueSlot = <SkeletonBlock className="mt-0.5 h-8 w-28 rounded-lg" />;
  } else if (isError) {
    valueSlot = (
      <div className="mt-0.5 space-y-2">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{errorLabel}</p>
        {onRetry ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        ) : null}
      </div>
    );
  } else if (value === null) {
    valueSlot = (
      <p className="mt-0.5 text-sm font-semibold text-gray-700 dark:text-gray-200">{emptyLabel}</p>
    );
  } else {
    valueSlot = (
      <p className={valueClassName}>
        {formatValue(value)}
        {total !== undefined && total !== null ? (
          <span className={cn('ml-1 text-sm font-normal', portalMetricMutedTextClassName(accent))}>
            / {formatValue(total)}
          </span>
        ) : null}
      </p>
    );
  }

  const iconClearanceClassName = Icon ? 'pr-10' : undefined;

  const eyebrowText = eyebrow?.trim() ?? '';
  const showEyebrow = eyebrowText.length > 0 && !isCompact;

  const body = (
    <div className="relative flex flex-col justify-center">
      {Icon ? (
        <span
          className={cn(
            'absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-2xl',
            portalDashboardMetricIconToneClassName[accent],
          )}
        >
          <Icon className="h-4 w-4" aria-hidden={true} />
        </span>
      ) : null}
      {showEyebrow ? (
        <p className={cn(portalMetricEyebrowClassName(accent), iconClearanceClassName)}>
          {eyebrowText}
        </p>
      ) : null}
      <div className={cn(!showEyebrow && iconClearanceClassName)}>{valueSlot}</div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
        {delta ? (
          <Badge variant={portalDashboardMetricDeltaBadgeVariant[delta.tone]}>{delta.label}</Badge>
        ) : null}
      </div>
      {description ? (
        <div
          className={cn(
            isCompact ? 'sr-only' : 'mt-0.5 text-sm leading-5',
            portalMetricMutedTextClassName(accent),
          )}
        >
          {description}
        </div>
      ) : null}
      {sparkline && sparkline.length >= 2 ? <PortalMetricSparkline values={sparkline} /> : null}
    </div>
  );

  if (href && !(isError && onRetry)) {
    return (
      <Link
        href={href}
        aria-label={label}
        aria-busy={isLoading || undefined}
        className={cn(shellClassName, 'block w-full text-left')}
      >
        {body}
      </Link>
    );
  }

  if (onClick && !(isError && onRetry)) {
    return (
      <button
        type="button"
        aria-label={label}
        aria-busy={isLoading || undefined}
        className={cn(shellClassName, 'w-full text-left')}
        onClick={onClick}
      >
        {body}
      </button>
    );
  }

  return (
    <article aria-busy={isLoading || undefined} className={shellClassName}>
      {body}
    </article>
  );
}

export type PortalModuleHealthStatus = 'ok' | 'attention' | 'at-risk' | 'unknown';
export type PortalModuleHealthChipState = 'idle' | 'loading' | 'error';

const portalModuleHealthBadge: Record<
  PortalModuleHealthStatus,
  { label: string; variant: 'lime' | 'warning' | 'error' | 'neutral' }
> = {
  ok: { label: 'Al día', variant: 'lime' },
  attention: { label: 'Atención', variant: 'warning' },
  'at-risk': { label: 'En riesgo', variant: 'error' },
  unknown: { label: 'Sin dato', variant: 'neutral' },
};

export const portalModuleHealthChipShellClassName = cn(
  'flex min-h-11 w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2',
  'text-left shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2',
);

const defaultPortalModuleHealthFormat = (value: number) =>
  new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);

export interface PortalModuleHealthChipProps {
  label: string;
  status: PortalModuleHealthStatus;
  /** Solo señal (Atención / En riesgo). `null` = no se pinta cifra. */
  value?: number | null;
  formatValue?: (value: number) => string;
  state?: PortalModuleHealthChipState;
  href?: string;
  onClick?: () => void;
  onRetry?: () => void;
  className?: string;
}

/** Chip de mapa de módulo — B1b del inicio. No es una card de KPI. */
export function PortalModuleHealthChip({
  label,
  status,
  value = null,
  formatValue = defaultPortalModuleHealthFormat,
  state = 'idle',
  href,
  onClick,
  onRetry,
  className,
}: PortalModuleHealthChipProps) {
  const isLoading = state === 'loading';
  const isError = state === 'error';
  const badge = portalModuleHealthBadge[isError ? 'unknown' : status];
  const showValue =
    !isLoading && !isError && (status === 'attention' || status === 'at-risk') && value != null;
  const accessibleName = showValue
    ? `${label}, ${badge.label}, ${formatValue(value)}`
    : `${label}, ${badge.label}`;
  const isInteractive = Boolean(href || onClick) && !isError;

  const shellClassName = cn(
    portalModuleHealthChipShellClassName,
    isInteractive && interactiveFocusClassName,
    isInteractive && 'transition-shadow hover:shadow-iwana-active',
    className,
  );

  const body = isLoading ? (
    <>
      <SkeletonBlock className="h-4 w-28 rounded-md" />
      <SkeletonBlock className="ml-auto h-5 w-16 rounded-full" />
    </>
  ) : (
    <>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-white">
        {label}
      </span>
      {showValue ? (
        <span className="font-mono text-sm font-semibold tabular-nums text-iwana-primary dark:text-iwana-primary-200">
          {formatValue(value)}
        </span>
      ) : null}
      <Badge variant={badge.variant}>{badge.label}</Badge>
      {isError && onRetry ? (
        <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden={true} />
      )}
    </>
  );

  if (href && isInteractive) {
    return (
      <Link
        href={href}
        aria-label={accessibleName}
        aria-busy={isLoading || undefined}
        className={shellClassName}
      >
        {body}
      </Link>
    );
  }

  if (onClick && isInteractive) {
    return (
      <button
        type="button"
        aria-label={accessibleName}
        aria-busy={isLoading || undefined}
        className={shellClassName}
        onClick={onClick}
      >
        {body}
      </button>
    );
  }

  return (
    <article aria-busy={isLoading || undefined} className={shellClassName}>
      {isError ? (
        <>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-white">
            {label}
          </span>
          <Badge variant="neutral">Sin dato</Badge>
          {onRetry ? (
            <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
              Reintentar
            </Button>
          ) : null}
        </>
      ) : (
        body
      )}
    </article>
  );
}

interface PortalNavListRowBaseProps {
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export type PortalNavListRowProps = PortalNavListRowBaseProps &
  (
    | { href: string; onClick?: never }
    | { onClick: () => void; href?: never }
    | { href?: never; onClick?: never }
  );

export const portalNavListRowClassName = cn(
  'flex min-h-11 items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2.5',
  'dark:border-dark-border',
);

const portalNavListRowInteractiveClassName = cn(
  'hover:border-iwana-primary hover:bg-iwana-primary-50',
  'dark:hover:border-iwana-primary-300 dark:hover:bg-iwana-primary/10',
  interactiveFocusClassName,
);

export function PortalNavListRow({
  title,
  meta,
  trailing,
  onClick,
  href,
  disabled = false,
  className,
  'aria-label': ariaLabel,
}: PortalNavListRowProps) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900 dark:text-white">{title}</p>
        {meta != null && meta !== false ? (
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{meta}</p>
        ) : null}
      </div>
      {trailing != null ? (
        <span className="shrink-0 text-sm font-medium text-iwana-secondary-700 dark:text-iwana-primary-300">
          {trailing}
        </span>
      ) : null}
    </>
  );

  if (href && !disabled) {
    return (
      <Link
        href={href}
        aria-label={ariaLabel}
        className={cn(
          portalNavListRowClassName,
          portalNavListRowInteractiveClassName,
          'w-full text-left',
          className,
        )}
      >
        {body}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(
          portalNavListRowClassName,
          portalNavListRowInteractiveClassName,
          'w-full text-left',
          disabled && portalDisabledControlClassName,
          className,
        )}
        onClick={onClick}
      >
        {body}
      </button>
    );
  }

  return <div className={cn(portalNavListRowClassName, className)}>{body}</div>;
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
  /** Controles a la izquierda (modo paginado cede el conteo). Sin `controls` → `justify-end`. */
  controls?: ReactNode | undefined;
  className?: string | undefined;
}

export function PortalResultsStrip({ badge, controls, className }: PortalResultsStripProps) {
  return (
    <div
      className={cn(
        portalResultsStripClassName,
        controls != null ? 'justify-between' : 'justify-end',
        className,
      )}
    >
      {controls != null ? (
        <div className="flex min-w-0 flex-wrap items-center gap-3">{controls}</div>
      ) : null}
      {badge}
    </div>
  );
}

/** Footer de tabla operativa (ADR-064): solo «Cargar más» si hay más páginas. */
export interface PortalTablePaginationProps {
  hasMore: boolean;
  onLoadMore: () => void;
  loading: boolean;
  /** Vocabulario del recurso para aria / sr-only (p. ej. «usuarios»). */
  resourceLabel?: string | undefined;
  className?: string | undefined;
  /** Texto del CTA; default «Cargar más». */
  loadMoreLabel?: string | undefined;
  /** Conteo cargado — solo sr-only / aria-live; no pintar en el pie. */
  shown?: number | undefined;
  /** Total del listado — solo sr-only / aria-live; no pintar en el pie. */
  total?: number | undefined;
}

export function PortalTablePagination({
  hasMore,
  onLoadMore,
  loading,
  resourceLabel,
  className,
  loadMoreLabel = 'Cargar más',
  shown,
  total,
}: PortalTablePaginationProps) {
  if (!hasMore) {
    return null;
  }

  const hasCounts = typeof shown === 'number' && typeof total === 'number';
  const liveStatus = hasCounts
    ? resourceLabel
      ? `Mostrando ${shown} de ${total} ${resourceLabel}`
      : `Mostrando ${shown} de ${total}`
    : null;

  return (
    <div
      className={cn(
        'flex items-center justify-center border-t border-gray-100 px-5 py-4 dark:border-dark-border',
        className,
      )}
    >
      {liveStatus ? (
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {liveStatus}
        </p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="min-h-11"
        onClick={onLoadMore}
        disabled={loading}
        loading={loading}
      >
        {loadMoreLabel}
      </Button>
    </div>
  );
}

export interface PortalTablePagerLabels {
  previous: string;
  next: string;
  page: (n: number) => string;
  position: (p: number, c: number) => string;
  nav: (resource?: string) => string;
}

/** Sustantivo del recurso en singular y plural, minúscula. */
export interface PortalResourceNoun {
  singular: string;
  plural: string;
}

/** Densidad del pager: `default` = tablas operativas ADR-065; `compact` = paneles embebidos. */
export type PortalPagerDensity = 'default' | 'compact';

export interface PortalTablePagerProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  from: number;
  to: number;
  total: number;
  resource: PortalResourceNoun;
  totalIsEstimate?: boolean | undefined;
  loading?: boolean | undefined;
  siblingCount?: number | undefined;
  boundaryCount?: number | undefined;
  pageSizeControl?: ReactNode | undefined;
  labels?: Partial<PortalTablePagerLabels> | undefined;
  className?: string | undefined;
  /**
   * `default` (h-11) para tablas operativas; `compact` (h-8) solo paneles
   * embebidos densos (bitácora, peeks). No rebaja el target 44 px del default.
   */
  density?: PortalPagerDensity | undefined;
}

const DEFAULT_PAGER_LABELS: PortalTablePagerLabels = {
  previous: 'Anterior',
  next: 'Siguiente',
  page: (n) => `Página ${n}`,
  position: (p, c) => `Página ${p} de ${c}`,
  nav: (r) => (r ? `Paginación de ${r}` : 'Paginación'),
};

function formatEsInt(n: number): string {
  return n.toLocaleString('es-CO');
}

function formatPagerCount(options: {
  from: number;
  to: number;
  total: number;
  pageCount: number;
  resource: PortalResourceNoun;
  totalIsEstimate: boolean;
}): string {
  const { from, to, total, pageCount, resource, totalIsEstimate } = options;
  if (total === 1) return `${from}\u2013${to} de 1 ${resource.singular}`;
  if (pageCount <= 1) return `${formatEsInt(total)} ${resource.plural}`;
  if (totalIsEstimate) {
    return `Mostrando ${from}\u2013${to} de más de ${formatEsInt(total)} ${resource.plural}`;
  }
  return `Mostrando ${from}\u2013${to} de ${formatEsInt(total)} ${resource.plural}`;
}

type PageWindowItem = number | 'ellipsis';

/** Ventana de páginas con elipsis (máx. ~7 slots con defaults). */
export function buildPageWindow(
  page: number,
  pageCount: number,
  siblingCount = 1,
  boundaryCount = 1,
): PageWindowItem[] {
  const siblings = Math.min(2, Math.max(0, siblingCount));
  const boundaries = Math.min(2, Math.max(1, boundaryCount));
  if (pageCount <= 0) return [];

  const totalNumbers = siblings * 2 + boundaries * 2 + 3;
  if (pageCount <= totalNumbers) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const startPages = Array.from({ length: boundaries }, (_, i) => i + 1);
  const endPages = Array.from({ length: boundaries }, (_, i) => pageCount - boundaries + 1 + i);
  const leftSibling = Math.max(page - siblings, boundaries + 1);
  const rightSibling = Math.min(page + siblings, pageCount - boundaries);
  const showLeftEllipsis = leftSibling > boundaries + 2;
  const showRightEllipsis = rightSibling < pageCount - (boundaries + 1);

  const items: PageWindowItem[] = [...startPages];

  if (!showLeftEllipsis && !showRightEllipsis) {
    for (let n = boundaries + 1; n <= pageCount - boundaries; n += 1) items.push(n);
  } else if (!showLeftEllipsis) {
    const rightLimit = Math.min(pageCount - boundaries, boundaries + siblings * 2 + 2);
    for (let n = boundaries + 1; n <= rightLimit; n += 1) items.push(n);
    items.push('ellipsis');
    items.push(...endPages);
    return items;
  } else if (!showRightEllipsis) {
    items.push('ellipsis');
    const leftStart = Math.max(boundaries + 1, pageCount - boundaries - (siblings * 2 + 1));
    for (let n = leftStart; n <= pageCount - boundaries; n += 1) items.push(n);
    items.push(...endPages);
    return items;
  } else {
    items.push('ellipsis');
    for (let n = leftSibling; n <= rightSibling; n += 1) items.push(n);
    items.push('ellipsis');
    items.push(...endPages);
    return items;
  }

  items.push(...endPages);
  return items;
}

const pageButtonInactiveClassName = cn(
  'text-gray-700 hover:bg-iwana-surface-soft hover:text-iwana-primary',
  'active:bg-iwana-primary-100',
  'dark:text-gray-200 dark:hover:bg-dark-surface-4 dark:hover:text-white',
);

const pageButtonActiveClassName = cn(
  'cursor-default bg-iwana-primary text-white shadow-sm',
  'dark:bg-iwana-primary-500 dark:text-white',
  'dark:ring-1 dark:ring-inset dark:ring-iwana-primary-300',
);

function pageButtonBaseClassName(density: PortalPagerDensity): string {
  return cn(
    'inline-flex items-center justify-center font-semibold tabular-nums transition-colors',
    interactiveFocusClassName,
    'disabled:pointer-events-none disabled:opacity-50',
    density === 'compact'
      ? 'h-8 min-w-8 rounded-lg px-2.5 text-xs'
      : 'h-11 min-w-11 rounded-xl px-3 text-sm',
  );
}

function pagerNavButtonClassName(density: PortalPagerDensity): string {
  return density === 'compact' ? 'gap-1 px-2.5 text-xs' : 'min-h-11 gap-1 px-3';
}

function pagerEllipsisClassName(density: PortalPagerDensity): string {
  return cn(
    'hidden items-center justify-center text-gray-500 sm:inline-flex dark:text-gray-400',
    density === 'compact' ? 'h-8 min-w-8 text-xs' : 'h-11 min-w-11 text-sm',
  );
}

function pageSizeSelectClassName(density: PortalPagerDensity): string {
  return density === 'compact'
    ? 'h-8 w-auto min-w-[4.5rem] rounded-lg px-2.5 py-1.5 text-xs'
    : 'h-11 w-auto min-w-[5.5rem]';
}

/**
 * Pie numerado de tablas operativas (ADR-065). Controlado puro; hermano del
 * contenedor con overflow-x, nunca hijo.
 */
export function PortalTablePager({
  page,
  pageCount,
  onPageChange,
  from,
  to,
  total,
  resource,
  totalIsEstimate = false,
  loading = false,
  siblingCount = 1,
  boundaryCount = 1,
  pageSizeControl,
  labels: labelsProp,
  className,
  density = 'default',
}: PortalTablePagerProps) {
  const labels = { ...DEFAULT_PAGER_LABELS, ...labelsProp };
  const liveId = useId();
  const pendingFocusRef = useRef<'prev' | 'next' | number | null>(null);
  const prevBtnRef = useRef<HTMLButtonElement | null>(null);
  const nextBtnRef = useRef<HTMLButtonElement | null>(null);
  const pageBtnRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const pageBtnBase = pageButtonBaseClassName(density);
  const navBtnClass = pagerNavButtonClassName(density);
  const ellipsisClass = pagerEllipsisClassName(density);
  const positionMobileClass =
    density === 'compact'
      ? 'px-2 text-xs tabular-nums text-gray-700 sm:hidden dark:text-gray-200'
      : 'px-2 text-sm tabular-nums text-gray-700 sm:hidden dark:text-gray-200';

  const showFooter = total > 0;
  const countText = showFooter
    ? formatPagerCount({
        from,
        to,
        total,
        pageCount,
        resource,
        totalIsEstimate,
      })
    : '';
  const showNav = showFooter && pageCount > 1;
  const liveAnnouncement = showNav
    ? `${labels.position(page, pageCount)}. ${countText}.`
    : showFooter
      ? `${labels.position(page, 1)}. ${countText}.`
      : '';
  const windowItems = showNav ? buildPageWindow(page, pageCount, siblingCount, boundaryCount) : [];
  const prevDisabled = loading || page <= 1;
  const nextDisabled = loading || page >= pageCount;
  const controlsDisabled = loading;

  useLayoutEffect(() => {
    if (!showFooter) return;
    const target = pendingFocusRef.current;
    if (target == null) return;

    const focusSafe = (el: HTMLButtonElement | null | undefined) => {
      if (el && !el.disabled) {
        el.focus();
        return true;
      }
      return false;
    };

    let focused = false;
    if (target === 'prev') {
      focused =
        focusSafe(prevBtnRef.current) ||
        focusSafe(nextBtnRef.current) ||
        focusSafe(pageBtnRefs.current.get(page));
    } else if (target === 'next') {
      focused =
        focusSafe(nextBtnRef.current) ||
        focusSafe(prevBtnRef.current) ||
        focusSafe(pageBtnRefs.current.get(page));
    } else if (typeof target === 'number') {
      focused =
        focusSafe(pageBtnRefs.current.get(target)) ||
        focusSafe(pageBtnRefs.current.get(page)) ||
        focusSafe(nextBtnRef.current) ||
        focusSafe(prevBtnRef.current);
    }

    if (focused) {
      pendingFocusRef.current = null;
    }
  }, [page, pageCount, loading, showFooter]);

  const goTo = (nextPage: number, focusTarget: 'prev' | 'next' | number) => {
    if (nextPage < 1 || nextPage > pageCount || nextPage === page || loading) return;
    pendingFocusRef.current = focusTarget;
    onPageChange(nextPage);
  };

  if (!showFooter) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-t border-gray-100 px-5 py-4 dark:border-dark-border',
        'sm:flex-row sm:items-center sm:justify-between',
        density === 'compact' && 'gap-2',
        className,
      )}
      data-density={density}
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs tabular-nums text-gray-500 dark:text-gray-400">{countText}</p>
        {pageSizeControl}
      </div>

      <p id={liveId} className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </p>

      {showNav ? (
        <nav
          aria-label={labels.nav(resource.plural)}
          aria-busy={loading || undefined}
          data-loading={loading ? 'true' : undefined}
          className="flex items-center justify-between gap-1 sm:justify-start"
        >
          <Button
            ref={prevBtnRef}
            type="button"
            variant="secondary"
            size="sm"
            className={navBtnClass}
            disabled={prevDisabled}
            aria-label={labels.previous}
            onClick={() => goTo(page - 1, 'prev')}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{labels.previous}</span>
          </Button>

          <span className={positionMobileClass}>{labels.position(page, pageCount)}</span>

          {windowItems.map((item, index) => {
            if (item === 'ellipsis') {
              return (
                <span key={`ellipsis-${index}`} aria-hidden="true" className={ellipsisClass}>
                  …
                </span>
              );
            }

            const isCurrent = item === page;
            return (
              <button
                key={item}
                ref={(el) => {
                  if (el) pageBtnRefs.current.set(item, el);
                  else pageBtnRefs.current.delete(item);
                }}
                type="button"
                className={cn(
                  pageBtnBase,
                  'hidden sm:inline-flex',
                  isCurrent ? pageButtonActiveClassName : pageButtonInactiveClassName,
                )}
                aria-label={labels.page(item)}
                aria-current={isCurrent ? 'page' : undefined}
                disabled={controlsDisabled}
                onClick={() => goTo(item, item)}
              >
                {item}
              </button>
            );
          })}

          <Button
            ref={nextBtnRef}
            type="button"
            variant="secondary"
            size="sm"
            className={navBtnClass}
            disabled={nextDisabled}
            aria-label={labels.next}
            onClick={() => goTo(page + 1, 'next')}
          >
            <span className="hidden sm:inline">{labels.next}</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </nav>
      ) : null}
    </div>
  );
}

export interface PortalPageSizeSelectProps {
  /** Tamaño de página actual (p. ej. 20). Debe pertenecer a `options`. */
  value: number;
  onChange: (pageSize: number) => void;
  /** Default PORTAL_PAGE_SIZE_OPTIONS. Un override explícito valida pertenencia al array, no el rango 10–50. */
  options?: readonly number[] | undefined;
  disabled?: boolean | undefined;
  id?: string | undefined;
  className?: string | undefined;
  /**
   * `default` (h-11) para tablas; `compact` (h-8) para toolbars densas embebidas.
   */
  density?: PortalPagerDensity | undefined;
}

const DEFAULT_PAGE_SIZE_OPTIONS: readonly number[] = PORTAL_PAGE_SIZE_OPTIONS;

/** Selector de filas por página — siempre sobre `Select` de `@iwana/ui`. */
export function PortalPageSizeSelect({
  value,
  onChange,
  options = DEFAULT_PAGE_SIZE_OPTIONS,
  disabled = false,
  id,
  className,
  density = 'default',
}: PortalPageSizeSelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const labelId = `${selectId}-pager-size-label`;
  const minOption = options.length > 0 ? Math.min(...options) : PORTAL_DEFAULT_PAGE_SIZE;
  const selectOptions = options.map((option) => ({
    value: String(option),
    label: String(option),
  }));

  return (
    <div
      className={cn('flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400', className)}
      data-min-option={minOption}
      data-density={density}
    >
      <label id={labelId} htmlFor={selectId} className="shrink-0 whitespace-nowrap">
        Filas por página
      </label>
      <div className="w-auto shrink-0">
        <Select
          id={selectId}
          aria-labelledby={labelId}
          value={String(value)}
          disabled={disabled}
          className={pageSizeSelectClassName(density)}
          onChange={(event) => {
            const next = Number.parseInt(event.target.value, 10);
            if (Number.isFinite(next) && options.includes(next)) onChange(next);
          }}
          options={selectOptions}
        />
      </div>
    </div>
  );
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

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousActiveElementRef.current = opener;

    const focusFrame = window.requestAnimationFrame(() => {
      // Misma carrera que `OperationalSidePeek`, `usePortalSideDrawerA11y` y
      // `Dialog`: el frame diferido puede caer DESPUÉS de la primera
      // interacción del operador y arrastrar el foco fuera del control en uso
      // —cerrando el desplegable recién abierto o descartando lo tecleado—.
      // Solo se reubica el foco si nadie lo reclamó entretanto.
      const active = document.activeElement;
      const untouched =
        active == null ||
        active === document.body ||
        active === document.documentElement ||
        active === opener;

      if (!untouched) {
        return;
      }

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

  // Difunde la apertura hacia el chrome: Sidebar, TopHeader y subnav quedan
  // inertes bajo el velo, y el sidebar mobile se cierra mientras el peek viva.
  usePortalModalDrawerBroadcast(open);

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

  // Portal, escalón, velo y alineación viven en `ModalLayer` (`@iwana/ui`). Dos
  // razones para que la capa esté portalada a `document.body` y en `--z-modal`:
  //
  // 1. Un `fixed inset-0` que vive dentro del árbol de la página se ancla al
  //    primer ancestro que le cree bloque contenedor (`transform`, `filter`,
  //    `backdrop-filter`, `contain`, `will-change`…) y deja de cubrir el
  //    viewport: tapa el contenido y **deja el chrome fuera** del velo.
  // 2. En `--z-shell-panel` compartía escalón con el `Sidebar`, así que su velo
  //    solo cubría el chrome porque `<main>` va después de `<Sidebar>` en el
  //    DOM — el contrato negociado por orden de inserción que ADR-075 vino a
  //    eliminar.
  //
  // La guarda de anidamiento no viaja a la capa: `ModalLayer` no conoce la pila
  // de peeks, así que el consumidor decide si su `onVeilClick` cierra o no.
  return (
    <ModalLayer
      align="end"
      onVeilClick={() => {
        if (!isTopMostSidePeekLayer(layerId)) {
          return;
        }
        onClose();
      }}
    >
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...(description ? { 'aria-describedby': descriptionId } : {})}
        tabIndex={-1}
        // Sin z literal (ADR-075 §2): el panel pinta sobre el velo por orden de
        // documento — es hermano posterior y está posicionado.
        className={cn(
          overlayEdgeClassName,
          'relative flex h-full w-full max-w-lg flex-col border-l bg-white shadow-iwana-soft dark:bg-dark-surface-2',
          className,
        )}
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
    </ModalLayer>
  );
}

const panelBaseClassName =
  'rounded-2xl border border-gray-200 bg-white shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2';

type PortalAlertVariant = 'error' | 'warning' | 'success' | 'info';

interface PortalPanelProps {
  as?: 'div' | 'section';
  id?: string | undefined;
  eyebrow?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  actions?: ReactNode | undefined;
  className?: string | undefined;
  headerClassName?: string | undefined;
  contentClassName?: string | undefined;
  /** Destino de foco estable (p. ej. retorno tras reintento o ancla de bloque). */
  titleTabIndex?: number | undefined;
  titleRef?: Ref<HTMLHeadingElement> | undefined;
  /** Carga del bloque: cabecera permanece; el consumidor sustituye hijos por esqueleto. */
  busy?: boolean | undefined;
  /** Densidad del home (DS v1.6). Solo consumidores del inicio. Default: p-5. */
  compact?: boolean | undefined;
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
  /** Nombre accesible del grupo de acciones (p. ej. Inicio B0b). */
  'aria-label'?: string | undefined;
}

type PortalAlertLive = 'assertive' | 'polite' | 'off';

interface PortalAlertProps {
  variant: PortalAlertVariant;
  title: string;
  description?: ReactNode | undefined;
  action?: ReactNode | undefined;
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }> | undefined;
  className?: string | undefined;
  /**
   * Politenez de la región live. Independiente de `variant`.
   * - assertive → role=alert, aria-live=assertive
   * - polite (default) → role=status, aria-live=polite
   * - off → sin role live ni aria-live (p. ej. tiras estáticas)
   */
  live?: PortalAlertLive | undefined;
}

interface PortalEmptyStateProps {
  title: string;
  description: ReactNode;
  action?: ReactNode | undefined;
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }> | undefined;
  className?: string | undefined;
  /** Sin segunda cáscara cuando ya vive dentro de `PortalPanel` (DS §1.9). */
  embedded?: boolean | undefined;
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
  id,
  eyebrow,
  title,
  description,
  actions,
  className,
  headerClassName,
  contentClassName,
  titleTabIndex,
  titleRef,
  busy = false,
  compact = false,
  children,
}: PortalPanelProps) {
  const Component = as;

  return (
    <Component
      id={id}
      className={cn(panelBaseClassName, compact ? 'p-4' : 'p-5', className)}
      aria-busy={busy || undefined}
    >
      {(eyebrow || title || description || actions) && (
        <div
          className={cn(
            'flex flex-col border-b border-gray-100 dark:border-dark-border',
            compact ? 'gap-2 pb-3' : 'gap-3 pb-4',
            actions && 'md:flex-row md:items-start md:justify-between',
            headerClassName,
          )}
        >
          <div className="min-w-0">
            {eyebrow && <p className="portal-eyebrow">{eyebrow}</p>}
            {title && (
              <h2
                ref={titleRef}
                tabIndex={titleTabIndex}
                className={cn(
                  'text-base font-semibold text-gray-900 dark:text-white',
                  eyebrow && 'mt-1',
                  titleTabIndex === -1 ? interactiveFocusClassName : null,
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
        className={cn(
          title || eyebrow || description || actions ? (compact ? 'pt-3' : 'pt-4') : '',
          contentClassName,
        )}
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
  'aria-label': ariaLabel,
}: PortalActionToolbarProps) {
  return (
    <div
      role={ariaLabel ? 'toolbar' : undefined}
      aria-label={ariaLabel}
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
  live = 'polite',
}: PortalAlertProps) {
  const styles = alertVariantStyles[variant];
  const Icon = icon ?? styles.defaultIcon;
  const liveRegionProps =
    live === 'off'
      ? {}
      : live === 'assertive'
        ? ({
            role: 'alert',
            'aria-live': 'assertive',
            'aria-atomic': true,
          } as const)
        : ({
            role: 'status',
            'aria-live': 'polite',
            'aria-atomic': true,
          } as const);

  return (
    <div
      {...liveRegionProps}
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
        <p className={cn('text-sm font-semibold', styles.titleColor)}>{title}</p>
        {description && (
          <div className="mt-1 space-y-2">
            <div className={cn('text-sm', styles.bodyColor)}>{description}</div>
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
  embedded = false,
}: PortalEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300',
        embedded
          ? 'py-1'
          : 'rounded-2xl border border-gray-200 bg-iwana-surface-soft px-4 py-4 dark:border-dark-border dark:bg-dark-surface-3',
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

export interface PortalModuleSubnavItem {
  id: string;
  label: string;
  icon?: LucideIcon;
}

export interface PortalModuleSubnavGroup {
  id: string;
  label: string;
  items: PortalModuleSubnavItem[];
  /**
   * v1.3 — aditivo (default false). Oculta el eyebrow del grupo en pantalla.
   * `label` sigue siendo obligatorio: es el nombre accesible del grupo.
   */
  hideLabel?: boolean;
}

export interface PortalModuleSubnavProps {
  groups: PortalModuleSubnavGroup[];
  value: string;
  onValueChange: (id: string) => void;
  ariaLabel: string;
}

export const portalModuleSubnavRailClassName = cn(
  'flex flex-row items-stretch gap-4 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-3 shadow-iwana-soft',
  'dark:border-dark-border dark:bg-dark-surface-2',
  'lg:sticky lg:top-(--portal-sticky-offset) lg:z-(--z-sticky)',
);

export const portalModuleSubnavTriggerClassName = cn(
  'flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 shadow-iwana-soft',
  'dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-100',
  interactiveFocusClassName,
);

export const portalModuleSubnavItemClassName = cn(
  'relative flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-150',
  interactiveFocusClassName,
);

export const portalModuleSubnavItemActiveClassName =
  'bg-iwana-surface-soft font-medium text-iwana-primary dark:bg-dark-surface-3 dark:text-iwana-primary-200';

export const portalModuleSubnavItemInactiveClassName =
  'text-gray-600 hover:bg-iwana-surface-soft dark:text-gray-400 dark:hover:bg-dark-surface-3';

export const portalModuleSubnavDividerClassName =
  'w-px shrink-0 self-stretch bg-gray-200 dark:bg-dark-border';

function PortalModuleSubnavList({
  groups,
  value,
  labelledByPrefix,
  onSelect,
  orientation,
}: {
  groups: PortalModuleSubnavGroup[];
  value: string;
  labelledByPrefix: string;
  onSelect: (id: string) => void;
  orientation: 'horizontal' | 'vertical';
}) {
  const isHorizontal = orientation === 'horizontal';

  return (
    <div
      className={
        isHorizontal ? 'flex min-w-max flex-row items-stretch gap-4' : 'flex flex-col gap-4'
      }
    >
      {groups.map((group, index) => {
        const headingId = `${labelledByPrefix}-${group.id}`;
        // v1.3 (hideLabel): sin eyebrow, la lista pasa a aria-label para no
        // dejar un aria-labelledby apuntando a un heading inexistente; el
        // wrapper recibe la compensación de alineación documentada en tokens.
        const hideLabel = group.hideLabel === true;
        return (
          <Fragment key={group.id}>
            {isHorizontal && index > 0 ? (
              <div
                role="separator"
                aria-hidden="true"
                className={portalModuleSubnavDividerClassName}
              />
            ) : null}
            <div className={cn('space-y-1', hideLabel && 'portal-subnav-group-sans-label')}>
              {hideLabel ? null : (
                <p className="portal-eyebrow px-1" id={headingId}>
                  {group.label}
                </p>
              )}
              <ul
                aria-label={hideLabel ? group.label : undefined}
                aria-labelledby={hideLabel ? undefined : headingId}
                className={isHorizontal ? 'flex flex-row gap-1' : 'flex flex-col gap-1'}
              >
                {group.items.map((item) => {
                  const isActive = item.id === value;
                  const ItemIcon = item.icon;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={cn(
                          portalModuleSubnavItemClassName,
                          isHorizontal ? 'whitespace-nowrap' : 'w-full text-left',
                          isActive
                            ? portalModuleSubnavItemActiveClassName
                            : portalModuleSubnavItemInactiveClassName,
                        )}
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => onSelect(item.id)}
                      >
                        {isActive ? (
                          <span
                            aria-hidden="true"
                            className={
                              isHorizontal
                                ? 'absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-iwana-secondary'
                                : 'absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-iwana-secondary'
                            }
                          />
                        ) : null}
                        {ItemIcon ? (
                          <ItemIcon
                            className={
                              isActive
                                ? 'h-4 w-4 shrink-0 text-iwana-secondary-700 dark:text-iwana-secondary'
                                : 'h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500'
                            }
                            aria-hidden="true"
                          />
                        ) : null}
                        {item.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

function resolveSubnavItem(
  groups: PortalModuleSubnavGroup[],
  value: string,
): PortalModuleSubnavItem | undefined {
  for (const group of groups) {
    const item = group.items.find((entry) => entry.id === value);
    if (item) {
      return item;
    }
  }

  return groups[0]?.items[0];
}

/** Subnavegación interna de módulo: barra horizontal lima en lg+; selector + dialog bajo lg. */
export function PortalModuleSubnav({
  groups,
  value,
  onValueChange,
  ariaLabel,
}: PortalModuleSubnavProps) {
  const isLgUp = useMinWidthLg();
  // Con un drawer modal abierto el rail conserva su `lg:z-(--z-sticky)` — bajo
  // el velo, que lo atenúa y desenfoca con el resto del chrome — y queda inerte
  // para confinar el foco al panel. El estado se toma del canal del portal, no
  // de un prop cableado por cada pantalla: cablearlo a mano dejaba el rail
  // tabulable con los drawers que la pantalla olvidara conectar.
  const modalDrawerOpen = usePortalModalDrawerOpen();
  const [dialogOpen, setDialogOpen] = useState(false);
  const listId = useId();
  const currentItem = resolveSubnavItem(groups, value);
  const currentLabel = currentItem?.label ?? 'Sección';
  const CurrentIcon = currentItem?.icon;

  const handleSelect = useCallback(
    (id: string) => {
      onValueChange(id);
      setDialogOpen(false);
    },
    [onValueChange],
  );

  if (isLgUp) {
    return (
      <nav
        aria-label={ariaLabel}
        inert={modalDrawerOpen || undefined}
        aria-hidden={modalDrawerOpen ? true : undefined}
        className={portalModuleSubnavRailClassName}
      >
        <PortalModuleSubnavList
          groups={groups}
          value={value}
          labelledByPrefix={listId}
          onSelect={handleSelect}
          orientation="horizontal"
        />
      </nav>
    );
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger
        className={portalModuleSubnavTriggerClassName}
        aria-haspopup="dialog"
        aria-expanded={dialogOpen}
      >
        <span className="flex min-w-0 items-center gap-2">
          {CurrentIcon ? (
            <CurrentIcon
              className="h-4 w-4 shrink-0 text-iwana-secondary-700 dark:text-iwana-secondary"
              aria-hidden="true"
            />
          ) : null}
          <span>
            Sección: <span className="text-iwana-primary">{currentLabel}</span>
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Elegir sección</DialogTitle>
        </DialogHeader>
        <nav aria-label={ariaLabel}>
          <PortalModuleSubnavList
            groups={groups}
            value={value}
            labelledByPrefix={`${listId}-sheet`}
            onSelect={handleSelect}
            orientation="vertical"
          />
        </nav>
      </DialogContent>
    </Dialog>
  );
}

/** Footer sticky compartido en flujos create-mode (compras, salidas, recepciones). */
export const createModeStickyFooterClassName =
  'sticky bottom-0 z-(--z-sticky) rounded-2xl border border-gray-200 bg-iwana-surface-soft px-4 py-3 shadow-sm dark:border-dark-border dark:bg-dark-surface-3';

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
