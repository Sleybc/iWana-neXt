'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  FormStatus,
  Select,
} from '@iwana/ui';
import { Plus, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { ConsentChannel, type DataAuthorizationView, type LegalText } from '@iwana/shared';
import {
  crmApi,
  subscribersApi,
  type ConsentRecordItem,
  type CreateConsentDto,
} from '@/lib/api-client';
import { PortalAlert, PortalPanel, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { getSafeCrmErrorMessage } from './crm-error-message';
import { ApiError, privacyApi } from '@/lib/api-client';
import { LegalTextContent } from '@/components/privacy/LegalTextContent';
import { LegalTextReferences } from '@/components/privacy/LegalTextReferences';
import { useEnabledPurposes } from '@/components/privacy/use-enabled-purposes';

const CONSENT_TYPE_OPTIONS = [
  { value: 'DATA_TREATMENT', label: 'Tratamiento de datos' },
  { value: 'COMMERCIAL_CONTACT', label: 'Contacto comercial' },
  { value: 'OPERATIONAL_CONTACT', label: 'Contacto operativo' },
];

const CONSENT_STATUS_OPTIONS = [
  { value: 'ACCEPTED', label: 'Aceptado' },
  { value: 'PENDING', label: 'Pendiente' },
  { value: 'REJECTED', label: 'Rechazado' },
];

const CONSENT_CHANNEL_OPTIONS = [
  { value: ConsentChannel.TELEFONO, label: 'Teléfono' },
  { value: ConsentChannel.PRESENCIAL, label: 'Presencial' },
  { value: ConsentChannel.EMAIL, label: 'Correo electrónico' },
  { value: ConsentChannel.MENSAJE_TEXTO, label: 'Mensaje de texto' },
  { value: ConsentChannel.MENSAJERIA_INSTANTANEA, label: 'Mensajería instantánea' },
];

function getConsentStatusBadgeVariant(status: string) {
  switch (status) {
    case 'ACCEPTED':
    case 'ACEPTADO':
      return 'success';
    case 'PENDING':
    case 'PENDIENTE':
      return 'warning';
    case 'REJECTED':
    case 'RECHAZADO':
    case 'REVOKED':
    case 'REVOCADO':
      return 'error';
    default:
      return 'neutral';
  }
}

function getConsentStatusLabel(status: string) {
  switch (status) {
    case 'ACCEPTED':
    case 'ACEPTADO':
      return 'Aceptado';
    case 'PENDING':
    case 'PENDIENTE':
      return 'Pendiente';
    case 'REJECTED':
    case 'RECHAZADO':
      return 'Rechazado';
    case 'REVOKED':
    case 'REVOCADO':
      return 'Revocado';
    default:
      return 'Estado registrado';
  }
}

function getConsentTypeLabel(type: string) {
  switch (type) {
    case 'DATA_TREATMENT':
    case 'TRATAMIENTO_DATOS':
      return 'Tratamiento de datos';
    case 'COMMERCIAL_CONTACT':
    case 'CONTACTO_COMERCIAL':
      return 'Contacto comercial';
    case 'OPERATIONAL_CONTACT':
    case 'CONTACTO_OPERATIVO':
      return 'Contacto operativo';
    default:
      return 'Autorización histórica';
  }
}

function getConsentChannelLabel(channel: string) {
  switch (channel) {
    case 'PRESENCIAL':
      return 'Presencial';
    case 'TELEFONO':
      return 'Teléfono';
    case 'EMAIL':
      return 'Correo electrónico';
    case 'MENSAJE_TEXTO':
      return 'Mensaje de texto';
    case 'MENSAJERIA_INSTANTANEA':
      return 'Mensajería instantánea';
    default:
      return 'Medio histórico';
  }
}

function getConsentTypeIcon(type: string, status: string) {
  const isAccepted = status === 'ACCEPTED' || status === 'ACEPTADO';
  const isRejected =
    status === 'REJECTED' ||
    status === 'RECHAZADO' ||
    status === 'REVOKED' ||
    status === 'REVOCADO';

  if (isRejected) return ShieldX;
  if (isAccepted) return ShieldCheck;
  return ShieldAlert;
}

interface ConsentsPanelProps {
  expedienteId: string;
  subscriberId?: string | null;
  canReadSubscriberAuthorizations?: boolean;
}

export function ConsentsPanel({
  expedienteId,
  subscriberId,
  canReadSubscriberAuthorizations = false,
}: ConsentsPanelProps) {
  if (subscriberId) {
    return (
      <SubscriberConsentsPanel
        key={`${subscriberId}:${canReadSubscriberAuthorizations}`}
        subscriberId={subscriberId}
        canRead={canReadSubscriberAuthorizations}
      />
    );
  }
  return <ExpedienteConsentsPanel expedienteId={expedienteId} />;
}

const SUBSCRIBER_CONSENT_PURPOSES = [
  { key: 'TRATAMIENTO_CONTRACTUAL', label: 'Tratamiento contractual' },
  { key: 'CONTACTO_COMERCIAL', label: 'Contacto comercial' },
] as const;

function SubscriberConsentsPanel({
  subscriberId,
  canRead,
}: {
  subscriberId: string;
  canRead: boolean;
}) {
  const [authorizations, setAuthorizations] = useState<DataAuthorizationView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!canRead) return;
    let active = true;
    void subscribersApi.get360(subscriberId).then(
      (data) => {
        if (!active) return;
        if (
          data.privacyDetailsRestricted ||
          data.subscriber.privacyRestricted ||
          data.subscriber.anonymizedAt
        ) {
          setRestricted(true);
          return;
        }
        setAuthorizations(data.habeasData);
      },
      (failure: unknown) => {
        if (!active) return;
        if (failure instanceof ApiError && failure.status === 403) setRestricted(true);
        else setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [attempt, canRead, subscriberId]);

  return (
    <PortalPanel
      as="section"
      labelled
      title="Consentimientos (Ley 1581)"
      description="Autorizaciones del suscriptor vinculado."
    >
      {!canRead || restricted ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Autorizaciones restringidas para tu perfil.
        </p>
      ) : failed ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar las autorizaciones del suscriptor."
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setFailed(false);
                setAttempt((value) => value + 1);
              }}
            >
              Reintentar
            </Button>
          }
        />
      ) : authorizations === null ? (
        <p role="status" className="text-sm text-gray-600 dark:text-gray-400">
          Cargando autorizaciones
        </p>
      ) : (
        <>
          <ul
            aria-label="Autorizaciones por finalidad"
            className="divide-y divide-gray-100 dark:divide-dark-border"
          >
            {SUBSCRIBER_CONSENT_PURPOSES.map(({ key, label }) => {
              // La API de privacidad devuelve primero el evento más reciente de cada finalidad.
              const current = authorizations.find((item) => item.purpose === key);
              const status =
                current?.kind === 'REVOCATION'
                  ? 'Retirada'
                  : current?.granted
                    ? current.kind === 'LEGACY_IMPORT'
                      ? 'Autorización importada'
                      : 'Autorización vigente'
                    : current
                      ? 'No autorizada'
                      : 'Sin registro';
              return (
                <li
                  key={key}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span>{label}</span>
                  <Badge
                    variant={
                      current?.granted && current.kind !== 'REVOCATION' ? 'success' : 'neutral'
                    }
                  >
                    {status}
                  </Badge>
                </li>
              );
            })}
          </ul>
          <Button variant="link" asChild>
            <Link
              href={`/dashboard/crm/subscribers/${encodeURIComponent(subscriberId)}?tab=cumplimiento`}
            >
              Ver cumplimiento del suscriptor
            </Link>
          </Button>
        </>
      )}
    </PortalPanel>
  );
}

function ExpedienteConsentsPanel({ expedienteId }: { expedienteId: string }) {
  const purposes = useEnabledPurposes();
  const [textError, setTextError] = useState(false);
  const [textRetry, setTextRetry] = useState(0);
  const [consents, setConsents] = useState<ConsentRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [authorizationText, setAuthorizationText] = useState<LegalText | null>(null);
  const [authorizationTextLoading, setAuthorizationTextLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [consentType, setConsentType] = useState('DATA_TREATMENT');
  const [status, setStatus] = useState('ACCEPTED');
  const [channel, setChannel] = useState<ConsentChannel | ''>('');
  useEffect(() => {
    let active = true;
    void privacyApi
      .getCurrentLegalText('AUTORIZACION')
      .then((text) => {
        if (active) setAuthorizationText(text);
      })
      .catch((failure: unknown) => {
        if (active) {
          setAuthorizationText(null);
          setTextError(!(failure instanceof ApiError && failure.status === 404));
        }
      })
      .finally(() => {
        if (active) setAuthorizationTextLoading(false);
      });
    return () => {
      active = false;
    };
  }, [textRetry]);

  const loadConsents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccessMessage(null);
      const response = await crmApi.listConsents(expedienteId);
      setConsents(response.data);
    } catch {
      setError('No fue posible cargar los consentimientos.');
    } finally {
      setLoading(false);
    }
  }, [expedienteId]);

  useEffect(() => {
    void loadConsents();
  }, [loadConsents]);

  const handleCreateConsent = async () => {
    if (!authorizationText || !channel) return;

    const payload: CreateConsentDto = {
      consentType,
      status,
      channel,
      legalTextVersion: authorizationText.version,
    };

    try {
      setSubmitting(true);
      setError(null);
      setSuccessMessage(null);
      await crmApi.createConsent(expedienteId, payload);
      setShowForm(false);
      setChannel('');
      await loadConsents();
      setSuccessMessage('La autorización quedó registrada.');
    } catch (err) {
      setError(getSafeCrmErrorMessage(err, 'No fue posible registrar la autorización.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (consentId: string, reason?: string) => {
    try {
      setRevoking(consentId);
      setError(null);
      setSuccessMessage(null);
      await crmApi.revokeConsent(
        expedienteId,
        consentId,
        reason?.trim() || 'Revocación solicitada desde el portal',
      );
      await loadConsents();
      setSuccessMessage('Consentimiento revocado correctamente.');
    } catch (err) {
      setError(getSafeCrmErrorMessage(err, 'No fue posible revocar el consentimiento.'));
    } finally {
      setRevoking(null);
    }
  };

  const consentTypes = ['DATA_TREATMENT', 'COMMERCIAL_CONTACT', 'OPERATIONAL_CONTACT'];
  const legacyConsentTypeMap: Record<string, string> = {
    DATA_TREATMENT: 'TRATAMIENTO_DATOS',
    COMMERCIAL_CONTACT: 'CONTACTO_COMERCIAL',
    OPERATIONAL_CONTACT: 'CONTACTO_OPERATIVO',
  };
  const consentsByType = consentTypes.reduce(
    (acc, type) => {
      const legacyType = legacyConsentTypeMap[type] ?? type;
      acc[type] = consents.find((c) => c.consentType === type || c.consentType === legacyType);
      return acc;
    },
    {} as Record<string, ConsentRecordItem | undefined>,
  );

  const canRegister = !authorizationTextLoading && Boolean(authorizationText);
  const authorizationStatusClass = (consent: ConsentRecordItem | undefined) => {
    const accepted = consent?.status === 'ACCEPTED' || consent?.status === 'ACEPTADO';
    const rejected =
      consent?.status === 'REJECTED' ||
      consent?.status === 'RECHAZADO' ||
      consent?.status === 'REVOKED' ||
      consent?.status === 'REVOCADO';
    if (accepted)
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
    if (rejected) return 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300';
    return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
  };

  return (
    <PortalPanel
      as="section"
      labelled
      eyebrow="Ley 1581"
      title="Consentimientos (Ley 1581)"
      description="Autorizaciones de tratamiento de datos y contacto."
      contentClassName="space-y-3"
    >
      {/* Con el diálogo abierto, el error se muestra dentro de él. */}
      <FormStatus
        status={error && !showForm ? 'error' : successMessage ? 'success' : 'idle'}
        message={(showForm ? null : error) ?? successMessage ?? undefined}
      />

      {!authorizationTextLoading && !authorizationText ? (
        textError ? (
          <PortalAlert
            variant="error"
            title="No fue posible cargar el texto vigente."
            action={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setAuthorizationTextLoading(true);
                  setTextError(false);
                  setTextRetry((value) => value + 1);
                }}
              >
                Reintentar
              </Button>
            }
          />
        ) : (
          <PortalAlert
            variant="warning"
            title="No hay un texto de autorización vigente"
            description="La captura está bloqueada hasta publicar uno."
            action={
              <Button variant="secondary" size="sm" asChild>
                <Link href="/dashboard/privacy?view=legal">Administrar textos legales</Link>
              </Button>
            }
          />
        )
      ) : null}

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          <span className="sr-only" role="status">
            Cargando autorizaciones
          </span>
          <PortalSkeletonBlock className="h-14 rounded-xl" />
          <PortalSkeletonBlock className="h-14 rounded-xl" />
          <PortalSkeletonBlock className="h-14 rounded-xl" />
        </div>
      ) : (
        // Una lista: las tres finalidades se leen de un vistazo, con su estado como etiqueta.
        <ul
          aria-label="Autorizaciones por finalidad"
          className="divide-y divide-gray-100 dark:divide-dark-border"
        >
          {consentTypes.map((type) => {
            const consent = consentsByType[type];
            const Icon = getConsentTypeIcon(type, consent?.status ?? '');
            const isRejected =
              consent?.status === 'REJECTED' ||
              consent?.status === 'RECHAZADO' ||
              consent?.status === 'REVOKED' ||
              consent?.status === 'REVOCADO';

            return (
              <li key={type} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${authorizationStatusClass(consent)}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {getConsentTypeLabel(type)}
                    </p>
                    {consent ? (
                      <Badge variant={getConsentStatusBadgeVariant(consent.status)}>
                        {getConsentStatusLabel(consent.status)}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {consent
                      ? [
                          new Date(consent.obtainedAt).toLocaleString('es-CO', {
                            dateStyle: 'medium',
                          }),
                          consent.channel
                            ? `Medio: ${getConsentChannelLabel(consent.channel)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : 'Sin registro'}
                  </p>
                </div>
                {consent && !isRejected ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-11 shrink-0"
                    aria-label={`Revocar ${getConsentTypeLabel(type).toLowerCase()}`}
                    onClick={() => void handleRevoke(consent.id)}
                    loading={revoking === consent.id}
                  >
                    Revocar
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* Al pie de la lista: en la columna angosta del tablero, en la cabecera apretaba el título. */}
      <Button
        type="button"
        variant="secondary"
        className="min-h-11 w-full gap-1.5"
        onClick={() => setShowForm(true)}
        disabled={!canRegister}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Registrar autorización
      </Button>

      {/* El texto legal vigente se lee al registrar: es lo que la persona revisa y acepta. */}
      <Dialog open={showForm && Boolean(authorizationText)} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registrar autorización</DialogTitle>
            <DialogDescription>
              Cada decisión se guarda con el texto exacto que la persona revisa.
            </DialogDescription>
          </DialogHeader>
          {authorizationText ? (
            <div className="space-y-4">
              <section className="space-y-2" aria-label="Texto de autorización vigente">
                <p className="text-sm font-semibold">
                  Texto vigente · versión {authorizationText.version}
                </p>
                <div
                  role="region"
                  aria-label={`Texto de autorización, versión ${authorizationText.version}`}
                  tabIndex={0}
                  className="iwana-scroll-inset max-h-64 overflow-y-auto rounded-xl bg-iwana-surface-soft p-4 dark:bg-dark-surface-3"
                >
                  <LegalTextContent
                    content={authorizationText.content}
                    format={authorizationText.format}
                  />
                </div>
                <LegalTextReferences />
              </section>
              <section className="space-y-4" aria-labelledby="expediente-authorization-form-title">
                <div>
                  <h4 id="expediente-authorization-form-title" className="font-semibold">
                    Registrar una autorización
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    El medio indica cómo la persona otorgó su autorización.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select
                    id="expediente-consent-type"
                    label="Finalidad"
                    value={consentType}
                    options={CONSENT_TYPE_OPTIONS.filter((option) =>
                      purposes.enabled.includes(
                        option.value === 'COMMERCIAL_CONTACT'
                          ? 'CONTACTO_COMERCIAL'
                          : 'TRATAMIENTO_CONTRACTUAL',
                      ),
                    )}
                    onChange={(event) => setConsentType(event.target.value)}
                  />
                  <Select
                    id="expediente-consent-status"
                    label="Decisión registrada"
                    value={status}
                    options={CONSENT_STATUS_OPTIONS}
                    onChange={(event) => setStatus(event.target.value)}
                  />
                </div>
                <Select
                  id="expediente-consent-channel"
                  label="Medio por el que la persona otorgó la autorización"
                  value={channel}
                  options={CONSENT_CHANNEL_OPTIONS}
                  placeholder="Selecciona un medio"
                  onChange={(event) => setChannel(event.target.value as ConsentChannel | '')}
                  required
                  aria-required="true"
                />
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Texto vinculado: versión {authorizationText.version}. No se adjuntan archivos
                  desde la oportunidad.
                </p>
                {/* Un fallo al registrar se ve dentro del diálogo, no detrás de él. */}
                {error ? <PortalAlert variant="error" live="assertive" title={error} /> : null}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11"
                    disabled={submitting}
                    onClick={() => setShowForm(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    className="min-h-11"
                    onClick={() => void handleCreateConsent()}
                    loading={submitting}
                    disabled={
                      submitting ||
                      !channel ||
                      !purposes.enabled.includes(
                        consentType === 'COMMERCIAL_CONTACT'
                          ? 'CONTACTO_COMERCIAL'
                          : 'TRATAMIENTO_CONTRACTUAL',
                      )
                    }
                  >
                    Registrar autorización
                  </Button>
                </div>
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </PortalPanel>
  );
}
