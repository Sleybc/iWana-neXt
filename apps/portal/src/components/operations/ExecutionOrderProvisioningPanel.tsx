'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessPermissionKey, ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';
import type {
  ControlMethod,
  ControlParams,
  Ipv4NetworkDto,
  ProvisioningOrderContextDto,
  RouterDto,
  ServiceProvisioningDto,
  TechnicianProvisioningViewDto,
} from '@iwana/shared';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Select,
} from '@iwana/ui';
import { Clipboard, RotateCw } from 'lucide-react';
import { usePermissions } from '@/components/access-control/permissions-context';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { collectListPages } from '@/lib/list-meta';
import { ApiError, networkApi } from '@/lib/api-client';
import {
  formatNetworkDate,
  getControlMethodProductLabel,
  getProvisioningErrorMessage,
  getProvisioningStatusLabel,
  NETWORK_PROVISIONING_COPY,
} from '@/components/network/network-provisioning-labels';
import { EXECUTION_ORDER_STATUS_LABELS } from './operations-labels';

interface RequirementSnapshot {
  enabled: boolean | null;
  certified: boolean | null;
}

interface ExecutionOrderProvisioningPanelProps {
  executionOrderId: string;
  onRequirementSnapshotChange?: (snapshot: RequirementSnapshot) => void;
}

const PAGE_SIZE = 100;
const EMPTY_CONTROL_METHODS: readonly ControlMethod[] = [];

function isTechnicianView(
  value: ProvisioningOrderContextDto | TechnicianProvisioningViewDto,
): value is TechnicianProvisioningViewDto {
  return 'executionOrderId' in value;
}

function getProvisioningBadgeVariant(
  status: ServiceProvisioningDto['status'] | null,
): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'CERTIFIED' || status === 'ACTIVE') return 'success';
  if (status === 'RESERVED') return 'warning';
  if (status === 'FAILED') return 'error';
  return 'neutral';
}

export function ExecutionOrderProvisioningPanel({
  executionOrderId,
  onRequirementSnapshotChange,
}: ExecutionOrderProvisioningPanelProps) {
  const { hasPermission } = usePermissions();
  const canRead = hasPermission(AccessPermissionKey.NETWORK_PROVISIONING_READ);
  const canReadExecutionOrders = hasPermission(
    AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
  );
  const canExecute = hasPermission(AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE);
  const canCertify = hasPermission(AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY);
  const [context, setContext] = useState<ProvisioningOrderContextDto | null>(null);
  const [technicianView, setTechnicianView] = useState<TechnicianProvisioningViewDto | null>(null);
  const [routers, setRouters] = useState<RouterDto[]>([]);
  const [networks, setNetworks] = useState<Ipv4NetworkDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState('');
  const [routerId, setRouterId] = useState('');
  const [networkId, setNetworkId] = useState('');
  const [manualIp, setManualIp] = useState(false);
  const [requestedIp, setRequestedIp] = useState('');
  const [method, setMethod] = useState<ControlMethod>('SIMPLE_QUEUE_STATIC_IP');
  const [parameterValue, setParameterValue] = useState('');
  const [contractId, setContractId] = useState('');
  const [evidenceId, setEvidenceId] = useState('');
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releaseReason, setReleaseReason] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [settingsEnabled, setSettingsEnabled] = useState<boolean | null>(null);
  const [reservationsPaused, setReservationsPaused] = useState<boolean | null>(null);

  const loadCatalogs = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const [routerResponse, networkResponse] = await Promise.all([
        collectListPages(
          (page) => networkApi.listRouters({ page, limit: PAGE_SIZE, status: 'ACTIVE' }),
          {
            limit: PAGE_SIZE,
          },
        ),
        collectListPages(
          (page) => networkApi.listIpv4Networks({ page, limit: PAGE_SIZE, status: 'ACTIVE' }),
          {
            limit: PAGE_SIZE,
          },
        ),
      ]);
      setRouters(routerResponse.data);
      setNetworks(networkResponse.data);
      const firstRouter = routerResponse.data[0];
      if (firstRouter) {
        setRouterId((current) => current || firstRouter.id);
        const firstNetwork = networkResponse.data.find(
          (network) => network.routerId === firstRouter.id,
        );
        if (firstNetwork) setNetworkId((current) => current || firstNetwork.id);
      }
    } catch (error) {
      setCatalogError(
        getProvisioningErrorMessage(
          error,
          'No pudimos cargar los routers y redes disponibles. Reintenta.',
        ),
      );
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const loadContext = useCallback(async () => {
    if (!canRead && !canReadExecutionOrders) {
      setContext(null);
      setTechnicianView(null);
      setLoadError(NETWORK_PROVISIONING_COPY.readDenied);
      onRequirementSnapshotChange?.({ enabled: null, certified: null });
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    setReservationsPaused(null);
    try {
      const result = await networkApi.getProvisioningContext(executionOrderId);
      if (isTechnicianView(result)) {
        setTechnicianView(result);
        setContext(null);
        onRequirementSnapshotChange?.({ enabled: null, certified: result.certified });
      } else if (!canRead) {
        // Una cuenta de Operaciones sin lectura de red solo puede recibir la proyección del técnico.
        setContext(null);
        setTechnicianView(null);
        setLoadError(NETWORK_PROVISIONING_COPY.readDenied);
        onRequirementSnapshotChange?.({ enabled: null, certified: null });
      } else {
        setContext(result);
        setTechnicianView(null);
        const certified =
          result.provisioning?.status === 'CERTIFIED' || result.provisioning?.status === 'ACTIVE';
        let enabled: boolean | null;
        try {
          const settings = await networkApi.getSettings();
          enabled = settings.enforceProvisioningOnInstallClose;
          setSettingsEnabled(enabled);
        } catch {
          // No se infiere el estado de la guarda si el endpoint no está disponible.
          enabled = null;
          setSettingsEnabled(null);
        }
        onRequirementSnapshotChange?.({ enabled, certified });
        if (canRead) {
          try {
            const metadata = await networkApi.getProvisioningMeta();
            setReservationsPaused(metadata.reservationsPaused);
          } catch {
            setReservationsPaused(null);
          }
        }
        if (canExecute) {
          await loadCatalogs();
        }
      }
    } catch (error) {
      setContext(null);
      setTechnicianView(null);
      setReservationsPaused(null);
      if (error instanceof ApiError && error.status === 403) {
        setLoadError(NETWORK_PROVISIONING_COPY.readDenied);
      } else {
        setLoadError(NETWORK_PROVISIONING_COPY.loadError);
      }
      onRequirementSnapshotChange?.({ enabled: null, certified: null });
    } finally {
      setLoading(false);
    }
  }, [
    canExecute,
    canRead,
    canReadExecutionOrders,
    executionOrderId,
    loadCatalogs,
    onRequirementSnapshotChange,
  ]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const selectedRouter = routers.find((router) => router.id === routerId) ?? null;
  const selectedNetwork = networks.find((network) => network.id === networkId) ?? null;
  const availableNetworks = useMemo(
    () => networks.filter((network) => network.routerId === routerId),
    [networks, routerId],
  );
  const supportedMethods = selectedRouter?.supportedControlMethods ?? EMPTY_CONTROL_METHODS;
  const provisioning = context?.provisioning ?? null;
  const reserveEligible =
    context?.executionOrder.status === ExecutionOrderStatus.IN_PROGRESS &&
    context.executionOrder.workType === WfmWorkType.INSTALLATION &&
    context.executionOrder.assignedTechnician !== null;
  const canReserve = canExecute && reserveEligible && provisioning === null;
  const canRelease =
    provisioning?.status === 'RESERVED'
      ? canExecute
      : provisioning?.status === 'CERTIFIED'
        ? canCertify
        : false;

  useEffect(() => {
    if (!selectedNetwork) return;
    const next = selectedNetwork.defaultControlMethod;
    if (supportedMethods.includes(next)) {
      setMethod(next);
      setParameterValue(
        next === 'SIMPLE_QUEUE_STATIC_IP'
          ? (context?.suggestedQueueName ?? '')
          : (context?.plan?.pcqAddressList ?? ''),
      );
    } else if (supportedMethods[0]) {
      const supportedMethod = supportedMethods[0];
      setMethod(supportedMethod);
      setParameterValue(
        supportedMethod === 'SIMPLE_QUEUE_STATIC_IP'
          ? (context?.suggestedQueueName ?? '')
          : (context?.plan?.pcqAddressList ?? ''),
      );
    }
  }, [
    context?.plan?.pcqAddressList,
    context?.suggestedQueueName,
    selectedNetwork,
    supportedMethods,
  ]);

  useEffect(() => {
    if (!context?.plan) return;
    const next = context.plan.pcqAddressList ?? '';
    if (method === 'PCQ_ADDRESS_LIST') setParameterValue((current) => current || next);
  }, [context?.plan, method]);

  useEffect(() => {
    if (!context) return;
    setParameterValue((current) => {
      if (current) return current;
      return method === 'SIMPLE_QUEUE_STATIC_IP'
        ? context.suggestedQueueName
        : (context.plan?.pcqAddressList ?? '');
    });
  }, [context, method]);

  const updateProvisioning = (service: ServiceProvisioningDto) => {
    setContext((current) => (current ? { ...current, provisioning: service } : current));
    const certified = service.status === 'CERTIFIED' || service.status === 'ACTIVE';
    onRequirementSnapshotChange?.({
      enabled: settingsEnabled,
      certified,
    });
  };

  const reserve = async () => {
    if (!context || !selectedRouter || !selectedNetwork || !parameterValue.trim()) return;
    const controlParams: ControlParams =
      method === 'SIMPLE_QUEUE_STATIC_IP'
        ? { method, queueName: parameterValue.trim() }
        : { method, addressList: parameterValue.trim() };
    setSaving(true);
    setActionError(null);
    setSuccess('');
    try {
      const service = await networkApi.reserveProvisioning({
        executionOrderId,
        routerId: selectedRouter.id,
        ipv4NetworkId: selectedNetwork.id,
        ...(manualIp && requestedIp.trim() ? { requestedIp: requestedIp.trim() } : {}),
        controlParams,
        ...(contractId ? { contractId } : {}),
      });
      updateProvisioning(service);
      setSuccess(
        'La dirección quedó reservada. Revisa la instrucción manual antes de aplicarla en el router.',
      );
    } catch (error) {
      if (error instanceof ApiError && error.code === 'RESERVATIONS_PAUSED') {
        setReservationsPaused(true);
        setActionError(null);
      } else {
        setActionError(getProvisioningErrorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  };

  const certify = async () => {
    if (!provisioning || !evidenceId || !context?.executionOrder.canCertify) return;
    setSaving(true);
    setActionError(null);
    setSuccess('');
    try {
      const service = await networkApi.certifyProvisioning(provisioning.id, {
        evidenceId,
        version: provisioning.version,
      });
      updateProvisioning(service);
      setSuccess('Aprovisionamiento certificado.');
    } catch (error) {
      setActionError(getProvisioningErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const release = async () => {
    if (!provisioning) return;
    const reason = releaseReason.trim();
    if (reason.length < 10 || reason.length > 500) {
      setActionError('Escribe un motivo de 10 a 500 caracteres.');
      return;
    }
    setSaving(true);
    setActionError(null);
    setSuccess('');
    try {
      const service = await networkApi.releaseProvisioning(provisioning.id, {
        version: provisioning.version,
        reason,
      });
      updateProvisioning(service);
      setReleaseOpen(false);
      setReleaseReason('');
      setSuccess('El servicio se liberó.');
    } catch (error) {
      setActionError(getProvisioningErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const copyInstruction = async () => {
    const steps =
      provisioning?.routerInstruction?.mode === 'MANUAL'
        ? provisioning.routerInstruction.steps
        : [];
    if (steps.length === 0) return;
    try {
      await navigator.clipboard.writeText(steps.join('\n'));
      setCopyStatus('Instrucción copiada.');
    } catch {
      setCopyStatus('No pudimos copiar la instrucción. Selecciona el texto y cópialo manualmente.');
    }
  };

  return (
    <section
      id="execution-order-provisioning"
      aria-labelledby="execution-order-provisioning-heading"
      className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="portal-eyebrow-muted">Servicio técnico</p>
          <h3
            id="execution-order-provisioning-heading"
            tabIndex={-1}
            className="text-base font-semibold text-gray-900 dark:text-white"
          >
            Aprovisionamiento
          </h3>
        </div>
        {!loading && !loadError ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={() => void loadContext()}
          >
            <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Actualizar
          </Button>
        ) : null}
      </header>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <p className="sr-only" role="status" aria-live="polite">
            Cargando aprovisionamiento de la orden
          </p>
          <PortalSkeletonBlock className="h-20 rounded-xl" />
          <PortalSkeletonBlock className="h-36 rounded-xl" />
        </div>
      ) : loadError ? (
        <PortalAlert
          variant="error"
          title={
            loadError === NETWORK_PROVISIONING_COPY.readDenied
              ? 'Sin acceso'
              : 'No pudimos consultar el aprovisionamiento'
          }
          description={loadError}
          action={
            loadError === NETWORK_PROVISIONING_COPY.readDenied ? undefined : (
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() => void loadContext()}
              >
                Reintentar
              </Button>
            )
          }
        />
      ) : technicianView ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {technicianView.status === null && technicianView.ip === null
              ? 'Esta orden todavía no tiene una dirección reservada.'
              : 'Consulta el estado del servicio técnico asignado a esta orden.'}
          </p>
          <dl className="grid gap-3 rounded-xl bg-iwana-surface-soft p-4 text-sm dark:bg-dark-surface-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Estado</dt>
              <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                {getProvisioningStatusLabel(technicianView.status)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Dirección IP</dt>
              <dd className="mt-1 font-mono text-gray-900 dark:text-white">
                {technicianView.ip ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Certificación</dt>
              <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                {technicianView.certified ? 'Certificado' : 'Pendiente'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Actualizado</dt>
              <dd className="mt-1 text-gray-900 dark:text-white">
                {formatNetworkDate(technicianView.updatedAt)}
              </dd>
            </div>
          </dl>
        </div>
      ) : context ? (
        <div className="space-y-4">
          {reservationsPaused ? (
            <PortalAlert
              variant="warning"
              title="Reservas pausadas"
              description="Las reservas están pausadas temporalmente. Inténtalo más tarde."
            />
          ) : null}
          {actionError ? (
            <PortalAlert
              variant="error"
              title="No fue posible completar la acción"
              description={actionError}
            />
          ) : null}
          {success ? (
            <PortalAlert
              variant="success"
              title="Aprovisionamiento actualizado"
              description={success}
            />
          ) : null}
          <dl className="grid gap-3 rounded-xl bg-iwana-surface-soft p-4 text-sm dark:bg-dark-surface-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Orden de trabajo</dt>
              <dd className="mt-1 font-mono font-medium text-gray-900 dark:text-white">
                {context.executionOrder.executionOrderNumber}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Estado</dt>
              <dd className="mt-1 text-gray-900 dark:text-white">
                {EXECUTION_ORDER_STATUS_LABELS[context.executionOrder.status]}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Técnico asignado</dt>
              <dd className="mt-1 text-gray-900 dark:text-white">
                {context.executionOrder.assignedTechnician?.name ?? 'Sin técnico asignado'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Suscriptor</dt>
              <dd className="mt-1 text-gray-900 dark:text-white">
                {context.subscriber.displayLabel}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Plan</dt>
              <dd className="mt-1 text-gray-900 dark:text-white">
                {context.plan
                  ? `${context.plan.downloadMbps ?? '—'} / ${context.plan.uploadMbps ?? '—'} Mbps`
                  : 'Sin plan asociado'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Contrato</dt>
              <dd className="mt-1 text-gray-900 dark:text-white">
                {context.provisioning?.contractId
                  ? (context.contracts.find((item) => item.id === context.provisioning?.contractId)
                      ?.alias ?? 'Contrato asociado')
                  : 'Sin contrato seleccionado'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Equipo instalado</dt>
              <dd className="mt-1 font-mono text-gray-900 dark:text-white">
                {context.cpe
                  ? `${context.cpe.serialNumber}${context.cpe.macAddress ? ` · ${context.cpe.macAddress}` : ''}`
                  : 'Sin equipo asociado'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">
                Nombre sugerido para la cola
              </dt>
              <dd className="mt-1 font-mono text-gray-900 dark:text-white">
                {context.suggestedQueueName}
              </dd>
            </div>
          </dl>

          {!context.cpe && canReserve ? (
            <PortalAlert
              variant="warning"
              title="No hay equipo instalado asociado"
              description="La instrucción se generará sin datos del equipo. Revísala antes de aplicarla en el router."
            />
          ) : null}

          {provisioning ? (
            <div className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-dark-border">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-semibold text-gray-900 dark:text-white">Servicio técnico</h4>
                <Badge variant={getProvisioningBadgeVariant(provisioning.status)}>
                  {getProvisioningStatusLabel(provisioning.status)}
                </Badge>
                {provisioning.ip ? (
                  <span className="font-mono text-sm text-gray-700 dark:text-gray-200">
                    {provisioning.ip}
                  </span>
                ) : null}
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-gray-500 dark:text-gray-400">Router</dt>
                  <dd className="mt-1 text-gray-900 dark:text-white">{provisioning.router.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500 dark:text-gray-400">Red</dt>
                  <dd className="mt-1 text-gray-900 dark:text-white">
                    {provisioning.network.name}{' '}
                    <span className="font-mono text-xs">({provisioning.network.cidr})</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500 dark:text-gray-400">Método</dt>
                  <dd className="mt-1 text-gray-900 dark:text-white">
                    {getControlMethodProductLabel(provisioning.controlMethod)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500 dark:text-gray-400">Reservado por</dt>
                  <dd className="mt-1 text-gray-900 dark:text-white">
                    {provisioning.reservedBy?.name ?? 'Nombre no disponible'}
                  </dd>
                </div>
              </dl>
              {provisioning.routerInstruction?.mode === 'MANUAL' ? (
                <div className="space-y-2 rounded-xl bg-gray-50 p-3 dark:bg-dark-surface-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h5 className="text-sm font-semibold text-gray-900 dark:text-white">
                      Instrucción manual del router
                    </h5>
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11"
                      onClick={() => void copyInstruction()}
                    >
                      <Clipboard className="mr-2 h-4 w-4" aria-hidden="true" />
                      Copiar instrucción
                    </Button>
                  </div>
                  <ol className="list-decimal space-y-1 pl-5 font-mono text-xs leading-5 text-gray-700 dark:text-gray-200">
                    {provisioning.routerInstruction.steps.map((step, index) => (
                      <li key={`${index}-${step}`}>{step}</li>
                    ))}
                  </ol>
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    La configuración no se aplica automáticamente; revisa y ejecuta estos pasos en
                    el router.
                  </p>
                  <p
                    className="text-xs text-gray-600 dark:text-gray-300"
                    role="status"
                    aria-live="polite"
                  >
                    {copyStatus}
                  </p>
                </div>
              ) : null}
              {provisioning.status === 'RESERVED' && canCertify ? (
                <div className="flex flex-col gap-3 border-t border-gray-100 pt-3 dark:border-dark-border sm:flex-row sm:items-end">
                  <Select
                    id="provisioning-evidence"
                    label="Foto o documento para certificar"
                    value={evidenceId}
                    options={context.evidences.map((evidence) => ({
                      value: evidence.id,
                      label: `${evidence.evidenceType === 'PHOTO' ? 'Foto' : 'Documento'} · ${formatNetworkDate(evidence.createdAt)}`,
                    }))}
                    placeholder="Selecciona una evidencia"
                    disabled={
                      !context.executionOrder.canCertify || saving || context.evidences.length === 0
                    }
                    onChange={(event) => setEvidenceId(event.target.value)}
                  />
                  {context.executionOrder.canCertify ? (
                    <Button
                      type="button"
                      variant="primary"
                      className="min-h-11"
                      loading={saving}
                      disabled={saving || !evidenceId}
                      onClick={() => void certify()}
                    >
                      Certificar aprovisionamiento
                    </Button>
                  ) : (
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {context.executionOrder.assignedTechnician === null
                        ? 'Asigna un técnico antes de certificar.'
                        : context.evidences.length === 0
                          ? 'Adjunta una foto o un documento a esta orden antes de certificar.'
                          : 'La certificación debe realizarla una persona distinta del técnico asignado.'}
                    </p>
                  )}
                </div>
              ) : null}
              {provisioning.status === 'CERTIFIED' && !context.executionOrder.canCertify ? (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  El servicio está certificado.
                </p>
              ) : null}
              {canRelease ? (
                <div className="border-t border-gray-100 pt-3 dark:border-dark-border">
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11"
                    onClick={() => {
                      setReleaseReason('');
                      setReleaseOpen(true);
                    }}
                  >
                    Liberar servicio
                  </Button>
                </div>
              ) : null}
            </div>
          ) : canReserve ? (
            <div className="space-y-4 rounded-xl border border-gray-200 p-4 dark:border-dark-border">
              <h4 className="font-semibold text-gray-900 dark:text-white">Reservar dirección IP</h4>
              {catalogError ? (
                <PortalAlert
                  variant="error"
                  title="No pudimos cargar el catálogo"
                  description={catalogError}
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11"
                      onClick={() => void loadCatalogs()}
                    >
                      Reintentar
                    </Button>
                  }
                />
              ) : null}
              {catalogLoading ? (
                <div aria-busy="true">
                  <PortalSkeletonBlock className="h-36 rounded-xl" />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    id="provisioning-router"
                    label="Router"
                    value={routerId}
                    options={routers.map((router) => ({ value: router.id, label: router.name }))}
                    placeholder="Selecciona un router"
                    disabled={saving || routers.length === 0}
                    onChange={(event) => {
                      setRouterId(event.target.value);
                      const nextNetwork = networks.find(
                        (network) => network.routerId === event.target.value,
                      );
                      setNetworkId(nextNetwork?.id ?? '');
                    }}
                  />
                  <Select
                    id="provisioning-network"
                    label="Red IPv4"
                    value={networkId}
                    options={availableNetworks.map((network) => ({
                      value: network.id,
                      label: `${network.name} · ${network.cidr}`,
                    }))}
                    placeholder="Selecciona una red"
                    disabled={saving || availableNetworks.length === 0}
                    onChange={(event) => setNetworkId(event.target.value)}
                  />
                  <fieldset className="space-y-2 sm:col-span-2">
                    <legend className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      Dirección IP
                    </legend>
                    <label className="flex min-h-11 items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                      <input
                        type="radio"
                        name="provisioning-ip-mode"
                        checked={!manualIp}
                        disabled={saving}
                        onChange={() => setManualIp(false)}
                      />
                      Asignar automáticamente
                    </label>
                    <label className="flex min-h-11 items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                      <input
                        type="radio"
                        name="provisioning-ip-mode"
                        checked={manualIp}
                        disabled={saving}
                        onChange={() => setManualIp(true)}
                      />
                      Elegir dirección manual
                    </label>
                    {manualIp ? (
                      <Input
                        id="provisioning-requested-ip"
                        label="Dirección IPv4"
                        value={requestedIp}
                        disabled={saving}
                        onChange={(event) => setRequestedIp(event.target.value)}
                        placeholder="192.0.2.10"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    ) : null}
                  </fieldset>
                  <Select
                    id="provisioning-control-method"
                    label="Método de control"
                    value={method}
                    options={supportedMethods.map((value) => ({
                      value,
                      label: getControlMethodProductLabel(value),
                    }))}
                    placeholder="Selecciona un método"
                    disabled={saving || supportedMethods.length === 0}
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
                    id="provisioning-control-parameter"
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
                      id="provisioning-contract"
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
              )}
              {routers.length === 0 && !catalogLoading && !catalogError ? (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  No hay routers activos disponibles.
                </p>
              ) : null}
              {selectedNetwork && selectedNetwork.occupancy.free === 0 ? (
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Esta red no tiene direcciones libres. Elige otra red o revisa su rango y
                  exclusiones.
                </p>
              ) : null}
              <Button
                type="button"
                variant="primary"
                className="min-h-11"
                loading={saving}
                disabled={
                  saving ||
                  reservationsPaused === true ||
                  catalogLoading ||
                  catalogError !== null ||
                  routers.length === 0 ||
                  networks.length === 0 ||
                  !routerId ||
                  !networkId ||
                  supportedMethods.length === 0 ||
                  !parameterValue.trim() ||
                  (manualIp && !requestedIp.trim())
                }
                onClick={() => void reserve()}
              >
                Reservar dirección IP
              </Button>
            </div>
          ) : null}

          {!provisioning && context.executionOrder.assignedTechnician === null && canExecute ? (
            <PortalAlert
              variant="warning"
              title="Falta asignar un técnico"
              description="Asigna un técnico a la orden antes de reservar, certificar o regularizar. Actualiza la orden y vuelve a intentarlo."
            />
          ) : null}
        </div>
      ) : null}

      <Dialog open={releaseOpen} onOpenChange={(open) => !open && !saving && setReleaseOpen(false)}>
        <DialogContent
          className="sm:max-w-lg"
          onInteractOutside={() => !saving && setReleaseOpen(false)}
        >
          <DialogTitle>Liberar servicio técnico</DialogTitle>
          <DialogDescription className="mt-1">
            Escribe un motivo de 10 a 500 caracteres. Esta acción también libera la dirección
            asociada.
          </DialogDescription>
          {actionError ? (
            <PortalAlert
              variant="error"
              title="No fue posible liberar el servicio"
              description={actionError}
            />
          ) : null}
          <label
            className="mt-4 block space-y-1.5 text-sm font-medium text-gray-800 dark:text-gray-100"
            htmlFor="provisioning-release-reason"
          >
            Motivo
            <textarea
              id="provisioning-release-reason"
              minLength={10}
              maxLength={500}
              rows={4}
              value={releaseReason}
              disabled={saving}
              onChange={(event) => setReleaseReason(event.target.value)}
              className="portal-input-surface min-h-24 w-full px-3 py-2 text-sm text-gray-900 dark:text-white"
            />
          </label>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={saving}
              onClick={() => setReleaseOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              className="min-h-11"
              loading={saving}
              disabled={
                saving || releaseReason.trim().length < 10 || releaseReason.trim().length > 500
              }
              onClick={() => void release()}
            >
              Liberar servicio
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
