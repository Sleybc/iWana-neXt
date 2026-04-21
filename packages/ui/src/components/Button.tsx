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
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Light: azul noche (#17163A) con texto blanco.
        // Dark: violeta medio (#534FD4, primary-400) con texto blanco — contraste 3.8:1 sobre #222 (WCAG AA para componentes UI).
        primary:
          'bg-iwana-primary text-white hover:bg-iwana-primary-600 focus-visible:ring-iwana-primary active:bg-iwana-primary-800 dark:bg-iwana-primary-400 dark:hover:bg-iwana-primary-300 dark:active:bg-iwana-primary-500',
        // Light: borde+texto azul noche, fondo transparente.
        // Dark: borde+texto violeta claro (#7E7BDF, primary-300) — contraste 5.1:1 sobre #222.
        secondary:
          'border-2 border-iwana-primary text-iwana-primary bg-transparent hover:bg-iwana-primary hover:text-white focus-visible:ring-iwana-primary dark:border-iwana-primary-300 dark:text-iwana-primary-300 dark:hover:bg-iwana-primary-400 dark:hover:border-iwana-primary-400 dark:hover:text-white',
        outline:
          'border border-gray-300 bg-white hover:bg-gray-100 hover:text-gray-900 border-gray-300 dark:border-dark-border-2 dark:bg-dark-surface-3 dark:hover:bg-dark-surface-2 dark:text-white dark:hover:text-gray-50 focus-visible:ring-iwana-primary',
        // Dark: texto e icono en gris claro visible.
        ghost:
          'text-gray-700 hover:bg-gray-100 focus-visible:ring-iwana-primary dark:text-gray-300 dark:hover:bg-dark-surface-3',
        // Rojo funciona bien en ambos modos — aclarar hover en dark.
        destructive:
          'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600 active:bg-red-800 dark:bg-red-500 dark:hover:bg-red-400',
        // Dark: usar secondary (#A5C330) que tiene 6.1:1 sobre #222 — contraste excelente.
        link: 'text-iwana-secondary-700 underline-offset-4 hover:underline focus-visible:ring-iwana-secondary-700 p-0 h-auto dark:text-iwana-secondary',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        default: 'h-10 px-6 py-2',
        lg: 'h-12 px-8 text-base',
        icon: 'h-10 w-10',
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
