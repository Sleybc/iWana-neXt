'use client';

import type { ReactNode, RefObject } from 'react';
import { Button, cn } from '@iwana/ui';
import { PortalDiscardChangesDialog } from '@/components/shared/PortalDiscardChangesDialog';

/**
 * Shell compartido de los drawers laterales del catálogo de Inventario
 * (dedup D-FE1 de `docs/plans/2026-09-01-inventario-dedup-refactors.md`).
 *
 * Centraliza overlay, `<aside>` accesible, contenedor de cabecera con botón
 * Cerrar, contenedor de pie con acciones y el diálogo de descarte de cambios.
 * El foco, el guard de cambios y la señal de suciedad siguen vivos en cada
 * drawer (su lógica de formulario es distinta); aquí solo vive el esqueleto.
 */
interface InventorySideDrawerShellProps {
  open: boolean;
  drawerRef: RefObject<HTMLElement | null>;
  labelledBy: string;
  describedBy?: string;
  closeAriaLabel: string;
  maxWidthClass: string;
  onRequestClose: () => void;
  closeDisabled?: boolean;
  header: ReactNode;
  body: ReactNode;
  bodyClassName?: string;
  footer: ReactNode;
  discardOpen: boolean;
  onConfirmDiscard: () => void;
  onCancelDiscard: () => void;
}

export function InventorySideDrawerShell({
  open,
  drawerRef,
  labelledBy,
  describedBy,
  closeAriaLabel,
  maxWidthClass,
  onRequestClose,
  closeDisabled = false,
  header,
  body,
  bodyClassName = 'flex-1 overflow-y-auto px-6 py-5',
  footer,
  discardOpen,
  onConfirmDiscard,
  onCancelDiscard,
}: InventorySideDrawerShellProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[1200] bg-black/45">
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        aria-label={closeAriaLabel}
        onClick={onRequestClose}
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 right-0 z-[1201] flex w-full flex-col border-l border-gray-200 bg-white shadow-2xl outline-none dark:border-dark-border dark:bg-dark-surface-2',
          maxWidthClass,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5 dark:border-dark-border">
          <div className="min-w-0">{header}</div>
          <Button
            type="button"
            variant="secondary"
            onClick={onRequestClose}
            disabled={closeDisabled}
          >
            Cerrar
          </Button>
        </div>

        <div className={bodyClassName}>{body}</div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-dark-border">
          {footer}
        </div>
      </aside>

      <PortalDiscardChangesDialog
        open={discardOpen}
        onConfirm={onConfirmDiscard}
        onCancel={onCancelDiscard}
      />
    </div>
  );
}
