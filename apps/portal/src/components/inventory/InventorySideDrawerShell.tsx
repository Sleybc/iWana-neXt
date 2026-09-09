'use client';

import { useEffect, type ReactNode, type RefObject } from 'react';
import { Button, ModalLayer, cn, overlayEdgeClassName } from '@iwana/ui';
import { PortalDiscardChangesDialog } from '@/components/shared/PortalDiscardChangesDialog';
import { usePortalModalDrawerBroadcast } from '@/components/shared/use-portal-modal-drawer-broadcast';

/**
 * Shell compartido de los drawers laterales del catálogo de Inventario
 * (dedup D-FE1 de `docs/plans/2026-09-01-inventario-dedup-refactors.md`).
 *
 * Centraliza overlay, `<aside>` accesible, contenedor de cabecera con botón
 * Cerrar, contenedor de pie con acciones y el diálogo de descarte de cambios.
 * El foco, el guard de cambios y la señal de suciedad siguen vivos en cada
 * drawer (su lógica de formulario es distinta); aquí solo vive el esqueleto.
 *
 * Apilado ADR-075: velo y panel comparten UNA capa `--z-modal` portalada al
 * `body` (`ModalLayer` de `@iwana/ui`), con el velo dentro de ella. El chrome
 * (Sidebar, TopHeader, subnav) no cambia de escalón: la capa se monta por
 * encima y lo atenúa, y la difusión del estado lo vuelve además inerte
 * mientras el drawer está abierto.
 */
interface InventorySideDrawerShellProps {
  open: boolean;
  drawerRef: RefObject<HTMLElement | null>;
  labelledBy: string;
  describedBy?: string;
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
  // Difunde la apertura hacia el chrome: Sidebar, TopHeader y subnav quedan
  // inertes bajo el velo, y el sidebar mobile se cierra mientras el drawer viva.
  usePortalModalDrawerBroadcast(open);

  if (!open) {
    return null;
  }

  return (
    <>
      <ModalLayer align="end" onVeilClick={onRequestClose}>
        <aside
          ref={drawerRef}
          role="dialog"
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          aria-modal="true"
          tabIndex={-1}
          className={cn(
            overlayEdgeClassName,
            'pointer-events-auto relative flex h-full w-full flex-col border-l bg-white shadow-2xl outline-none dark:bg-dark-surface-2',
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
      </ModalLayer>

      <PortalDiscardChangesDialog
        open={discardOpen}
        onConfirm={onConfirmDiscard}
        onCancel={onCancelDiscard}
      />
    </>
  );
}
