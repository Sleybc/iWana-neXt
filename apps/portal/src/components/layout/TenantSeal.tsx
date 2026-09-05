'use client';

import { useEffect, useState } from 'react';
import { cn } from '@iwana/ui';
import { getTenantInitials } from '@iwana/shared';

interface TenantSealProps {
  sealLightUrl: string | null;
  sealDarkUrl: string | null;
  /** Nombre comercial del tenant — usado para generar iniciales del fallback */
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-16 h-16 text-xl',
} as const;

/**
 * Muestra el sello del tenant con fallback de iniciales.
 *
 * Identidad de tenant, no de persona: fuera de `Avatar` por contrato
 * (docs/specs/2026-09-04-contrato-avatar.md §8). El cómputo de iniciales se
 * comparte con `TenantCreateSummary` (web) vía `getTenantInitials`.
 *
 * - Si hay URL configurada → imagen con la variante correcta según dark mode.
 * - Si la imagen falla o no hay URL → cuadrado con iniciales en colores iWana
 *   (idéntico al "iW" actual del sidebar para una transición natural).
 *
 * Reutilizable en sidebar, documentos, login y cualquier punto que necesite
 * representar la identidad compacta del tenant.
 */
export function TenantSeal({
  sealLightUrl,
  sealDarkUrl,
  name,
  size = 'sm',
  className,
}: TenantSealProps) {
  const [isDark, setIsDark] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Detectar dark mode observando la clase 'dark' en el elemento html
  useEffect(() => {
    const html = document.documentElement;
    const update = () => setIsDark(html.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Resetear error si cambian las URLs
  useEffect(() => {
    setImgError(false);
  }, [sealLightUrl, sealDarkUrl]);

  // Elegir variante según modo; usar la única disponible si falta la otra
  const activeUrl = isDark ? (sealDarkUrl ?? sealLightUrl) : (sealLightUrl ?? sealDarkUrl);

  const sizeClass = SIZE_CLASSES[size];

  if (activeUrl && !imgError) {
    return (
      <img
        src={activeUrl}
        alt={`Sello de ${name}`}
        onError={() => setImgError(true)}
        className={cn(sizeClass, 'shrink-0 rounded-md object-contain', className)}
      />
    );
  }

  // Fallback: iniciales con colores iWana — idéntico al "iW" actual del sidebar
  return (
    <div
      aria-hidden="true"
      className={cn(
        sizeClass,
        'shrink-0 rounded-md bg-iwana-secondary flex items-center justify-center',
        className,
      )}
    >
      <span className="text-iwana-primary font-bold leading-none">{getTenantInitials(name)}</span>
    </div>
  );
}
