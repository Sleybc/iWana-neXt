// packages/ui/src/components/SectionHeader.tsx
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { FormSectionTitle } from './FormSection';

export interface SectionHeaderProps {
  /** Icono de la caja. Se renderiza con `aria-hidden`. */
  icon: LucideIcon;
  /** Eyebrow via `FormSectionTitle` (fuente unica, no reimplementado). */
  eyebrow?: string;
  /** Titulo. Envuelve, no trunca. */
  title: ReactNode;
  /** Obligatorio y sin default: el orden de encabezados es decision de a11y. */
  headingLevel: 2 | 3;
  description?: ReactNode;
  /** `md`: caja 48px, titulo `text-lg`, icono 20px. `sm`: 44px, `text-sm`, 16px. */
  size?: 'md' | 'sm';
  /** `primary`: tinta primaria. `secondary`: tinta secundaria AA sobre blanco. */
  tone?: 'primary' | 'secondary';
  actions?: ReactNode;
  className?: string;
}

const titleClassBySize = {
  md: 'text-lg font-semibold text-gray-900 dark:text-white',
  sm: 'text-sm font-semibold text-gray-900 dark:text-white',
} as const;

const boxClassBySize = {
  md: 'h-12 w-12',
  sm: 'h-11 w-11',
} as const;

const iconClassBySize = {
  md: 'h-5 w-5',
  sm: 'h-4 w-4',
} as const;

const boxClassByTone = {
  primary:
    'bg-iwana-primary/10 text-iwana-primary dark:bg-iwana-primary/20 dark:text-iwana-primary-300',
  secondary:
    'bg-iwana-secondary-100 text-iwana-secondary-700 dark:bg-iwana-secondary-900/30 dark:text-iwana-secondary-300',
} as const;

/**
 * Encabezado de seccion de tarjeta: caja de icono + eyebrow + titulo +
 * descripcion + acciones. No interactivo; sin estados hover/focus/disabled.
 * Radio `rounded-xl` de la escala vigente; descripcion unificada
 * `text-gray-500 dark:text-gray-400`.
 */
export function SectionHeader({
  icon: Icon,
  eyebrow,
  title,
  headingLevel,
  description,
  size = 'md',
  tone = 'primary',
  actions,
  className,
}: SectionHeaderProps) {
  const TitleTag = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <div className={cn('flex items-start gap-4', className)}>
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-xl',
          boxClassBySize[size],
          boxClassByTone[tone],
        )}
      >
        <Icon className={iconClassBySize[size]} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        {eyebrow ? <FormSectionTitle>{eyebrow}</FormSectionTitle> : null}
        <TitleTag className={titleClassBySize[size]}>{title}</TitleTag>
        {description ? (
          <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}
