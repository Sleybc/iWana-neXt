// packages/ui/src/components/Button.tsx
'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

/**
 * Componente Button del sistema de diseño iWana neXt.
 * Variantes: primary, secondary, ghost, destructive, link.
 * ADR-026: shadcn/ui + CVA.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50 dark:focus-visible:ring-offset-dark-surface-2 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Light: azul noche (#17163A) con texto blanco.
        // Dark: violeta medio (#534FD4, primary-400) con texto blanco — contraste 3.8:1 sobre #222 (WCAG AA para componentes UI).
        primary:
          'rounded-full bg-iwana-primary text-white shadow-sm hover:bg-iwana-primary-600 focus-visible:ring-iwana-primary active:bg-iwana-primary-800 dark:bg-iwana-primary-400 dark:hover:bg-iwana-primary-300 dark:active:bg-iwana-primary-500',
        // Light: borde+texto azul noche, fondo transparente.
        // Dark: borde+texto violeta claro (#7E7BDF, primary-300) — contraste 5.1:1 sobre #222.
        secondary:
          'rounded-full border border-iwana-primary/25 bg-white text-iwana-primary hover:border-iwana-primary hover:bg-iwana-primary-50 focus-visible:ring-iwana-primary active:bg-iwana-primary-100 dark:border-iwana-primary-300/40 dark:bg-dark-surface-2 dark:text-iwana-primary-300 dark:hover:border-iwana-primary-300 dark:hover:bg-dark-surface-3',
        outline:
          'rounded-xl border border-gray-300 bg-white hover:bg-gray-100 hover:text-gray-900 dark:border-dark-border-2 dark:bg-dark-surface-3 dark:hover:bg-dark-surface-2 dark:text-white dark:hover:text-gray-50 focus-visible:ring-iwana-primary',
        // Dark: texto e icono en gris claro visible.
        ghost:
          'rounded-full text-gray-700 hover:bg-gray-100 focus-visible:ring-iwana-primary dark:text-gray-300 dark:hover:bg-dark-surface-3',
        // Rojo funciona bien en ambos modos — aclarar hover en dark.
        destructive:
          'rounded-full bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-600 active:bg-red-800 dark:bg-red-500 dark:hover:bg-red-400',
        softDestructive:
          'rounded-full border border-red-200 bg-white text-red-600 hover:bg-red-50 focus-visible:ring-red-500 active:bg-red-100 dark:border-red-500/30 dark:bg-dark-surface-2 dark:text-red-300 dark:hover:bg-red-500/10 dark:active:bg-red-500/20',
        // Dark: usar secondary (#A5C330) que tiene 6.1:1 sobre #222 — contraste excelente.
        link: 'rounded-none p-0 h-auto text-iwana-secondary-700 underline-offset-4 hover:underline focus-visible:ring-iwana-secondary-700 dark:text-iwana-secondary',
      },
      size: {
        sm: 'h-8 px-3.5 text-xs',
        default: 'h-10 px-5 py-2',
        lg: 'h-12 px-7 text-base',
        icon: 'h-10 w-10 rounded-full p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, children, disabled, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading ? (
          <>
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
