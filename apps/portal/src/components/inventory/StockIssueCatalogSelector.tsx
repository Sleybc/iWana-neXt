'use client';

interface StockIssueCatalogSelectorProps {
  rows: Array<{
    id: string;
    productLabel: string;
    categoryName: string;
    unitLabel: string;
    availableLabel?: string | null;
    selected: boolean;
  }>;
  isLoading?: boolean;
  showAvailableColumn?: boolean;
  onToggle: (itemId: string) => void;
}

export function StockIssueCatalogSelector({
  rows,
  isLoading = false,
  showAvailableColumn = false,
  onToggle,
}: StockIssueCatalogSelectorProps) {
  if (isLoading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Cargando catálogo...</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500 dark:border-dark-border dark:text-gray-400">
        No hay ítems que coincidan con la búsqueda.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-2">
      <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
        <thead className="bg-gray-50 dark:bg-dark-surface-3">
          <tr>
            <th className="px-4 py-3 text-left">Sel.</th>
            <th className="px-4 py-3 text-left">Ítem</th>
            <th className="px-4 py-3 text-left">Categoría</th>
            <th className="px-4 py-3 text-left">Unidad</th>
            {showAvailableColumn ? (
              <th className="px-4 py-3 text-left">Disponible en origen</th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 accent-iwana-primary"
                  aria-label={`Seleccionar ${row.productLabel}`}
                  checked={row.selected}
                  onChange={() => onToggle(row.id)}
                />
              </td>
              <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                {row.productLabel}
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.categoryName}</td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.unitLabel}</td>
              {showAvailableColumn ? (
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                  {row.availableLabel ?? '—'}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
