// packages/ui/src/components/Card.tsx
import * as React from 'react';
import { cn } from '../lib/utils';

/**
 * Componente Card del sistema de diseño iWana neXt.
 * Variantes: default (blanco), glass (glassmorphism sobre oscuro) y outline
 * (borde sin sombra, para tablas y cabeceras; contrato DS 2026-11-21 §5.1).
 */

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'glass' | 'outline' }
>(({ className, variant = 'default', ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-2xl',
      variant === 'default' &&
        'bg-white shadow-iwana-card dark:bg-dark-surface-2 dark:shadow-none dark:border dark:border-dark-border-2',
      variant === 'glass' && 'bg-white/10 backdrop-blur-md border border-white/20',
      variant === 'outline' &&
        'border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-2',
      className,
    )}
    {...props}
  />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn(
        'text-lg font-semibold leading-none tracking-tight text-iwana-primary dark:text-white/90',
        className,
      )}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardContent, CardFooter };
