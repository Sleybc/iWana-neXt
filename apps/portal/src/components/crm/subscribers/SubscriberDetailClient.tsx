'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AccessPermissionKey, PersonType } from '@iwana/shared';
import type { LifecycleAction, TransitionStatusPayload } from '@iwana/shared';
import type { CreateSubscriberPayload, UpdateSubscriberPayload } from '@iwana/shared';
import { ApiError, Subscriber360Response, subscribersApi } from '@/lib/api-client';
import { PageHeader } from '@/components/layout/PageHeader';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { usePermissions } from '@/components/access-control/permissions-context';
import { CompliancePanel } from '@/components/privacy/CompliancePanel';
import { SubscriberForm } from './SubscriberForm';
import { SubscriberHeader } from './SubscriberHeader';
import { SubscriberSections } from './SubscriberSections';
import { SubscriberFiscalSection } from './SubscriberFiscalSection';
import { SubscriberStatusTransitionDialog } from './SubscriberStatusTransitionDialog';
import { SubscriberTabsContainer } from './SubscriberTabsContainer';
import { TaxProfileBlock } from './TaxProfileBlock';
import { ServiciosTab } from './ServiciosTab';
import { SubscriberLifecycleDialog } from './SubscriberLifecycleDialog';
import { SubscriberOverviewTab } from './SubscriberOverviewTab';
import { SubscriberSupportTab } from './SubscriberSupportTab';
import { SubscriberTechnicalServiceSection } from './SubscriberTechnicalServiceSection';

interface SubscriberDetailClientProps {
  mode: 'create' | 'detail';
}

function mapError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  return 'No fue posible completar la operación del suscriptor.';
}

const SUBSCRIBER_TAB_IDS = [
  'vista-general',
  'servicios',
  'soporte',
  'datos',
  'tributario',
  'cumplimiento',
];
const INITIAL_LOADING_SKELETON_DELAY_MS = 300;

export function SubscriberDetailClient({ mode }: SubscriberDetailClientProps) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams?.toString() ?? '';
  const requestedTab = searchParams?.get('tab') ?? 'vista-general';
  const urlTab = SUBSCRIBER_TAB_IDS.includes(requestedTab) ? requestedTab : 'vista-general';
  const { hasPermission } = usePermissions();
  const canReadPrivacy = hasPermission(AccessPermissionKey.PRIVACY_READ);
  const canManagePrivacy = hasPermission(AccessPermissionKey.PRIVACY_MANAGE);
  const canReadNetworkProvisioning = hasPermission(AccessPermissionKey.NETWORK_PROVISIONING_READ);
  const subscriberId = typeof params?.id === 'string' ? params.id : '';
  const [subscriber360, setSubscriber360] = useState<Subscriber360Response | null>(null);
  const [loading, setLoading] = useState(mode === 'detail');
  const [showLoadingSkeleton, setShowLoadingSkeleton] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusDialogMode, setStatusDialogMode] = useState<'advance' | 'cancel'>('advance');
  const [lifecycleAction, setLifecycleAction] = useState<LifecycleAction | null>(null);
  const [lifecycleContractId, setLifecycleContractId] = useState<string | null>(null);
  const [lifecycleSuccess, setLifecycleSuccess] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const [activeSubscriberTab, setActiveSubscriberTab] = useState(urlTab);
  const [fiscalDirty, setFiscalDirty] = useState(false);
  const selectSubscriberTab = useCallback(
    (tabId: string) => {
      setActiveSubscriberTab(tabId);
      // Parte de la URL vigente: conserva parámetros escritos por las pestañas (p. ej. ?estado=).
      const next = new URLSearchParams(
        typeof window === 'undefined' ? queryString : window.location.search,
      );
      next.set('tab', tabId);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, queryString, router],
  );

  useEffect(() => {
    setActiveSubscriberTab(urlTab);
  }, [urlTab]);

  useEffect(() => {
    if (requestedTab !== urlTab) {
      const next = new URLSearchParams(queryString);
      next.set('tab', urlTab);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }
  }, [urlTab, requestedTab, pathname, queryString, router]);

  useEffect(() => {
    if (!loading) {
      setShowLoadingSkeleton(false);
      return;
    }

    const timeoutId = window.setTimeout(
      () => setShowLoadingSkeleton(true),
      INITIAL_LOADING_SKELETON_DELAY_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [loading]);

  const loadSubscriber = useCallback(
    async (preserveContent = false) => {
      if (mode !== 'detail' || !subscriberId) {
        return;
      }

      if (!preserveContent) setLoading(true);
      setError(null);
      try {
        const response = await subscribersApi.get360(subscriberId);
        setSubscriber360(response);
      } catch (loadError) {
        setError(mapError(loadError));
      } finally {
        setLoading(false);
      }
    },
    [mode, subscriberId],
  );

  useEffect(() => {
    void loadSubscriber();
  }, [loadSubscriber]);

  const subscriber = subscriber360?.subscriber ?? null;

  // IVA y RUT se completan en Tributario; el dígito del NIT y el representante legal, en Datos.
  const openFiscalCompletion = useCallback(() => {
    const missing = subscriber?.fiscalCompleteness?.missing ?? [];
    selectSubscriberTab(
      missing.some((field) => field === 'VAT_RESPONSIBILITY' || field === 'RUT_RESPONSIBILITIES')
        ? 'tributario'
        : 'datos',
    );
  }, [subscriber, selectSubscriberTab]);

  const tabs = useMemo(() => {
    if (!subscriber) {
      return [];
    }

    // Datos y Tributario guardan por la misma vía y recargan la ficha.
    const saveSubscriber = async (partial: Partial<UpdateSubscriberPayload>) => {
      await subscribersApi.update(subscriber.id, partial as UpdateSubscriberPayload);
      await loadSubscriber();
    };

    return [
      {
        id: 'vista-general',
        label: 'Vista general',
        content: subscriber360 ? (
          <SubscriberOverviewTab
            subscriber360={subscriber360}
            canReadPrivacy={canReadPrivacy}
            onNavigate={selectSubscriberTab}
            onReload={() => loadSubscriber(true)}
          />
        ) : null,
      },
      {
        id: 'servicios',
        label: 'Servicios',
        content: subscriber360 ? (
          <div className="space-y-4">
            <ServiciosTab
              subscriber360={subscriber360}
              onReload={async () => {
                // Refresca sin desmontar la pestaña: un skeleton perdería el
                // drawer abierto y su estado tras cambiar el plan o activar.
                await loadSubscriber(true);
              }}
              onOpenLifecycle={(action, contractId) => {
                setLifecycleAction(action);
                setLifecycleContractId(contractId ?? null);
                setLifecycleSuccess(null);
              }}
            />
            {canReadNetworkProvisioning ? (
              <SubscriberTechnicalServiceSection subscriberId={subscriber.id} />
            ) : null}
          </div>
        ) : null,
      },
      {
        id: 'soporte',
        label: 'Soporte',
        content: <SubscriberSupportTab subscriber={subscriber} />,
      },
      {
        id: 'datos',
        label: 'Datos',
        content: <SubscriberSections subscriber={subscriber} onSave={saveSubscriber} />,
      },
      {
        id: 'tributario',
        label: 'Tributario',
        pending: fiscalDirty,
        content: (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <SubscriberFiscalSection
              subscriber={subscriber}
              onSave={saveSubscriber}
              onDirtyChange={setFiscalDirty}
            />
            <TaxProfileBlock
              subscriberId={subscriber.id}
              onNavigateToServices={() => selectSubscriberTab('servicios')}
            />
          </div>
        ),
      },
      {
        id: 'cumplimiento',
        label: 'Cumplimiento',
        content:
          canReadPrivacy && !subscriber360?.privacyDetailsRestricted ? (
            <CompliancePanel
              partyId={subscriber.partyId}
              authorizations={subscriber360?.habeasData ?? []}
              requests={subscriber360?.arcoRequests ?? []}
              canManage={canManagePrivacy}
              contracts={subscriber360?.contracts ?? []}
              requesterDefaults={{
                name:
                  subscriber.personType === PersonType.JURIDICA
                    ? subscriber.businessName
                    : `${subscriber.firstName ?? ''} ${subscriber.lastName ?? ''}`.trim(),
                ...(subscriber.documentNumber !== undefined
                  ? { document: subscriber.documentNumber }
                  : {}),
                ...((subscriber.email ?? subscriber.phone) !== undefined
                  ? { contact: subscriber.email ?? subscriber.phone ?? null }
                  : {}),
              }}
              onChanged={() => void loadSubscriber(true)}
            />
          ) : (
            <PortalAlert
              variant="warning"
              title="No tienes acceso a datos de privacidad"
              description="Solicita el permiso de lectura para consultar autorizaciones y solicitudes vinculadas."
            />
          ),
      },
    ];
  }, [
    subscriber,
    subscriber360,
    selectSubscriberTab,
    loadSubscriber,
    canManagePrivacy,
    canReadPrivacy,
    canReadNetworkProvisioning,
    fiscalDirty,
  ]);

  if (mode === 'create') {
    return (
      <div className="space-y-6 pb-6">
        <PageHeader
          title="Nuevo suscriptor"
          subtitle="Registra un nuevo suscriptor para la empresa autenticada."
        />
        <SubscriberForm
          onCancel={() => router.push('/dashboard/crm/subscribers')}
          onSave={async (payload) => {
            const created = await subscribersApi.create(payload as CreateSubscriberPayload);
            router.push(`/dashboard/crm/subscribers/${created.id}`);
          }}
        />
      </div>
    );
  }

  if (!loading && subscriber?.privacyRestricted) {
    return (
      <div className="space-y-6 pb-6">
        <SubscriberHeader
          subscriber={subscriber}
          marks={subscriber360?.privacyMarks ?? []}
          canReadPrivacy={canReadPrivacy}
          onChangeStatus={() => setDialogOpen(true)}
          onOpenLifecycle={() => undefined}
          onCancelSubscriber={() => undefined}
          onAddContact={() => selectSubscriberTab('datos')}
        />
        <PortalAlert
          variant="warning"
          title="Datos bloqueados"
          description="La información personal está bloqueada y no se puede editar desde este perfil."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      {loading && showLoadingSkeleton && (
        <div className="space-y-4" aria-busy="true">
          <PortalSkeletonBlock className="h-24 rounded-2xl" />
          <section className="space-y-3" aria-label="Servicios">
            <p className="text-sm text-gray-600 dark:text-gray-300" role="status">
              Cargando servicios…
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <PortalSkeletonBlock className="h-28 rounded-xl" />
              <PortalSkeletonBlock className="h-28 rounded-xl" />
            </div>
          </section>
          <PortalSkeletonBlock className="h-64 rounded-2xl" />
        </div>
      )}

      {error && (
        <PortalAlert
          variant="error"
          title="No fue posible cargar el suscriptor"
          description={error}
        />
      )}

      {!loading && subscriber && (
        <>
          <div>
            <SubscriberHeader
              subscriber={subscriber}
              contracts={subscriber360?.contracts ?? []}
              marks={subscriber360?.privacyMarks ?? []}
              canReadPrivacy={canReadPrivacy}
              onChangeStatus={() => {
                setStatusDialogMode('advance');
                setDialogOpen(true);
              }}
              onOpenLifecycle={(action) => {
                setLifecycleAction(action);
                setLifecycleContractId(null);
                setLifecycleSuccess(null);
              }}
              onCancelSubscriber={() => {
                setStatusDialogMode('cancel');
                setDialogOpen(true);
              }}
              onAddContact={() => selectSubscriberTab('datos')}
              onCompleteFiscalData={openFiscalCompletion}
            />
          </div>

          <div>
            <SubscriberTabsContainer
              tabs={tabs}
              activeTab={activeSubscriberTab}
              onActiveTabChange={selectSubscriberTab}
            />
          </div>

          <SubscriberStatusTransitionDialog
            currentStatus={subscriber.status}
            mode={statusDialogMode}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            onGoToServices={() => selectSubscriberTab('servicios')}
            onAddContact={() => {
              setDialogOpen(false);
              selectSubscriberTab('datos');
            }}
            onCompleteFiscalData={openFiscalCompletion}
            onTransition={async (payload: TransitionStatusPayload) => {
              await subscribersApi.transitionStatus(subscriber.id, payload);
              await loadSubscriber(true);
            }}
          />
          {lifecycleAction && subscriber360 && (
            <SubscriberLifecycleDialog
              open={Boolean(lifecycleAction)}
              onOpenChange={(open) => {
                if (!open) {
                  setLifecycleAction(null);
                  setLifecycleContractId(null);
                }
              }}
              subscriberId={subscriber.id}
              contracts={subscriber360.contracts}
              action={lifecycleAction}
              contractId={lifecycleContractId}
              onGoToServices={() => selectSubscriberTab('servicios')}
              onSuccess={async (action, affectedCount) => {
                await loadSubscriber(true);
                const subject = affectedCount === 1 ? 'servicio' : 'servicios';
                const verb = affectedCount === 1 ? 'suspendió' : 'suspendieron';
                const title =
                  action === 'SUSPEND'
                    ? 'Servicios suspendidos'
                    : action === 'REACTIVATE'
                      ? 'Servicios reactivados'
                      : affectedCount === 1
                        ? 'Servicio terminado'
                        : 'Servicios terminados';
                const description =
                  action === 'SUSPEND'
                    ? `Se ${verb} ${affectedCount} ${subject}.`
                    : action === 'REACTIVATE'
                      ? affectedCount === 1
                        ? 'Se reactivó 1 servicio.'
                        : `Se reactivaron ${affectedCount} servicios.`
                      : affectedCount === 1
                        ? 'Se terminó 1 servicio.'
                        : `Se terminaron ${affectedCount} servicios.`;
                setLifecycleSuccess({ title, description });
              }}
            />
          )}
          {lifecycleSuccess && (
            <PortalAlert
              variant="success"
              title={lifecycleSuccess.title}
              description={lifecycleSuccess.description}
            />
          )}
        </>
      )}
    </div>
  );
}
