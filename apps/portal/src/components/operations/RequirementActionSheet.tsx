'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button, FormStatus } from '@iwana/ui';
import {
  requirementActionLabel,
  type RequirementActionDescriptor,
} from './execution-order-actions';

export interface RequirementActionSheetProps {
  open: boolean;
  action: RequirementActionDescriptor;
  status: 'idle' | 'loading' | 'success' | 'error' | 'offline';
  errorMessage?: string | undefined;
  body: ReactNode;
  onCancel: () => void;
  onSubmit: () => void;
  onRetry?: () => void;
}
export function RequirementActionSheet({
  open,
  action,
  status,
  errorMessage,
  body,
  onCancel,
  onSubmit,
  onRetry,
}: RequirementActionSheetProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [bodySuppliesForm, setBodySuppliesForm] = useState(false);
  useLayoutEffect(() => {
    setBodySuppliesForm(Boolean(panel.current?.querySelector('form')));
  }, [open, body]);
  useEffect(() => {
    if (!open) return;
    const trigger =
      document.getElementById(`requirement-trigger-${action.requirementKey}`) ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    heading.current?.focus();
    return () => {
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open, action.requirementKey]);
  if (!open) return null;
  return (
    <section
      ref={panel}
      id={`requirement-action-${action.requirementKey}`}
      aria-labelledby={`requirement-action-title-${action.requirementKey}`}
      aria-busy={status === 'loading'}
      className="space-y-3 border-l-2 border-iwana-primary/20 pl-3"
      onSubmitCapture={(event) => {
        if (
          !(event.target instanceof HTMLFormElement) ||
          !event.target.hasAttribute('data-requirement-submit')
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        if (status !== 'loading' && status !== 'offline') onSubmit();
      }}
      onKeyDown={(event) => {
        // Un control compuesto (por ejemplo Select) puede consumir Escape para
        // cerrar su popup. Respeta ese primer Escape y deja la hoja abierta.
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.stopPropagation();
          if (status !== 'loading') onCancel();
        }
      }}
    >
      <h4
        ref={heading}
        tabIndex={-1}
        id={`requirement-action-title-${action.requirementKey}`}
        className="text-sm font-semibold text-iwana-primary dark:text-white"
      >
        {requirementActionLabel(action)}
      </h4>
      <FormStatus
        status={status === 'error' ? 'error' : status === 'success' ? 'success' : 'idle'}
        message={status === 'error' ? errorMessage : 'Registro guardado'}
      />
      {status === 'offline' && (
        <p role="status" className="text-sm text-gray-500 dark:text-gray-400">
          Sin conexión; vuelve a intentar cuando recuperes la red.
        </p>
      )}
      {status === 'loading' && (
        <p role="status" className="text-sm text-gray-500 dark:text-gray-400">
          Guardando registro…
        </p>
      )}
      <fieldset disabled={status === 'loading' || status === 'offline'}>{body}</fieldset>
      <div className="flex gap-2">
        {!bodySuppliesForm && (action.kind === 'activity' || action.kind === 'consumption') && (
          <Button
            type="button"
            disabled={status === 'loading' || status === 'offline'}
            onClick={onSubmit}
          >
            Guardar registro
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          disabled={status === 'loading'}
          onClick={onCancel}
        >
          Cancelar
        </Button>
        {status === 'error' && onRetry && (
          <Button type="button" onClick={onRetry}>
            Reintentar
          </Button>
        )}
      </div>
    </section>
  );
}
