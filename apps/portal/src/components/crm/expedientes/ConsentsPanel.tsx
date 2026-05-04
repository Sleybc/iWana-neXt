'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Select } from '@iwana/ui';
import { CircleAlert, Loader2, Shield, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { ConsentChannel } from '@iwana/shared';
import { crmApi, type ConsentRecordItem, type CreateConsentDto } from '@/lib/api-client';

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
  { value: ConsentChannel.PRESENCIAL, label: 'Presencial' },
  { value: ConsentChannel.TELEFONO, label: 'Teléfono' },
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
      return status;
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
      return type;
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
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState<CreateConsentDto>({
    consentType: 'DATA_TREATMENT',
    status: 'ACCEPTED',
    channel: ConsentChannel.PRESENCIAL,
    legalTextVersion: '1.0',
    evidenceRef: undefined,
  });

  useEffect(() => {
    void loadConsents();
  }, [expedienteId]);

  const loadConsents = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccessMessage(null);
      const response = await crmApi.listConsents(expedienteId);
      setConsents(response.data);
    } catch (err) {
      console.error(err);
      setError('No fue posible cargar los consentimientos.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);
      setSuccessMessage(null);
      await crmApi.createConsent(expedienteId, formData);
      await loadConsents();
      setShowForm(false);
      setFormData({
        consentType: 'DATA_TREATMENT',
        status: 'ACCEPTED',
        channel: ConsentChannel.PRESENCIAL,
        legalTextVersion: '1.0',
        evidenceRef: undefined,
      });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'No fue posible registrar el consentimiento.');
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
        reason?.trim() || 'Revocación solicitada desde CRM portal',
      );
      await loadConsents();
      setSuccessMessage('Consentimiento revocado correctamente.');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'No fue posible revocar el consentimiento.');
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
        <Button type="button" size="sm" onClick={() => setShowForm(!showForm)}>
          <Shield className="mr-2 h-4 w-4" aria-hidden="true" />
          {showForm ? 'Cancelar' : 'Registrar consentimiento'}
        </Button>
      </div>

      {successMessage && (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 shadow-sm dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300">
          {successMessage}
        </div>
      )}

      {showForm && (
        <Card className="rounded-2xl border border-white/70 shadow-sm dark:border-dark-border dark:bg-dark-surface-2/95">
          <CardHeader>
            <CardTitle className="text-base">Nuevo consentimiento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Select
                  id="consentType"
                  label="Tipo de consentimiento"
                  value={formData.consentType}
                  onChange={(e) => setFormData({ ...formData, consentType: e.target.value })}
                  className="h-11"
                >
                  {CONSENT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Select
                  id="status"
                  label="Estado"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="h-11"
                >
                  {CONSENT_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Select
                id="channel"
                label="Canal de obtención"
                value={formData.channel}
                onChange={(e) =>
                  setFormData({ ...formData, channel: e.target.value as ConsentChannel })
                }
                className="h-11"
              >
                {CONSENT_CHANNEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>
            <Input
              id="evidenceRef"
              label="Referencia de evidencia"
              value={formData.evidenceRef ?? ''}
              onChange={(e) =>
                setFormData({ ...formData, evidenceRef: e.target.value || undefined })
              }
              placeholder="Número de acta, URL, etc."
            />
            {error && (
              <div className="flex items-start gap-3 rounded-2xl border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-700 shadow-sm dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <p>{error}</p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                loading={submitting}
                disabled={!formData.consentType || !formData.status || !formData.channel}
              >
                Registrar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-iwana-primary" aria-hidden="true" />
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
                              Canal: {consent.channel}
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
