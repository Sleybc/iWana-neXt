'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, FileText, MapPin } from 'lucide-react';
import type { ExecutionOrderEvidence } from '@iwana/shared';
import { Badge, Button, SkeletonBlock } from '@iwana/ui';
import {
  PortalAlert,
  PortalEmptyState,
  PortalTablePagination,
} from '@/components/shared/portal-ui';
import { collectionCountLabel } from './execution-order-collections';
import { templateRequirementLabel } from './execution-order-requirements';
import type {
  ExecutionOrderActionOf,
  ExecutionOrderCaptureSlotProps,
  ExecutionOrderHistorySlotProps,
  ExecutionOrderSlotContext,
} from './execution-order-slots';
import { ExecutionOrderSignatureCapture } from './ExecutionOrderSignatureCapture';
import { formatTaskDateTime } from './operations-labels';
import {
  EVIDENCE_ACCEPTED_MIMES,
  type ExecutionOrderEvidenceOutcome,
} from './use-execution-order-evidence';

// SLOT R2 — evidencia por requisito.
//
// La acción nace del requisito: publica la `requirementKey` y el `evidenceType` de
// su descriptor, sin claves globales. Foto y documento usan el selector de archivo
// (sin arrastre); la firma usa el lienzo de `ExecutionOrderSignatureCapture`.
// La captura nunca ejecuta el cierre: el registro de conformidad sigue siendo de
// `close()`. Del drawer toma, vía `context`: `onUploadEvidence`, `isSubmitting`,
// `isAnalyzingEvidence`, `offline`, `evidence*` y `onRefreshDetail`.

const EVIDENCE_STATUS_LABELS: Record<string, string> = {
  PENDING_ANALYSIS: 'Pendiente de análisis',
  AVAILABLE: 'Disponible',
  REJECTED: 'Rechazada',
  EXPIRED: 'Expirada',
};

const EMPTY_EVIDENCE: ExecutionOrderEvidence[] = [];

function evidenceTypeLabel(evidenceType: string): string {
  if (evidenceType === 'PHOTO') return 'Foto';
  if (evidenceType === 'SIGNATURE') return 'Firma';
  return 'Documento';
}

function EvidenceTypeIcon({ evidenceType }: { evidenceType: string }) {
  const className = 'mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400';
  if (evidenceType === 'PHOTO') return <Camera className={className} />;
  if (evidenceType === 'SIGNATURE') return <CheckCircle2 className={className} />;
  return <FileText className={className} />;
}

const FILE_COPY = {
  PHOTO: { hint: 'Selecciona una foto.', button: 'Seleccionar foto' },
  DOCUMENT: {
    hint: 'Selecciona un documento en PDF o una imagen.',
    button: 'Seleccionar documento',
  },
} as const;

type EvidenceAction = ExecutionOrderActionOf<'evidence'>;

/**
 * Sesión de subida del slot: llama al manejador del drawer con la clave y el tipo
 * del requisito y una señal que se aborta al desmontarse (cerrar la hoja o cambiar
 * de requisito), de modo que el sondeo en curso se detiene sin avisos tardíos.
 */
function useEvidenceUpload(
  context: ExecutionOrderSlotContext,
  action: EvidenceAction,
  onRegistered?: () => void,
) {
  const { onUploadEvidence } = context;
  const controller = useRef<AbortController | null>(null);
  const [outcome, setOutcome] = useState<ExecutionOrderEvidenceOutcome | null>(null);

  useEffect(() => {
    const own = new AbortController();
    controller.current = own;
    return () => own.abort();
  }, []);

  const upload = useCallback(
    async (file: File) => {
      const signal = controller.current?.signal;
      setOutcome(null);
      return onUploadEvidence(file, action.requirementKey, {
        evidenceType: action.evidenceType,
        ...(signal ? { signal } : {}),
        ...(onRegistered ? { onRegistered } : {}),
        onOutcome: (next) => {
          if (!signal?.aborted) setOutcome(next);
        },
      });
    },
    [onUploadEvidence, action.requirementKey, action.evidenceType, onRegistered],
  );

  /** La hoja que pidió la subida sigue montada (no se cerró ni cambió de requisito). */
  const isActive = useCallback(() => controller.current?.signal.aborted === false, []);

  return { upload, outcome, isActive };
}

/**
 * Estado «Analizando archivo»: lo enciende el hook mientras espera el análisis. La
 * región viva existe siempre (vacía e invisible si no hay análisis) para que el
 * anuncio no se pierda al montarla con su contenido en el mismo instante.
 */
function AnalyzingStatus({ active }: { active: boolean }) {
  return (
    <p
      className={active ? 'text-sm text-iwana-secondary-700 dark:text-gray-300' : 'sr-only'}
      role="status"
    >
      {active ? 'Analizando archivo' : null}
    </p>
  );
}

function FileEvidenceCapture({
  action,
  context,
}: {
  action: EvidenceAction & { evidenceType: 'PHOTO' | 'DOCUMENT' };
  context: ExecutionOrderSlotContext;
}) {
  const { isSubmitting, isAnalyzingEvidence = false, offline } = context;
  const { upload, outcome } = useEvidenceUpload(context, action);
  const fileRef = useRef<HTMLInputElement>(null);
  const hintId = `eo-evidence-${action.requirementKey}-hint`;
  /** Archivo que no llegó a registrarse: se conserva para reanudar sin volver a subir. */
  const [retained, setRetained] = useState<File | null>(null);
  const copy = FILE_COPY[action.evidenceType];

  async function submitFile(file: File) {
    setRetained(file);
    const result = await upload(file);
    if (result === false) return;
    setRetained(null);
    // Reset para permitir elegir de nuevo el mismo archivo tras un registro exitoso.
    if (fileRef.current) {
      fileRef.current.value = '';
    }
  }

  const canResume = retained !== null && (outcome === 'pending-review' || outcome === 'failed');

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-gray-300 p-4 dark:border-dark-border">
      <p id={hintId} className="text-sm text-gray-600 dark:text-gray-300">
        {copy.hint}
      </p>
      <AnalyzingStatus active={isAnalyzingEvidence} />
      <input
        ref={fileRef}
        type="file"
        aria-label="Archivo de evidencia"
        aria-describedby={hintId}
        accept={EVIDENCE_ACCEPTED_MIMES[action.evidenceType].join(',')}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void submitFile(file);
        }}
      />
      {retained ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Archivo seleccionado: {retained.name}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          disabled={isSubmitting || offline}
          onClick={() => fileRef.current?.click()}
        >
          {copy.button}
        </Button>
        {canResume ? (
          <Button
            type="button"
            className="min-h-11"
            disabled={isSubmitting || offline}
            onClick={() => void submitFile(retained)}
          >
            Reintentar registro
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function SignatureEvidenceCapture({
  action,
  context,
  onClose,
}: {
  action: EvidenceAction & { evidenceType: 'SIGNATURE' };
  context: ExecutionOrderSlotContext;
  onClose: () => void;
}) {
  const { isSubmitting, isAnalyzingEvidence = false, offline } = context;
  // La firma guardada cierra la hoja en cuanto el servidor la acepta, antes del refresco.
  const closed = useRef(false);
  const closeOnce = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    onClose();
  }, [onClose]);
  const { upload, isActive } = useEvidenceUpload(context, action, closeOnce);

  // «Cancelar» lo aporta la hoja del requisito: un segundo botón duplicaría el control.
  return (
    <div className="space-y-3">
      <AnalyzingStatus active={isAnalyzingEvidence} />
      <ExecutionOrderSignatureCapture
        disabled={isSubmitting || offline}
        onSave={async (file) => {
          closed.current = false;
          const result = await upload(file);
          if (result === false) return false;
          if (isActive()) closeOnce();
          return true;
        }}
      />
    </div>
  );
}

/** Captura inline: foto, documento o firma según el descriptor del requisito. */
export function ExecutionOrderEvidenceAction({
  requirement,
  action,
  context,
  onClose,
}: ExecutionOrderCaptureSlotProps<'EVIDENCE', 'evidence'>) {
  const { onRefreshDetail } = context;

  if (action.requirementKey.trim().length === 0) {
    return (
      <PortalAlert
        variant="warning"
        title="Requisito de evidencia no disponible"
        description="No hay un requisito de evidencia válido para asociar el archivo. Actualiza el detalle antes de intentarlo."
        action={
          onRefreshDetail ? (
            <Button type="button" onClick={() => void onRefreshDetail()}>
              Actualizar detalle
            </Button>
          ) : undefined
        }
      />
    );
  }

  // La clave de la acción y la del requisito son la misma por construcción; se
  // conserva la comprobación para no registrar contra otro requisito.
  if (action.requirementKey !== requirement.key) return null;

  if (action.evidenceType === 'SIGNATURE') {
    return (
      <SignatureEvidenceCapture
        action={{ ...action, evidenceType: 'SIGNATURE' }}
        context={context}
        onClose={onClose}
      />
    );
  }
  return (
    <FileEvidenceCapture
      action={{ ...action, evidenceType: action.evidenceType }}
      context={context}
    />
  );
}

const HISTORY_EMPTY_DESCRIPTION: Record<string, string> = {
  PHOTO: 'Las fotos que añadas aparecerán aquí.',
  DOCUMENT: 'Los documentos que adjuntes aparecerán aquí.',
  SIGNATURE: 'La firma del cliente aparecerá aquí cuando se guarde.',
};

/** Historial de evidencias del requisito, por clave exacta del snapshot. */
export function ExecutionOrderEvidenceHistory({
  order,
  requirement,
  context,
}: ExecutionOrderHistorySlotProps<'EVIDENCE'>) {
  const {
    evidence,
    evidenceMeta,
    evidenceState = 'available',
    isLoadingMoreEvidence,
    onLoadMoreEvidence,
    onRefreshDetail,
  } = context;
  const requirementEvidence = (evidence ?? EMPTY_EVIDENCE).filter(
    (entry) => entry.requirementKey === requirement.key,
  );
  const requirementLabel = templateRequirementLabel(requirement);

  return (
    <section
      aria-labelledby={`eo-evidence-heading-${requirement.key}-history`}
      className="space-y-3"
    >
      <h3
        id={`eo-evidence-heading-${requirement.key}-history`}
        className="text-sm font-semibold text-gray-900 dark:text-white"
      >
        Evidencia y conformidad
      </h3>
      <div className="mt-3 space-y-2">
        {evidenceState === 'unavailable' ? (
          <PortalAlert
            variant="warning"
            title="Evidencias no disponibles"
            description="No pudimos consultar las evidencias en este momento. La OT sigue disponible y podrás intentarlo cuando el servicio esté disponible."
            action={
              onRefreshDetail ? (
                <Button type="button" onClick={() => void onRefreshDetail()}>
                  Actualizar detalle
                </Button>
              ) : undefined
            }
          />
        ) : evidenceState === 'loading' ? (
          <div aria-busy="true" aria-label="Cargando evidencias">
            <SkeletonBlock className="h-20" />
          </div>
        ) : requirementEvidence.length === 0 ? (
          <PortalEmptyState
            title="Todavía no hay evidencias para este requisito"
            description={
              HISTORY_EMPTY_DESCRIPTION[requirement.evidenceType] ??
              'Las evidencias que guardes aparecerán aquí.'
            }
          />
        ) : (
          <>
            {evidenceMeta && evidenceMeta.total > 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400" role="status">
                {collectionCountLabel(requirementEvidence.length, evidenceMeta.total, 'evidencias')}
              </p>
            ) : null}
            {requirementEvidence.map((entry) => (
              <article
                key={entry.id}
                className="flex items-start gap-3 rounded-xl border border-gray-200 p-3 dark:border-dark-border"
              >
                <EvidenceTypeIcon evidenceType={entry.evidenceType} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {evidenceTypeLabel(entry.evidenceType)} · {requirementLabel}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatTaskDateTime(entry.capturedAt ?? entry.receivedAt)}
                  </p>
                </div>
                <Badge
                  variant={
                    entry.status === 'AVAILABLE'
                      ? 'success'
                      : entry.status === 'REJECTED' || entry.status === 'EXPIRED'
                        ? 'error'
                        : 'warning'
                  }
                >
                  {EVIDENCE_STATUS_LABELS[entry.status] ?? 'Estado no disponible'}
                </Badge>
              </article>
            ))}
            <PortalTablePagination
              hasMore={evidenceMeta?.hasMore === true}
              onLoadMore={() => void onLoadMoreEvidence()}
              loading={isLoadingMoreEvidence}
              resourceLabel="evidencias"
              shown={requirementEvidence.length}
              total={evidenceMeta?.total}
            />
          </>
        )}
      </div>
      {order.site.address && (
        <div className="mt-3 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
          <span>{order.site.address}</span>
        </div>
      )}
    </section>
  );
}
