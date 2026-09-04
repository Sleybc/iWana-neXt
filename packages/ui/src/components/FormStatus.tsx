// packages/ui/src/components/FormStatus.tsx
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { alertVariants } from './Alert';

export type FormStatusState = 'idle' | 'success' | 'error';

export interface FormStatusProps {
  /** Estado del resultado. `idle` renderiza el contenedor vacio, nunca null. */
  status: FormStatusState;
  /** Contenido del banner. Ignorado en `idle`. */
  message?: ReactNode;
  /** Anula el tono derivado (`error` → `assertive`, resto → `polite`). */
  tone?: 'polite' | 'assertive';
  /**
   * Auto-ocultado del exito en ms. `false` lo desactiva.
   * Prohibido con `status="error"`: un error no se auto-oculta (se ignora).
   * Requiere `onDismiss` cuando es un numero.
   */
  autoDismissMs?: number | false;
  /** Requerido si `autoDismissMs` es un numero: vuelve a `idle` sin desmontar. */
  onDismiss?: () => void;
  /** Para enlazar con `aria-describedby` del `<form>`. */
  id?: string;
  className?: string;
}

/**
 * Banner de resultado de formulario con region viva preexistente.
 *
 * El contenedor (con `role`, `aria-live` y `aria-atomic`) se monta desde el
 * primer render tambien en `idle`: montar region y contenido en el mismo tick
 * hace que el lector de pantalla pierda el anuncio (SC 4.1.3). Por eso el
 * consumidor lo renderiza siempre y controla por `status`, nunca con
 * `{cond && <FormStatus />}`. Delega en `alertVariants`; cero tokens nuevos.
 */
export function FormStatus({
  status,
  message,
  tone,
  autoDismissMs = false,
  onDismiss,
  id,
  className,
}: FormStatusProps) {
  const live = tone ?? (status === 'error' ? 'assertive' : 'polite');

  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (typeof autoDismissMs !== 'number' || status !== 'success') {
      return;
    }
    const timer = setTimeout(() => {
      onDismissRef.current?.();
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [status, autoDismissMs]);

  if (status === 'idle') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        id={id}
        className={cn('sr-only', className)}
      />
    );
  }

  if (status === 'error') {
    return (
      <div
        role="alert"
        aria-live={live}
        aria-atomic="true"
        id={id}
        className={cn(alertVariants({ variant: 'error' }), className)}
      >
        {message}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live={live}
      aria-atomic="true"
      id={id}
      className={cn(alertVariants({ variant: 'success' }), 'flex items-center gap-2', className)}
    >
      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
      {message}
    </div>
  );
}
