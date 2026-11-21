import * as React from 'react';

/** Vacío estático de un bloque (U-3, contrato DS 2026-11-21 §5.3). Sin icono ni rol vivo. */
export interface EmptyStateProps {
  message: React.ReactNode;
  action?: React.ReactNode;
  className?: string | undefined;
}

export function EmptyState({ message, action, className }: EmptyStateProps) {
  return (
    <div className={className}>
      <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">{message}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
