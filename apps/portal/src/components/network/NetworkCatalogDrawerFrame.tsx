'use client';

import { useId, useRef, type FormEventHandler, type ReactNode, type RefObject } from 'react';
import { Button, ModalLayer, overlayEdgeClassName } from '@iwana/ui';
import { usePortalModalDrawerBroadcast } from '@/components/shared/use-portal-modal-drawer-broadcast';
import { usePortalSideDrawerA11y } from '@/components/shared/use-portal-side-drawer-a11y';
import {
  PortalSkeletonBlock,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
} from '@/components/shared/portal-ui';

interface NetworkCatalogDrawerFrameProps {
  open: boolean;
  title: string;
  description: string;
  formId: string;
  submitLabel: string;
  submitAriaDisabled?: boolean;
  submitDisabled?: boolean;
  submitVisible?: boolean;
  submitting: boolean;
  secondaryAction?: { label: string; onClick: () => void; disabled?: boolean };
  initialFocusRef?: RefObject<HTMLElement | null>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onClose: () => void;
  children: ReactNode;
}

export function NetworkCatalogDrawerFrame({
  open,
  title,
  description,
  formId,
  submitLabel,
  submitAriaDisabled = false,
  submitDisabled = false,
  submitVisible = true,
  submitting,
  secondaryAction,
  initialFocusRef,
  onSubmit,
  onClose,
  children,
}: NetworkCatalogDrawerFrameProps) {
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();
  usePortalSideDrawerA11y(open, panelRef, onClose, initialFocusRef);
  usePortalModalDrawerBroadcast(open);

  if (!open) return null;

  return (
    <ModalLayer align="end" onVeilClick={onClose}>
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`${overlayEdgeClassName} pointer-events-auto relative flex h-full w-full max-w-2xl flex-col border-l bg-white shadow-2xl dark:bg-dark-surface-2`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-5 dark:border-dark-border sm:px-6">
          <div className="min-w-0">
            <p className="portal-eyebrow">Catálogo de red</p>
            <h2 id={titleId} className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
              {title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11 shrink-0"
            onClick={onClose}
            aria-label={`Cerrar ${title.toLowerCase()}`}
          >
            Cerrar
          </Button>
        </header>
        <form id={formId} onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          <footer className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-white px-5 py-4 dark:border-dark-border dark:bg-dark-surface-2 sm:flex-row sm:justify-end sm:px-6">
            {secondaryAction ? (
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={secondaryAction.onClick}
                disabled={submitting || secondaryAction.disabled}
              >
                {secondaryAction.label}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={onClose}
              disabled={submitting}
            >
              Cancelar
            </Button>
            {submitVisible ? (
              <Button
                type="submit"
                form={formId}
                variant="primary"
                className="min-h-11"
                loading={submitting}
                disabled={submitting || submitDisabled}
                aria-disabled={submitAriaDisabled || undefined}
              >
                {submitLabel}
              </Button>
            ) : null}
          </footer>
        </form>
      </aside>
    </ModalLayer>
  );
}

interface NetworkFormFieldProps {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: ReactNode;
}

export function NetworkFormField({ id, label, error, hint, children }: NetworkFormFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-gray-800 dark:text-gray-100">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={hintId} className="text-xs leading-5 text-gray-500 dark:text-gray-400">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function networkFormControlProps(id: string, error?: string, hasHint = false) {
  const describedBy = [hasHint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter((value): value is string => value !== null)
    .join(' ');

  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined,
    className:
      'portal-input-surface min-h-11 w-full px-3 py-2 text-sm text-gray-900 dark:text-white',
  } as const;
}

export function NetworkCatalogTableSkeleton({ columnCount }: { columnCount: number }) {
  return (
    <div className={portalDataTableShellClassName} aria-hidden="true">
      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full">
          <thead>
            <tr className={portalDataTableHeadRowClassName}>
              {Array.from({ length: columnCount }, (_, index) => (
                <th key={index} scope="col" className={portalDataTableHeadClassName}>
                  <PortalSkeletonBlock className="h-3 w-20" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={portalDataTableBodyClassName}>
            {Array.from({ length: 5 }, (_, row) => (
              <tr key={row}>
                {Array.from({ length: columnCount }, (_, column) => (
                  <td key={column} className={portalDataTableCellClassName}>
                    <PortalSkeletonBlock className={column === 0 ? 'h-4 w-32' : 'h-4 w-24'} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
