'use client';

import type { ReactNode } from 'react';
import { cn } from '@iwana/ui';

interface SettingsTabPanelProps {
  id: string;
  labelledBy: string;
  isActive: boolean;
  children: ReactNode;
  className?: string;
}

export function SettingsTabPanel({
  id,
  labelledBy,
  isActive,
  children,
  className,
}: SettingsTabPanelProps) {
  return (
    <section
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      hidden={!isActive}
      className={cn('space-y-6', !isActive && 'hidden', className)}
    >
      {/*
        Los paneles inactivos no deben montar su contenido.
        Esto evita inicializar componentes sensibles al layout oculto (ej. Leaflet)
        dentro de contenedores con display:none, lo que provoca errores de ciclo de vida
        y reuso inválido de contenedores al cambiar de pestaña.
      */}
      {isActive ? children : null}
    </section>
  );
}
