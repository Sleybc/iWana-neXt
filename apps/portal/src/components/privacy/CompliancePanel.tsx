'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
} from '@iwana/ui';
import { ExternalLink, FilePlus2, ShieldCheck } from 'lucide-react';
import {
  ConsentChannel,
  type DataAuthorizationView,
  type DataPurpose,
  type LegalText,
  type RequestSummary,
} from '@iwana/shared';
import { ApiError, privacyApi } from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';
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

type BadgeVariant = 'success' | 'warning' | 'info' | 'neutral' | 'error';

/** Estado del evento más reciente de una finalidad. */
function authorizationStatus(item: DataAuthorizationView): {
  label: string;
  variant: BadgeVariant;
} {
  if (item.kind === 'REVOCATION') return { label: 'Retirada', variant: 'neutral' };
  if (item.kind === 'LEGACY_IMPORT') return { label: 'Autorización importada', variant: 'info' };
  return item.granted
    ? { label: 'Autorización vigente', variant: 'success' }
    : { label: 'No autorizada', variant: 'warning' };
}

const REQUEST_KIND_LABELS: Record<RequestSummary['kind'], string> = {
  CONSULTA: 'Consulta',
  RECLAMO: 'Reclamo',
  SUPLANTACION: 'Reporte de suplantación',
};

const REQUEST_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  RESUELTA: { label: 'Respondida', variant: 'success' },
  NO_PROCEDENTE: { label: 'No procede', variant: 'neutral' },
  TRASLADADA: { label: 'Trasladada', variant: 'neutral' },
  DESISTIDA: { label: 'Cerrada por falta de respuesta', variant: 'neutral' },
  INCOMPLETA: { label: 'Necesita información', variant: 'warning' },
  PRORROGADA: { label: 'Con plazo ampliado', variant: 'warning' },
  EN_TRAMITE: { label: 'En trámite', variant: 'info' },
};
const REQUEST_RECEIVED = { label: 'Recibida', variant: 'info' as const };

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
      {creationNotice ? <PortalAlert variant="success" title={creationNotice} /> : null}
      {error ? (
        <PortalAlert variant="error" title="No se completó la operación" description={error} />
      ) : null}
      <PortalPanel
        as="section"
        labelled
        title="Autorizaciones"
        description="El evento más reciente de cada finalidad, con su comprobante."
      >
        {records.length ? (
          <ul
            aria-label="Autorizaciones por finalidad"
            className="divide-y divide-gray-100 dark:divide-dark-border"
          >
            {PURPOSES.map((purpose) => {
              const item = latest.get(purpose);
              const status = item ? authorizationStatus(item) : null;
              return (
                <li
                  key={purpose}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                        {DATA_PURPOSE_LABELS[purpose]}
                      </h4>
                      {status ? <Badge variant={status.variant}>{status.label}</Badge> : null}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {item
                        ? `${formatLocalDateTime(item.capturedAt)} · Medio: ${getConsentChannelLabel(item.channel)}`
                        : 'Sin registro'}
                    </p>
                  </div>
                  {item ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11 shrink-0 gap-1.5"
                      onClick={() => void viewProof(item.id)}
                    >
                      <ShieldCheck className="h-4 w-4" aria-hidden />
                      Ver comprobante
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <PortalEmptyState
            title="No hay autorizaciones registradas"
            description="Al registrar una nueva autorización se mostrará aquí su finalidad y versión."
            embedded
          />
        )}
      </PortalPanel>

      {canManage ? (
        <PortalPanel
          as="section"
          labelled
          title="Registrar una autorización"
          description="Cada decisión se guarda con el texto exacto que la persona revisa."
          contentClassName="space-y-4"
        >
          {loadingText ? (
            <PortalSkeletonBlock className="h-24" />
          ) : currentText ? (
            <>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Texto vigente · versión {currentText.version}
                </p>
                {/* El texto completo se conserva; solo se acota su alto para no empujar el formulario. */}
                <div
                  role="region"
                  aria-label={`Texto de autorización, versión ${currentText.version}`}
                  tabIndex={0}
                  className="iwana-scroll-inset max-h-80 overflow-y-auto rounded-xl border border-gray-100 bg-iwana-surface-soft p-4 text-sm dark:border-dark-border dark:bg-dark-surface-3"
                >
                  <LegalTextContent content={currentText.content} format={currentText.format} />
                </div>
                <LegalTextReferences />
              </div>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium text-gray-900 dark:text-white">
                  Finalidades que la persona autoriza
                </legend>
                {purposes.enabled.length === 0 && purposes.failed ? (
                  <PortalAlert
                    variant="error"
                    title="No fue posible cargar las finalidades."
                    action={
                      <Button type="button" variant="secondary" size="sm" onClick={purposes.retry}>
                        Reintentar
                      </Button>
                    }
                  />
                ) : null}
                {PURPOSES.filter((purpose) => purposes.enabled.includes(purpose)).map((purpose) => (
                  <label
                    key={purpose}
                    className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-3 text-sm dark:border-dark-border"
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
              </fieldset>
              <div className="grid gap-4 md:grid-cols-2">
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
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300">
                El medio indica cómo la persona otorgó su autorización. La evidencia puede asociarse
                a un nuevo registro.
              </p>
              <div className="flex justify-end">
                <Button
                  type="button"
                  className="min-h-11"
                  loading={saving}
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
              </div>
            </>
          ) : textError ? (
            <PortalAlert
              variant="error"
              title="No fue posible cargar el texto vigente."
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setLoadingText(true);
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
              description="Publica un texto para habilitar nuevos registros."
              action={
                <Button variant="secondary" asChild>
                  <Link href="/dashboard/privacy?view=legal">Administrar textos legales</Link>
                </Button>
              }
            />
          )}
        </PortalPanel>
      ) : null}

      <PortalPanel
        as="section"
        labelled
        title="Solicitudes de esta persona"
        description="El resumen no incluye datos de identidad ni evidencia."
        actions={
          canManage ? (
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 gap-1.5"
              onClick={() => setRequestFormOpen(true)}
            >
              <FilePlus2 className="h-4 w-4" aria-hidden />
              Radicar solicitud
            </Button>
          ) : undefined
        }
      >
        {requests.length ? (
          <ul
            aria-label="Solicitudes de esta persona"
            className="divide-y divide-gray-100 dark:divide-dark-border"
          >
            {requests.map((request) => {
              const status = REQUEST_STATUS[request.status] ?? REQUEST_RECEIVED;
              const kind = REQUEST_KIND_LABELS[request.kind] ?? 'Solicitud';
              return (
                <li
                  key={request.id}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {kind}
                      </span>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Vence el {formatCivilDate(request.dueAt)}
                    </p>
                  </div>
                  <Button variant="secondary" className="min-h-11 shrink-0 gap-1.5" asChild>
                    <Link
                      href={`/dashboard/privacy?requestId=${encodeURIComponent(request.id)}`}
                      aria-label={`Abrir ${kind.toLowerCase()} que vence el ${formatCivilDate(request.dueAt)}`}
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden />
                      Abrir
                    </Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <PortalEmptyState
            title="No hay solicitudes vinculadas"
            description="Las solicitudes asociadas a esta persona aparecerán aquí."
            embedded
          />
        )}
      </PortalPanel>
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
      <Dialog
        open={proof !== null}
        onOpenChange={(open) => {
          if (!open) setProof(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Comprobante de autorización</DialogTitle>
            <DialogDescription>
              Si hay evidencia disponible, se abrió en una pestaña segura. El enlace firmado no se
              conserva en esta vista.
            </DialogDescription>
          </DialogHeader>
          {proof ? (
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium text-gray-900 dark:text-white">Versión:</span>{' '}
                {proof.version}
              </p>
              <p className="break-all">
                <span className="font-medium text-gray-900 dark:text-white">SHA-256:</span>{' '}
                <code className="font-mono">{proof.hash}</code>
              </p>
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={() => setProof(null)}
            >
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
