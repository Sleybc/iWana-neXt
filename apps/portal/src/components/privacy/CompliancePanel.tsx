'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Select } from '@iwana/ui';
import {
  ConsentChannel,
  type DataAuthorizationView,
  type DataPurpose,
  type LegalText,
  type RequestSummary,
} from '@iwana/shared';
import { ApiError, privacyApi } from '@/lib/api-client';
import { PortalAlert, PortalEmptyState, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { EvidenceUploadField } from './EvidenceUploadField';
import { LegalTextContent } from './LegalTextContent';
import { LegalTextReferences } from './LegalTextReferences';
import { useEnabledPurposes } from './use-enabled-purposes';
import { RequestForm } from './RequestForm';
import { formatCivilDate, formatLocalDateTime, DATA_PURPOSE_LABELS } from './privacy-labels';

const PURPOSES: DataPurpose[] = [
  'TRATAMIENTO_CONTRACTUAL',
  'CONTACTO_COMERCIAL',
  'DATOS_BIOMETRICOS',
];
const purposeInput = 'h-4 w-4 rounded border-gray-300 text-iwana-primary focus:ring-iwana-primary';
const CONSENT_CHANNEL_OPTIONS = [
  { value: ConsentChannel.TELEFONO, label: 'Teléfono' },
  { value: ConsentChannel.PRESENCIAL, label: 'Presencial' },
  { value: ConsentChannel.EMAIL, label: 'Correo electrónico' },
  { value: ConsentChannel.MENSAJE_TEXTO, label: 'Mensaje de texto' },
  { value: ConsentChannel.MENSAJERIA_INSTANTANEA, label: 'Mensajería instantánea' },
];

function getConsentChannelLabel(channel: string): string {
  return (
    CONSENT_CHANNEL_OPTIONS.find((option) => option.value === channel)?.label ?? 'Medio histórico'
  );
}

function currentAuthorizationByPurpose(
  records: DataAuthorizationView[],
): Map<DataPurpose, DataAuthorizationView> {
  const sorted = [...records].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  const current = new Map<DataPurpose, DataAuthorizationView>();
  for (const record of sorted)
    if (!current.has(record.purpose)) current.set(record.purpose, record);
  return current;
}

export function CompliancePanel({
  partyId,
  authorizations,
  requests,
  canManage,
  contracts = [],
  requesterDefaults,
  onChanged,
}: {
  partyId: string | null | undefined;
  authorizations: DataAuthorizationView[];
  requests: RequestSummary[];
  canManage: boolean;
  contracts?: import('@/lib/api-client').Contract[];
  requesterDefaults?: { name?: string | null; document?: string | null; contact?: string | null };
  onChanged?: () => void;
}) {
  const [records, setRecords] = useState(authorizations);
  const [currentText, setCurrentText] = useState<LegalText | null>(null);
  const [textError, setTextError] = useState(false);
  const [textRetry, setTextRetry] = useState(0);
  const purposes = useEnabledPurposes();
  const [loadingText, setLoadingText] = useState(canManage);
  const [consent, setConsent] = useState<Record<DataPurpose, boolean>>({
    TRATAMIENTO_CONTRACTUAL: false,
    CONTACTO_COMERCIAL: false,
    DATOS_BIOMETRICOS: false,
    REPORTE_CENTRALES_RIESGO: false,
  });
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [channel, setChannel] = useState<ConsentChannel | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creationNotice, setCreationNotice] = useState<string | null>(null);
  const [proof, setProof] = useState<{ version: string; hash: string } | null>(null);
  const [requestFormOpen, setRequestFormOpen] = useState(false);

  useEffect(() => setRecords(authorizations), [authorizations]);
  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    void privacyApi
      .getCurrentLegalText('AUTORIZACION')
      .then((text) => {
        if (!cancelled) setCurrentText(text);
      })
      .catch((failure: unknown) => {
        if (!cancelled) {
          setCurrentText(null);
          setTextError(!(failure instanceof ApiError && failure.status === 404));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingText(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canManage, textRetry]);

  const latest = useMemo(() => currentAuthorizationByPurpose(records), [records]);
  const save = async () => {
    if (!partyId || !currentText || !channel) return;
    setSaving(true);
    setError(null);
    try {
      for (const purpose of PURPOSES.filter((item) => purposes.enabled.includes(item))) {
        if (!consent[purpose]) continue;
        await privacyApi.createAuthorization({
          partyId,
          purpose,
          granted: true,
          channel,
          legalTextId: currentText.id,
          ...(evidenceId ? { evidenceMediaId: evidenceId } : {}),
        });
      }
      setConsent({
        TRATAMIENTO_CONTRACTUAL: false,
        CONTACTO_COMERCIAL: false,
        DATOS_BIOMETRICOS: false,
        REPORTE_CENTRALES_RIESGO: false,
      });
      setEvidenceId(null);
      setChannel('');
      setRecords(await privacyApi.listAuthorizations(partyId));
    } catch (saveError) {
      setError(
        saveError instanceof ApiError
          ? saveError.message
          : 'No fue posible registrar la autorización.',
      );
    } finally {
      setSaving(false);
    }
  };

  const viewProof = async (authorizationId: string) => {
    if (!partyId) return;
    setError(null);
    try {
      const result = await privacyApi.getAuthorizationProof(partyId, authorizationId);
      setProof({ version: result.legalTextVersion, hash: result.sha256 });
      if (result.evidenceUrl) window.open(result.evidenceUrl, '_blank', 'noopener,noreferrer');
    } catch {
      setError('No fue posible consultar el comprobante.');
    }
  };

  if (!partyId)
    return (
      <PortalEmptyState
        title="No hay una persona vinculada"
        description="La información de cumplimiento aparece cuando el suscriptor tiene una ficha de persona asociada."
      />
    );

  return (
    <div className="space-y-6">
      {creationNotice ? (
        <div
          role="status"
          className="rounded-xl border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-950/30 dark:text-green-100"
        >
          {creationNotice}
        </div>
      ) : null}
      <section className="space-y-3" aria-labelledby="privacy-authorizations-title">
        <div>
          <h3 id="privacy-authorizations-title" className="text-base font-semibold">
            Autorizaciones
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Consulta el evento más reciente por finalidad y revisa su comprobante.
          </p>
        </div>
        {records.length ? (
          <div className="space-y-2">
            {PURPOSES.map((purpose) => {
              const item = latest.get(purpose);
              return (
                <article
                  key={purpose}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 dark:border-dark-border"
                >
                  <div>
                    <h4 className="font-medium">{DATA_PURPOSE_LABELS[purpose]}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {item
                        ? `${item.kind === 'REVOCATION' ? 'Retirada' : item.kind === 'LEGACY_IMPORT' ? 'Autorización importada' : item.granted ? 'Autorización vigente' : 'No autorizada'} · ${formatLocalDateTime(item.capturedAt)} · Medio: ${getConsentChannelLabel(item.channel)}`
                        : 'Sin registro'}
                    </p>
                  </div>
                  {item ? (
                    <Button variant="secondary" onClick={() => void viewProof(item.id)}>
                      Ver comprobante
                    </Button>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <PortalEmptyState
            title="No hay autorizaciones registradas"
            description="Al registrar una nueva autorización se mostrará aquí su finalidad y versión."
            embedded
          />
        )}
      </section>

      {canManage ? (
        <section
          className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border"
          aria-labelledby="privacy-capture-title"
        >
          <div>
            <h3 id="privacy-capture-title" className="font-semibold">
              Registrar una autorización
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Cada decisión se guarda con el texto exacto que la persona revisa.
            </p>
          </div>
          {loadingText ? (
            <PortalSkeletonBlock className="h-24" />
          ) : currentText ? (
            <>
              <div className="rounded-xl bg-iwana-surface-soft p-3 dark:bg-dark-surface-3">
                <p className="text-sm font-semibold">
                  Texto vigente · versión {currentText.version}
                </p>
                <LegalTextContent content={currentText.content} format={currentText.format} />
                <LegalTextReferences />
              </div>
              <div className="space-y-2">
                {purposes.enabled.length === 0 && purposes.failed ? (
                  <p>
                    No fue posible cargar las finalidades.{' '}
                    <button type="button" onClick={purposes.retry}>
                      Reintentar
                    </button>
                  </p>
                ) : null}
                {PURPOSES.filter((purpose) => purposes.enabled.includes(purpose)).map((purpose) => (
                  <label
                    key={purpose}
                    className="flex min-h-11 items-start gap-3 rounded-xl border border-gray-200 p-3 text-sm dark:border-dark-border"
                  >
                    <input
                      className={`${purposeInput} mt-1`}
                      type="checkbox"
                      checked={consent[purpose]}
                      onChange={(event) =>
                        setConsent((value) => ({ ...value, [purpose]: event.target.checked }))
                      }
                    />
                    <span>
                      {purpose === 'TRATAMIENTO_CONTRACTUAL'
                        ? 'Prestación del servicio, facturación y soporte'
                        : DATA_PURPOSE_LABELS[purpose]}
                      {purpose === 'TRATAMIENTO_CONTRACTUAL'
                        ? ' (necesaria para continuar)'
                        : ' (opcional)'}
                    </span>
                  </label>
                ))}
              </div>
              <Select
                id="privacy-authorization-channel"
                label="Medio por el que la persona otorgó la autorización"
                value={channel}
                options={CONSENT_CHANNEL_OPTIONS}
                placeholder="Selecciona un medio"
                onChange={(event) => setChannel(event.target.value as ConsentChannel | '')}
                required
                aria-required="true"
              />
              <EvidenceUploadField
                label="Evidencia para este registro (opcional)"
                onUploaded={setEvidenceId}
              />
              <p className="text-xs text-gray-600 dark:text-gray-300">
                El medio indica cómo la persona otorgó su autorización. La evidencia puede asociarse
                a un nuevo registro.
              </p>
              <Button
                disabled={
                  saving ||
                  !channel ||
                  !PURPOSES.some(
                    (purpose) => purposes.enabled.includes(purpose) && consent[purpose],
                  )
                }
                onClick={() => void save()}
              >
                {saving ? 'Guardando…' : 'Guardar autorizaciones seleccionadas'}
              </Button>
            </>
          ) : textError ? (
            <p>
              No fue posible cargar el texto vigente.{' '}
              <button
                type="button"
                onClick={() => {
                  setLoadingText(true);
                  setTextError(false);
                  setTextRetry((value) => value + 1);
                }}
              >
                Reintentar
              </button>
            </p>
          ) : (
            <PortalAlert
              variant="warning"
              title="No hay un texto de autorización vigente"
              description="Publica un texto para habilitar nuevos registros."
              action={
                <Button variant="secondary" asChild>
                  <Link href="/dashboard/privacy?view=legal">Administrar textos legales</Link>
                </Button>
              }
            />
          )}
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="privacy-requests-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="privacy-requests-title" className="font-semibold">
              Solicitudes de esta persona
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              El resumen no incluye datos de identidad ni evidencia.
            </p>
          </div>
          {canManage ? (
            <Button variant="secondary" onClick={() => setRequestFormOpen(true)}>
              Radicar solicitud
            </Button>
          ) : null}
        </div>
        {requests.length ? (
          <ul className="space-y-2">
            {requests.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 p-3 text-sm dark:border-dark-border"
              >
                <span>
                  {request.kind === 'CONSULTA'
                    ? 'Consulta'
                    : request.kind === 'RECLAMO'
                      ? 'Reclamo'
                      : 'Reporte de suplantación'}{' '}
                  ·{' '}
                  {request.status === 'RESUELTA'
                    ? 'Respondida'
                    : request.status === 'NO_PROCEDENTE'
                      ? 'No procede'
                      : request.status === 'TRASLADADA'
                        ? 'Trasladada'
                        : request.status === 'DESISTIDA'
                          ? 'Cerrada por falta de respuesta'
                          : request.status === 'INCOMPLETA'
                            ? 'Necesita información'
                            : request.status === 'PRORROGADA'
                              ? 'Con plazo ampliado'
                              : request.status === 'EN_TRAMITE'
                                ? 'En trámite'
                                : 'Recibida'}{' '}
                  · vence {formatCivilDate(request.dueAt)}
                </span>
                <Button variant="secondary" asChild>
                  <Link href={`/dashboard/privacy?requestId=${encodeURIComponent(request.id)}`}>
                    Abrir
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <PortalEmptyState
            title="No hay solicitudes vinculadas"
            description="Las solicitudes asociadas a esta persona aparecerán aquí."
            embedded
          />
        )}
      </section>
      <RequestForm
        open={requestFormOpen}
        onClose={() => setRequestFormOpen(false)}
        onCreated={(_id, outcome) => {
          setRequestFormOpen(false);
          const count = outcome.suspendedContractCount;
          setCreationNotice(
            outcome.submittedKind === 'SUPLANTACION' && outcome.registeredKind === 'SUPLANTACION'
              ? `El reporte quedó registrado. ${count} ${count === 1 ? 'contrato impugnado fue confirmado como suspendido.' : 'contratos impugnados fueron confirmados como suspendidos.'}`
              : outcome.submittedKind === 'SUPLANTACION'
                ? 'Sin contratos impugnados, el caso quedó registrado como reclamo.'
                : 'La solicitud quedó registrada.',
          );
          onChanged?.();
        }}
        partyId={partyId}
        {...(requesterDefaults ? { requesterDefaults } : {})}
        contracts={contracts}
        allowImpersonation
      />
      {proof ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="privacy-proof-title"
          className="fixed inset-0 z-(--z-modal) grid place-items-center bg-black/40 p-4"
        >
          <section className="w-full max-w-xl space-y-3 rounded-2xl bg-white p-6 dark:bg-dark-surface-2">
            <h3 id="privacy-proof-title" className="text-lg font-semibold">
              Comprobante de autorización
            </h3>
            <p>Versión: {proof.version}</p>
            <p className="break-all text-sm">
              SHA-256: <code>{proof.hash}</code>
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Si hay evidencia disponible, se abrió en una pestaña segura. El enlace firmado no se
              conserva en esta vista.
            </p>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setProof(null)}>
                Cerrar
              </Button>
            </div>
          </section>
        </div>
      ) : null}
      {error ? (
        <PortalAlert variant="error" title="No se completó la operación" description={error} />
      ) : null}
    </div>
  );
}
