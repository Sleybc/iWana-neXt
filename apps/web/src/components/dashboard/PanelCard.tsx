// apps/web/src/components/dashboard/PanelCard.tsx
import { cn } from '@iwana/ui';

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
  className?: string;
  /** Encabezados de columnas (label, value). Por defecto no se muestran. */
  columnHeaders?: { label: string; value: string };
}

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
  className,
  columnHeaders,
}: PanelCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-gray-200 bg-white p-5 dark:border-dark-border dark:bg-dark-surface-2',
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

        {/* Filas de datos */}
        {rows.map((row, idx) => (
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
        ))}
      </div>

      {/* Pie opcional */}
      {footerLabel && (
        <div className="mt-4">
          {footerHref ? (
            <a
              href={footerHref}
              className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-gray-400 dark:hover:bg-white/5"
            >
              {footerLabel}
            </a>
          ) : (
            <button
              type="button"
              onClick={onFooterClick}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-gray-400 dark:hover:bg-white/5"
            >
              {footerLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
