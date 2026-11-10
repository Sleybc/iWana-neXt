'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { AccessPermissionKey } from '@iwana/shared';
import type { LifecycleAction } from '@iwana/shared';
import type { Contract } from '@/lib/api-client';
import { ApiError, contractsApi } from '@/lib/api-client';
import { usePermissions } from '@/components/access-control/permissions-context';
import { PortalAlert } from '@/components/shared/portal-ui';
import { ActivateServiceDialog } from './ActivateServiceDialog';
import { ContractDetailView } from './ContractDetailDrawer';
import { SubscriberLifecycleDialog } from './SubscriberLifecycleDialog';
import { SubscriberTechnicalServiceSection } from './SubscriberTechnicalServiceSection';
import { BackToServicesLink, ServicePageFrame } from './ServicePageFrame';
import { lifecycleSuccessMessage } from './subscriber-lifecycle-ui';
import { useBillingCycles } from './use-billing-cycles';
import { subscriberServicesHref, useSubscriber360 } from './use-subscriber-360';

const LocationPreviewMap = dynamic(() => import('./LocationPreviewMap'), {
  ssr: false,
  loading: () => <div className="h-44 rounded-lg bg-gray-100 dark:bg-dark-surface-3" />,
});

/**
 * Detalle del contrato en página (spec MOD05 UISP §3 E, CA-5): mismo estado y acciones
 * que el panel lateral (`ContractDetailView`), más mapa del punto de servicio y su
 * aprovisionamiento. Suspender, reactivar y terminar abren el diálogo con vista previa.
 */
export function ContractDetailPageClient() {
  const params = useParams<{ id: string; contractId: string }>();
  const router = useRouter();
  const subscriberId = typeof params?.id === 'string' ? params.id : '';
  const contractId = typeof params?.contractId === 'string' ? params.contractId : '';
  const { data, loading, error, reload } = useSubscriber360(subscriberId);
  const billingCycles = useBillingCycles();
  const { hasPermission } = usePermissions();
  const canReadPrivacy = hasPermission(AccessPermissionKey.PRIVACY_READ);
  const [lifecycleAction, setLifecycleAction] = useState<LifecycleAction | null>(null);
  const [activatingContract, setActivatingContract] = useState<Contract | null>(null);
  const [feedback, setFeedback] = useState<{
    variant: 'success' | 'error';
    title: string;
    description: string;
  } | null>(null);

  const contract = data?.contracts.find((item) => item.id === contractId) ?? null;

  return (
    <ServicePageFrame
      subscriberId={subscriberId}
      loading={loading && !data}
      error={data ? null : error}
      onRetry={() => void reload()}
      notFound={
        data && !contract
          ? {
              title: 'No encontramos este servicio',
              description: 'El servicio no pertenece a este suscriptor o ya no está disponible.',
            }
          : null
      }
    >
      {() => {
        if (!data || !contract) return null;
        const { subscriber } = data;
        const personalVisible = !subscriber.anonymizedAt && !subscriber.privacyRestricted;
        const map =
          personalVisible && subscriber.latitude != null && subscriber.longitude != null ? (
            <figure aria-label="Mapa del punto de servicio" className="space-y-1">
              <div className="h-44 overflow-hidden rounded-lg border border-gray-200 dark:border-dark-border">
                <LocationPreviewMap
                  latitude={Number(subscriber.latitude)}
                  longitude={Number(subscriber.longitude)}
                />
              </div>
              <figcaption className="text-xs text-gray-500 dark:text-gray-400">
                © Colaboradores de OpenStreetMap
              </figcaption>
            </figure>
          ) : null;
        return (
          <div className="space-y-4">
            {feedback ? (
              <PortalAlert
                variant={feedback.variant}
                live={feedback.variant === 'error' ? 'assertive' : 'polite'}
                title={feedback.title}
                description={feedback.description}
              />
            ) : null}
            <ContractDetailView
              layout="page"
              contract={contract}
              billingCycles={billingCycles.cycles}
              billingCyclesLoading={billingCycles.loading}
              billingCyclesError={billingCycles.error}
              onRetryBillingCycles={billingCycles.retry}
              customerSegment={subscriber.customerSegment}
              personType={subscriber.personType}
              privacyRestricted={subscriber.privacyRestricted}
              anonymizedRequestId={subscriber.anonymizedRequestId}
              canReadPrivacy={canReadPrivacy}
              pageBackAction={<BackToServicesLink subscriberId={subscriberId} />}
              installationMap={map}
              pageAside={
                subscriber.privacyRestricted ? null : (
                  <SubscriberTechnicalServiceSection
                    subscriberId={subscriberId}
                    contractId={contract.id}
                    density="dense"
                  />
                )
              }
              onReload={() => reload(true)}
              onOpenLifecycle={(action) => {
                setFeedback(null);
                setLifecycleAction(action);
              }}
              onActivate={(target) => {
                setFeedback(null);
                setActivatingContract(target);
              }}
              onRemove={async (id) => {
                setFeedback(null);
                try {
                  await contractsApi.remove(id);
                  router.push(subscriberServicesHref(subscriberId));
                } catch (cause) {
                  setFeedback({
                    variant: 'error',
                    title: 'No fue posible eliminar el borrador',
                    description:
                      cause instanceof ApiError ? cause.message : 'Error al eliminar el servicio.',
                  });
                }
              }}
            />
            {lifecycleAction ? (
              <SubscriberLifecycleDialog
                open
                onOpenChange={(open) => {
                  if (!open) setLifecycleAction(null);
                }}
                subscriberId={subscriberId}
                contracts={data.contracts}
                action={lifecycleAction}
                contractId={contract.id}
                onGoToServices={() => router.push(subscriberServicesHref(subscriberId))}
                onSuccess={async (action, affectedCount) => {
                  await reload(true);
                  setFeedback({
                    variant: 'success',
                    ...lifecycleSuccessMessage(action, affectedCount),
                  });
                }}
              />
            ) : null}
            {activatingContract ? (
              <ActivateServiceDialog
                contract={activatingContract}
                onClose={() => setActivatingContract(null)}
                onSuccess={async () => {
                  setActivatingContract(null);
                  await reload(true);
                }}
              />
            ) : null}
          </div>
        );
      }}
    </ServicePageFrame>
  );
}
