import { cva } from 'class-variance-authority';
import { cn } from '../lib/utils';

/**
 * Patrón tonal compartido (U-4, contrato DS 2026-11-21 §2; escala warning por U-5 §6).
 * Superficie: tinte -50 en claro y -500 al 15 % en oscuro. `progress` (lima) no es un tono.
 */
export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'error';

export const toneSurfaceVariants = cva('', {
  variants: {
    tone: {
      neutral:
        'border-gray-200 bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-3',
      primary:
        'border-iwana-primary/20 bg-iwana-primary-50 dark:border-iwana-primary-400/30 dark:bg-iwana-primary-800/50',
      success:
        'border-success-500/20 bg-success-50 dark:border-success-500/30 dark:bg-success-500/15',
      warning:
        'border-warning-500/20 bg-warning-50 dark:border-warning-500/30 dark:bg-warning-500/15',
      error: 'border-error-500/20 bg-error-50 dark:border-error-500/30 dark:bg-error-500/15',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export const toneTextVariants = cva('', {
  variants: {
    tone: {
      neutral: 'text-gray-600 dark:text-gray-400',
      primary: 'text-iwana-primary dark:text-iwana-primary-200',
      success: 'text-success-700 dark:text-success-400',
      warning: 'text-warning-700 dark:text-warning-400',
      error: 'text-error-700 dark:text-error-400',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

/** Intensidad de relleno para escalas ordinales (contrato DS v1.1 §5.5). */
export type FillEmphasis = 'soft' | 'default' | 'strong';

const toneFillBaseVariants = cva('', {
  variants: {
    tone: {
      neutral: 'bg-gray-400 dark:bg-gray-500',
      primary: 'bg-iwana-primary',
      success: 'bg-success-500',
      warning: 'bg-warning-500',
      error: 'bg-error-500',
    },
    emphasis: {
      soft: '',
      default: '',
      strong: '',
    },
  },
  // Solo donde la tabla §5.5 da un valor distinto de `default`.
  compoundVariants: [
    { tone: 'primary', emphasis: 'soft', className: 'bg-iwana-primary-400' },
    { tone: 'primary', emphasis: 'strong', className: 'dark:bg-iwana-primary-300' },
    { tone: 'warning', emphasis: 'soft', className: 'bg-warning-400' },
    { tone: 'warning', emphasis: 'strong', className: 'bg-warning-600' },
    { tone: 'error', emphasis: 'soft', className: 'bg-error-400' },
    { tone: 'error', emphasis: 'strong', className: 'bg-error-600' },
  ],
  defaultVariants: { tone: 'neutral', emphasis: 'default' },
});

/** Relleno de punto o tramo; `cn` resuelve el cruce entre el valor base y el de `emphasis`. */
export function toneFillVariants(
  opts: { tone?: Tone | null | undefined; emphasis?: FillEmphasis | null | undefined } = {},
): string {
  return cn(toneFillBaseVariants(opts));
}

/** Texto atenuado sobre una superficie tonal (contrato DS v1.1 §2.1). */
export const toneMutedTextVariants = cva('', {
  variants: {
    tone: {
      neutral: 'text-gray-500 dark:text-gray-400',
      primary: 'text-gray-500 dark:text-gray-400',
      success: 'text-gray-700 dark:text-gray-200',
      warning: 'text-gray-700 dark:text-gray-200',
      error: 'text-gray-700 dark:text-gray-200',
    },
  },
  defaultVariants: { tone: 'neutral' },
});
