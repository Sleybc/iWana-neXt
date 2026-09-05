// packages/ui/src/components/Avatar.tsx
'use client';

import { useState } from 'react';
import { User } from 'lucide-react';
import { getInitials } from '@iwana/shared';
import { cn } from '../lib/utils';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';
export type AvatarVariant = 'default' | 'soft';

export interface AvatarProps {
  /**
   * Nombre visible completo, ya compuesto con `formatFullName`.
   * Alimenta iniciales y nombre accesible. Nunca email (contrato §5).
   */
  name: string;
  /** URL de imagen. `null`/`undefined`/`''`/solo-blancos → sin imagen. */
  avatarUrl?: string | null | undefined;
  /** Escala cerrada contra clases vigentes (contrato §6). */
  size?: AvatarSize | undefined;
  /** `default`: fondo de marca pleno. `soft`: tintado para triggers y cabeceras. */
  variant?: AvatarVariant | undefined;
  /**
   * Cuando el nombre visible ya está junto al avatar, el contenedor es
   * decorativo (`aria-hidden`). Solo cuando el avatar va solo (sin este prop)
   * se usa `role="img"` + `aria-label` (contrato §7, sin tercera opción).
   */
  labelledById?: string | undefined;
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-xl',
  xl: 'h-20 w-20 text-2xl',
};

const iconClasses: Record<AvatarSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-8 w-8',
  xl: 'h-10 w-10',
};

const variantClasses: Record<AvatarVariant, string> = {
  default: 'bg-iwana-primary text-white',
  soft: 'bg-iwana-primary-100 text-iwana-primary-700',
};

/**
 * Avatar de persona: imagen válida > iniciales (1–2 grafemas) > icono `User`.
 * Contrato: docs/specs/2026-09-04-contrato-avatar.md v1.0.
 *
 * Client Component: el fallback de imagen rota usa `useState`, y el barrel
 * `@iwana/ui` se importa desde layouts RSC (portal y web); sin `'use client'`
 * Next.js trata este módulo como Server Component y el compile falla.
 *
 * Siempre circular (`rounded-full`), sin punto de presencia ni badge acoplado.
 * El foco visible lo aporta el trigger padre, nunca un anillo propio.
 */
export function Avatar({
  name,
  avatarUrl,
  size = 'md',
  variant = 'default',
  labelledById,
}: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const cleanUrl = avatarUrl?.trim() ? avatarUrl.trim() : null;
  const showImage = cleanUrl !== null && !imgFailed;
  const initials = getInitials(name);
  const decorative = labelledById !== undefined;
  const accessibleName = name.trim() ? `Avatar de ${name.trim()}` : 'Avatar de usuario sin nombre';

  return (
    <div
      {...(decorative
        ? { 'aria-hidden': true as const }
        : { role: 'img' as const, 'aria-label': accessibleName })}
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        sizeClasses[size],
        variantClasses[variant],
      )}
    >
      {showImage ? (
        <img
          src={cleanUrl}
          alt={decorative ? '' : name.trim()}
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : initials ? (
        <span aria-hidden="true" className="font-semibold leading-none select-none">
          {initials}
        </span>
      ) : (
        <User aria-hidden="true" className={iconClasses[size]} />
      )}
    </div>
  );
}
