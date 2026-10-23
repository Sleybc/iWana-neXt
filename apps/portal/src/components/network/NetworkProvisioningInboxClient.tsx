'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AccessPermissionKey, ExecutionOrderStatus } from '@iwana/shared';
import type {
  ControlMethod,
  ControlParams,
  Ipv4NetworkDto,
  ProvisioningInboxQueue,
  ProvisioningInboxRowDto,
  ProvisioningOrderContextDto,
  RouterDto,
} from '@iwana/shared';
import { Badge, Button, Input, Select } from '@iwana/ui';
import { ExternalLink } from 'lucide-react';
import { usePermissions } from '@/components/access-control/permissions-context';
import {
  NetworkCatalogDrawerFrame,
  NetworkFormField,
  networkFormControlProps,
} from '@/components/network/NetworkCatalogDrawerFrame';
import {
  PortalAlert,
  PortalEmptyState,
  PortalSkeletonBlock,
  PortalTablePager,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
  portalModuleTabTriggerClassName,
  portalModuleTabsShellClassName,
  portalModuleTabsTrackClassName,
} from '@/components/shared/portal-ui';
import {
  collectListPages,
  EMPTY_LIST_META,
  listPageWindow,
  normalizeListMeta,
} from '@/lib/list-meta';
import { ApiError, networkApi } from '@/lib/api-client';
import {
  formatNetworkDate,
  getControlMethodProductLabel,
  getProvisioningErrorMessage,
  getProvisioningStatusLabel,
  NETWORK_PROVISIONING_COPY,
} from './network-provisioning-labels';
import { EXECUTION_ORDER_STATUS_LABELS } from '@/components/operations/operations-labels';

const QUEUES: readonly ProvisioningInboxQueue[] = [
  'IN_EXECUTION',
  'FAILED',
  'CLOSED_UNPROVISIONED',
];
const QUEUE_LABELS: Record<ProvisioningInboxQueue, string> = {
  IN_EXECUTION: 'En ejecución',
  FAILED: 'Sin aprovisionar',
  CLOSED_UNPROVISIONED: 'Cerradas sin aprovisionar',
};
const EMPTY_LABELS: Record<ProvisioningInboxQueue, string> = {
  IN_EXECUTION: 'No hay instalaciones en ejecución pendientes.',
  FAILED: 'No hay servicios sin aprovisionar.',
  CLOSED_UNPROVISIONED: 'No hay instalaciones cerradas pendientes.',
};
const LIMIT = 20;
const CATALOG_LIMIT = 100;

function parseQueue(value: string | null): ProvisioningInboxQueue {
  return QUEUES.find((queue) => queue === value) ?? 'IN_EXECUTION';
}

function parsePage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function queueErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403)
    return NETWORK_PROVISIONING_COPY.inboxDenied;
  return NETWORK_PROVISIONING_COPY.inboxLoadError;
}

function toExecutionOrderStatus(status: ExecutionOrderStatus): string {
  return EXECUTION_ORDER_STATUS_LABELS[status] ?? 'Estado de la orden no disponible';
}

export function NetworkProvisioningInboxClient() {
  const { hasPermission } = usePermissions();
  const canRegularize = hasPermission(AccessPermissionKey.NETWORK_PROVISIONING_REGULARIZE);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queue = parseQueue(searchParams.get('queue'));
  const page = parsePage(searchParams.get('page'));
  const [rowsByQueue, setRowsByQueue] = useState<
    Partial<Record<ProvisioningInboxQueue, ProvisioningInboxRowDto[]>>
  >({});
  const [metaByQueue, setMetaByQueue] = useState<
    Partial<Record<ProvisioningInboxQueue, ReturnType<typeof normalizeListMeta>>>
  >({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeRow, setActiveRow] = useState<ProvisioningInboxRowDto | null>(null);
  const rows = rowsByQueue[queue] ?? [];
  const meta = metaByQueue[queue] ?? EMPTY_LIST_META;

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await networkApi.listProvisioningInbox({ queue, page, limit: LIMIT });
      const data = Array.isArray(response.data) ? response.data : [];
      setRowsByQueue((current) => ({ ...current, [queue]: data }));
      setMetaByQueue((current) => ({
        ...current,
        [queue]: normalizeListMeta(response.meta, { dataLength: data.length, limit: LIMIT }),
      }));
    } catch (error) {
      setLoadError(queueErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [page, queue]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const setLocation = (next: { queue?: ProvisioningInboxQueue; page?: number }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next.queue) params.set('queue', next.queue);
    params.set('page', String(next.page ?? (next.queue ? 1 : page)));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const pageMeta = useMemo(
    () => normalizeListMeta(meta, { dataLength: rows.length, limit: LIMIT }),
    [meta, rows.length],
  );
  const window = listPageWindow({
    page: pageMeta.page ?? page,
    limit: pageMeta.limit || LIMIT,
    total: pageMeta.total,
  });

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <p className="portal-eyebrow">Red</p>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Bandeja de aprovisionamiento
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300">
          Revisa instalaciones en curso, servicios pendientes y órdenes cerradas que requieren
          regularización.
        </p>
      </header>

      <div className={portalModuleTabsShellClassName}>
        <div className="min-w-0 flex-1">
          <p className="portal-eyebrow">Seguimiento de instalaciones</p>
          <h2 className="mt-1 text-base font-semibold text-gray-900 dark:text-white">
            {QUEUE_LABELS[queue]}
          </h2>
          <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">
            Elige una lista para revisar las órdenes y sus servicios técnicos.
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Listas de aprovisionamiento"
          className={portalModuleTabsTrackClassName}
        >
          {QUEUES.map((item) => (
            <Button
              key={item}
              type="button"
              variant="ghost"
              role="tab"
              aria-selected={item === queue}
              aria-controls="provisioning-inbox-panel"
              id={`provisioning-inbox-tab-${item.toLowerCase()}`}
              tabIndex={item === queue ? 0 : -1}
              data-state={item === queue ? 'active' : 'inactive'}
              onKeyDown={(event) => {
                const currentIndex = QUEUES.indexOf(item);
                let nextIndex: number | null = null;
                if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % QUEUES.length;
                if (event.key === 'ArrowLeft')
                  nextIndex = (currentIndex + QUEUES.length - 1) % QUEUES.length;
                if (event.key === 'Home') nextIndex = 0;
                if (event.key === 'End') nextIndex = QUEUES.length - 1;
                if (nextIndex === null) return;
                event.preventDefault();
                const nextQueue = QUEUES[nextIndex];
                if (!nextQueue) return;
                event.currentTarget.parentElement
                  ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                  [nextIndex]?.focus();
                setLocation({ queue: nextQueue });
              }}
              onClick={() => setLocation({ queue: item })}
              className={portalModuleTabTriggerClassName}
            >
              {QUEUE_LABELS[item]}
            </Button>
          ))}
        </div>
      </div>

      <section
        id="provisioning-inbox-panel"
        role="tabpanel"
        aria-labelledby={`provisioning-inbox-tab-${queue.toLowerCase()}`}
        aria-busy={loading}
        tabIndex={0}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary"
      >
        {loadError ? (
          <PortalAlert
            variant="error"
            title="No pudimos cargar esta lista"
            description={loadError}
            action={
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() => void loadQueue()}
              >
                Reintentar
              </Button>
            }
          />
        ) : null}
        {loading && rows.length === 0 ? (
          <div className="space-y-3" aria-busy="true">
            <p className="sr-only" role="status" aria-live="polite">
              Cargando la lista seleccionada
            </p>
            {[0, 1, 2].map((item) => (
              <PortalSkeletonBlock key={item} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : !loadError && !loading && rows.length === 0 ? (
          <PortalEmptyState
            title={EMPTY_LABELS[queue]}
            description="La lista se actualizará cuando haya órdenes que requieran atención."
            action={
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() => void loadQueue()}
              >
                Actualizar lista
              </Button>
            }
          />
        ) : rows.length > 0 ? (
          <div className={portalDataTableShellClassName}>
            <div
              className="overflow-x-auto"
              role="region"
              aria-label={`Tabla: ${QUEUE_LABELS[queue]}`}
              tabIndex={0}
            >
              <table className="min-w-[900px] w-full text-sm">
                <thead>
                  <tr className={portalDataTableHeadRowClassName}>
                    <th scope="col" className={portalDataTableHeadClassName}>
                      Orden de trabajo
                    </th>
                    <th scope="col" className={portalDataTableHeadClassName}>
                      Suscriptor
                    </th>
                    <th scope="col" className={portalDataTableHeadClassName}>
                      Estado de la orden
                    </th>
                    <th scope="col" className={portalDataTableHeadClassName}>
                      Técnico asignado
                    </th>
                    <th scope="col" className={portalDataTableHeadClassName}>
                      Servicio técnico
                    </th>
                    <th scope="col" className={portalDataTableHeadClassName}>
                      Dirección IP
                    </th>
                    <th scope="col" className={portalDataTableHeadClassName}>
                      Actualización
                    </th>
                    {queue === 'CLOSED_UNPROVISIONED' ? (
                      <th scope="col" className={portalDataTableHeadClassName}>
                        Cierre
                      </th>
                    ) : null}
                    <th scope="col" className={portalDataTableHeadClassName}>
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className={portalDataTableBodyClassName}>
                  {rows.map((row) => (
                    <tr key={row.executionOrderId}>
                      <th
                        scope="row"
                        className={`${portalDataTableCellClassName} text-left font-mono font-semibold text-gray-900 dark:text-white`}
                      >
                        {row.executionOrderNumber}
                      </th>
                      <td className={portalDataTableCellClassName}>{row.subscriberDisplayLabel}</td>
                      <td className={portalDataTableCellClassName}>
                        {toExecutionOrderStatus(row.executionOrderStatus)}
                      </td>
                      <td className={portalDataTableCellClassName}>
                        {row.assignedTechnician?.name ?? 'Sin técnico asignado'}
                      </td>
                      <td className={portalDataTableCellClassName}>
                        {row.failureReason === 'CLOSED_WITHOUT_CERTIFICATION'
                          ? 'Cerrada sin certificar'
                          : getProvisioningStatusLabel(row.provisioningStatus)}
                      </td>
                      <td className={`${portalDataTableCellClassName} font-mono`}>
                        {row.ip ?? '—'}
                      </td>
                      <td className={portalDataTableCellClassName}>
                        {formatNetworkDate(row.updatedAt)}
                      </td>
                      {queue === 'CLOSED_UNPROVISIONED' ? (
                        <td className={portalDataTableCellClassName}>
                          {formatNetworkDate(row.closedAt)}
                        </td>
                      ) : null}
                      <td className={portalDataTableCellClassName}>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/dashboard/operations/execution-orders?executionOrderId=${encodeURIComponent(row.executionOrderId)}`}
                            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-iwana-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:text-white"
                          >
                            Abrir OT <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          </Link>
                          {queue === 'CLOSED_UNPROVISIONED' && canRegularize ? (
                            <Button
                              type="button"
                              variant="secondary"
                              className="min-h-11"
                              onClick={() => setActiveRow(row)}
                            >
                              Regularizar
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PortalTablePager
              page={pageMeta.page ?? page}
              pageCount={Math.max(1, pageMeta.totalPages ?? 1)}
              onPageChange={(next) => setLocation({ page: next })}
              from={window.from}
              to={window.to}
              total={pageMeta.total}
              resource={{ singular: 'orden', plural: 'órdenes' }}
              totalIsEstimate={pageMeta.totalIsEstimate}
              loading={loading}
            />
          </div>
        ) : null}
      </section>

      {activeRow ? (
        <RegularizeProvisioningDrawer
          row={activeRow}
          onClose={() => setActiveRow(null)}
          onSaved={async () => {
            await loadQueue();
          }}
        />
      ) : null}
    </main>
  );
}

function RegularizeProvisioningDrawer({
  row,
  onClose,
  onSaved,
}: {
  row: ProvisioningInboxRowDto;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [context, setContext] = useState<ProvisioningOrderContextDto | null>(null);
  const [routers, setRouters] = useState<RouterDto[]>([]);
  const [networks, setNetworks] = useState<Ipv4NetworkDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routerId, setRouterId] = useState('');
  const [networkId, setNetworkId] = useState('');
  const [requestedIp, setRequestedIp] = useState('');
  const [method, setMethod] = useState<ControlMethod>('SIMPLE_QUEUE_STATIC_IP');
  const [parameterValue, setParameterValue] = useState('');
  const [contractId, setContractId] = useState('');
  const [reason, setReason] = useState('');
  const [completedService, setCompletedService] = useState<Awaited<
    ReturnType<typeof networkApi.regularizeProvisioning>
  > | null>(null);
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    let current = true;
    setLoading(true);
    void Promise.all([
      networkApi.getProvisioningContext(row.executionOrderId),
      collectListPages(
        (page) => networkApi.listRouters({ page, limit: CATALOG_LIMIT, status: 'ACTIVE' }),
        { limit: CATALOG_LIMIT },
      ),
      collectListPages(
        (page) => networkApi.listIpv4Networks({ page, limit: CATALOG_LIMIT, status: 'ACTIVE' }),
        { limit: CATALOG_LIMIT },
      ),
    ])
      .then(([orderContext, routerResponse, networkResponse]) => {
        if (!current || !('executionOrder' in orderContext)) return;
        setContext(orderContext);
        setRouters(routerResponse.data);
        setNetworks(networkResponse.data);
        const firstRouter = routerResponse.data[0];
        const firstNetwork = networkResponse.data[0];
        if (firstRouter) setRouterId(firstRouter.id);
        if (firstNetwork) {
          setRouterId(firstNetwork.routerId);
          setNetworkId(firstNetwork.id);
          setMethod(firstNetwork.defaultControlMethod);
        }
        const defaultMethod = firstNetwork?.defaultControlMethod ?? 'SIMPLE_QUEUE_STATIC_IP';
        setParameterValue(
          defaultMethod === 'SIMPLE_QUEUE_STATIC_IP'
            ? orderContext.suggestedQueueName
            : (orderContext.plan?.pcqAddressList ?? ''),
        );
      })
      .catch((cause: unknown) => {
        if (current)
          setError(
            getProvisioningErrorMessage(cause, 'No pudimos preparar la regularización. Reintenta.'),
          );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [row.executionOrderId]);

  const selectedRouter = routers.find((router) => router.id === routerId) ?? null;
  const availableNetworks = networks.filter((network) => network.routerId === routerId);
  const selectedNetwork = availableNetworks.find((network) => network.id === networkId) ?? null;
  const methods = selectedRouter?.supportedControlMethods ?? [];

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !context ||
      !routerId ||
      !networkId ||
      !parameterValue.trim() ||
      reason.trim().length < 10 ||
      reason.trim().length > 500
    ) {
      setError('Completa los datos requeridos. El motivo debe tener entre 10 y 500 caracteres.');
      return;
    }
    const controlParams: ControlParams =
      method === 'SIMPLE_QUEUE_STATIC_IP'
        ? { method, queueName: parameterValue.trim() }
        : { method, addressList: parameterValue.trim() };
    setSaving(true);
    setError(null);
    try {
      const service = await networkApi.regularizeProvisioning({
        executionOrderId: row.executionOrderId,
        routerId,
        ipv4NetworkId: networkId,
        ...(requestedIp.trim() ? { requestedIp: requestedIp.trim() } : {}),
        controlParams,
        ...(contractId ? { contractId } : {}),
        reason: reason.trim(),
      });
      setCompletedService(service);
      await onSaved();
    } catch (cause) {
      setError(getProvisioningErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const copyInstruction = async () => {
    const instruction = completedService?.routerInstruction;
    if (!instruction || instruction.mode !== 'MANUAL') return;
    try {
      await navigator.clipboard.writeText(instruction.steps.join('\n'));
      setCopyStatus('Instrucción copiada.');
    } catch {
      setCopyStatus('No pudimos copiar la instrucción. Selecciona el texto y cópialo manualmente.');
    }
  };

  return (
    <NetworkCatalogDrawerFrame
      open
      title={`Regularizar ${row.executionOrderNumber}`}
      description="Registra el servicio que faltó asociar a esta instalación cerrada."
      formId="network-provisioning-regularize-form"
      submitLabel="Guardar regularización"
      submitVisible={!completedService}
      submitting={saving}
      onSubmit={(event) => void submit(event)}
      onClose={() => !saving && onClose()}
    >
      {error ? (
        <PortalAlert
          variant="error"
          title="No fue posible regularizar el servicio"
          description={error}
        />
      ) : null}
      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <p className="sr-only" role="status">
            Cargando los datos de la orden cerrada
          </p>
          <PortalSkeletonBlock className="h-40 rounded-xl" />
          <PortalSkeletonBlock className="h-48 rounded-xl" />
        </div>
      ) : completedService ? (
        <div className="space-y-4">
          <PortalAlert
            variant="success"
            title="Servicio regularizado"
            description="La orden quedó asociada a un servicio activo. Revisa y aplica manualmente la instrucción en el router."
          />
          <dl className="grid gap-3 rounded-xl bg-iwana-surface-soft p-4 text-sm dark:bg-dark-surface-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Estado</dt>
              <dd className="mt-1">
                <Badge variant="success">
                  {getProvisioningStatusLabel(completedService.status)}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Dirección IP</dt>
              <dd className="mt-1 font-mono text-gray-900 dark:text-white">
                {completedService.ip ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Router</dt>
              <dd className="mt-1 text-gray-900 dark:text-white">{completedService.router.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Red</dt>
              <dd className="mt-1 text-gray-900 dark:text-white">
                {completedService.network.name} · {completedService.network.cidr}
              </dd>
            </div>
          </dl>
          {completedService.routerInstruction?.mode === 'MANUAL' ? (
            <div className="space-y-2 rounded-xl border border-gray-200 p-3 dark:border-dark-border">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Instrucción manual del router
                </h3>
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  onClick={() => void copyInstruction()}
                >
                  Copiar instrucción
                </Button>
              </div>
              <ol className="list-decimal space-y-1 pl-5 font-mono text-xs leading-5 text-gray-700 dark:text-gray-200">
                {completedService.routerInstruction.steps.map((step, index) => (
                  <li key={`${index}-${step}`}>{step}</li>
                ))}
              </ol>
              <p
                className="text-xs text-gray-600 dark:text-gray-300"
                role="status"
                aria-live="polite"
              >
                {copyStatus}
              </p>
            </div>
          ) : null}
        </div>
      ) : context ? (
        <div className="space-y-4">
          <PortalAlert
            variant="info"
            title="Revisa las condiciones"
            description="La orden debe ser una instalación cerrada como ejecutada, tener técnico asignado y quien regulariza debe ser una persona distinta del técnico. La configuración del router se debe aplicar manualmente."
          />
          <dl className="grid gap-2 rounded-xl bg-iwana-surface-soft p-3 text-sm dark:bg-dark-surface-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Orden de trabajo</dt>
              <dd className="font-mono text-gray-900 dark:text-white">
                {context.executionOrder.executionOrderNumber}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Suscriptor</dt>
              <dd className="text-gray-900 dark:text-white">{context.subscriber.displayLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Técnico asignado</dt>
              <dd className="text-gray-900 dark:text-white">
                {context.executionOrder.assignedTechnician?.name ?? 'Sin técnico asignado'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Estado del plan</dt>
              <dd className="text-gray-900 dark:text-white">
                {context.plan
                  ? `${context.plan.downloadMbps ?? '—'} / ${context.plan.uploadMbps ?? '—'} Mbps`
                  : 'Sin plan asociado'}
              </dd>
            </div>
          </dl>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              id="regularize-router"
              label="Router"
              value={routerId}
              options={routers.map((router) => ({ value: router.id, label: router.name }))}
              placeholder="Selecciona un router"
              disabled={saving || routers.length === 0}
              onChange={(event) => {
                setRouterId(event.target.value);
                const next = networks.find((network) => network.routerId === event.target.value);
                setNetworkId(next?.id ?? '');
                setMethod(next?.defaultControlMethod ?? 'SIMPLE_QUEUE_STATIC_IP');
              }}
            />
            <Select
              id="regularize-network"
              label="Red IPv4"
              value={networkId}
              options={availableNetworks.map((network) => ({
                value: network.id,
                label: `${network.name} · ${network.cidr}`,
              }))}
              placeholder="Selecciona una red"
              disabled={saving || availableNetworks.length === 0}
              onChange={(event) => {
                const next = availableNetworks.find((network) => network.id === event.target.value);
                setNetworkId(event.target.value);
                if (next) setMethod(next.defaultControlMethod);
              }}
            />
            <Input
              id="regularize-ip"
              label="Dirección IPv4 manual (opcional)"
              value={requestedIp}
              disabled={saving}
              onChange={(event) => setRequestedIp(event.target.value)}
              placeholder="Automática si se deja vacío"
              autoComplete="off"
              spellCheck={false}
            />
            <Select
              id="regularize-method"
              label="Método de control"
              value={method}
              options={methods.map((value) => ({
                value,
                label: getControlMethodProductLabel(value),
              }))}
              placeholder="Selecciona un método"
              disabled={saving || methods.length === 0}
              onChange={(event) => {
                const next = event.target.value as ControlMethod;
                setMethod(next);
                setParameterValue(
                  next === 'SIMPLE_QUEUE_STATIC_IP'
                    ? context.suggestedQueueName
                    : (context.plan?.pcqAddressList ?? ''),
                );
              }}
            />
            <Input
              id="regularize-parameter"
              label={
                method === 'SIMPLE_QUEUE_STATIC_IP'
                  ? 'Nombre de la cola'
                  : 'Lista de direcciones PCQ'
              }
              value={parameterValue}
              disabled={saving}
              onChange={(event) => setParameterValue(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            {context.contracts.length > 0 ? (
              <Select
                id="regularize-contract"
                label="Contrato (opcional)"
                value={contractId}
                options={context.contracts.map((contract) => ({
                  value: contract.id,
                  label: contract.alias ?? 'Contrato asociado',
                }))}
                placeholder="Sin asociar contrato"
                disabled={saving}
                onChange={(event) => setContractId(event.target.value)}
              />
            ) : null}
          </div>
          {selectedNetwork && selectedNetwork.occupancy.free === 0 ? (
            <PortalAlert
              variant="warning"
              title="Red sin direcciones libres"
              description="Esta red no tiene direcciones libres. Elige otra red o revisa su rango y exclusiones."
            />
          ) : null}
          <NetworkFormField
            id="regularize-reason"
            label="Motivo de regularización"
            hint="Escribe entre 10 y 500 caracteres."
            error={error ?? undefined}
          >
            <textarea
              {...networkFormControlProps('regularize-reason', error ?? undefined, true)}
              rows={4}
              minLength={10}
              maxLength={500}
              value={reason}
              disabled={saving}
              onChange={(event) => {
                setReason(event.target.value);
                setError(null);
              }}
            />
          </NetworkFormField>
          {selectedRouter &&
          selectedNetwork &&
          !selectedRouter.supportedControlMethods.includes(method) ? (
            <p className="text-sm text-red-700 dark:text-red-300">
              El router seleccionado no admite este método.
            </p>
          ) : null}
        </div>
      ) : null}
    </NetworkCatalogDrawerFrame>
  );
}
