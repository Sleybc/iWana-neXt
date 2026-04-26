// apps/web/src/components/dashboard/TenantsTable.tsx
'use client';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Select } from '@iwana/ui';
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';

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
};

/** Etiquetas legibles por estado de tenant. */
const statusLabels: Record<TenantStatus, string> = {
  ACTIVE: 'Activo',
  PROVISIONING: 'Provisionando',
  PROVISIONING_FAILED: 'Error provisión',
  SUSPENDED: 'Suspendido',
  INACTIVE: 'Inactivo',
};

const ALL_STATUSES = 'TODAS' as const;

const STATUS_FILTER_OPTIONS = [
  { value: ALL_STATUSES, label: 'Todos los estados' },
  ...((Object.keys(statusLabels) as TenantStatus[]).map((key) => ({
    value: key,
    label: statusLabels[key],
  })) satisfies Array<{ value: TenantStatus; label: string }>),
];

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

/** Dropdown de acciones por fila (3 puntos). Implementado con estado local sin librerías extra.
 *  Usa position:fixed calculado desde getBoundingClientRect para escapar de contenedores
 *  con overflow:hidden (como el wrapper de la tabla con bordes redondeados). */
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
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Calcular posición fixed del menú relativa al viewport al momento de abrirlo
  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 192; // w-48
      const menuHeight = 160; // estimado para 3-4 items
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < menuHeight ? rect.top - menuHeight - 4 : rect.bottom + 4;
      const left = rect.right - menuWidth;
      setMenuStyle({ position: 'fixed', top, left, zIndex: 9999 });
    }
    setOpen((prev) => !prev);
  };

  // Cerrar el dropdown al hacer clic fuera
  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  // Cerrar al presionar Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const canSuspend = tenantStatus === 'ACTIVE' && !!onSuspend;
  const canActivate = (tenantStatus === 'SUSPENDED' || tenantStatus === 'INACTIVE') && !!onActivate;
  const canRetry =
    (tenantStatus === 'PROVISIONING_FAILED' || tenantStatus === 'PROVISIONING') &&
    !!onRetryProvisioning;

  return (
    <div className="inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Abrir menú de acciones"
        aria-haspopup="true"
        onClick={handleToggle}
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-dark-surface-4 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          style={menuStyle}
          className="w-48 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-dark-surface-2"
        >
          {/* Ver configuración — siempre disponible */}
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              router.push(`/tenants/${tenantId}/settings`);
            }}
            className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-dark-surface-3 rounded-t-xl last:rounded-b-xl transition-colors"
          >
            Ver configuración
          </button>

          {/* Suspender — solo si está ACTIVE */}
          {canSuspend && (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                onSuspend!(tenantId);
              }}
              className="w-full px-4 py-2.5 text-left text-sm text-error-700 hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-500/10 last:rounded-b-xl transition-colors"
            >
              Suspender
            </button>
          )}

          {/* Reactivar — solo si está SUSPENDED o INACTIVE */}
          {canActivate && (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                onActivate!(tenantId);
              }}
              className="w-full px-4 py-2.5 text-left text-sm text-success-700 hover:bg-success-50 dark:text-success-400 dark:hover:bg-success-500/10 last:rounded-b-xl transition-colors"
            >
              Reactivar
            </button>
          )}

          {/* Reintentar — solo si está FAILED o PROVISIONING */}
          {canRetry && (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                onRetryProvisioning!(tenantId);
              }}
              className="w-full px-4 py-2.5 text-left text-sm text-warning-700 hover:bg-warning-50 dark:text-warning-400 dark:hover:bg-warning-500/10 last:rounded-b-xl transition-colors"
            >
              Reintentar provisioning
            </button>
          )}
        </div>
      )}
    </div>
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
  onSuspend,
  onActivate,
  onRetryProvisioning,
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
        <CardTitle>Empresas de la plataforma</CardTitle>

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
          <div className="w-full sm:w-[210px]">
            <Select
              id="tenant-status-filter"
              options={STATUS_FILTER_OPTIONS}
              value={statusFilter}
              aria-label="Filtrar por estado"
              onChange={(e) =>
                setStatusFilter(e.target.value as TenantStatus | typeof ALL_STATUSES)
              }
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 mt-4">
        {/* px-6 alinea la tabla con los márgenes del CardHeader */}
        <div className="px-6 pb-6">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Lista de empresas">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-dark-surface-3">
                    <th className="px-6 py-3 text-left">
                      <button
                        type="button"
                        onClick={() => handleSort('name')}
                        className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        Empresa <SortIcon field="name" sortField={sortField} sortDir={sortDir} />
                      </button>
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Suscriptores
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        type="button"
                        onClick={() => handleSort('createdAt')}
                        className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        Fecha creación{' '}
                        <SortIcon field="createdAt" sortField={sortField} sortDir={sortDir} />
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
                        Cargando empresas...
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
                        No se encontraron empresas con los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((tenant) => (
                      <tr
                        key={tenant.id}
                        className="hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors"
                      >
                        {/* Columna Empresa: nombre principal + slug en gris debajo */}
                        <td className="px-6 py-4">
                          <div className="font-medium text-iwana-primary dark:text-white">
                            {tenant.name}
                          </div>
                          <div className="mt-0.5 font-mono text-xs text-gray-600 dark:text-gray-300">
                            {tenant.slug}
                          </div>
                        </td>

                        {/* Columna Estado: pill badge */}
                        <td className="px-6 py-4">
                          <span className={statusPillClasses[tenant.status]}>
                            {statusLabels[tenant.status]}
                          </span>
                        </td>

                        {/* Columna Suscriptores: dato no disponible aún, mostrar dash */}
                        <td className="px-6 py-4 text-gray-500 dark:text-gray-400">—</td>

                        {/* Columna Fecha creación */}
                        <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                          {tenant.createdAt
                            ? new Date(tenant.createdAt).toLocaleDateString('es-CO', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : '—'}
                        </td>

                        {/* Columna Acciones: dropdown 3 puntos */}
                        <td className="px-6 py-4 text-right">
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
        {/* cierre px-6 pb-6 */}

        {/* Contador de resultados */}
        {filtered.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-100 dark:border-dark-border">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Mostrando {filtered.length} de {tenants.length} empresas
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
