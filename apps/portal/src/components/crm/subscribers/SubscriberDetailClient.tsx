'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AccessPermissionKey, PersonType } from '@iwana/shared';
import type { LifecycleAction, TransitionStatusPayload } from '@iwana/shared';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@iwana/ui';
import { BriefcaseBusiness, Pencil, X } from 'lucide-react';
import type { CreateSubscriberPayload, UpdateSubscriberPayload } from '@iwana/shared';
import { ApiError, Subscriber360Response, crmApi, subscribersApi } from '@/lib/api-client';
import { formatExpedienteStatus } from '@/components/crm/expedientes/expediente-ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { usePermissions } from '@/components/access-control/permissions-context';
import { CompliancePanel } from '@/components/privacy/CompliancePanel';
import { privacyDisplayValue } from '@/components/privacy/privacy-display';
import { SubscriberForm } from './SubscriberForm';
import { SubscriberHeader } from './SubscriberHeader';
import { SubscriberSections } from './SubscriberSections';
import { SubscriberStatusTransitionDialog } from './SubscriberStatusTransitionDialog';
import { SubscriberTabsContainer } from './SubscriberTabsContainer';
import { TaxProfileBlock } from './TaxProfileBlock';
import { ServiciosTab } from './ServiciosTab';
import { SubscriberLifecycleDialog } from './SubscriberLifecycleDialog';
import { SubscriberSupportTab } from './SubscriberSupportTab';
import { CUSTOMER_SEGMENT_META, PERSON_TYPE_META, SUBSCRIBER_STATUS_META } from './subscriber-ui';

interface SubscriberDetailClientProps {
  mode: 'create' | 'detail';
}

function mapError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  return 'No fue posible completar la operación del suscriptor.';
}

function toSentenceCase(value: string): string {
  const normalized = value.replace(/_/g, ' ').toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
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
  const selectSubscriberTab = useCallback(
    (tabId: string) => {
      setActiveSubscriberTab(tabId);
      const next = new URLSearchParams(queryString);
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

  // Estado de edición del panel Facturación en la vista 360
  const [billingEditing, setBillingEditing] = useState(false);
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingSuccess, setBillingSuccess] = useState('');
  const [billingDraft, setBillingDraft] = useState({
    paymentMethod: '',
    billingCycle: '',
    fiscalName: '',
  });

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

  const tabs = useMemo(() => {
    if (!subscriber) {
      return [];
    }

    return [
      {
        id: 'vista-general',
        label: 'Vista general',
        content: (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Identidad del suscriptor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <p>
                  <strong>Estado:</strong>{' '}
                  {SUBSCRIBER_STATUS_META[subscriber.status]?.label ??
                    toSentenceCase(subscriber.status)}
                </p>
                <p>
                  <strong>Tipo:</strong>{' '}
                  {PERSON_TYPE_META[subscriber.personType]?.label ??
                    toSentenceCase(subscriber.personType)}
                </p>
                <p>
                  <strong>Segmento:</strong>{' '}
                  {CUSTOMER_SEGMENT_META[subscriber.customerSegment]?.label ??
                    toSentenceCase(subscriber.customerSegment)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Oportunidad de origen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                {subscriber360?.expedienteSummary ? (
                  <>
                    <p>
                      <strong>Estado:</strong>{' '}
                      {formatExpedienteStatus(subscriber360.expedienteSummary.status)}
                    </p>
                    <Link
                      className="text-iwana-primary underline"
                      href={`/dashboard/crm/expedientes/${subscriber360.expedienteSummary.id}`}
                    >
                      Abrir oportunidad de origen
                    </Link>
                  </>
                ) : (
                  <p>No hay una oportunidad vinculada a este suscriptor.</p>
                )}
              </CardContent>
            </Card>

            {/* Facturación: se configura al activar al cliente */}
            <Card className="md:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2">
                  <BriefcaseBusiness className="h-5 w-5 text-iwana-primary" aria-hidden="true" />
                  Facturación
                </CardTitle>
                {subscriber360?.expedienteSummary &&
                  !billingEditing &&
                  !subscriber.privacyRestricted &&
                  !subscriber.anonymizedAt && (
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label="Editar facturación"
                      onClick={() => {
                        const s = subscriber360.expedienteSummary!;
                        setBillingDraft({
                          paymentMethod: s.paymentMethod ?? '',
                          billingCycle: s.billingCycle ?? '',
                          fiscalName: s.fiscalName ?? '',
                        });
                        setBillingError(null);
                        setBillingSuccess('');
                        setBillingEditing(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      Editar
                    </Button>
                  )}
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                <p aria-live="polite" role="status">
                  {billingSuccess}
                </p>
                {billingError && (
                  <PortalAlert
                    variant="error"
                    live="assertive"
                    title="No fue posible guardar la facturación"
                    description={billingError}
                  />
                )}
                {!subscriber360?.expedienteSummary ? (
                  <p className="italic">Sin oportunidad vinculada. Facturación no disponible.</p>
                ) : billingEditing && !subscriber.anonymizedAt ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      {(
                        [
                          {
                            key: 'paymentMethod',
                            label: 'Método de pago',
                            placeholder: 'Transferencia, PSE, efectivo...',
                          },
                          {
                            key: 'billingCycle',
                            label: 'Ciclo de facturación',
                            placeholder: 'Mensual, quincenal...',
                          },
                          {
                            key: 'fiscalName',
                            label: 'Nombre fiscal',
                            placeholder: 'Razón fiscal para facturación',
                          },
                        ] as const
                      ).map(({ key, label, placeholder }) => (
                        <label key={key} className="flex flex-col gap-1">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {label}
                          </span>
                          <Input
                            aria-label={label}
                            disabled={billingSaving}
                            placeholder={placeholder}
                            type="text"
                            value={billingDraft[key]}
                            onChange={(e) =>
                              setBillingDraft((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        type="button"
                        aria-label="Guardar facturación"
                        loading={billingSaving}
                        onClick={async () => {
                          const expedienteId = subscriber360.expedienteSummary!.id;
                          const payload: Record<string, unknown> = {};
                          if (billingDraft.paymentMethod.trim())
                            payload.paymentMethod = billingDraft.paymentMethod.trim();
                          if (billingDraft.billingCycle.trim())
                            payload.billingCycle = billingDraft.billingCycle.trim();
                          if (billingDraft.fiscalName.trim())
                            payload.fiscalName = billingDraft.fiscalName.trim();
                          setBillingSaving(true);
                          setBillingError(null);
                          setBillingSuccess('');
                          try {
                            await crmApi.updateExpedienteSection(expedienteId, 'billing', payload);
                            await loadSubscriber(true);
                            setBillingEditing(false);
                            setBillingSuccess('Facturación guardada.');
                          } catch (saveErr) {
                            setBillingError(mapError(saveErr));
                          } finally {
                            setBillingSaving(false);
                          }
                        }}
                      >
                        Guardar
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={billingSaving}
                        aria-label="Cancelar edición de facturación"
                        onClick={() => setBillingEditing(false)}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-x-8 gap-y-2 sm:grid-cols-3">
                    {(
                      [
                        {
                          label: 'Método de pago',
                          value: subscriber360.expedienteSummary.paymentMethod,
                        },
                        {
                          label: 'Ciclo de facturación',
                          value: subscriber360.expedienteSummary.billingCycle,
                        },
                        {
                          label: 'Nombre fiscal',
                          value: subscriber360.expedienteSummary.fiscalName,
                        },
                      ] as const
                    ).map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-xs font-medium text-gray-400">{label}</p>
                        <p>
                          {label === 'Nombre fiscal' && subscriber.anonymizedAt
                            ? privacyDisplayValue(null, {
                                anonymizedAt: subscriber.anonymizedAt,
                              })
                            : (value ?? (
                                <span className="italic text-gray-400">No configurado</span>
                              ))}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ),
      },
      {
        id: 'servicios',
        label: 'Servicios',
        content: subscriber360 ? (
          <ServiciosTab
            subscriber360={subscriber360}
            onReload={loadSubscriber}
            onOpenLifecycle={(action, contractId) => {
              setLifecycleAction(action);
              setLifecycleContractId(contractId ?? null);
              setLifecycleSuccess(null);
            }}
          />
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
        content: (
          <SubscriberSections
            subscriber={subscriber}
            onSave={async (partial) => {
              await subscribersApi.update(subscriber.id, partial as UpdateSubscriberPayload);
              await loadSubscriber();
            }}
          />
        ),
      },
      {
        id: 'tributario',
        label: 'Tributario',
        content: (
          <TaxProfileBlock
            subscriberId={subscriber.id}
            onNavigateToServices={() => selectSubscriberTab('servicios')}
          />
        ),
      },
      {
        id: 'cumplimiento',
        label: 'Cumplimiento',
        content: canReadPrivacy ? (
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
                ? { contact: subscriber.email ?? subscriber.phone }
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
    billingEditing,
    billingDraft,
    billingSaving,
    billingError,
    billingSuccess,
    selectSubscriberTab,
    loadSubscriber,
    canManagePrivacy,
    canReadPrivacy,
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
              onCompleteFiscalData={() => selectSubscriberTab('datos')}
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
            onCompleteFiscalData={() => selectSubscriberTab('datos')}
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
