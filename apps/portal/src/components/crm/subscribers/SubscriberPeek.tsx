'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button } from '@iwana/ui';
import { SubscriberStatus } from '@iwana/shared';
import {
  contractsApi,
  subscribersApi,
  type Contract,
  type SubscriberRecord,
} from '@/lib/api-client';
import { PortalAlert, PortalSidePeek, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { privacyDisplayValue } from '@/components/privacy/privacy-display';
import {
  CONTRACT_STATUS_META,
  SUBSCRIBER_STATUS_META,
  formatSubscriberName,
} from './subscriber-ui';
import {
  contractServiceName,
  isEligibleLifecycleContract,
  lifecycleReasonLabel,
} from './subscriber-lifecycle-ui';
import { SubscriberLifecycleDialog } from './SubscriberLifecycleDialog';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface SubscriberPeekProps {
  open: boolean;
  subscriberId: string | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  onGoToServices: () => void;
}

interface SubscriberPeekData {
  subscriber: SubscriberRecord;
  contracts: Contract[];
}

function getSafeName(subscriber: SubscriberRecord): string {
  if (subscriber.privacyRestricted || subscriber.anonymizedAt) {
    return privacyDisplayValue(null, {
      privacyRestricted: subscriber.privacyRestricted,
      anonymizedAt: subscriber.anonymizedAt,
    });
  }

  return formatSubscriberName(subscriber);
}

function getPlanName(contract: Contract): string {
  const name = contract.planSnapshotJson.name;
  return typeof name === 'string' && name.trim() ? name.trim() : 'Servicio';
}

function getServiceName(contract: Contract, anonymized: boolean): string {
  return anonymized ? getPlanName(contract) : contractServiceName(contract);
}

export function SubscriberPeek({
  open,
  subscriberId,
  onClose,
  onChanged,
  onGoToServices,
}: SubscriberPeekProps) {
  const requestIdRef = useRef(0);
  const [data, setData] = useState<SubscriberPeekData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showLoadingSkeleton, setShowLoadingSkeleton] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lifecycleAction, setLifecycleAction] = useState<'SUSPEND' | 'REACTIVATE' | null>(null);

  const invalidateDetailRequest = useCallback(() => {
    ++requestIdRef.current;
  }, []);

  const loadDetail = useCallback(async () => {
    if (!subscriberId || !UUID_PATTERN.test(subscriberId)) {
      setData(null);
      setFailed(true);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setFailed(false);

    try {
      const subscriber = await subscribersApi.getById(subscriberId);
      const contracts = subscriber.privacyRestricted
        ? []
        : (await contractsApi.listBySubscriber(subscriberId, { page: 1, limit: 100 })).data;

      if (requestId !== requestIdRef.current) return;
      setData({ subscriber, contracts });
    } catch {
      if (requestId !== requestIdRef.current) return;
      setData(null);
      setFailed(true);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [subscriberId]);

  useEffect(() => {
    if (!open) return;
    void loadDetail();
    return invalidateDetailRequest;
  }, [invalidateDetailRequest, loadDetail, open]);

  useEffect(() => {
    if (!open || !loading) {
      setShowLoadingSkeleton(false);
      return;
    }

    const timeoutId = window.setTimeout(() => setShowLoadingSkeleton(true), 300);
    return () => window.clearTimeout(timeoutId);
  }, [loading, open]);

  useEffect(() => {
    if (!open) setLifecycleAction(null);
  }, [open]);

  const liveContracts = useMemo(
    () =>
      data?.contracts.filter((contract) => ['ACTIVE', 'SUSPENDED'].includes(contract.status)) ?? [],
    [data],
  );
  const subscriberStatus = data?.subscriber.status;
  const action =
    subscriberStatus === SubscriberStatus.ACTIVE
      ? 'SUSPEND'
      : subscriberStatus === SubscriberStatus.SUSPENDED
        ? 'REACTIVATE'
        : null;
  const eligibleActionContracts = action
    ? liveContracts.filter((contract) => isEligibleLifecycleContract(contract, action))
    : [];
  const isAnonymized = Boolean(data?.subscriber.anonymizedAt);
  const canShowLifecycleAction = Boolean(
    data && !data.subscriber.privacyRestricted && !isAnonymized && action,
  );

  const statusLabel = data ? SUBSCRIBER_STATUS_META[data.subscriber.status].label : '';

  async function handleLifecycleSuccess() {
    await loadDetail();
    await onChanged();
  }

  const title = loading
    ? 'Cargando información del suscriptor…'
    : data
      ? getSafeName(data.subscriber)
      : 'Información del suscriptor';

  return (
    <>
      <PortalSidePeek
        open={open}
        onClose={onClose}
        title={title}
        description="Detalle del suscriptor seleccionado"
      >
        {loading ? (
          showLoadingSkeleton ? (
            <div aria-busy="true" className="space-y-5 p-5">
              <PortalSkeletonBlock className="h-16 rounded-xl" />
              <PortalSkeletonBlock className="h-24 rounded-xl" />
              <PortalSkeletonBlock className="h-40 rounded-xl" />
            </div>
          ) : null
        ) : failed || !data ? (
          <div className="space-y-4 p-5">
            <PortalAlert
              variant="error"
              title="No pudimos cargar la información del suscriptor"
              description="Intenta de nuevo en unos minutos."
              action={
                <Button type="button" variant="secondary" onClick={() => void loadDetail()}>
                  Reintentar
                </Button>
              }
            />
          </div>
        ) : data.subscriber.privacyRestricted ? (
          <div className="space-y-4 p-5">
            <header className="space-y-2">
              <h2 className="text-lg font-semibold text-iwana-primary dark:text-white">
                Datos bloqueados
              </h2>
              <Badge variant={SUBSCRIBER_STATUS_META[data.subscriber.status].variant}>
                {statusLabel}
              </Badge>
            </header>
            <PortalAlert
              variant="warning"
              title="Datos bloqueados"
              description="La información personal está bloqueada y no se puede editar desde este perfil."
            />
          </div>
        ) : (
          <div className="space-y-6 p-5">
            <header className="space-y-2">
              <h2 className="text-lg font-semibold text-iwana-primary dark:text-white">
                {getSafeName(data.subscriber)}
              </h2>
              <Badge variant={SUBSCRIBER_STATUS_META[data.subscriber.status].variant}>
                {statusLabel}
              </Badge>
            </header>

            {!isAnonymized ? (
              <section aria-labelledby="subscriber-peek-contact-title" className="space-y-2">
                <h3 id="subscriber-peek-contact-title" className="text-sm font-semibold">
                  Contacto
                </h3>
                {data.subscriber.email || data.subscriber.phone || data.subscriber.whatsapp ? (
                  <dl className="space-y-2 text-sm">
                    {data.subscriber.email ? (
                      <div>
                        <dt className="text-gray-600 dark:text-gray-300">Correo</dt>
                        <dd className="break-all">{data.subscriber.email}</dd>
                      </div>
                    ) : null}
                    {data.subscriber.phone ? (
                      <div>
                        <dt className="text-gray-600 dark:text-gray-300">Teléfono</dt>
                        <dd>{data.subscriber.phone}</dd>
                      </div>
                    ) : null}
                    {data.subscriber.whatsapp ? (
                      <div>
                        <dt className="text-gray-600 dark:text-gray-300">WhatsApp</dt>
                        <dd>{data.subscriber.whatsapp}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Sin datos de contacto disponibles.
                  </p>
                )}
              </section>
            ) : null}

            <section aria-labelledby="subscriber-peek-services-title" className="space-y-3">
              <h3 id="subscriber-peek-services-title" className="text-sm font-semibold">
                Servicios vigentes
              </h3>
              {liveContracts.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-300">Sin servicios vigentes</p>
              ) : (
                <ul className="space-y-3">
                  {liveContracts.map((contract) => (
                    <li
                      key={contract.id}
                      className="space-y-1 rounded-xl border border-gray-200 p-3 dark:border-dark-border"
                    >
                      <p className="font-medium">{getServiceName(contract, isAnonymized)}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {CONTRACT_STATUS_META[contract.status].label}
                        {!isAnonymized
                          ? ` · ${lifecycleReasonLabel(contract.statusReasonCode)}`
                          : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {!isAnonymized &&
            (data.subscriber.contactPending || !data.subscriber.fiscalCompleteness.complete) ? (
              <section aria-labelledby="subscriber-peek-notices-title" className="space-y-2">
                <h3 id="subscriber-peek-notices-title" className="text-sm font-semibold">
                  Avisos
                </h3>
                <ul className="space-y-1 text-sm">
                  {data.subscriber.contactPending ? <li>Contacto pendiente</li> : null}
                  {!data.subscriber.fiscalCompleteness.complete ? (
                    <li>Datos fiscales incompletos</li>
                  ) : null}
                </ul>
              </section>
            ) : null}

            <Link
              href={`/dashboard/crm/subscribers/${encodeURIComponent(data.subscriber.id)}`}
              className="inline-flex min-h-11 items-center font-medium text-iwana-secondary-700 underline-offset-4 hover:underline dark:text-iwana-secondary"
            >
              Abrir ficha
            </Link>

            {canShowLifecycleAction && action ? (
              <div className="space-y-2 border-t border-gray-200 pt-4 dark:border-dark-border">
                <Button
                  type="button"
                  variant="primary"
                  disabled={eligibleActionContracts.length === 0}
                  onClick={() => setLifecycleAction(action)}
                  className="min-h-11 w-full"
                >
                  {action === 'SUSPEND' ? 'Suspender servicios' : 'Reactivar servicios'}
                </Button>
                {eligibleActionContracts.length === 0 ? (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {action === 'SUSPEND'
                      ? 'No hay servicios activos para suspender.'
                      : 'No hay servicios suspendidos para reactivar.'}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </PortalSidePeek>

      {data && action ? (
        <SubscriberLifecycleDialog
          open={lifecycleAction !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setLifecycleAction(null);
          }}
          subscriberId={data.subscriber.id}
          contracts={liveContracts}
          action={lifecycleAction ?? action}
          onSuccess={handleLifecycleSuccess}
          onGoToServices={onGoToServices}
        />
      ) : null}
    </>
  );
}
