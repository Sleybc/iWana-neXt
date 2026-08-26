'use client';

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@iwana/ui';

export type DispatchDrawerScope = 'mobile' | 'all';

interface DispatchDrawerPortalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  drawerScope?: DispatchDrawerScope;
  overlayLabel?: string;
}

export function DispatchDrawerPortal({
  open,
  onClose,
  children,
  drawerScope = 'all',
  overlayLabel = 'Cerrar panel de despacho',
}: DispatchDrawerPortalProps) {
  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-(--z-drawer) flex justify-end',
        drawerScope === 'mobile' && 'xl:hidden',
      )}
    >
      <button
        type="button"
        aria-label={overlayLabel}
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={onClose}
      />
      {children}
    </div>,
    document.body,
  );
}
