// apps/web/src/components/dashboard/PanelCard.tsx
import { cn, interactiveFocusClassName, SkeletonBlock } from '@iwana/ui';

export interface PanelRow {
  label: string;
  value: string | number;
  /** Clases CSS adicionales para el valor (ej: color semántico) */
  valueClassName?: string;
}

interface PanelCardProps {
  title: string;
  rows: PanelRow[];
  /** Texto del enlace/botón al pie. Si se omite, no se muestra. */
  footerLabel?: string;
  /** Href del enlace al pie. Si se provee footerLabel sin footerHref, es un botón. */
  footerHref?: string;
  onFooterClick?: () => void;
  /** Callback al hacer clic en una fila interactiva (value numérico > 0). Recibe el label. */
  onRowClick?: (rowLabel: string) => void;
  /** Mientras carga, muestra filas skeleton y oculta el footer. */
  isLoading?: boolean;
  className?: string;
  /** Encabezados de columnas (label, value). Por defecto no se muestran. */
  columnHeaders?: { label: string; value: string };
}

const rowFocusClassName =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-secondary/20 focus-visible:ring-offset-1';

/**
 * Panel de datos tabulados para dashboards iWana.
 * Referencia visual: docs/prototipo/tailadmin/src/partials/top-card-group.html
 */
export function PanelCard({
  title,
  rows,
  footerLabel,
  footerHref,
  onFooterClick,
  onRowClick,
  isLoading = false,
  className,
  columnHeaders,
}: PanelCardProps) {
  const skeletonCount = rows.length > 0 ? rows.length : 4;

  return (
    <div
      className={cn(
        'rounded-2xl border border-gray-200 bg-white p-5 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2',
        className,
      )}
    >
      {/* Cabecera */}
      <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</h3>

      {/* Cuerpo con filas */}
      <div className="mt-4">
        {/* Encabezados de columna opcionales */}
        {columnHeaders && (
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-dark-border">
            <span className="text-xs text-gray-600 dark:text-gray-400">{columnHeaders.label}</span>
            <span className="text-right text-xs text-gray-600 dark:text-gray-400">
              {columnHeaders.value}
            </span>
          </div>
        )}

        {isLoading
          ? Array.from({ length: skeletonCount }).map((_, idx) => (
              <div
                key={`panel-skeleton-${idx}`}
                className="flex items-center justify-between border-b border-gray-100 py-3 last:border-0 dark:border-dark-border"
              >
                <SkeletonBlock className="h-4 w-32 rounded bg-gray-200" />
                <SkeletonBlock className="h-4 w-8 rounded bg-gray-200" />
              </div>
            ))
          : rows.map((row, idx) => {
              const numericValue = typeof row.value === 'number' ? row.value : Number(row.value);
              const isClickable =
                Boolean(onRowClick) && Number.isFinite(numericValue) && numericValue > 0;

              if (isClickable && onRowClick) {
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onRowClick(row.label)}
                    className={cn(
                      'flex w-full items-center justify-between border-b border-gray-100 py-3 text-left last:border-0 dark:border-dark-border',
                      'cursor-pointer rounded-lg hover:bg-gray-50 dark:hover:bg-dark-surface-3',
                      rowFocusClassName,
                    )}
                  >
                    <span className="text-sm text-gray-600 dark:text-gray-400">{row.label}</span>
                    <span
                      className={cn(
                        'text-right text-sm font-medium text-gray-800 dark:text-white/80',
                        row.valueClassName,
                      )}
                    >
                      {row.value}
                    </span>
                  </button>
                );
              }

              return (
                <div
                  key={idx}
                  className="flex items-center justify-between border-b border-gray-100 py-3 last:border-0 dark:border-dark-border"
                >
                  <span className="text-sm text-gray-600 dark:text-gray-400">{row.label}</span>
                  <span
                    className={cn(
                      'text-right text-sm font-medium text-gray-800 dark:text-white/80',
                      row.valueClassName,
                    )}
                  >
                    {row.value}
                  </span>
                </div>
              );
            })}
      </div>

      {/* Pie opcional — oculto mientras carga */}
      {!isLoading && footerLabel && (
        <div className="mt-4">
          {footerHref ? (
            <a
              href={footerHref}
              className={cn(
                'flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-gray-400 dark:hover:bg-dark-surface-4',
                interactiveFocusClassName,
              )}
            >
              {footerLabel}
            </a>
          ) : (
            <button
              type="button"
              onClick={onFooterClick}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-gray-400 dark:hover:bg-dark-surface-4',
                interactiveFocusClassName,
              )}
            >
              {footerLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
