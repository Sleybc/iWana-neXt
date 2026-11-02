'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { LifecycleAction } from '@iwana/shared';
import { Button, DatePicker } from '@iwana/ui';
import type { Contract, CutoffAgendaItem, CutoffAgendaResponse } from '@/lib/api-client';
import { billingCyclesApi, contractsApi } from '@/lib/api-client';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  PortalAlert,
  PortalDataTableHead,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
  PortalTablePager,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
} from '@/components/shared/portal-ui';
import { SubscriberLifecycleDialog } from './SubscriberLifecycleDialog';
import { formatBillingDate } from './billing-cycle-ui';

const AGENDA_PAGE_SIZE = 25;
const AGENDA_RESOURCE = { singular: 'servicio', plural: 'servicios' } as const;

interface LoadedAgenda {
  date: string;
  page: number;
  response: CutoffAgendaResponse;
}

function parsePage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function isCivilDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = month === 2 ? (leapYear ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return day <= daysInMonth;
}

function pickerValue(date: string | null | undefined): Date | undefined {
  if (!date || !isCivilDate(date)) return undefined;
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year!, month! - 1, day!, 12);
}

function dateFromPicker(value: Date | undefined): string | null {
  if (!value) return null;
  const year = String(value.getFullYear()).padStart(4, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function groupAgendaItems(items: CutoffAgendaItem[]) {
  const groups = new Map<number, CutoffAgendaItem[]>();
  for (const item of items) {
    const itemsForCycle = groups.get(item.billingCycleDay) ?? [];
    itemsForCycle.push(item);
    groups.set(item.billingCycleDay, itemsForCycle);
  }
  return [...groups.entries()].sort(([left], [right]) => left - right);
}

export function CutoffAgendaClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');
  const page = parsePage(searchParams.get('page'));
  const [agenda, setAgenda] = useState<CutoffAgendaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [suspendingItem, setSuspendingItem] = useState<CutoffAgendaItem | null>(null);
  const [suspensionContract, setSuspensionContract] = useState<Contract | null>(null);
  const [suspensionLoadingId, setSuspensionLoadingId] = useState<string | null>(null);
  const [suspensionError, setSuspensionError] = useState<string | null>(null);
  const loadedAgendaRef = useRef<LoadedAgenda | null>(null);

  const updateUrl = useCallback(
    (updates: { date?: string; page?: number }, history: 'push' | 'replace') => {
      const params = new URLSearchParams(searchParams.toString());
      if (updates.date) params.set('date', updates.date);
      if (updates.page == null || updates.page <= 1) params.delete('page');
      else params.set('page', String(updates.page));
      const query = params.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      if (history === 'push') router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const loadAgenda = useCallback(() => setRetryToken((value) => value + 1), []);

  useEffect(() => {
    if (dateParam && !isCivilDate(dateParam)) {
      setAgenda(null);
      setError('La fecha seleccionada no es válida. Elige otra fecha.');
      setLoading(false);
      return;
    }

    if (
      dateParam &&
      loadedAgendaRef.current?.date === dateParam &&
      loadedAgendaRef.current.page === page
    ) {
      setAgenda(loadedAgendaRef.current.response);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void billingCyclesApi
      .cutoffAgenda({
        ...(dateParam ? { date: dateParam } : {}),
        page,
        limit: AGENDA_PAGE_SIZE,
      })
      .then((response) => {
        if (cancelled) return;
        loadedAgendaRef.current = { date: response.date, page, response };
        setAgenda(response);
        setLoading(false);
        setError(null);
        if (!dateParam) updateUrl({ date: response.date, page }, 'replace');
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setAgenda(null);
        setLoading(false);
        setError('No pudimos cargar la agenda.');
      });

    return () => {
      cancelled = true;
    };
  }, [dateParam, page, retryToken, updateUrl]);

  const groups = useMemo(() => groupAgendaItems(agenda?.items ?? []), [agenda?.items]);

  const handleDateChange = (selectedDate: Date | undefined) => {
    const nextDate = dateFromPicker(selectedDate);
    if (nextDate && nextDate !== dateParam) updateUrl({ date: nextDate, page: 1 }, 'push');
  };

  const openSuspension = async (item: CutoffAgendaItem) => {
    setSuspendingItem(item);
    setSuspensionLoadingId(item.contractId);
    setSuspensionError(null);
    try {
      const contract = await contractsApi.getById(item.contractId);
      setSuspensionContract(contract);
    } catch {
      setSuspensionError('No pudimos abrir la suspensión. Intenta de nuevo.');
    } finally {
      setSuspensionLoadingId(null);
    }
  };

  const suspensionContracts = suspensionContract ? [suspensionContract] : [];
  const suspensionAction: LifecycleAction = 'SUSPEND';
  const activeDate = dateParam ?? agenda?.date;
  const pageCount = agenda?.meta.totalPages ?? 1;
  const currentPage = agenda?.meta.page ?? page;
  const total = agenda?.meta.total ?? 0;

  return (
    <div className="space-y-6 pb-6">
      <PageHeader
        title="Agenda de corte"
        subtitle="Revisa los servicios con fecha de corte programada. La suspensión continúa siendo una decisión manual."
        actions={
          <Button asChild variant="secondary" className="min-h-11">
            <Link href="/dashboard/crm/subscribers">Volver a suscriptores</Link>
          </Button>
        }
      />

      <PortalPanel
        title="Servicios con corte programado"
        description="El sistema todavía no registra pagos: esta es la lista de servicios con corte programado"
        busy={loading}
        contentClassName="space-y-5"
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(15rem,22rem)_1fr] sm:items-end">
          <DatePicker
            id="cutoff-agenda-date"
            label="Fecha de corte"
            value={pickerValue(activeDate)}
            onChange={handleDateChange}
            disabled={loading && !activeDate}
            placeholder="Selecciona una fecha"
          />
          {agenda ? (
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200" role="status">
              {agenda.withoutCycleCount === 1
                ? '1 servicio activo sin ciclo de facturación'
                : `${agenda.withoutCycleCount} servicios activos sin ciclo de facturación`}
            </p>
          ) : null}
        </div>

        {suspensionError ? (
          <PortalAlert
            variant="error"
            title="No pudimos abrir la suspensión"
            description={suspensionError}
            action={
              suspendingItem ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  onClick={() => void openSuspension(suspendingItem)}
                >
                  Reintentar
                </Button>
              ) : undefined
            }
          />
        ) : null}

        {error ? (
          <PortalAlert
            variant="error"
            live="assertive"
            title="No pudimos cargar la agenda"
            description={error}
            action={
              <Button type="button" variant="secondary" className="min-h-11" onClick={loadAgenda}>
                Reintentar
              </Button>
            }
          />
        ) : null}

        {loading ? (
          <div className="space-y-4" aria-label="Cargando agenda" aria-busy="true">
            {[0, 1].map((cycle) => (
              <section key={cycle} className="space-y-3">
                <PortalSkeletonBlock className="h-5 w-32 rounded-lg" />
                <PortalSkeletonBlock className="h-12 w-full rounded-xl" />
                <PortalSkeletonBlock className="h-12 w-full rounded-xl" />
              </section>
            ))}
          </div>
        ) : null}

        {!loading && !error && agenda && agenda.items.length === 0 ? (
          <PortalEmptyState
            title="No hay servicios con corte programado para esta fecha"
            description="Selecciona otra fecha para revisar los servicios con corte programado."
            action={
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() =>
                  (
                    document.getElementById('cutoff-agenda-date') as HTMLButtonElement | null
                  )?.click()
                }
              >
                Cambiar fecha
              </Button>
            }
          />
        ) : null}

        {!loading && !error && groups.length > 0 ? (
          <div className="space-y-6">
            {groups.map(([cycleDay, items]) => {
              const groupId = `cutoff-cycle-${cycleDay}`;
              return (
                <section key={cycleDay} aria-labelledby={groupId} className="space-y-3">
                  <h2
                    id={groupId}
                    className="text-base font-semibold text-iwana-primary dark:text-white"
                  >
                    Ciclo: día {cycleDay}
                  </h2>

                  <div className="hidden md:block">
                    <div className={portalDataTableShellClassName}>
                      <table className="w-full min-w-[42rem] border-collapse text-left">
                        <thead className={portalDataTableHeadRowClassName}>
                          <tr>
                            <PortalDataTableHead>Suscriptor</PortalDataTableHead>
                            <PortalDataTableHead>Plan</PortalDataTableHead>
                            <PortalDataTableHead>Fecha de corte</PortalDataTableHead>
                            <PortalDataTableHead>Acciones</PortalDataTableHead>
                          </tr>
                        </thead>
                        <tbody className={portalDataTableBodyClassName}>
                          {items.map((item) => (
                            <tr key={item.contractId}>
                              <td className={portalDataTableCellClassName}>
                                {item.subscriberDisplayName}
                              </td>
                              <td className={portalDataTableCellClassName}>
                                {item.planName ?? 'Sin plan'}
                              </td>
                              <td className={`${portalDataTableCellClassName} tabular-nums`}>
                                {formatBillingDate(item.cutoffDate)}
                              </td>
                              <td className={portalDataTableCellClassName}>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Link
                                    href={`/dashboard/crm/subscribers/${item.subscriberId}`}
                                    className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-iwana-secondary-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:text-iwana-secondary-300"
                                  >
                                    Abrir ficha
                                  </Link>
                                  <AgendaActions
                                    item={item}
                                    loading={suspensionLoadingId === item.contractId}
                                    onSuspend={openSuspension}
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <ul className="space-y-3 md:hidden">
                    {items.map((item) => (
                      <li
                        key={item.contractId}
                        className="rounded-2xl border border-gray-200 bg-white p-4 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2"
                      >
                        <dl className="space-y-2 text-sm">
                          <div>
                            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
                              Suscriptor
                            </dt>
                            <dd className="font-medium text-gray-900 dark:text-white">
                              {item.subscriberDisplayName}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
                              Plan
                            </dt>
                            <dd className="text-gray-800 dark:text-gray-200">
                              {item.planName ?? 'Sin plan'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
                              Fecha de corte
                            </dt>
                            <dd className="tabular-nums text-gray-800 dark:text-gray-200">
                              {formatBillingDate(item.cutoffDate)}
                            </dd>
                          </div>
                        </dl>
                        <div className="mt-3 flex flex-wrap gap-3">
                          <Link
                            href={`/dashboard/crm/subscribers/${item.subscriberId}`}
                            className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-iwana-secondary-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:text-iwana-secondary-300"
                          >
                            Abrir ficha
                          </Link>
                          <AgendaActions
                            item={item}
                            loading={suspensionLoadingId === item.contractId}
                            onSuspend={openSuspension}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : null}

        {!loading && agenda && total > 0 ? (
          <PortalTablePager
            page={currentPage}
            pageCount={pageCount}
            onPageChange={(nextPage) => updateUrl({ date: agenda.date, page: nextPage }, 'push')}
            from={(currentPage - 1) * agenda.meta.limit + 1}
            to={Math.min(currentPage * agenda.meta.limit, total)}
            total={total}
            resource={AGENDA_RESOURCE}
            loading={loading}
          />
        ) : null}
      </PortalPanel>

      {suspensionContract ? (
        <SubscriberLifecycleDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setSuspensionContract(null);
              setSuspendingItem(null);
            }
          }}
          subscriberId={suspensionContract.subscriberId}
          contracts={suspensionContracts}
          action={suspensionAction}
          contractId={suspensionContract.id}
          onGoToServices={() =>
            router.push(`/dashboard/crm/subscribers/${suspensionContract.subscriberId}`)
          }
          onSuccess={async () => {
            loadedAgendaRef.current = null;
            loadAgenda();
          }}
        />
      ) : null}
    </div>
  );
}

function AgendaActions({
  item,
  loading,
  onSuspend,
}: {
  item: CutoffAgendaItem;
  loading: boolean;
  onSuspend: (item: CutoffAgendaItem) => Promise<void>;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      className="min-h-11"
      loading={loading}
      disabled={loading}
      aria-label={`Suspender servicio de ${item.subscriberDisplayName}`}
      onClick={() => void onSuspend(item)}
    >
      Suspender
    </Button>
  );
}
