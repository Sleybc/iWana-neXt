'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ServiceProvisioningDto } from '@iwana/shared';
import { Badge, Button } from '@iwana/ui';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';
import { ApiError, networkApi } from '@/lib/api-client';
import {
  formatNetworkDate,
  getCommercialActivationDetailLabel,
  getCommercialActivationLabel,
  getControlMethodProductLabel,
  getProvisioningStatusLabel,
  NETWORK_PROVISIONING_COPY,
} from '@/components/network/network-provisioning-labels';

interface SubscriberTechnicalServiceSectionProps {
  subscriberId: string;
  /** Detalle de un contrato (página de servicio): solo su aprovisionamiento. */
  contractId?: string;
  density?: 'default' | 'dense';
}

function statusVariant(
  status: ServiceProvisioningDto['status'],
): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'ACTIVE' || status === 'CERTIFIED') return 'success';
  if (status === 'RESERVED') return 'warning';
  if (status === 'FAILED') return 'error';
  return 'neutral';
}

export function SubscriberTechnicalServiceSection({
  subscriberId,
  contractId,
  density = 'default',
}: SubscriberTechnicalServiceSectionProps) {
  const [services, setServices] = useState<ServiceProvisioningDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadServices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await networkApi.listSubscriberProvisioning(subscriberId);
      const all = Array.isArray(response) ? response : [];
      setServices(contractId ? all.filter((service) => service.contractId === contractId) : all);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 403) {
        setError(NETWORK_PROVISIONING_COPY.subscriberDenied);
      } else {
        setError(NETWORK_PROVISIONING_COPY.subscriberLoadError);
      }
    } finally {
      setLoading(false);
    }
  }, [subscriberId, contractId]);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  return (
    <PortalPanel
      as="section"
      labelled
      eyebrow="Red"
      title="Servicio técnico"
      description="Estado de la instalación y la conexión de cada servicio."
      contentClassName="space-y-4"
      density={density}
    >
      {error ? (
        <PortalAlert
          variant="error"
          title={
            error === NETWORK_PROVISIONING_COPY.subscriberDenied
              ? 'Sin acceso'
              : 'No pudimos cargar los servicios técnicos'
          }
          description={error}
          action={
            error === NETWORK_PROVISIONING_COPY.subscriberDenied ? undefined : (
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() => void loadServices()}
              >
                Reintentar
              </Button>
            )
          }
        />
      ) : loading ? (
        <div className="space-y-3" aria-busy="true">
          <p className="sr-only" role="status" aria-live="polite">
            Cargando servicios técnicos
          </p>
          <PortalSkeletonBlock className="h-32 rounded-xl" />
          <PortalSkeletonBlock className="h-32 rounded-xl" />
        </div>
      ) : services.length === 0 ? (
        <PortalEmptyState
          embedded
          title="Aún no hay datos de instalación"
          description="Aparecerán cuando se asigne una dirección IP a un servicio."
        />
      ) : (
        // Fichas separadas por línea, sin caja propia: ya están dentro del panel.
        <div className="divide-y divide-gray-100 dark:divide-dark-border">
          {services.map((service) => {
            const activationDetail = getCommercialActivationDetailLabel(
              service.commercialActivation.detail,
            );
            return (
              <article key={service.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                <header className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                    {service.executionOrderNumber}
                  </span>
                  <Badge variant={statusVariant(service.status)}>
                    {getProvisioningStatusLabel(service.status)}
                  </Badge>
                  {service.origin === 'REGULARIZED' ? (
                    <Badge variant="info">Regularizado</Badge>
                  ) : null}
                </header>
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Dirección IP" value={service.ip ?? '—'} mono />
                  <Field label="Router" value={service.router.name} />
                  <Field
                    label="Red"
                    value={`${service.network.name} · ${service.network.cidr}`}
                    mono
                  />
                  <Field
                    label="Método"
                    value={getControlMethodProductLabel(service.controlMethod)}
                  />
                  <Field
                    label="Equipo instalado"
                    value={
                      service.cpe
                        ? `${service.cpe.serialNumber}${service.cpe.macAddress ? ` · ${service.cpe.macAddress}` : ''}`
                        : 'Sin equipo asociado'
                    }
                    mono
                  />
                  <Field
                    label="Certificó"
                    value={
                      service.certifiedBy?.name?.trim() ||
                      (service.certifiedBy
                        ? 'Nombre no disponible'
                        : service.origin === 'REGULARIZED'
                          ? 'Regularización directa'
                          : 'Pendiente')
                    }
                  />
                  <Field
                    label="Fecha de certificación"
                    value={formatNetworkDate(service.certifiedAt)}
                  />
                  {service.origin === 'REGULARIZED' ? (
                    <>
                      <Field
                        label="Regularizó"
                        value={service.regularizedBy?.name?.trim() || 'Nombre no disponible'}
                      />
                      <Field
                        label="Fecha de regularización"
                        value={formatNetworkDate(service.regularizedAt)}
                      />
                      <Field
                        label="Motivo"
                        value={service.regularizationReason?.trim() || 'Sin motivo registrado'}
                      />
                    </>
                  ) : null}
                </dl>
                <div className="border-t border-gray-100 pt-3 dark:border-dark-border">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {getCommercialActivationLabel(service.commercialActivation.status)}
                  </p>
                  {(service.commercialActivation.status === 'PENDING' ||
                    service.commercialActivation.status === 'BLOCKED') &&
                  activationDetail ? (
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      {activationDetail}
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </PortalPanel>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className={`mt-1 break-words text-gray-900 dark:text-white ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
