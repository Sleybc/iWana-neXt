'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Input, Select } from '@iwana/ui';
import { AlertTriangle, ArrowRight, Loader2, Plus, Search, Users } from 'lucide-react';
import {
  ApiError,
  type ListSubscribersParams,
  type SubscriberRecord,
  subscribersApi,
} from '@/lib/api-client';
import { CustomerSegment, PersonType, SubscriberStatus } from '@iwana/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  CUSTOMER_SEGMENT_META,
  CUSTOMER_SEGMENT_OPTIONS,
  PERSON_TYPE_META,
  PERSON_TYPE_OPTIONS,
  STRATUM_OPTIONS,
  SUBSCRIBER_STATUS_META,
  SUBSCRIBER_STATUS_OPTIONS,
  formatDocumentDisplay,
  formatSubscriberLocation,
  formatSubscriberDate,
  formatSubscriberName,
  formatVatTreatmentLabel,
} from './subscriber-ui';

const tableHeadClass =
  'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400';
const cellClass = 'px-4 py-3 align-middle text-sm text-gray-700 dark:text-gray-200';

function mapError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  return 'No fue posible cargar los suscriptores. Intenta de nuevo.';
}

export function SubscribersListClient() {
  const [records, setRecords] = useState<SubscriberRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [personTypeFilter, setPersonTypeFilter] = useState('');
  const [segmentFilter, setSegmentFilter] = useState('');
  const [stratumFilter, setStratumFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const filters = useMemo<ListSubscribersParams>(() => {
    const current: ListSubscribersParams = { page, limit };

    if (statusFilter) current.status = statusFilter as SubscriberStatus;
    if (personTypeFilter) current.personType = personTypeFilter as PersonType;
    if (segmentFilter) current.customerSegment = segmentFilter as CustomerSegment;
    if (stratumFilter) current.stratum = Number(stratumFilter);

    return current;
  }, [limit, page, personTypeFilter, segmentFilter, statusFilter, stratumFilter]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        if (searchValue.trim()) {
          const response = await subscribersApi.search({
            documentNumber: searchValue.trim(),
            nit: searchValue.trim(),
            email: searchValue.trim(),
            phone: searchValue.trim(),
          });
          setRecords(response.data);
          setTotal(response.data.length);
        } else {
          const response = await subscribersApi.list(filters);
          setRecords(response.data);
          setTotal(response.total);
        }
      } catch (loadError) {
        setError(mapError(loadError));
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [filters, searchValue]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6 pb-6">
      <PageHeader
        title="Suscriptores"
        subtitle="Consulta, filtra y gestiona el ciclo de vida comercial de los suscriptores de la empresa."
        actions={
          <Button asChild>
            <Link href="/dashboard/crm/subscribers/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuevo suscriptor
            </Link>
          </Button>
        }
      />

      <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-sm dark:border-dark-border dark:bg-dark-surface-2/95">
        <div className="border-b border-gray-100/80 px-5 py-5 dark:border-dark-border">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                Radar de suscriptores
              </p>
              <h2 className="text-lg font-semibold text-iwana-primary dark:text-white">
                Operación comercial y postventa
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Usa filtros combinados o búsqueda determinista para ir directo al registro correcto.
              </p>
            </div>
            <Badge
              variant="neutral"
              className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
            >
              {total} registros
            </Badge>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_220px_220px_220px_180px] lg:items-end">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                aria-hidden="true"
              />
              <Input
                value={searchValue}
                onChange={(event) => {
                  setSearchValue(event.target.value);
                  setPage(1);
                }}
                placeholder="Buscar por documento, NIT, correo o teléfono"
                className="h-12 pl-11"
              />
            </div>

            <Select
              id="subscriber-status-filter"
              label="Estado"
              className="h-12"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              options={SUBSCRIBER_STATUS_OPTIONS}
            >
              <option value="">Todos</option>
            </Select>

            <Select
              id="subscriber-person-type-filter"
              label="Tipo persona"
              className="h-12"
              value={personTypeFilter}
              onChange={(event) => {
                setPersonTypeFilter(event.target.value);
                setPage(1);
              }}
              options={[...PERSON_TYPE_OPTIONS]}
            >
              <option value="">Todos</option>
            </Select>

            <Select
              id="subscriber-segment-filter"
              label="Segmento"
              className="h-12"
              value={segmentFilter}
              onChange={(event) => {
                setSegmentFilter(event.target.value);
                setPage(1);
              }}
              options={[...CUSTOMER_SEGMENT_OPTIONS]}
            >
              <option value="">Todos</option>
            </Select>

            <Select
              id="subscriber-stratum-filter"
              label="Estrato"
              className="h-12"
              value={stratumFilter}
              onChange={(event) => {
                setStratumFilter(event.target.value);
                setPage(1);
              }}
              options={[...STRATUM_OPTIONS]}
            >
              <option value="">Todos</option>
            </Select>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/90 px-5 py-4 text-sm text-red-700 shadow-[var(--shadow-sm)] dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-[#f6f8f4] dark:border-dark-border dark:bg-dark-surface-3">
                <th className={tableHeadClass}>Suscriptor</th>
                <th className={tableHeadClass}>Documento / NIT</th>
                <th className={tableHeadClass}>Tipo</th>
                <th className={tableHeadClass}>Segmento</th>
                <th className={tableHeadClass}>IVA</th>
                <th className={tableHeadClass}>Ubicación</th>
                <th className={tableHeadClass}>Estado</th>
                <th className={tableHeadClass}>Creado</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                      Cargando suscriptores...
                    </div>
                  </td>
                </tr>
              )}

              {!loading && records.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <Users
                        className="h-10 w-10 text-gray-300 dark:text-gray-600"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="font-semibold text-gray-700 dark:text-gray-200">
                          No hay suscriptores para mostrar.
                        </p>
                        <p className="text-sm">
                          Ajusta filtros o crea el primer registro de la empresa.
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {!loading &&
                records.map((subscriber) => (
                  <tr
                    key={subscriber.id}
                    className="border-b border-gray-100 last:border-b-0 hover:bg-[#f8faf5]/80 dark:border-dark-border dark:hover:bg-dark-surface-3/50"
                  >
                    <td className={cellClass}>
                      <Link
                        href={`/dashboard/crm/subscribers/${subscriber.id}`}
                        className="group block"
                      >
                        <p className="font-semibold text-iwana-primary transition-colors group-hover:text-iwana-secondary-700 dark:text-white dark:group-hover:text-iwana-secondary-300">
                          {formatSubscriberName(subscriber)}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {subscriber.email || subscriber.phone || 'Sin contacto principal'}
                        </p>
                      </Link>
                    </td>
                    <td className={cellClass}>{formatDocumentDisplay(subscriber)}</td>
                    <td className={cellClass}>
                      <Badge
                        variant={PERSON_TYPE_META[subscriber.personType].variant}
                        className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide"
                      >
                        {PERSON_TYPE_META[subscriber.personType].label}
                      </Badge>
                    </td>
                    <td className={cellClass}>
                      <Badge
                        variant="neutral"
                        className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide"
                      >
                        {CUSTOMER_SEGMENT_META[subscriber.customerSegment].label}
                      </Badge>
                    </td>
                    <td className={cellClass}>
                      {formatVatTreatmentLabel(subscriber.vatTreatment)}
                    </td>
                    <td className={cellClass}>
                      {formatSubscriberLocation(subscriber.city, subscriber.department)}
                    </td>
                    <td className={cellClass}>
                      <Badge
                        variant={SUBSCRIBER_STATUS_META[subscriber.status].variant}
                        className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide"
                      >
                        {SUBSCRIBER_STATUS_META[subscriber.status].label}
                      </Badge>
                    </td>
                    <td className={cellClass}>{formatSubscriberDate(subscriber.createdAt)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 dark:border-dark-border md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Página {page} de {Math.max(1, Math.ceil(total / limit))}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              id="subscriber-limit-filter"
              label="Límite"
              className="h-11 min-w-[120px]"
              value={String(limit)}
              onChange={(event) => {
                setLimit(Number(event.target.value));
                setPage(1);
              }}
              options={[
                { value: '10', label: '10' },
                { value: '25', label: '25' },
                { value: '50', label: '50' },
              ]}
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((current) => current + 1)}
              >
                Siguiente
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
