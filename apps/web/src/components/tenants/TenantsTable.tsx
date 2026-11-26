// apps/web/src/components/tenants/TenantsTable.tsx
'use client';
import { useEffect, useMemo, useState, type Ref } from 'react';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
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
import type { TenantListItem } from '@/lib/api-client';
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

type Tenant = Pick<TenantListItem, 'id' | 'name' | 'slug' | 'status' | 'createdAt'> &
  Partial<Pick<TenantListItem, 'contactEmail' | 'updatedAt'>>;

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
  titleRef?: Ref<HTMLHeadingElement>;
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
    return <span className="text-xs text-gray-600 dark:text-gray-300">{label}</span>;
  }

  return (
    <time
      dateTime={value}
      className="font-mono text-xs whitespace-nowrap tabular-nums text-gray-600 dark:text-gray-300"
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
        className="min-h-11 min-w-11"
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
      'inline-flex min-h-11 items-center gap-1 text-left text-xs whitespace-nowrap hover:underline',
      sortField === field
        ? 'font-semibold text-iwana-primary dark:text-iwana-primary-300'
        : 'font-medium text-gray-600 dark:text-gray-300',
      interactiveFocusClassName,
    );

  const ariaSortFor = (field: SortField): 'ascending' | 'descending' | 'none' => {
    if (sortField !== field) {
      return 'none';
    }
    return sortDir === 'asc' ? 'ascending' : 'descending';
  };

  return (
    <Card className="min-w-0 p-4 sm:p-5" aria-busy={isLoading}>
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <h2
          ref={titleRef}
          tabIndex={-1}
          id="tenants-directory-title"
          className={cn(
            'text-base font-semibold text-iwana-primary dark:text-white',
            interactiveFocusClassName,
          )}
        >
          {PLATFORM_UI_COPY.tenants.tableTitle}
        </h2>

        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-1 sm:basis-96 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <Input
            type="search"
            aria-label="Buscar empresa"
            placeholder={PLATFORM_UI_COPY.tenants.searchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            containerClassName="min-w-0 sm:max-w-sm sm:flex-auto sm:basis-64"
            className="min-h-11"
            startIcon={<Search className="h-4 w-4" />}
          />

          <div className="min-w-0 sm:w-48">
            <Select
              id="tenant-status-filter"
              options={STATUS_FILTER_OPTIONS}
              value={statusFilter}
              aria-label="Filtrar por estado"
              onChange={(e) => setStatusFilter(e.target.value as StatusFilterValue)}
            />
          </div>

          {hasActiveFilters ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => {
                setSearch('');
                setStatusFilter(ALL_STATUSES);
              }}
            >
              Limpiar filtro
            </Button>
          ) : null}

          <Button asChild variant="primary" className="min-h-11 shrink-0">
            <Link href="/tenants/new">{PLATFORM_UI_COPY.tenants.newCompany}</Link>
          </Button>
        </div>
      </div>

      {error && !isLoading ? (
        <Alert variant="error" className="mt-4">
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
      ) : !isLoading && rows.length === 0 ? (
        <EmptyState
          className="py-10 text-center"
          message={
            <>
              <span className="block font-medium text-iwana-primary dark:text-white">
                {hasActiveFilters
                  ? PLATFORM_UI_COPY.tenants.emptyFilterTitle
                  : PLATFORM_UI_COPY.tenants.emptyParkTitle}
              </span>
              {hasActiveFilters
                ? PLATFORM_UI_COPY.tenants.emptyFilterHint
                : PLATFORM_UI_COPY.tenants.emptyParkHint}
            </>
          }
          action={
            hasActiveFilters ? undefined : (
              <Button asChild size="sm" variant="primary" className="min-h-11">
                <Link href="/tenants/new">{PLATFORM_UI_COPY.tenants.firstCompanyCta}</Link>
              </Button>
            )
          }
        />
      ) : (
        <div
          className={cn('mt-2 overflow-x-auto p-1', interactiveFocusClassName)}
          role="region"
          aria-labelledby="tenants-directory-title"
          tabIndex={0}
        >
          <table className="w-full text-sm" aria-label="Lista de empresas">
            <thead>
              <tr className="border-b border-gray-100 text-left dark:border-dark-border">
                <th scope="col" className="min-w-36 pr-4" aria-sort={ariaSortFor('name')}>
                  <button
                    type="button"
                    onClick={() => handleSort('name')}
                    className={sortButtonClassName('name')}
                  >
                    Empresa <SortIcon field="name" sortField={sortField} sortDir={sortDir} />
                  </button>
                </th>
                <th scope="col" className="pr-4" aria-sort={ariaSortFor('status')}>
                  <button
                    type="button"
                    onClick={() => handleSort('status')}
                    className={sortButtonClassName('status')}
                  >
                    Estado <SortIcon field="status" sortField={sortField} sortDir={sortDir} />
                  </button>
                </th>
                <th scope="col" className="pr-4" aria-sort={ariaSortFor('updatedAt')}>
                  <button
                    type="button"
                    onClick={() => handleSort('updatedAt')}
                    className={sortButtonClassName('updatedAt')}
                  >
                    Última actualización{' '}
                    <SortIcon field="updatedAt" sortField={sortField} sortDir={sortDir} />
                  </button>
                </th>
                <th scope="col" className="pr-4" aria-sort={ariaSortFor('createdAt')}>
                  <button
                    type="button"
                    onClick={() => handleSort('createdAt')}
                    className={sortButtonClassName('createdAt')}
                  >
                    Fecha de creación{' '}
                    <SortIcon field="createdAt" sortField={sortField} sortDir={sortDir} />
                  </button>
                </th>
                <th
                  scope="col"
                  className="text-right text-xs font-medium text-gray-600 dark:text-gray-300"
                >
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
              {isLoading
                ? Array.from({ length: 5 }).map((_, rowIndex) => (
                    <tr key={`skeleton-${rowIndex}`}>
                      <td className="py-3 pr-4">
                        <div className="space-y-2">
                          <SkeletonBlock className="h-4 w-40 rounded" />
                          <SkeletonBlock className="h-3 w-40 rounded" />
                          <SkeletonBlock className="h-3 w-20 rounded" />
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <SkeletonBlock className="h-5 w-20 rounded-full" />
                      </td>
                      <td className="py-3 pr-4">
                        <SkeletonBlock className="h-4 w-20 rounded" />
                      </td>
                      <td className="py-3 pr-4">
                        <SkeletonBlock className="h-4 w-20 rounded" />
                      </td>
                      <td className="py-3 text-right">
                        <SkeletonBlock className="ml-auto h-9 w-9 rounded-lg" />
                      </td>
                    </tr>
                  ))
                : rows.map((tenant) => (
                    <tr
                      key={tenant.id}
                      className="transition-colors hover:bg-iwana-surface-soft dark:hover:bg-dark-surface-3"
                    >
                      <td className="py-2 pr-4 align-middle">
                        <button
                          type="button"
                          className={cn(
                            'block min-h-11 w-full cursor-pointer rounded-lg py-1 text-left wrap-anywhere',
                            interactiveFocusClassName,
                          )}
                          aria-label={`Ver detalle de ${tenant.name}`}
                          onClick={() => openTenantSettings(tenant.id)}
                        >
                          <div className="font-medium text-iwana-primary hover:underline dark:text-white">
                            {tenant.name}
                          </div>
                          <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
                            {tenant.contactEmail || 'Sin contacto principal registrado'}
                          </div>
                          <div className="mt-0.5 font-mono text-xs text-gray-600 dark:text-gray-300">
                            {tenant.slug}
                          </div>
                        </button>
                      </td>

                      <td className="py-2 pr-4 align-middle">
                        <TenantStatusBadge status={tenant.status} />
                      </td>

                      <td className="py-2 pr-4 align-middle">
                        <TableDate value={tenant.updatedAt ?? undefined} />
                      </td>

                      <td className="py-2 pr-4 align-middle">
                        <TableDate value={tenant.createdAt} />
                      </td>

                      <td className="py-2 text-right align-middle">
                        <ActionsDropdown
                          tenantId={tenant.id}
                          tenantStatus={tenant.status}
                          {...(onSuspend && { onSuspend })}
                          {...(onActivate && { onActivate })}
                          {...(onRetryProvisioning && { onRetryProvisioning })}
                        />
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      {tenants.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-dark-border">
          <span className="text-xs text-gray-600 dark:text-gray-300">
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
    </Card>
  );
}
