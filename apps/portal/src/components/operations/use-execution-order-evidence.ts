import { useCallback, useEffect, useRef } from 'react';
import { ApiError, tasksApi, type ExecutionOrderDetailResponse } from '@/lib/api-client';
import {
  EXECUTION_ORDER_EVIDENCE_UPLOAD_CONSTRAINTS,
  type EvidenceAssetReceipt,
} from '@iwana/shared';
import { isValidFutureEvidenceExpiry, mapOperationsError } from './execution-order-requirements';
import type { ExecutionOrderMutation } from './use-execution-order-refresh';

// SLOT R2 — subida de evidencia por requisito: carga, espera acotada del análisis
// y registro del mismo `mediaAssetId`.
//
// Garantías de la política:
// - Se registra solo con el asset en `AVAILABLE` (hotfix `f1348c64`): el servidor
//   rechaza todo lo demás con `EVIDENCE_ASSET_NOT_AVAILABLE`.
// - El tipo de evidencia lo declara quien llama (el descriptor del requisito); solo
//   si falta se deriva del MIME, que es el comportamiento anterior.
// - El recibo de la propia carga (`mediaAssetId` y su `expiresAt`) se conserva
//   mientras el archivo no haya llegado a un desenlace terminal. Si la espera se
//   agota, o el registro falla, repetir la llamada con el mismo archivo (el mismo
//   objeto `File`, o uno con idénticos nombre, tipo, tamaño y fecha de modificación,
//   como al volver a elegirlo del disco) reanuda el registro de ese asset sin
//   volver a subir: el asset anterior se quedaría huérfano en cuarentena.
// - Un resultado obsoleto no toca el estado: cambiar de OT, desmontar el slot que
//   lo pidió (`options.signal`) o desmontar la consola detiene el sondeo y calla
//   los avisos. El recibo se conserva para poder reanudar.

export type ExecutionOrderEvidenceType = 'PHOTO' | 'DOCUMENT' | 'SIGNATURE';

/** Cómo terminó la llamada; el slot lo usa para ofrecer el siguiente paso. */
export type ExecutionOrderEvidenceOutcome =
  | 'registered'
  /** La espera del análisis se agotó: el recibo se conservó y se puede reanudar. */
  | 'pending-review'
  | 'rejected'
  | 'expired'
  | 'invalid-file'
  /** Fallo de red o de registro: si ya había recibo, se conservó. */
  | 'failed'
  | 'stale';

/**
 * Opciones que el slot de evidencia declara al subir. Son opcionales para que el
 * tipo público del drawer siga aceptando la llamada de dos argumentos.
 */
export interface ExecutionOrderEvidenceUploadOptions {
  /** `evidenceType` del descriptor del requisito. Sin él se deriva del MIME. */
  evidenceType?: ExecutionOrderEvidenceType;
  /** El slot la aborta al desmontarse o al cambiar de requisito. */
  signal?: AbortSignal;
  /** Informa el desenlace sin cambiar la semántica booleana del manejador. */
  onOutcome?: (outcome: ExecutionOrderEvidenceOutcome) => void;
  /**
   * Se llama en cuanto el servidor acepta el registro, antes de releer la orden y
   * solo si la señal sigue viva: permite cerrar la hoja sin esperar al refresco,
   * que puede desmontar el cuerpo del drawer.
   */
  onRegistered?: () => void;
}
export type ExecutionOrderEvidenceUploadHandler = (
  file: File,
  requirementKey: string,
  options?: ExecutionOrderEvidenceUploadOptions,
) => Promise<void | boolean>;

export interface ExecutionOrderEvidenceAdapter {
  selectedExecutionOrder: ExecutionOrderDetailResponse | null;
  requestSequence: { current: number };
  setIsSubmittingExecutionOrder: (value: boolean) => void;
  setIsAnalyzingEvidence: (value: boolean) => void;
  setExecutionOrderError: (value: string | null) => void;
  setExecutionOrderSuccess: (value: string | null) => void;
  refreshExecutionOrder: (
    executionOrderId: string,
    mutation: ExecutionOrderMutation,
  ) => Promise<void>;
}

/**
 * Espera finita del análisis para no dejar la carga abierta indefinidamente.
 *
 * Calibrada con la medición del análisis contra el stack local con el worker
 * BullMQ real (informe R2 §4): p95 de 62 ms en cargas secuenciales y de 168 ms con
 * 10 cargas simultáneas, p99 de 69 y 192 ms. Un intervalo fijo de 500 ms hacía
 * esperar medio segundo a un asset que ya estaba listo a los ~60 ms; el escalado
 * lo recoge en la segunda lectura y conserva un tope total parecido al del hotfix
 * `f1348c64` (6 lecturas, 2,3 s frente a 2,5 s). La medición es de un entorno
 * local sin carga: el p95 de un entorno compartido sigue pendiente, y por eso
 * agotar el tope no pierde nada: el recibo se conserva y el registro se reanuda.
 */
export const EVIDENCE_ANALYSIS_POLICY = {
  /** Espera antes de cada nueva lectura; hay una lectura más que esperas. */
  retryDelaysMs: [150, 250, 400, 600, 900],
} as const;

/** Restricciones de subida compartidas con el servicio que valida los assets. */
export const EVIDENCE_FILE_MAX_BYTES = EXECUTION_ORDER_EVIDENCE_UPLOAD_CONSTRAINTS.MAX_BYTES;
const IMAGE_MIMES = EXECUTION_ORDER_EVIDENCE_UPLOAD_CONSTRAINTS.ALLOWED_MIMES.filter((mime) =>
  mime.startsWith('image/'),
);
/** Tipos que el selector ofrece según el `evidenceType` del requisito. */
export const EVIDENCE_ACCEPTED_MIMES: Record<ExecutionOrderEvidenceType, readonly string[]> = {
  PHOTO: IMAGE_MIMES,
  DOCUMENT: [...EXECUTION_ORDER_EVIDENCE_UPLOAD_CONSTRAINTS.ALLOWED_MIMES],
  SIGNATURE: [...EXECUTION_ORDER_EVIDENCE_UPLOAD_CONSTRAINTS.SIGNATURE_MIMES],
};

const SIGNATURE_SAVE_ERROR = 'No pudimos guardar la firma. Intenta de nuevo.';

function validateEvidenceFile(file: File, evidenceType: ExecutionOrderEvidenceType | undefined) {
  if (typeof file.size === 'number' && file.size === 0) return 'El archivo está vacío.';
  if (typeof file.size === 'number' && file.size > EVIDENCE_FILE_MAX_BYTES) {
    return 'El archivo supera el tamaño máximo de 25 MB.';
  }
  if (evidenceType && !EVIDENCE_ACCEPTED_MIMES[evidenceType].includes(file.type)) {
    if (evidenceType === 'PHOTO') return 'Selecciona una foto en formato JPG, PNG, WebP o GIF.';
    if (evidenceType === 'DOCUMENT') {
      return 'Selecciona un documento en PDF o una imagen en formato JPG, PNG, WebP o GIF.';
    }
    return SIGNATURE_SAVE_ERROR;
  }
  return null;
}

function failureMessage(error: unknown, evidenceType: ExecutionOrderEvidenceType): string {
  if (evidenceType !== 'SIGNATURE') return mapOperationsError(error);
  // La sesión y el permiso se explican tal cual; el resto usa el copy cerrado de la firma.
  if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
    return mapOperationsError(error);
  }
  return SIGNATURE_SAVE_ERROR;
}

function terminalMessage(
  status: 'REJECTED' | 'EXPIRED' | 'PENDING_ANALYSIS',
  evidenceType: ExecutionOrderEvidenceType,
): string {
  if (evidenceType === 'SIGNATURE') {
    return status === 'PENDING_ANALYSIS'
      ? 'La firma sigue en revisión y aún no se guardó. Puedes volver a intentarlo en unos minutos.'
      : SIGNATURE_SAVE_ERROR;
  }
  if (status === 'REJECTED') {
    return 'El archivo no superó la revisión y no se registró. Selecciona otro archivo para continuar.';
  }
  if (status === 'EXPIRED') {
    return 'El archivo venció antes de completar la revisión y no se registró. Vuelve a seleccionarlo para adjuntarlo.';
  }
  return 'El archivo sigue en revisión y aún no se registró. Puedes volver a intentarlo en unos minutos.';
}

/** Espera `ms`, o menos si se aborta la señal. */
function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener('abort', finish, { once: true });
  });
}

type AnalysisResult = EvidenceAssetReceipt['status'] | 'STALE';

async function waitForEvidenceAssetAvailability(
  executionOrderId: string,
  mediaAssetId: string,
  isStale: () => boolean,
  signal: AbortSignal | undefined,
): Promise<AnalysisResult> {
  const delays = EVIDENCE_ANALYSIS_POLICY.retryDelaysMs;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    if (isStale()) return 'STALE';
    const receipt: EvidenceAssetReceipt = await tasksApi.executionOrders.getEvidenceAsset(
      executionOrderId,
      mediaAssetId,
    );
    if (isStale()) return 'STALE';
    if (receipt.status !== 'PENDING_ANALYSIS') return receipt.status;
    const delay = delays[attempt];
    if (delay === undefined) return receipt.status;
    await wait(delay, signal);
  }
  return 'PENDING_ANALYSIS';
}

/** Mismo archivo: el mismo objeto, o idénticos nombre, tipo, tamaño y fecha de modificación. */
function isSameFile(a: File, b: File): boolean {
  if (a === b) return true;
  return (
    typeof a.size === 'number' &&
    typeof a.lastModified === 'number' &&
    a.name === b.name &&
    a.type === b.type &&
    a.size === b.size &&
    a.lastModified === b.lastModified
  );
}

interface RetainedReceipt {
  file: File;
  mediaAssetId: string;
  expiresAt: string;
}

/**
 * Slot R2: sube el archivo, espera `AVAILABLE` con tope y registra con la clave y
 * el tipo del requisito. El manejador devuelto es estable entre renders.
 */
export function useExecutionOrderEvidence(adapter: ExecutionOrderEvidenceAdapter) {
  // Siempre el último adaptador: una llamada larga no debe usar la versión ni el
  // refresco de cuando empezó.
  const latest = useRef(adapter);
  useEffect(() => {
    latest.current = adapter;
  });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const runCounter = useRef(0);
  const receipts = useRef(new Map<string, RetainedReceipt>());

  const handleUploadEvidence = useCallback(
    async (
      file: File,
      requirementKey: string,
      options?: ExecutionOrderEvidenceUploadOptions,
    ): Promise<boolean> => {
      const order = latest.current.selectedExecutionOrder;
      if (!order) return false;
      const orderId = order.id;
      const requestSequence = latest.current.requestSequence.current;
      const { signal, onOutcome } = options ?? {};
      const evidenceType: ExecutionOrderEvidenceType =
        options?.evidenceType ?? (file.type.startsWith('image/') ? 'PHOTO' : 'DOCUMENT');

      const run = (runCounter.current += 1);
      const isOrderStale = () =>
        latest.current.requestSequence.current !== requestSequence ||
        latest.current.selectedExecutionOrder?.id !== orderId;
      const isStale = () =>
        !mounted.current ||
        signal?.aborted === true ||
        run !== runCounter.current ||
        isOrderStale();
      const finish = (outcome: ExecutionOrderEvidenceOutcome) => {
        onOutcome?.(outcome);
        return outcome === 'registered';
      };
      const { setExecutionOrderError } = latest.current;

      if (!requirementKey.trim()) {
        setExecutionOrderError(
          'No hay un requisito de evidencia válido para asociar el archivo. Actualiza el detalle antes de intentarlo.',
        );
        return finish('invalid-file');
      }

      const receiptKey = `${orderId}::${requirementKey}`;
      let receipt = receipts.current.get(receiptKey);
      if (
        receipt &&
        (!isSameFile(receipt.file, file) || !isValidFutureEvidenceExpiry(receipt.expiresAt))
      ) {
        receipts.current.delete(receiptKey);
        receipt = undefined;
      }
      if (!receipt) {
        const invalid = validateEvidenceFile(file, options?.evidenceType);
        if (invalid) {
          setExecutionOrderError(invalid);
          return finish('invalid-file');
        }
      }

      latest.current.setIsSubmittingExecutionOrder(true);
      latest.current.setIsAnalyzingEvidence(false);
      setExecutionOrderError(null);
      latest.current.setExecutionOrderSuccess(null);
      try {
        if (!receipt) {
          const uploadReceipt = await tasksApi.executionOrders.uploadEvidenceAsset(
            orderId,
            file,
            order.version,
          );
          if (!isValidFutureEvidenceExpiry(uploadReceipt.expiresAt)) {
            throw new Error('La evidencia subida no tiene una fecha de expiración válida.');
          }
          receipt = {
            file,
            mediaAssetId: uploadReceipt.mediaAssetId,
            expiresAt: uploadReceipt.expiresAt,
          };
          receipts.current.set(receiptKey, receipt);
        }
        if (isStale()) return finish('stale');

        latest.current.setIsAnalyzingEvidence(true);
        const analysis = await waitForEvidenceAssetAvailability(
          orderId,
          receipt.mediaAssetId,
          isStale,
          signal,
        );
        if (analysis === 'STALE') return finish('stale');
        latest.current.setIsAnalyzingEvidence(false);

        if (analysis === 'REJECTED' || analysis === 'EXPIRED') {
          receipts.current.delete(receiptKey);
          setExecutionOrderError(terminalMessage(analysis, evidenceType));
          return finish(analysis === 'REJECTED' ? 'rejected' : 'expired');
        }
        if (analysis !== 'AVAILABLE') {
          // Tope agotado: el recibo queda para reanudar el registro del mismo asset.
          setExecutionOrderError(terminalMessage('PENDING_ANALYSIS', evidenceType));
          return finish('pending-review');
        }

        const currentOrder = latest.current.selectedExecutionOrder;
        await tasksApi.executionOrders.registerEvidence(
          orderId,
          {
            mediaAssetId: receipt.mediaAssetId,
            evidenceType,
            requirementKey,
            expiresAt: receipt.expiresAt,
          },
          currentOrder?.id === orderId ? currentOrder.version : order.version,
        );
        receipts.current.delete(receiptKey);
        // El registro ya ocurrió: el cierre del slot o su AbortSignal no deben
        // omitir el refresco. Solo una navegación a otra OT invalida el aviso.
        if (isOrderStale()) return finish('registered');
        if (signal?.aborted !== true) options?.onRegistered?.();
        // El registro ya ocurrió: el refresco y el aviso van aunque el slot se haya desmontado,
        // salvo que la persona ya esté en otra orden.
        if (!mounted.current || latest.current.selectedExecutionOrder?.id !== orderId) {
          return finish('registered');
        }
        await latest.current.refreshExecutionOrder(orderId, 'evidence');
        if (isOrderStale()) return finish('registered');
        latest.current.setExecutionOrderSuccess(
          evidenceType === 'SIGNATURE' ? 'Firma guardada' : 'La evidencia fue registrada.',
        );
        return finish('registered');
      } catch (error) {
        if (isStale()) return finish('stale');
        setExecutionOrderError(failureMessage(error, evidenceType));
        return finish('failed');
      } finally {
        // Solo la llamada vigente apaga los indicadores globales: una más nueva es su dueña.
        if (
          run === runCounter.current &&
          mounted.current &&
          latest.current.requestSequence.current === requestSequence
        ) {
          latest.current.setIsAnalyzingEvidence(false);
          latest.current.setIsSubmittingExecutionOrder(false);
        }
      }
    },
    [],
  );

  return handleUploadEvidence satisfies ExecutionOrderEvidenceUploadHandler;
}
