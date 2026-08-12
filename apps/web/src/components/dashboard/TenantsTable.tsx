// apps/web/src/components/dashboard/TenantsTable.tsx
'use client';
import { useEffect, useMemo, useState, type Ref } from 'react';
import {
  Alert,
  AlertDescription,
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
  SkeletonBlock,
  cn,
  interactiveFocusClassName,
} from '@iwana/ui';
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TenantStatusBadge } from '@/components/tenants/TenantStatusBadge';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { labelForTenantStatus, type TenantStatus } from '@/lib/tenant-status-label';

export type SortField = 'name' | 'status' | 'updatedAt' | 'createdAt';
export type SortDir = 'asc' | 'desc';

const ALL_STATUSES = 'TODAS' as const;
export type StatusFilterValue = TenantStatus | typeof ALL_STATUSES;

const STATUS_ORDER: TenantStatus[] = [
  'ACTIVE',
  'PROVISIONING',
  'PROVISIONING_FAILED',
  'SUSPENDED',
  'INACTIVE',
  'MARKED_FOR_DELETION',
];

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
  /** ADR-064 analogía: hay más páginas en servidor (offset/limit). */
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  sortField?: SortField;
  sortDir?: SortDir;
  onSortChange?: (field: SortField, dir: SortDir) => void;
  titleRef?: Ref<HTMLParagraphElement>;
}

const STATUS_FILTER_OPTIONS = [
  { value: ALL_STATUSES, label: 'Todos los estados' },
  ...STATUS_ORDER.map((key) => ({
    value: key,
    label: labelForTenantStatus(key, { form: 'plural' }),
  })),
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

function TableDate({ value }: { value?: string | undefined }) {
  const label = formatTableDate(value);
  const isValid = Boolean(value) && !Number.isNaN(new Date(value as string).getTime());

  if (!isValid) {
    return (
      <span className="font-mono text-sm tabular-nums text-gray-500 dark:text-gray-400">
        {label}
      </span>
    );
  }

  return (
    <time
      dateTime={value}
      className="font-mono text-sm tabular-nums text-gray-500 dark:text-gray-400"
    >
      {label}
    </time>
  );
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
    return <ChevronsUpDown className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />;
  return sortDir === 'asc' ? (
    <ChevronUp
      className="h-3.5 w-3.5 text-iwana-primary dark:text-iwana-primary-300"
      aria-hidden="true"
    />
  ) : (
    <ChevronDown
      className="h-3.5 w-3.5 text-iwana-primary dark:text-iwana-primary-300"
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
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
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
 * Soporta búsqueda por nombre/contacto, filtro por estado, ordenamiento por columna
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
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  sortField: controlledSortField,
  sortDir: controlledSortDir,
  onSortChange,
  titleRef,
}: TenantsTableProps) {
  const router = useRouter();
  const [internalSearch, setInternalSearch] = useState(searchQuery);
  const [internalStatus, setInternalStatus] = useState<StatusFilterValue>(ALL_STATUSES);
  const [internalSortField, setInternalSortField] = useState<SortField>('createdAt');
  const [internalSortDir, setInternalSortDir] = useState<SortDir>('desc');

  const search = onSearchChange ? searchQuery : internalSearch;
  const statusFilter = onStatusFilterChange ? (controlledStatus ?? ALL_STATUSES) : internalStatus;
  const sortField = onSortChange ? (controlledSortField ?? 'createdAt') : internalSortField;
  const sortDir = onSortChange ? (controlledSortDir ?? 'desc') : internalSortDir;
  const isServerFiltered = Boolean(onSearchChange && onStatusFilterChange);

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
    const nextDir: SortDir = sortField === field ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc';
    if (onSortChange) {
      onSortChange(field, nextDir);
      return;
    }
    if (sortField === field) {
      setInternalSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setInternalSortField(field);
    setInternalSortDir('asc');
  };

  const openTenantSettings = (tenantId: string) => {
    router.push(`/tenants/${tenantId}/settings`);
  };

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    const source = isServerFiltered
      ? tenants
      : tenants.filter((tenant) => {
          const matchSearch =
            tenant.name.toLowerCase().includes(q) ||
            tenant.slug.toLowerCase().includes(q) ||
            tenant.contactEmail?.toLowerCase().includes(q);
          const matchStatus = statusFilter === ALL_STATUSES || tenant.status === statusFilter;
          return matchSearch && matchStatus;
        });

    return [...source].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortField === 'status') cmp = a.status.localeCompare(b.status);
      else if (sortField === 'updatedAt')
        cmp = (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '');
      else cmp = a.createdAt.localeCompare(b.createdAt);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [isServerFiltered, search, statusFilter, sortField, sortDir, tenants]);

  const sortButtonClassName = (field: SortField) =>
    cn(
      'inline-flex min-h-11 items-center gap-1 text-xs tracking-wider uppercase hover:text-gray-700 dark:hover:text-gray-200',
      sortField === field
        ? 'font-semibold text-iwana-primary'
        : 'font-medium text-gray-500 dark:text-gray-400',
      interactiveFocusClassName,
    );

  const ariaSortFor = (field: SortField): 'ascending' | 'descending' | 'none' => {
    if (sortField !== field) {
      return 'none';
    }
    return sortDir === 'asc' ? 'ascending' : 'descending';
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-0 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle
          ref={titleRef}
          tabIndex={-1}
          id="tenants-directory-title"
          className={interactiveFocusClassName}
        >
          {PLATFORM_UI_COPY.tenants.tableTitle}
        </CardTitle>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type="search"
            aria-label="Buscar empresa"
            placeholder={PLATFORM_UI_COPY.tenants.searchPlaceholder}
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

          <Button asChild variant="primary" className="min-h-11 shrink-0">
            <Link href="/tenants/new">{PLATFORM_UI_COPY.tenants.newCompany}</Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="mt-4 p-0">
        <div className="px-6 pb-6">
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-dark-border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Lista de empresas">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 dark:border-dark-border dark:bg-dark-surface-3">
                    <th className="px-6 py-3 text-left" aria-sort={ariaSortFor('name')}>
                      <button
                        type="button"
                        onClick={() => handleSort('name')}
                        className={sortButtonClassName('name')}
                      >
                        Empresa <SortIcon field="name" sortField={sortField} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left" aria-sort={ariaSortFor('status')}>
                      <button
                        type="button"
                        onClick={() => handleSort('status')}
                        className={sortButtonClassName('status')}
                      >
                        Estado <SortIcon field="status" sortField={sortField} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left" aria-sort={ariaSortFor('updatedAt')}>
                      <button
                        type="button"
                        onClick={() => handleSort('updatedAt')}
                        className={sortButtonClassName('updatedAt')}
                      >
                        Última actualización{' '}
                        <SortIcon field="updatedAt" sortField={sortField} sortDir={sortDir} />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left" aria-sort={ariaSortFor('createdAt')}>
                      <button
                        type="button"
                        onClick={() => handleSort('createdAt')}
                        className={sortButtonClassName('createdAt')}
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
                      <tr key={`skeleton-${rowIndex}`}>
                        <td className="px-6 py-4">
                          <div className="space-y-2">
                            <SkeletonBlock className="h-4 w-40 rounded" />
                            <SkeletonBlock className="h-3 w-48 rounded" />
                            <SkeletonBlock className="h-3 w-24 rounded" />
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <SkeletonBlock className="h-5 w-20 rounded-full" />
                        </td>
                        <td className="px-6 py-4">
                          <SkeletonBlock className="h-4 w-24 rounded" />
                        </td>
                        <td className="px-6 py-4">
                          <SkeletonBlock className="h-4 w-24 rounded" />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <SkeletonBlock className="ml-auto h-9 w-9 rounded-lg" />
                        </td>
                      </tr>
                    ))
                  ) : error ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-10">
                        <Alert variant="error">
                          <AlertDescription>{error}</AlertDescription>
                          {onRetry ? (
                            <Button
                              type="button"
                              onClick={onRetry}
                              variant="secondary"
                              size="sm"
                              className="mt-3 min-h-11"
                            >
                              {PLATFORM_UI_COPY.dashboard.retry}
                            </Button>
                          ) : null}
                        </Alert>
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center">
                        {hasActiveFilters ? (
                          <div className="mx-auto flex max-w-md flex-col items-center gap-1">
                            <p className="text-sm font-medium text-iwana-primary dark:text-white">
                              {PLATFORM_UI_COPY.tenants.emptyFilterTitle}
                            </p>
                            <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
                              {PLATFORM_UI_COPY.tenants.emptyFilterHint}
                            </p>
                          </div>
                        ) : (
                          <div className="relative mx-auto flex max-w-md flex-col items-center gap-3">
                            <div className="flex flex-col items-center gap-1">
                              <p className="text-sm font-medium text-iwana-primary dark:text-white">
                                {PLATFORM_UI_COPY.tenants.emptyParkTitle}
                              </p>
                              <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
                                {PLATFORM_UI_COPY.tenants.emptyParkHint}
                              </p>
                            </div>
                            <Button asChild size="sm" variant="primary">
                              <Link href="/tenants/new">
                                {PLATFORM_UI_COPY.tenants.firstCompanyCta}
                              </Link>
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    rows.map((tenant) => (
                      <tr
                        key={tenant.id}
                        className="transition-colors hover:bg-gray-50 dark:hover:bg-dark-surface-3"
                      >
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
                            <div className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
                              {tenant.slug}
                            </div>
                          </button>
                        </td>

                        <td className="px-6 py-4">
                          <TenantStatusBadge status={tenant.status} />
                        </td>

                        <td className="px-6 py-4">
                          <TableDate value={tenant.updatedAt ?? undefined} />
                        </td>

                        <td className="px-6 py-4">
                          <TableDate value={tenant.createdAt} />
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

        {tenants.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-6 py-3 dark:border-dark-border">
            <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-iwana-secondary-700 dark:bg-dark-surface-3 dark:text-gray-300">
              {hasMore
                ? `${tenants.length} empresas cargadas`
                : `${tenants.length} ${tenants.length === 1 ? 'empresa' : 'empresas'}`}
            </span>
            {hasMore && onLoadMore ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="min-h-11"
                loading={isLoadingMore}
                disabled={isLoadingMore}
                onClick={onLoadMore}
              >
                Cargar más
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
