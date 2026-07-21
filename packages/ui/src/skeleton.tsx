import { cn } from './lib/utils';

export interface SkeletonBlockProps {
  className?: string | undefined;
}

/**
 * Placeholder de carga decorativo (animate-pulse).
 * Sobreescribir tamaño/forma con `className` desde el consumidor.
 */
export function SkeletonBlock({ className }: SkeletonBlockProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3', className)}
    />
  );
}
