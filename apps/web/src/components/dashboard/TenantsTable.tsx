// apps/web/src/components/dashboard/TenantsTable.tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button } from '@iwana/ui';
import { Card, CardHeader, CardTitle, CardContent } from '@iwana/ui';
import { Search, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

type TenantStatus = 'ACTIVE' | 'PROVISIONING' | 'PROVISIONING_FAILED' | 'SUSPENDED' | 'INACTIVE';
type SortField = 'name' | 'status' | 'createdAt';
type SortDir = 'asc' | 'desc';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  createdAt: string;
}

interface TenantsTableProps {
  tenants: Tenant[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  searchQuery?: string;
}

const statusConfig: Record<
  TenantStatus,
  { label: string; variant: 'success' | 'warning' | 'error' | 'neutral' }
> = {
  ACTIVE: { label: 'Activo', variant: 'success' },
  PROVISIONING: { label: 'Provisionando', variant: 'warning' },
  PROVISIONING_FAILED: { label: 'Error provisión', variant: 'error' },
  SUSPENDED: { label: 'Suspendido', variant: 'neutral' },
  INACTIVE: { label: 'Inactivo', variant: 'neutral' },
};

const ALL_STATUSES = 'TODAS' as const;

/** Icono de ordenamiento para cabecera de columna. */
function SortIcon({
  field,
  sortField,
  sortDir,
}: {
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
}) {
  if (sortField !== field)
    return <ChevronsUpDown className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />;
  return sortDir === 'asc' ? (
    <ChevronUp
      className="w-3.5 h-3.5 text-iwana-primary dark:text-iwana-primary-300"
      aria-hidden="true"
    />
  ) : (
    <ChevronDown
      className="w-3.5 h-3.5 text-iwana-primary dark:text-iwana-primary-300"
      aria-hidden="true"
    />
  );
}

/**
 * Tabla de tenants para el dashboard administrativo.
 * Soporta búsqueda por nombre/slug, filtro por estado y ordenamiento por columna.
 */
export function TenantsTable({
  tenants,
  isLoading = false,
  error = null,
  onRetry,
  searchQuery = '',
}: TenantsTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TenantStatus | typeof ALL_STATUSES>(
    ALL_STATUSES,
  );
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    setSearch(searchQuery);
  }, [searchQuery]);

  /** Alterna ordenamiento: si es el mismo campo, invierte dirección. Si es distinto, inicia asc. */
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tenants
      .filter((t) => {
        const matchSearch = t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q);
        const matchStatus = statusFilter === ALL_STATUSES || t.status === statusFilter;
        return matchSearch && matchStatus;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === 'name') cmp = a.name.localeCompare(b.name);
        else if (sortField === 'status') cmp = a.status.localeCompare(b.status);
        else cmp = a.createdAt.localeCompare(b.createdAt);
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [search, statusFilter, sortField, sortDir, tenants]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-0">
        <CardTitle>Tenants de la plataforma</CardTitle>

        {/* Toolbar: búsqueda + filtro */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Buscador */}
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Buscar tenant"
              placeholder="Buscar por nombre o slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full sm:w-56 rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-iwana-primary focus:ring-2 focus:ring-iwana-primary/20 dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-gray-200 dark:placeholder:text-gray-500"
            />
          </div>

          {/* Filtro de estado */}
          <select
            aria-label="Filtrar por estado"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TenantStatus | typeof ALL_STATUSES)}
            className="h-9 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700 focus:outline-none focus:border-iwana-primary focus:ring-2 focus:ring-iwana-primary/20 dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-gray-200"
          >
            <option value={ALL_STATUSES}>Todos los estados</option>
            {Object.entries(statusConfig).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>

      <CardContent className="p-0 mt-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Lista de tenants">
            <thead>
              <tr className="border-b border-gray-100 dark:border-dark-border">
                <th className="px-6 py-3 text-left">
                  <button
                    type="button"
                    onClick={() => handleSort('name')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    Nombre <SortIcon field="name" sortField={sortField} sortDir={sortDir} />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  Slug
                </th>
                <th className="px-6 py-3 text-left">
                  <button
                    type="button"
                    onClick={() => handleSort('status')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    Estado <SortIcon field="status" sortField={sortField} sortDir={sortDir} />
                  </button>
                </th>
                <th className="px-6 py-3 text-left">
                  <button
                    type="button"
                    onClick={() => handleSort('createdAt')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    Creado <SortIcon field="createdAt" sortField={sortField} sortDir={sortDir} />
                  </button>
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-dark-border">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-10 text-center text-sm text-gray-400 dark:text-gray-500"
                  >
                    Cargando tenants...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-10 text-center text-sm text-red-500 dark:text-red-400"
                  >
                    <p>{error}</p>
                    {onRetry && (
                      <button
                        type="button"
                        onClick={onRetry}
                        className="mt-2 text-xs text-iwana-primary underline dark:text-iwana-secondary"
                      >
                        Reintentar
                      </button>
                    )}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-10 text-center text-sm text-gray-400 dark:text-gray-500"
                  >
                    No se encontraron tenants con los filtros actuales.
                  </td>
                </tr>
              ) : (
                filtered.map((tenant) => {
                  const { label, variant } = statusConfig[tenant.status];
                  return (
                    <tr
                      key={tenant.id}
                      className="hover:bg-gray-50 transition-colors dark:hover:bg-dark-surface-3/50"
                    >
                      <td className="px-6 py-4 font-medium text-iwana-primary dark:text-white">
                        {tenant.name}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-500 dark:text-gray-400">
                        {tenant.slug}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={variant}>{label}</Badge>
                      </td>
                      <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                        {tenant.createdAt}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={`/tenants/${tenant.id}`}
                            className="text-xs text-iwana-secondary-700 hover:underline dark:text-iwana-secondary-400"
                          >
                            Ver detalle
                          </a>
                          {tenant.status === 'PROVISIONING_FAILED' && (
                            <Button size="sm" variant="destructive" className="h-7 px-2 text-xs">
                              Retry
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Contador de resultados */}
        {filtered.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-100 dark:border-dark-border">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Mostrando {filtered.length} de {tenants.length} tenants
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
