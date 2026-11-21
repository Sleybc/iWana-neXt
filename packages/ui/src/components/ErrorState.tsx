import * as React from 'react';
import { Alert, AlertDescription } from './Alert';
import { Button } from './Button';

/** Error de un bloque con reintento opcional (U-3, contrato DS 2026-11-21 §5.2). */
export interface ErrorStateProps {
  message: React.ReactNode;
  onRetry?: (() => void) | undefined;
  /** Rótulo del botón; llega del catálogo de copy de la app (R1). */
  retryLabel: string;
  isRetrying?: boolean | undefined;
  className?: string | undefined;
}

export function ErrorState({
  message,
  onRetry,
  retryLabel,
  isRetrying = false,
  className,
}: ErrorStateProps) {
  return (
    <Alert variant="error" className={className}>
      <AlertDescription>{message}</AlertDescription>
      {onRetry ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          loading={isRetrying}
          onClick={onRetry}
        >
          {retryLabel}
        </Button>
      ) : null}
    </Alert>
  );
}
