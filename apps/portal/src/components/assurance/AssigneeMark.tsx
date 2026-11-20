'use client';

import { getInitials } from '@iwana/shared';
import { cn } from '@iwana/ui';
import {
  ASSURANCE_UNASSIGNED_LABEL,
  ASSURANCE_UNAVAILABLE_ASSIGNEE_LABEL,
} from './assurance-labels';

export interface AssigneeMarkProps {
  /** Nombre, «Sin asignar» o «Responsable no disponible» (`getAssuranceAssigneeLabel`). */
  label: string;
  /** `xs` para filas densas (alto de línea 20 px); `sm` para la bandeja. */
  size?: 'xs' | 'sm' | undefined;
  /** Texto accesible previo al nombre (p. ej. «Responsable:»); vacío si la fila ya lo dice. */
  srPrefix?: string | undefined;
  className?: string | undefined;
  /** Muestra el nombre junto al círculo, truncado con elipsis (bandeja de Mesa de ayuda). */
  showName?: boolean | undefined;
}

const sizeClassName = {
  xs: 'h-5 w-5 text-[10px]',
  sm: 'h-7 w-7 text-xs',
} as const;

/**
 * Responsable como iniciales en círculo (spec 2026-11-20 asignación visible, bloque B). El nombre
 * completo va como texto accesible y como `title`; sin responsable, círculo punteado vacío. Las
 * iniciales son decorativas: el lector de pantalla oye el rótulo completo una sola vez.
 *
 * Local a Mesa de ayuda: `Avatar` de `@iwana/ui` no tiene tamaño de 20 px ni variante «vacío»;
 * queda reportado a ds-owner para consolidar si otra superficie lo necesita.
 */
export function AssigneeMark({
  label,
  size = 'sm',
  srPrefix,
  className,
  showName = false,
}: AssigneeMarkProps) {
  const unassigned = label === ASSURANCE_UNASSIGNED_LABEL;
  const unavailable = label === ASSURANCE_UNAVAILABLE_ASSIGNEE_LABEL;
  const initials = unassigned ? '' : unavailable ? '?' : getInitials(label);

  return (
    <span
      data-testid="assignee-mark"
      title={label}
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5',
        showName ? 'max-w-full' : 'shrink-0',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none',
          sizeClassName[size],
          unassigned
            ? 'border border-dashed border-gray-400 dark:border-gray-500'
            : unavailable
              ? 'bg-gray-100 text-gray-700 dark:bg-dark-surface-3 dark:text-gray-200'
              : 'bg-iwana-primary-100 text-iwana-primary-700 dark:bg-iwana-primary-900 dark:text-iwana-primary-100',
        )}
      >
        {initials}
      </span>
      {srPrefix ? <span className="sr-only">{srPrefix} </span> : null}
      <span
        className={
          showName ? 'min-w-0 truncate text-sm text-gray-700 dark:text-gray-200' : 'sr-only'
        }
      >
        {label}
      </span>
    </span>
  );
}
