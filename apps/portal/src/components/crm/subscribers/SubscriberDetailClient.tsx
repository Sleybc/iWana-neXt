'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@iwana/ui';
import {
  AlertTriangle,
  BriefcaseBusiness,
  FileCheck2,
  Loader2,
  Pencil,
  Users,
  X,
} from 'lucide-react';
import type { CreateSubscriberPayload, UpdateSubscriberPayload } from '@iwana/shared';
import { ApiError, Subscriber360Response, crmApi, subscribersApi } from '@/lib/api-client';
import { formatExpedienteStatus } from '@/components/crm/expedientes/expediente-ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { SubscriberForm } from './SubscriberForm';
import { SubscriberHeader } from './SubscriberHeader';
import { SubscriberSections } from './SubscriberSections';
import { SubscriberStatusTransitionDialog } from './SubscriberStatusTransitionDialog';
import { SubscriberTabsContainer } from './SubscriberTabsContainer';
import { TaxProfileBlock } from './TaxProfileBlock';
import { ServiciosTab } from './ServiciosTab';
import { CUSTOMER_SEGMENT_META, PERSON_TYPE_META, SUBSCRIBER_STATUS_META } from './subscriber-ui';

interface SubscriberDetailClientProps {
  mode: 'create' | 'detail';
}

function StubCard({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: typeof Users;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-iwana-primary" aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
      </CardContent>
    </Card>
  );
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

function formatFriendlyExpedienteRef(expedienteId: string): string {
  const shortToken = expedienteId.split('-')[0]?.toUpperCase();
  return shortToken ? `EXP-${shortToken}` : expedienteId;
}

export function SubscriberDetailClient({ mode }: SubscriberDetailClientProps) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const subscriberId = typeof params?.id === 'string' ? params.id : '';
  const [subscriber360, setSubscriber360] = useState<Subscriber360Response | null>(null);
  const [loading, setLoading] = useState(mode === 'detail');
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Estado de edición del panel Facturación en la vista 360
  const [billingEditing, setBillingEditing] = useState(false);
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingDraft, setBillingDraft] = useState({
    paymentMethod: '',
    billingCycle: '',
    fiscalName: '',
  });

  const loadSubscriber = async () => {
    if (mode !== 'detail' || !subscriberId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await subscribersApi.get360(subscriberId);
      setSubscriber360(response);
    } catch (loadError) {
      setError(mapError(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSubscriber();
  }, [mode, subscriberId]);

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
                <CardTitle>Origen del expediente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                {subscriber360?.expedienteSummary ? (
                  <>
                    <p>
                      <strong>Expediente:</strong>{' '}
                      {formatFriendlyExpedienteRef(subscriber360.expedienteSummary.id)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Código interno: {subscriber360.expedienteSummary.id}
                    </p>
                    <p>
                      <strong>Estado:</strong>{' '}
                      {formatExpedienteStatus(subscriber360.expedienteSummary.status)}
                    </p>
                    <Link
                      className="text-iwana-primary underline"
                      href={`/dashboard/crm/expedientes/${subscriber360.expedienteSummary.id}`}
                    >
                      Ir al expediente origen
                    </Link>
                  </>
                ) : (
                  <p>No disponible para este suscriptor.</p>
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
                {subscriber360?.expedienteSummary && !billingEditing && (
                  <button
                    aria-label="Editar facturación"
                    className="flex items-center gap-1 rounded text-xs text-iwana-primary hover:underline"
                    onClick={() => {
                      const s = subscriber360.expedienteSummary!;
                      setBillingDraft({
                        paymentMethod: s.paymentMethod ?? '',
                        billingCycle: s.billingCycle ?? '',
                        fiscalName: s.fiscalName ?? '',
                      });
                      setBillingEditing(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Editar
                  </button>
                )}
              </CardHeader>
              <CardContent className="text-sm text-gray-600 dark:text-gray-300">
                {!subscriber360?.expedienteSummary ? (
                  <p className="italic">Sin expediente vinculado. Facturación no disponible.</p>
                ) : billingEditing ? (
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
                          <input
                            aria-label={label}
                            className="rounded border border-gray-300 px-2.5 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
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
                      <button
                        aria-label="Guardar facturación"
                        className="rounded bg-iwana-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                        disabled={billingSaving}
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
                          try {
                            await crmApi.updateExpedienteSection(expedienteId, 'billing', payload);
                            await loadSubscriber();
                            setBillingEditing(false);
                          } catch (saveErr) {
                            // El error se muestra en consola; en una próxima iteración agregar toast
                            console.error('Error guardando facturación:', saveErr);
                          } finally {
                            setBillingSaving(false);
                          }
                        }}
                      >
                        {billingSaving ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button
                        aria-label="Cancelar edición de facturación"
                        className="flex items-center gap-1 rounded border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800"
                        onClick={() => setBillingEditing(false)}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        Cancelar
                      </button>
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
                          {value ?? <span className="italic text-gray-400">No configurado</span>}
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
        content: <TaxProfileBlock subscriberId={subscriber.id} />,
      },
      {
        id: 'servicios',
        label: 'Servicios',
        content: subscriber360 ? (
          <ServiciosTab subscriber360={subscriber360} onReload={loadSubscriber} />
        ) : null,
      },
      {
        id: 'financiero',
        label: 'Financiero',
        content: (
          <StubCard
            title="Financiero"
            description="Facturas, pagos y estado de cuenta aún no integrados al CRM en esta fase."
            icon={Users}
          />
        ),
      },
      {
        id: 'cumplimiento',
        label: 'Cumplimiento',
        content: (
          <StubCard
            title="Cumplimiento"
            description="Consentimientos y solicitudes ARCO se muestran como lectura consolidada progresiva."
            icon={FileCheck2}
          />
        ),
      },
      {
        id: 'seguimiento',
        label: 'Seguimiento',
        content: (
          <StubCard
            title="Seguimiento"
            description="Timeline consolidado de conversión y cambios de estado del suscriptor."
            icon={Users}
          />
        ),
      },
    ];
  }, [subscriber, subscriber360, billingEditing, billingDraft, billingSaving, loadSubscriber]);

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

  return (
    <div className="space-y-6 pb-6">
      {loading && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-6 py-5 shadow-[var(--shadow-sm)] dark:border-dark-border dark:bg-dark-surface-2">
          <Loader2 className="h-5 w-5 animate-spin text-iwana-primary" aria-hidden="true" />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Cargando ficha 360 del suscriptor...
          </span>
        </div>
      )}

      {error && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/90 px-5 py-4 text-sm text-red-700 shadow-[var(--shadow-sm)] dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {!loading && subscriber && (
        <>
          <div>
            <SubscriberHeader subscriber={subscriber} onChangeStatus={() => setDialogOpen(true)} />
          </div>

          <div>
            <SubscriberTabsContainer tabs={tabs} />
          </div>

          <SubscriberStatusTransitionDialog
            currentStatus={subscriber.status}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            onTransition={async (targetStatus, reason) => {
              await subscribersApi.transitionStatus(subscriber.id, {
                targetStatus,
                ...(reason ? { reason } : {}),
              });
              await loadSubscriber();
            }}
          />
        </>
      )}
    </div>
  );
}
