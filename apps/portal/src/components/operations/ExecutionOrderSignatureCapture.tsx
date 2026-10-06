'use client';

import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { Button } from '@iwana/ui';
import { PortalAlert } from '@/components/shared/portal-ui';

// SLOT R2 — captura de la firma del cliente en el navegador.
//
// Lienzo nativo (sin dependencias, G3 §2) con eventos de puntero y exportación a
// PNG con `canvas.toBlob`. El PNG sale como `File` por `onSave`; este componente
// no sube ni registra nada: la acción de evidencia lo envía por el transporte
// existente y el cierre de la OT conserva su propio registro de conformidad.
//
// Accesibilidad (UX v1.1 §3.1, contrato de componente §3.2):
// - Solo el trazo libre depende de la trayectoria y queda exceptuado por WCAG 2.1.1.
//   «Limpiar», «Guardar firma» y, si se ofrece, «Cancelar» son botones nativos
//   operables por teclado, con foco visible y objetivo de al menos 44 px.
// - Las instrucciones se asocian a la región y al lienzo por `aria-describedby`.
// - El estado del trazo y los errores locales se anuncian en regiones vivas.
// - No se acepta un nombre escrito como firma (ADR-088 §D4): sin trazo no hay firma.
// - Un error de guardado conserva el trazo para reintentar o cancelar.

/** Resolución fija del mapa de bits; el lienzo se escala por CSS. */
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 320;
/** Grosor del trazo medido en píxeles de pantalla. */
const STROKE_CSS_PX = 2.5;
const SIGNATURE_FILE_NAME = 'firma-cliente.png';

const SAVE_ERROR = 'No pudimos guardar la firma. Intenta de nuevo.';

export interface ExecutionOrderSignatureCaptureProps {
  /**
   * Resultado de guardar el PNG. `false` indica que no se guardó: el trazo se
   * conserva para reintentar o cancelar.
   */
  onSave: (file: File) => Promise<boolean | void> | boolean | void;
  /** Sin esta prop no hay botón «Cancelar»: lo aporta quien aloja la captura (la hoja del requisito). */
  onCancel?: () => void;
  /** Bloquea el trazo y los botones (envío en curso o sin conexión). */
  disabled?: boolean;
}

function exportPng(canvas: HTMLCanvasElement): Promise<File | null> {
  const context = canvas.getContext('2d');
  if (context) {
    // Fondo blanco detrás del trazo: el PNG no debe depender del tema de la pantalla.
    context.save();
    context.globalCompositeOperation = 'destination-over';
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
  }
  return new Promise<File | null>((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? new File([blob], SIGNATURE_FILE_NAME, { type: 'image/png' }) : null);
    }, 'image/png');
  });
}

export function ExecutionOrderSignatureCapture({
  onSave,
  onCancel,
  disabled = false,
}: ExecutionOrderSignatureCaptureProps) {
  const baseId = useId();
  const instructionsId = `${baseId}-instrucciones`;
  const statusId = `${baseId}-estado`;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const stroke = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  /** Hay trazo nuevo desde la última exportación. */
  const dirty = useRef(false);
  /** Último PNG exportado: un reintento sin cambios reenvía el mismo archivo. */
  const lastFile = useRef<File | null>(null);
  const restoreFocus = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('Todavía no hay firma dibujada.');
  const [localError, setLocalError] = useState<string | null>(null);

  const blocked = disabled || saving;

  // Tras un guardado fallido el envío se libera y el foco vuelve al botón que lo pidió.
  useEffect(() => {
    if (restoreFocus.current && !disabled && !saving) {
      restoreFocus.current = false;
      saveButtonRef.current?.focus();
    }
  }, [disabled, saving]);

  function toCanvasPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
      scale: scaleX,
    };
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (blocked) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = toCanvasPoint(event);
    context.lineWidth = STROKE_CSS_PX * point.scale;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = 'currentColor';
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    stroke.current = { pointerId: event.pointerId, x: point.x, y: point.y };
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const current = stroke.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const point = toCanvasPoint(event);
    context.beginPath();
    context.moveTo(current.x, current.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    stroke.current = { pointerId: current.pointerId, x: point.x, y: point.y };
  }

  function handlePointerEnd(event: PointerEvent<HTMLCanvasElement>) {
    if (stroke.current?.pointerId !== event.pointerId) return;
    stroke.current = null;
    dirty.current = true;
    setHasInk(true);
    setLocalError(null);
    setStatus('Firma dibujada. Puedes guardarla o limpiarla.');
  }

  function handleClear() {
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    stroke.current = null;
    dirty.current = false;
    lastFile.current = null;
    setHasInk(false);
    setLocalError(null);
    setStatus('Firma limpiada. Puedes volver a firmar.');
  }

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!hasInk) {
      setLocalError('Dibuja la firma antes de guardarla.');
      return;
    }
    setLocalError(null);
    setSaving(true);
    restoreFocus.current = true;
    try {
      let file = dirty.current ? null : lastFile.current;
      if (!file) {
        file = await exportPng(canvas);
        if (!file) {
          setLocalError(SAVE_ERROR);
          return;
        }
        lastFile.current = file;
        dirty.current = false;
      }
      const result = await onSave(file);
      if (result !== false) restoreFocus.current = false;
    } catch {
      setLocalError(SAVE_ERROR);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div role="group" aria-label="Captura de firma del cliente" aria-describedby={instructionsId}>
      <div className="space-y-3">
        <p id={instructionsId} className="text-sm text-gray-600 dark:text-gray-300">
          Pide al cliente que firme el acta de conformidad. Dibuja la firma dentro del recuadro con
          el dedo, un lápiz o el ratón.
        </p>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Área de firma"
          aria-describedby={`${instructionsId} ${statusId}`}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="aspect-[5/2] w-full touch-none rounded-xl border border-gray-300 bg-white text-iwana-primary dark:border-dark-border"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        />
        <p
          id={statusId}
          role="status"
          aria-live="polite"
          className="text-xs text-gray-500 dark:text-gray-400"
        >
          {status}
        </p>
        {localError ? <PortalAlert variant="error" title={localError} live="assertive" /> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            disabled={blocked}
            onClick={handleClear}
          >
            Limpiar
          </Button>
          <Button
            ref={saveButtonRef}
            type="button"
            className="min-h-11"
            disabled={disabled}
            loading={saving}
            onClick={() => void handleSave()}
          >
            Guardar firma
          </Button>
          {onCancel ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={saving}
              onClick={onCancel}
            >
              Cancelar
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
