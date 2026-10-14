'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, FormStatus, Select } from '@iwana/ui';
import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { ConsentChannel, type LegalText } from '@iwana/shared';
import { crmApi, type ConsentRecordItem, type CreateConsentDto } from '@/lib/api-client';
import { PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { getSafeCrmErrorMessage } from './crm-error-message';
import { privacyApi } from '@/lib/api-client';

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
}

export function ConsentsPanel({ expedienteId }: ConsentsPanelProps) {
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
    void loadConsents();
  }, [expedienteId]);

  useEffect(() => {
    let active = true;
    void privacyApi
      .getCurrentLegalText('AUTORIZACION')
      .then((text) => {
        if (active) setAuthorizationText(text);
      })
      .catch(() => {
        if (active) setAuthorizationText(null);
      })
      .finally(() => {
        if (active) setAuthorizationTextLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadConsents = async () => {
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
  };

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Consentimientos (Ley 1581)
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Autorizaciones para tratamiento de datos y contacto
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setShowForm((current) => !current)}
          disabled={authorizationTextLoading || !authorizationText}
        >
          {showForm ? 'Cancelar' : 'Registrar autorización'}
        </Button>
      </div>

      <FormStatus
        status={error ? 'error' : successMessage ? 'success' : 'idle'}
        message={error ?? successMessage ?? undefined}
      />

      {authorizationTextLoading ? (
        <p role="status" className="text-sm text-gray-600 dark:text-gray-300">
          Cargando texto de autorización vigente…
        </p>
      ) : authorizationText ? (
        <section
          className="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-dark-border"
          aria-label="Texto de autorización vigente"
        >
          <p className="text-sm font-semibold">
            Texto vigente · versión {authorizationText.version}
          </p>
          <p className="max-h-48 overflow-auto whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">
            {authorizationText.content}
          </p>
        </section>
      ) : (
        <div className="rounded-xl border border-amber-300 p-4 text-sm">
          <p>No hay un texto de autorización vigente. La captura está bloqueada.</p>
          <Link className="font-medium underline" href="/dashboard/privacy?view=legal">
            Administrar textos legales
          </Link>
        </div>
      )}

      {showForm && authorizationText ? (
        <section
          className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-border dark:bg-dark-surface-2"
          aria-labelledby="expediente-authorization-form-title"
        >
          <div>
            <h4 id="expediente-authorization-form-title" className="font-semibold">
              Registrar una autorización
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              El medio indica cómo la persona otorgó su autorización.
            </p>
          </div>
          <Select
            id="expediente-consent-type"
            label="Finalidad"
            value={consentType}
            options={CONSENT_TYPE_OPTIONS}
            onChange={(event) => setConsentType(event.target.value)}
          />
          <Select
            id="expediente-consent-status"
            label="Decisión registrada"
            value={status}
            options={CONSENT_STATUS_OPTIONS}
            onChange={(event) => setStatus(event.target.value)}
          />
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
            Texto vinculado: versión {authorizationText.version}. No se adjuntan archivos desde el
            expediente.
          </p>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => void handleCreateConsent()}
              loading={submitting}
              disabled={submitting || !channel}
            >
              Registrar autorización
            </Button>
          </div>
        </section>
      ) : null}

      {loading ? (
        <div className="space-y-3 py-3" aria-busy="true">
          <span className="sr-only" role="status">
            Cargando autorizaciones
          </span>
          <PortalSkeletonBlock className="h-20 rounded-2xl" />
          <PortalSkeletonBlock className="h-20 rounded-2xl" />
          <PortalSkeletonBlock className="h-20 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-3">
          {consentTypes.map((type) => {
            const consent = consentsByType[type];
            const Icon = getConsentTypeIcon(type, consent?.status ?? '');
            const isAccepted = consent?.status === 'ACCEPTED' || consent?.status === 'ACEPTADO';
            const isRejected =
              consent?.status === 'REJECTED' ||
              consent?.status === 'RECHAZADO' ||
              consent?.status === 'REVOKED' ||
              consent?.status === 'REVOCADO';

            return (
              <div
                key={type}
                className="rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm dark:border-dark-border dark:bg-dark-surface-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl ${
                        isAccepted
                          ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                          : isRejected
                            ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
                      }`}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {getConsentTypeLabel(type)}
                      </p>
                      {consent ? (
                        <>
                          <div className="mt-1 flex items-center gap-2">
                            <Badge variant={getConsentStatusBadgeVariant(consent.status)}>
                              {getConsentStatusLabel(consent.status)}
                            </Badge>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(consent.obtainedAt).toLocaleString('es-CO', {
                                dateStyle: 'medium',
                              })}
                            </span>
                          </div>
                          {consent.channel && (
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              Medio: {getConsentChannelLabel(consent.channel)}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          Sin registro
                        </p>
                      )}
                    </div>
                  </div>
                  {consent && !isRejected && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleRevoke(consent.id)}
                      loading={revoking === consent.id}
                    >
                      Revocar
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
