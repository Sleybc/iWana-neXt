// apps/web/src/components/dashboard/TenantsTable.tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Select,
  cn,
  interactiveFocusClassName,
} from '@iwana/ui';
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type TenantStatus =
  | 'ACTIVE'
  | 'PROVISIONING'
  | 'PROVISIONING_FAILED'
  | 'SUSPENDED'
  | 'INACTIVE'
  | 'MARKED_FOR_DELETION';
type SortField = 'name' | 'status' | 'updatedAt' | 'createdAt';
type SortDir = 'asc' | 'desc';

const ALL_STATUSES = 'TODAS' as const;
export type StatusFilterValue = TenantStatus | typeof ALL_STATUSES;

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  contactEmail?: string;
  updatedAt?: string;
  createdAt: string;
}

interface TenantsTableProps {
  tenants: Tenant[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  statusFilter?: StatusFilterValue;
  onStatusFilterChange?: (value: StatusFilterValue) => void;
  onSuspend?: (id: string) => void;
  onActivate?: (id: string) => void;
  onRetryProvisioning?: (id: string) => void;
}

/** Clases CSS para pill badges por estado de tenant. */
const statusPillClasses: Record<TenantStatus, string> = {
  ACTIVE:
    'rounded-full px-2.5 py-0.5 text-xs font-medium bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  PROVISIONING:
    'rounded-full px-2.5 py-0.5 text-xs font-medium bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400',
  PROVISIONING_FAILED:
    'rounded-full px-2.5 py-0.5 text-xs font-medium bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
  SUSPENDED:
    'rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-white/[0.03] dark:text-gray-400',
  INACTIVE:
    'rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-white/[0.03] dark:text-gray-400',
  MARKED_FOR_DELETION:
    'rounded-full px-2.5 py-0.5 text-xs font-medium bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
};

/** Etiquetas legibles por estado de tenant. */
const statusLabels: Record<TenantStatus, string> = {
  ACTIVE: 'Activo',
  PROVISIONING: 'Configurando',
  PROVISIONING_FAILED: 'Configuración fallida',
  SUSPENDED: 'Suspendido',
  INACTIVE: 'Inactivo',
  MARKED_FOR_DELETION: 'En eliminación',
};

const STATUS_FILTER_OPTIONS = [
  { value: ALL_STATUSES, label: 'Todos los estados' },
  ...((Object.keys(statusLabels) as TenantStatus[]).map((key) => ({
    value: key,
    label: statusLabels[key],
  })) satisfies Array<{ value: TenantStatus; label: string }>),
];

function formatTableDate(value?: string): string {
  if (!value) {
    return 'Sin fecha';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

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

function ActionsDropdown({
  tenantId,
  tenantStatus,
  onSuspend,
  onActivate,
  onRetryProvisioning,
}: {
  tenantId: string;
  tenantStatus: TenantStatus;
  onSuspend?: (id: string) => void;
  onActivate?: (id: string) => void;
  onRetryProvisioning?: (id: string) => void;
}) {
  const router = useRouter();

  const canSuspend = tenantStatus === 'ACTIVE' && !!onSuspend;
  const canActivate =
    (tenantStatus === 'SUSPENDED' ||
      tenantStatus === 'INACTIVE' ||
      tenantStatus === 'MARKED_FOR_DELETION') &&
    !!onActivate;
  const canRetry =
    (tenantStatus === 'PROVISIONING_FAILED' || tenantStatus === 'PROVISIONING') &&
    !!onRetryProvisioning;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Abrir menú de acciones"
        title="Abrir menú de acciones"
        className={cn(
          'min-h-11 min-w-11 border border-gray-200 bg-white text-gray-600 shadow-iwana-card hover:bg-gray-50 hover:text-gray-900 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300 dark:hover:bg-dark-surface-4',
          interactiveFocusClassName,
        )}
      >
        <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => router.push(`/tenants/${tenantId}/settings`)}>
          Ver configuración
        </DropdownMenuItem>

        {canSuspend && (
          <DropdownMenuItem variant="danger" onClick={() => onSuspend!(tenantId)}>
            Suspender
          </DropdownMenuItem>
        )}

        {canActivate && (
          <DropdownMenuItem variant="success" onClick={() => onActivate!(tenantId)}>
            {tenantStatus === 'MARKED_FOR_DELETION' ? 'Restaurar' : 'Reactivar'}
          </DropdownMenuItem>
        )}

        {canRetry && (
          <DropdownMenuItem variant="warning" onClick={() => onRetryProvisioning!(tenantId)}>
            Reintentar configuración
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Tabla de empresas para el dashboard administrativo.
 * Soporta búsqueda por nombre/slug, filtro por estado, ordenamiento por columna
 * y un dropdown de acciones (3 puntos) por fila con navegación a configuración,
 * suspensión, reactivación y reintento de provisioning.
 */
export function TenantsTable({
  tenants,
  isLoading = false,
  error = null,
  onRetry,
  searchQuery = '',
  onSearchChange,
  statusFilter: controlledStatus,
  onStatusFilterChange,
  onSuspend,
  onActivate,
  onRetryProvisioning,
}: TenantsTableProps) {
  const router = useRouter();
  const [internalSearch, setInternalSearch] = useState(searchQuery);
  const [internalStatus, setInternalStatus] = useState<StatusFilterValue>(ALL_STATUSES);
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const search = onSearchChange ? searchQuery : internalSearch;
  const statusFilter = onStatusFilterChange ? (controlledStatus ?? ALL_STATUSES) : internalStatus;

  const setSearch = (value: string) => {
    if (onSearchChange) {
      onSearchChange(value);
      return;
    }
    setInternalSearch(value);
  };

  const setStatusFilter = (value: StatusFilterValue) => {
    if (onStatusFilterChange) {
      onStatusFilterChange(value);
      return;
    }
    setInternalStatus(value);
  };

  useEffect(() => {
    if (!onSearchChange) {
      setInternalSearch(searchQuery);
    }
  }, [onSearchChange, searchQuery]);

  const hasActiveFilters = Boolean(search.trim()) || statusFilter !== ALL_STATUSES;

  /** Alterna ordenamiento: si es el mismo campo, invierte dirección. Si es distinto, inicia asc. */
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const openTenantSettings = (tenantId: string) => {
    router.push(`/tenants/${tenantId}/settings`);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tenants
      .filter((t) => {
        const matchSearch =
          t.name.toLowerCase().includes(q) ||
          t.slug.toLowerCase().includes(q) ||
          t.contactEmail?.toLowerCase().includes(q);
        const matchStatus = statusFilter === ALL_STATUSES || t.status === statusFilter;
        return matchSearch && matchStatus;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === 'name') cmp = a.name.localeCompare(b.name);
        else if (sortField === 'status') cmp = a.status.localeCompare(b.status);
        else if (sortField === 'updatedAt')
          cmp = (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '');
        else cmp = a.createdAt.localeCompare(b.createdAt);
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [search, statusFilter, sortField, sortDir, tenants]);

  const sortButtonClassName = cn(
    'inline-flex min-h-11 items-center gap-1 text-xs font-medium tracking-wider text-gray-500 uppercase hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
    interactiveFocusClassName,
  );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Directorio de empresas</CardTitle>
          <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
            Revisa estado, contacto principal y cambios recientes antes de entrar a la configuración
            de cada empresa.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type="search"
            aria-label="Buscar empresa"
            placeholder="Buscar por empresa, contacto o identificador..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            containerClassName="sm:w-56"
            className="min-h-11 rounded-lg bg-gray-50 text-gray-700 dark:text-gray-200"
            startIcon={<Search className="h-4 w-4" />}
          />

          <div className="w-full sm:w-[210px]">
            <Select
              id="tenant-status-filter"
              options={STATUS_FILTER_OPTIONS}
              value={statusFilter}
              aria-label="Filtrar por estado"
              onChange={(e) => setStatusFilter(e.target.value as StatusFilterValue)}
            />
          </div>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatusFilter(ALL_STATUSES);
              }}
              className={cn(
                'inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-medium text-iwana-primary hover:underline',
                interactiveFocusClassName,
              )}
            >
              Limpiar filtro
            </button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="mt-4 p-0">
        <div className="px-6 pb-6">
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-dark-border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Lista de empresas">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 dark:border-dark-border dark:bg-dark-surface-3">
                    <th className="px-6 py-3 text-left">
                      <button
                        type="button"
                        onClick={() => handleSort('name')}
                        className={sortButtonClassName}
                      >
                        Empresa <SortIcon field="name" sortField={sortField} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        type="button"
                        onClick={() => handleSort('status')}
                        className={sortButtonClassName}
                      >
                        Estado <SortIcon field="status" sortField={sortField} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        type="button"
                        onClick={() => handleSort('updatedAt')}
                        className={sortButtonClassName}
                      >
                        Última actualización{' '}
                        <SortIcon field="updatedAt" sortField={sortField} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        type="button"
                        onClick={() => handleSort('createdAt')}
                        className={sortButtonClassName}
                      >
                        Fecha creación{' '}
                        <SortIcon field="createdAt" sortField={sortField} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-dark-border">
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, rowIndex) => (
                      <tr key={`skeleton-${rowIndex}`} className="animate-pulse">
                        <td className="px-6 py-4">
                          <div className="space-y-2">
                            <div className="h-4 w-40 rounded bg-gray-200 dark:bg-dark-surface-4" />
                            <div className="h-3 w-48 rounded bg-gray-100 dark:bg-dark-surface-3" />
                            <div className="h-3 w-24 rounded bg-gray-100 dark:bg-dark-surface-3" />
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="h-5 w-20 rounded-full bg-gray-200 dark:bg-dark-surface-4" />
                        </td>
                        <td className="px-6 py-4">
                          <div className="h-4 w-24 rounded bg-gray-200 dark:bg-dark-surface-4" />
                        </td>
                        <td className="px-6 py-4">
                          <div className="h-4 w-24 rounded bg-gray-200 dark:bg-dark-surface-4" />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="ml-auto h-9 w-9 rounded-lg bg-gray-200 dark:bg-dark-surface-4" />
                        </td>
                      </tr>
                    ))
                  ) : error ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-10 text-center text-sm text-red-500 dark:text-red-400"
                      >
                        <p>{error}</p>
                        {onRetry && (
                          <Button
                            type="button"
                            onClick={onRetry}
                            variant="link"
                            size="sm"
                            className="mt-2 min-h-11"
                          >
                            Reintentar
                          </Button>
                        )}
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center">
                        <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                          <div className="flex flex-col items-center gap-1">
                            <p className="text-sm font-medium text-iwana-primary dark:text-white">
                              {hasActiveFilters
                                ? 'Sin empresas con estos filtros'
                                : 'Aún no hay empresas registradas'}
                            </p>
                            <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
                              {hasActiveFilters
                                ? 'Ajusta la búsqueda o el estado, o limpia el filtro para ver todo el directorio.'
                                : 'Cuando registres la primera empresa, aparecerá aquí con su estado operativo.'}
                            </p>
                          </div>
                          {!hasActiveFilters && (
                            <Button asChild size="sm" variant="secondary">
                              <Link href="/tenants/new">Registrar primera empresa</Link>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((tenant) => (
                      <tr
                        key={tenant.id}
                        className="transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                      >
                        {/* Columna Empresa: cell-link primario (teclado + clic) */}
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            className={cn(
                              'block w-full cursor-pointer rounded-lg text-left',
                              interactiveFocusClassName,
                            )}
                            aria-label={`Ver detalle de ${tenant.name}`}
                            onClick={() => openTenantSettings(tenant.id)}
                          >
                            <div className="font-medium text-iwana-primary dark:text-white">
                              {tenant.name}
                            </div>
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {tenant.contactEmail || 'Sin contacto principal registrado'}
                            </div>
                            <div className="mt-1 font-mono text-[11px] text-gray-500 dark:text-gray-400">
                              {tenant.slug}
                            </div>
                          </button>
                        </td>

                        <td
                          className="cursor-pointer px-6 py-4"
                          onClick={() => openTenantSettings(tenant.id)}
                        >
                          <span className={statusPillClasses[tenant.status]}>
                            {statusLabels[tenant.status]}
                          </span>
                        </td>

                        <td
                          className="cursor-pointer px-6 py-4 text-gray-500 dark:text-gray-400"
                          onClick={() => openTenantSettings(tenant.id)}
                        >
                          {formatTableDate(tenant.updatedAt)}
                        </td>

                        <td
                          className="cursor-pointer px-6 py-4 text-gray-500 dark:text-gray-400"
                          onClick={() => openTenantSettings(tenant.id)}
                        >
                          {formatTableDate(tenant.createdAt)}
                        </td>

                        <td className="cursor-default px-6 py-4 text-right">
                          <ActionsDropdown
                            tenantId={tenant.id}
                            tenantStatus={tenant.status}
                            {...(onSuspend && { onSuspend })}
                            {...(onActivate && { onActivate })}
                            {...(onRetryProvisioning && { onRetryProvisioning })}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {filtered.length > 0 && (
          <div className="border-t border-gray-100 px-6 py-3 dark:border-dark-border">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Mostrando {filtered.length} de {tenants.length} empresas en el directorio
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
