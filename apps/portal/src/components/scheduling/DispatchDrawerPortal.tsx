'use client';

import type { ReactNode } from 'react';
import { ModalLayer } from '@iwana/ui';

export type DispatchDrawerScope = 'mobile' | 'all';

interface DispatchDrawerPortalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  drawerScope?: DispatchDrawerScope;
}

export function DispatchDrawerPortal({
  open,
  onClose,
  children,
  drawerScope = 'all',
}: DispatchDrawerPortalProps) {
  if (!open) {
    return null;
  }

  // `drawerScope` es el único alcance responsive de la capa: en `mobile` el
  // panel de despacho ya vive maquetado en el rail a partir de `xl`, así que la
  // capa modal debe desaparecer ahí en vez de duplicarlo. Es exactamente el uso
  // que el contrato reserva a `className` (alcance responsive y padding).
  return (
    <ModalLayer
      align="end"
      onVeilClick={onClose}
      {...(drawerScope === 'mobile' ? { className: 'xl:hidden' } : {})}
    >
      {children}
    </ModalLayer>
  );
}
