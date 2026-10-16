'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  interactiveFocusClassName,
} from '@iwana/ui';
import type {
  DataSubjectRequestDetail,
  ErasurePreview,
  RequestLegalBasis,
  ResponseChannel,
} from '@iwana/shared';
import { ApiError, privacyApi } from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalSidePeek,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';
import { EvidenceUploadField } from './EvidenceUploadField';
import {
  formatCivilDate,
  formatLocalDateTime,
  getPurposeLabel,
  getLabel,
  DOCUMENT_TYPE_LABELS,
  ERASURE_BLOCKER_LABELS,
  ERASURE_CATEGORY_OPTIONS,
  IDENTITY_METHOD_OPTIONS,
  LEGAL_BASIS_OPTIONS,
  PRIVACY_REQUEST_KINDS,
  PRIVACY_REQUEST_RIGHTS,
  PRIVACY_REQUEST_STATUSES,
  RESPONSE_CHANNEL_OPTIONS,
} from './privacy-labels';

type Action = 'require-info' | 'complete' | 'extend' | 'resolve' | 'reject' | 'transfer' | 'verify';

const inputClass =
  'portal-input-surface min-h-11 w-full px-3 py-2 text-sm text-gray-900 dark:text-white';
const labelClass = 'block space-y-1 text-sm font-medium text-gray-800 dark:text-gray-100';

function isClosed(status: string): boolean {
  return ['DESISTIDA', 'RESUELTA', 'NO_PROCEDENTE', 'TRASLADADA'].includes(status);
}

function getResponseTemplate(
  action: Action,
  kind: DataSubjectRequestDetail['request']['kind'],
  legalBasis: RequestLegalBasis,
): string | null {
  if (action === 'require-info')
    return 'Para continuar con la atención, necesitamos la siguiente información:';
  if (action === 'extend')
    return 'Solicitamos ampliar el plazo porque la revisión de la información requiere tiempo adicional. Explica aquí la razón concreta.';
  if (action === 'transfer')
    return 'Trasladamos la solicitud a la entidad competente para que continúe su atención. Explica aquí el motivo del traslado.';
  if (action === 'resolve') {
    if (kind === 'CONSULTA')
      return 'En respuesta a su consulta sobre el tratamiento de sus datos personales, le informamos:';
    if (kind === 'SUPLANTACION')
      return 'En respuesta al reporte recibido, le informamos sobre las medidas registradas para su caso:';
    return 'En respuesta a su reclamo relacionado con el tratamiento de sus datos personales, le informamos:';
  }
  if (action === 'reject') {
    if (legalBasis === 'DEBER_LEGAL_CONSERVACION')
      return 'La solicitud no procede respecto de los datos que debemos conservar por mandato legal. Explica aquí el deber aplicable.';
    if (legalBasis === 'DEBER_CONTRACTUAL')
      return 'La solicitud no procede mientras exista una obligación contractual vigente. Explica aquí la obligación aplicable.';
    if (legalBasis === 'SOLICITANTE_NO_LEGITIMADO')
      return 'No es posible atender la solicitud porque quien la presenta no acreditó legitimación para este trámite.';
    return 'La solicitud no procede por el siguiente motivo:';
  }
  return null;
}

export function PrivacyRequestDetail({
  requestId,
  open,
  onClose,
  canManage,
  onChanged,
}: {
  requestId: string | null;
  open: boolean;
  onClose: () => void;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<DataSubjectRequestDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [missingItems, setMissingItems] = useState('');
  const [reason, setReason] = useState('');
  const [responseText, setResponseText] = useState('');
  const [channel, setChannel] = useState<ResponseChannel>('EMAIL');
  const [legalBasis, setLegalBasis] = useState<RequestLegalBasis>('SOLICITANTE_NO_LEGITIMADO');
  const [transferredTo, setTransferredTo] = useState('');
  const [dataChangeReference, setDataChangeReference] = useState('');
  const [identityMethod, setIdentityMethod] = useState('');
  const [evidenceMediaId, setEvidenceMediaId] = useState<string | null>(null);
  const [erasurePreview, setErasurePreview] = useState<ErasurePreview | null>(null);
  const [erasureDialogOpen, setErasureDialogOpen] = useState(false);
  const [erasureLoading, setErasureLoading] = useState(false);
  const [erasureError, setErasureError] = useState<string | null>(null);
  const [erasureNotice, setErasureNotice] = useState<string | null>(null);
  const [erasureConfirmed, setErasureConfirmed] = useState(false);

  const load = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    setError(null);
    try {
      setDetail(await privacyApi.getRequest(requestId));
    } catch (loadError) {
      setError(
        loadError instanceof ApiError ? loadError.message : 'No fue posible cargar el detalle.',
      );
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  const loadErasurePreview = async (notice?: string) => {
    if (!requestId) return;
    setErasureLoading(true);
    setErasureError(null);
    if (notice) setErasureNotice(notice);
    try {
      setErasurePreview(await privacyApi.getErasurePreview(requestId));
    } catch (previewError) {
      setErasurePreview(null);
      setErasureError(
        previewError instanceof ApiError
          ? previewError.message
          : 'No fue posible cargar la vista previa de supresión.',
      );
    } finally {
      setErasureLoading(false);
    }
  };

  useEffect(() => {
    if (open && requestId) void load();
    else {
      setDetail(null);
      setAction(null);
      setNotice(null);
      setError(null);
      setErasureDialogOpen(false);
      setErasurePreview(null);
      setErasureConfirmed(false);
      setErasureError(null);
      setErasureNotice(null);
    }
  }, [load, open, requestId]);

  const current = detail?.request;
  const editable = Boolean(current && !isClosed(current.status));
  const showVerify = Boolean(
    canManage &&
    current?.identityStatus === 'PENDIENTE' &&
    ['RADICADA', 'INCOMPLETA'].includes(current.status),
  );
  const showTransfer = Boolean(
    editable &&
    ['RADICADA', 'INCOMPLETA', 'EN_TRAMITE', 'PRORROGADA'].includes(current?.status ?? ''),
  );
  const showReject = Boolean(
    editable &&
    ['RADICADA', 'INCOMPLETA', 'EN_TRAMITE', 'PRORROGADA'].includes(current?.status ?? ''),
  );
  const showComplete = Boolean(
    current?.identityStatus === 'VERIFICADA' && ['RADICADA', 'INCOMPLETA'].includes(current.status),
  );
  const rejectBasisOptions =
    current?.identityStatus === 'PENDIENTE'
      ? LEGAL_BASIS_OPTIONS.filter((item) => item.value === 'SOLICITANTE_NO_LEGITIMADO')
      : LEGAL_BASIS_OPTIONS;
  const showErasureDialog = action === 'resolve' && current?.right === 'SUPRIMIR';

  const submitAction = async () => {
    if (!current || !requestId || !action) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (action === 'require-info') {
        await privacyApi.requireInfo(requestId, { missingItems, channel });
      } else if (action === 'complete') {
        await privacyApi.completeRequest(requestId);
      } else if (action === 'extend') {
        await privacyApi.extendRequest(requestId, { reason });
      } else if (action === 'resolve') {
        await privacyApi.resolveRequest(requestId, {
          responseText,
          responseChannel: channel,
          ...(dataChangeReference.trim()
            ? { dataChangeReference: dataChangeReference.trim() }
            : {}),
          ...(current.right === 'SUPRIMIR' && erasurePreview
            ? {
                erasure: {
                  confirm: true,
                  expedienteIds: erasurePreview.candidateExpedienteIds,
                },
              }
            : {}),
        });
      } else if (action === 'reject') {
        await privacyApi.rejectRequest(requestId, {
          responseText,
          responseChannel: channel,
          legalBasis,
        });
      } else if (action === 'transfer') {
        await privacyApi.transferRequest(requestId, { transferredTo, reason, channel });
      } else if (action === 'verify') {
        await privacyApi.verifyIdentity(requestId, {
          identityVerificationMethod:
            identityMethod as (typeof IDENTITY_METHOD_OPTIONS)[number]['value'],
          ...(evidenceMediaId ? { requesterEvidenceMediaId: evidenceMediaId } : {}),
        });
      }
      setAction(null);
      setErasureDialogOpen(false);
      setErasurePreview(null);
      setErasureConfirmed(false);
      setNotice(
        action === 'resolve'
          ? current.right === 'SUPRIMIR'
            ? 'La solicitud se resolvió y la supresión quedó registrada.'
            : 'La respuesta quedó registrada. Confirma el envío por el canal elegido.'
          : 'El cambio quedó registrado.',
      );
      await load();
      onChanged();
    } catch (submitError) {
      if (
        action === 'resolve' &&
        current.right === 'SUPRIMIR' &&
        submitError instanceof ApiError &&
        submitError.code === 'PRIVACY_ERASURE_CANDIDATES_CHANGED'
      ) {
        setErasureConfirmed(false);
        await loadErasurePreview(
          'El alcance cambió mientras revisabas la solicitud. Revisa el resumen actualizado antes de confirmar.',
        );
        return;
      }
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : 'No fue posible guardar el cambio. Revisa los datos e inténtalo de nuevo.',
      );
    } finally {
      setBusy(false);
    }
  };

  const openEvidence = async () => {
    if (!requestId) return;
    setBusy(true);
    setError(null);
    try {
      const { url } = await privacyApi.getRequesterEvidence(requestId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('No fue posible abrir la evidencia. Solicita una URL nueva e inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const launch = (next: Action) => {
    setError(null);
    if (next === 'resolve' && current?.right === 'SUPRIMIR') {
      setAction('resolve');
      setErasureDialogOpen(true);
      setErasurePreview(null);
      setErasureConfirmed(false);
      setErasureError(null);
      setErasureNotice(null);
      setResponseText(getResponseTemplate('resolve', current.kind, legalBasis) ?? '');
      void loadErasurePreview();
      return;
    }
    setAction(action === next ? null : next);
  };

  const closeErasureDialog = () => {
    setErasureDialogOpen(false);
    setAction(null);
    setErasureConfirmed(false);
    setErasureError(null);
    setErasureNotice(null);
  };

  const insertTemplate = () => {
    if (!current || !action) return;
    const template = getResponseTemplate(action, current.kind, legalBasis);
    if (!template) return;
    if (action === 'require-info') setMissingItems(template);
    else if (action === 'extend') setReason(template);
    else if (action === 'transfer') setReason(template);
    else setResponseText(template);
  };

  return (
    <PortalSidePeek
      open={open}
      onClose={onClose}
      title="Detalle de solicitud"
      description="Consulta su estado, fechas, actuaciones y tareas pendientes."
      eyebrow="Privacidad"
      className="md:max-w-[48rem]"
    >
      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <PortalSkeletonBlock className="h-24" />
          <PortalSkeletonBlock className="h-60" />
        </div>
      ) : null}
      {error && !current ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar el detalle"
          description={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Reintentar
            </Button>
          }
        />
      ) : null}
      {!loading && !error && !current ? (
        <PortalEmptyState
          title="Solicitud no disponible"
          description="Actualiza la bandeja e inténtalo de nuevo."
        />
      ) : null}
      {current ? (
        <div className="space-y-5">
          {notice ? (
            <PortalAlert variant="success" title="Cambio registrado" description={notice} />
          ) : null}
          {error ? (
            <PortalAlert variant="error" title="No se guardó el cambio" description={error} />
          ) : null}
          <section
            className="grid gap-3 rounded-2xl border border-gray-200 p-4 sm:grid-cols-2 dark:border-dark-border"
            aria-label="Resumen de la solicitud"
          >
            <p>
              <span className="font-semibold">Tipo:</span>{' '}
              {getLabel(PRIVACY_REQUEST_KINDS, current.kind)}
            </p>
            <p>
              <span className="font-semibold">Derecho:</span>{' '}
              {getLabel(PRIVACY_REQUEST_RIGHTS, current.right)}
            </p>
            {current.purpose ? (
              <p>
                <span className="font-semibold">Finalidad:</span> {getPurposeLabel(current.purpose)}
              </p>
            ) : null}
            <p>
              <span className="font-semibold">Estado:</span>{' '}
              {getLabel(PRIVACY_REQUEST_STATUSES, current.status)}
            </p>
            <p>
              <span className="font-semibold">Recibida:</span>{' '}
              {formatLocalDateTime(current.receivedAt)}
            </p>
            <p>
              <span className="font-semibold">Fecha límite:</span>{' '}
              {formatCivilDate(current.extendedUntil ?? current.dueAt)}
            </p>
            <p>
              <span className="font-semibold">Plazo de traslado:</span>{' '}
              {formatCivilDate(current.transferDueAt)}
              {current.transferredLate ? (
                <Badge variant="warning" className="ml-2">
                  Traslado extemporáneo
                </Badge>
              ) : null}
            </p>
            {current.impersonationComplaintDueAt ? (
              <p className="sm:col-span-2">
                <span className="font-semibold">Fecha estimada para presentar la denuncia:</span>{' '}
                {formatCivilDate(current.impersonationComplaintDueAt)}
              </p>
            ) : null}
            {current.responseText ? (
              <p className="sm:col-span-2">
                <span className="font-semibold">Respuesta registrada:</span> {current.responseText}
              </p>
            ) : null}
          </section>

          {current.erasedAt ? (
            <section
              className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2"
              aria-labelledby="privacy-erasure-result-title"
            >
              <h3 id="privacy-erasure-result-title" className="font-semibold">
                Supresión ejecutada
              </h3>
              <p className="text-sm">Fecha: {formatLocalDateTime(current.erasedAt)}</p>
              {current.erasureCategories.length > 0 ? (
                <ul className="list-inside list-disc text-sm">
                  {current.erasureCategories.map((category) => (
                    <li key={category}>
                      {ERASURE_CATEGORY_OPTIONS.find((option) => option.value === category)
                        ?.label ?? 'Información anonimizada'}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm">No había datos personales que anonimizar.</p>
              )}
            </section>
          ) : null}

          {canManage ? (
            <section
              className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border"
              aria-labelledby="privacy-requester-detail-title"
            >
              <h3 id="privacy-requester-detail-title" className="font-semibold">
                Identidad de quien solicita
              </h3>
              <p className="text-sm">
                Estado:{' '}
                {current.identityStatus === 'VERIFICADA'
                  ? 'Verificada'
                  : 'Pendiente de verificación'}
              </p>
              {current.identityVerificationMethod ? (
                <p className="text-sm">
                  Método: {getLabel(IDENTITY_METHOD_OPTIONS, current.identityVerificationMethod)}
                </p>
              ) : null}
              {current.identityVerifiedAt ? (
                <p className="text-sm">
                  Verificada el: {formatLocalDateTime(current.identityVerifiedAt)}
                </p>
              ) : null}
              {current.requester ? (
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="font-medium">Nombre</dt>
                    <dd>{current.requester.name}</dd>
                  </div>
                  <div>
                    <dt className="font-medium">Documento</dt>
                    <dd>
                      {DOCUMENT_TYPE_LABELS[current.requester.documentType]} ·{' '}
                      {current.requester.document}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="font-medium">Contacto</dt>
                    <dd>{current.requester.contact}</dd>
                  </div>
                </dl>
              ) : null}
              {current.hasRequesterEvidence ? (
                <Button variant="secondary" disabled={busy} onClick={() => void openEvidence()}>
                  Ver evidencia
                </Button>
              ) : null}
            </section>
          ) : (
            <section className="rounded-2xl border border-gray-200 p-4 text-sm dark:border-dark-border">
              <p>
                Estado de identidad:{' '}
                {current.identityStatus === 'VERIFICADA'
                  ? 'Verificada'
                  : 'Pendiente de verificación'}
              </p>
              {current.hasRequesterEvidence ? <p className="mt-1">Evidencia adjunta</p> : null}
            </section>
          )}

          {current.suspendedContractIds.length || (detail?.tasks.length ?? 0) > 0 ? (
            <section className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
              {current.suspendedContractIds.length ? (
                <p className="font-medium">
                  {current.suspendedContractIds.length} contratos impugnados confirmados como
                  suspendidos.
                </p>
              ) : null}
              {(detail?.tasks ?? []).map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl bg-iwana-surface-soft p-3 text-sm dark:bg-dark-surface-3"
                >
                  <p className="font-medium">
                    {task.kind === 'SUSPENDER_COBRO_EXTERNO'
                      ? 'Suspender el cobro en el sistema de facturación de la empresa'
                      : 'Entregar copia de los documentos de aprobación'}
                  </p>
                  <p>
                    Vence: {formatCivilDate(task.dueAt)} ·{' '}
                    {task.doneAt ? `Completada ${formatLocalDateTime(task.doneAt)}` : 'Pendiente'}
                  </p>
                  {task.note ? <p>Nota: {task.note}</p> : null}
                  {!task.doneAt && canManage ? (
                    <Button
                      className="mt-2"
                      variant="secondary"
                      disabled={busy}
                      onClick={async () => {
                        const note = window.prompt('Nota de cierre de la tarea');
                        if (note?.trim()) {
                          setBusy(true);
                          try {
                            await privacyApi.completeTask(requestId!, task.id, note.trim());
                            await load();
                            onChanged();
                          } catch {
                            setError('No fue posible cerrar la tarea.');
                          } finally {
                            setBusy(false);
                          }
                        }
                      }}
                    >
                      Marcar como completada
                    </Button>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          <section className="space-y-2" aria-label="Historial de actuaciones">
            <h3 className="font-semibold">Historial</h3>
            {detail?.events.length ? (
              detail.events.map((event) => (
                <div
                  key={event.id}
                  className="flex gap-3 border-l-2 border-iwana-secondary-700 py-1 pl-3 text-sm"
                >
                  <span>{getLabel(PRIVACY_REQUEST_STATUSES, event.toStatus)}</span>
                  <time className="text-gray-600 dark:text-gray-300">
                    {formatLocalDateTime(event.occurredAt)}
                  </time>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Aún no hay actuaciones para mostrar.
              </p>
            )}
          </section>

          {canManage && editable ? (
            <div className="flex flex-wrap gap-2" aria-label="Acciones disponibles">
              {showVerify ? (
                <Button variant="secondary" onClick={() => launch('verify')}>
                  Verificar identidad
                </Button>
              ) : null}
              {['RADICADA', 'INCOMPLETA'].includes(current.status) ? (
                <Button variant="secondary" onClick={() => launch('require-info')}>
                  Pedir información
                </Button>
              ) : null}
              {showComplete ? (
                <Button variant="secondary" onClick={() => launch('complete')}>
                  Registrar información recibida
                </Button>
              ) : null}
              {!current.extendedUntil ? (
                <Button variant="secondary" onClick={() => launch('extend')}>
                  Solicitar prórroga
                </Button>
              ) : null}
              <Button onClick={() => launch('resolve')}>
                {current.right === 'SUPRIMIR' ? 'Resolver' : 'Responder y cerrar'}
              </Button>
              {showReject ? (
                <Button variant="secondary" onClick={() => launch('reject')}>
                  Indicar que no procede
                </Button>
              ) : null}
              {showTransfer ? (
                <Button variant="secondary" onClick={() => launch('transfer')}>
                  Trasladar
                </Button>
              ) : null}
            </div>
          ) : null}

          {action && !showErasureDialog ? (
            <section
              className="space-y-4 rounded-2xl border border-iwana-primary/20 bg-iwana-surface-soft p-4 dark:border-iwana-primary-300/30 dark:bg-dark-surface-3"
              aria-label="Datos del cambio"
            >
              <h3 className="font-semibold">
                {action === 'verify'
                  ? 'Verificar identidad'
                  : action === 'require-info'
                    ? 'Pedir información'
                    : action === 'complete'
                      ? 'Registrar información recibida'
                      : action === 'extend'
                        ? 'Solicitar prórroga'
                        : action === 'resolve'
                          ? 'Responder y cerrar'
                          : action === 'reject'
                            ? 'Indicar que no procede'
                            : 'Trasladar solicitud'}
              </h3>
              {action === 'verify' ? (
                <>
                  <label className={labelClass}>
                    Método de verificación
                    <select
                      className={inputClass}
                      value={identityMethod}
                      onChange={(event) => setIdentityMethod(event.target.value)}
                    >
                      <option value="">Selecciona un método</option>
                      {IDENTITY_METHOD_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {identityMethod && identityMethod !== 'DOCUMENTO_PRESENCIAL' ? (
                    <EvidenceUploadField onUploaded={setEvidenceMediaId} />
                  ) : null}
                </>
              ) : null}
              {action === 'require-info' ? (
                <div className={labelClass}>
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="privacy-missing-items">Información necesaria</label>
                    <Button type="button" variant="ghost" onClick={insertTemplate}>
                      Insertar plantilla
                    </Button>
                  </div>
                  <textarea
                    id="privacy-missing-items"
                    className={inputClass}
                    maxLength={1000}
                    value={missingItems}
                    onChange={(event) => setMissingItems(event.target.value)}
                  />
                </div>
              ) : null}
              {action === 'extend' ? (
                <div className={labelClass}>
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="privacy-extension-reason">Motivo de la prórroga</label>
                    <Button type="button" variant="ghost" onClick={insertTemplate}>
                      Insertar plantilla
                    </Button>
                  </div>
                  <textarea
                    id="privacy-extension-reason"
                    className={inputClass}
                    maxLength={1000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </div>
              ) : null}
              {action === 'transfer' ? (
                <>
                  <label className={labelClass}>
                    Entidad o persona destinataria
                    <input
                      className={inputClass}
                      maxLength={200}
                      value={transferredTo}
                      onChange={(event) => setTransferredTo(event.target.value)}
                    />
                  </label>
                  <div className={labelClass}>
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="privacy-transfer-reason">Motivo</label>
                      <Button type="button" variant="ghost" onClick={insertTemplate}>
                        Insertar plantilla
                      </Button>
                    </div>
                    <textarea
                      id="privacy-transfer-reason"
                      className={inputClass}
                      maxLength={1000}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </div>
                </>
              ) : null}
              {action === 'resolve' || action === 'reject' ? (
                <>
                  <div className={labelClass}>
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="privacy-response-text">Respuesta</label>
                      <Button type="button" variant="ghost" onClick={insertTemplate}>
                        Insertar plantilla
                      </Button>
                    </div>
                    <textarea
                      id="privacy-response-text"
                      className={inputClass}
                      maxLength={4000}
                      value={responseText}
                      onChange={(event) => setResponseText(event.target.value)}
                    />
                  </div>
                  <label className={labelClass}>
                    Canal de respuesta
                    <select
                      className={inputClass}
                      value={channel}
                      onChange={(event) => setChannel(event.target.value as ResponseChannel)}
                    >
                      {RESPONSE_CHANNEL_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
              {action === 'reject' ? (
                <>
                  <label className={labelClass}>
                    Motivo por el que no procede
                    <select
                      className={inputClass}
                      value={legalBasis}
                      onChange={(event) => setLegalBasis(event.target.value as RequestLegalBasis)}
                    >
                      {rejectBasisOptions.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {current.identityStatus === 'PENDIENTE' ? (
                    <p className="text-sm">
                      Con la identidad pendiente, solo se puede indicar que quien presenta la
                      solicitud no está legitimado para este trámite.
                    </p>
                  ) : null}
                  {legalBasis === 'OTRO' ? (
                    <p className="text-sm">Explica la razón en el campo Respuesta.</p>
                  ) : null}
                </>
              ) : null}
              {action === 'resolve' && ['ACTUALIZAR', 'RECTIFICAR'].includes(current.right) ? (
                <label className={labelClass}>
                  Referencia del cambio realizado (opcional)
                  <input
                    className={inputClass}
                    maxLength={200}
                    value={dataChangeReference}
                    onChange={(event) => setDataChangeReference(event.target.value)}
                  />
                </label>
              ) : null}
              {action === 'require-info' || action === 'transfer' ? (
                <label className={labelClass}>
                  Canal
                  <select
                    className={inputClass}
                    value={channel}
                    onChange={(event) => setChannel(event.target.value as ResponseChannel)}
                  >
                    {RESPONSE_CHANNEL_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {action === 'complete' && current.identityStatus !== 'VERIFICADA' ? (
                <PortalAlert
                  variant="warning"
                  title="Falta verificar la identidad"
                  description="Registra la verificación antes de completar este requerimiento."
                />
              ) : null}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" disabled={busy} onClick={() => setAction(null)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => void submitAction()}
                  disabled={
                    busy ||
                    (action === 'verify' &&
                      (!identityMethod ||
                        (identityMethod !== 'DOCUMENTO_PRESENCIAL' && !evidenceMediaId))) ||
                    (action === 'require-info' && !missingItems.trim()) ||
                    (action === 'extend' && !reason.trim()) ||
                    (action === 'transfer' && (!transferredTo.trim() || !reason.trim())) ||
                    ((action === 'resolve' || action === 'reject') && !responseText.trim()) ||
                    (action === 'reject' &&
                      current.identityStatus === 'PENDIENTE' &&
                      legalBasis !== 'SOLICITANTE_NO_LEGITIMADO')
                  }
                >
                  {busy ? 'Guardando…' : 'Confirmar'}
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
      <Dialog
        open={erasureDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeErasureDialog();
          else setErasureDialogOpen(true);
        }}
      >
        <DialogContent aria-labelledby="privacy-erasure-title" className="max-w-xl">
          <DialogHeader>
            <DialogTitle id="privacy-erasure-title">Revisar supresión de datos</DialogTitle>
            <DialogDescription>
              Confirma el alcance antes de anonimizar los datos personales de forma irreversible.
            </DialogDescription>
          </DialogHeader>

          {erasureNotice ? (
            <PortalAlert
              variant="info"
              title="Vista previa actualizada"
              description={erasureNotice}
            />
          ) : null}
          {erasureError ? (
            <PortalAlert
              variant="error"
              title="No fue posible cargar la vista previa"
              description={erasureError}
              action={
                <Button
                  type="button"
                  variant="secondary"
                  disabled={erasureLoading}
                  onClick={() => void loadErasurePreview()}
                >
                  Reintentar
                </Button>
              }
            />
          ) : null}
          {erasureLoading ? (
            <div className="space-y-3" aria-busy="true" aria-live="polite">
              <p className="text-sm text-gray-600 dark:text-gray-300">Cargando la vista previa…</p>
              <PortalSkeletonBlock className="h-28" />
            </div>
          ) : null}
          {erasurePreview ? (
            <div className="space-y-4">
              <section aria-label="Resumen de datos que se anonimizarán">
                <p className="font-medium">
                  Expedientes encontrados:{' '}
                  <span className="font-mono tabular-nums">
                    {erasurePreview.candidateExpedienteIds.length}
                  </span>
                </p>
                <h3 className="mt-3 text-sm font-semibold">Conteo por categoría</h3>
                <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 rounded-xl bg-iwana-surface-soft p-3 text-sm sm:grid-cols-2 dark:bg-dark-surface-3">
                  {ERASURE_CATEGORY_OPTIONS.map((category) => (
                    <div key={category.value} className="flex items-baseline justify-between gap-3">
                      <dt>{category.label}</dt>
                      <dd className="font-mono tabular-nums font-semibold">
                        {erasurePreview.counts[category.value]}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              {!erasurePreview.eligible ? (
                <PortalAlert
                  variant="warning"
                  title="La solicitud aún no se puede resolver"
                  description={
                    <ul className="list-inside list-disc">
                      {erasurePreview.blockers.map((blocker) => (
                        <li key={blocker}>{ERASURE_BLOCKER_LABELS[blocker]}</li>
                      ))}
                    </ul>
                  }
                />
              ) : (
                <PortalAlert
                  variant="info"
                  title="Supresión disponible"
                  description="Se anonimizarán los datos indicados arriba y no se podrán recuperar."
                />
              )}

              <label className="flex min-h-11 items-start gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  className={`mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-iwana-primary ${interactiveFocusClassName}`}
                  checked={erasureConfirmed}
                  onChange={(event) => setErasureConfirmed(event.target.checked)}
                  aria-describedby="privacy-erasure-confirmation-help"
                />
                <span>
                  Entiendo que los datos personales se anonimizarán de forma irreversible
                  <span id="privacy-erasure-confirmation-help" className="sr-only">
                    La casilla debe estar marcada y la vista previa debe estar habilitada para
                    continuar.
                  </span>
                </span>
              </label>

              <div className={labelClass}>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="privacy-erasure-response">Respuesta</label>
                  <Button type="button" variant="ghost" onClick={insertTemplate}>
                    Insertar plantilla
                  </Button>
                </div>
                <textarea
                  id="privacy-erasure-response"
                  className={inputClass}
                  maxLength={4000}
                  value={responseText}
                  onChange={(event) => setResponseText(event.target.value)}
                />
              </div>
              <label className={labelClass}>
                Canal de respuesta
                <select
                  className={inputClass}
                  value={channel}
                  onChange={(event) => setChannel(event.target.value as ResponseChannel)}
                >
                  {RESPONSE_CHANNEL_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={closeErasureDialog}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={
                    busy ||
                    erasureLoading ||
                    !erasurePreview.eligible ||
                    !erasureConfirmed ||
                    !responseText.trim()
                  }
                  onClick={() => void submitAction()}
                >
                  {busy ? 'Anonimizando…' : 'Resolver y anonimizar'}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </PortalSidePeek>
  );
}
