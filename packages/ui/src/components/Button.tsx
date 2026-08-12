// packages/ui/src/components/Button.tsx
'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

/**
 * Componente Button del sistema de diseño iWana neXt.
 * Variantes: primary (CTA de página y acción de sección/modal — Firma enmienda CTO 2026-07-23),
 * lime (marca/auth/avance explícito; no es el default de header/empty operativo),
 * secondary/outline/ghost, destructive, link.
 * ADR-026: shadcn/ui + CVA. Spec Firma: azul noche = acción principal de página y sección;
 * lima = avance/éxito/completitud fuera del botón filled operativo de listados.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:cursor-not-allowed dark:focus-visible:ring-iwana-primary-300 dark:focus-visible:ring-offset-dark-surface-2 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Marca / auth / avance explícito — no es el CTA default de página (enmienda CTO 2026-07-23).
        // Light: lima AA fondo secondary-700 + texto blanco.
        lime: 'rounded-full bg-iwana-secondary-700 text-white shadow-sm hover:bg-iwana-secondary-700/90 focus-visible:ring-iwana-secondary-700 active:bg-iwana-secondary-800 disabled:bg-gray-200 disabled:text-gray-500 dark:bg-iwana-secondary dark:text-iwana-primary dark:hover:bg-iwana-secondary-400 dark:focus-visible:ring-iwana-secondary dark:disabled:bg-dark-surface-3 dark:disabled:text-gray-400',
        // Light: azul noche (#17163A) — CTA de página y acciones de sección/modal.
        // Dark: violeta medio (iwana-primary-500, #5A5190) con texto blanco — contraste ~7:1 (WCAG AA 4.5:1).
        // El #534FD4 del comentario anterior era un hex obsoleto: la rampa real en globals.css es
        // 400=#7B75AB, 500=#5A5190, 600=#4A4176. El 400 medía 4.22:1 con blanco — incumplía AA.
        primary:
          'rounded-full bg-iwana-primary text-white shadow-sm hover:bg-iwana-primary-600 focus-visible:ring-iwana-primary active:bg-iwana-primary-800 disabled:bg-gray-200 disabled:text-gray-500 dark:bg-iwana-primary-500 dark:hover:bg-iwana-primary-400 dark:active:bg-iwana-primary-600 dark:disabled:bg-dark-surface-3 dark:disabled:text-gray-400',
        // Light: borde+texto azul noche, fondo transparente.
        // Dark: borde+texto violeta claro (#7E7BDF, primary-300) — contraste 5.1:1 sobre #222.
        secondary:
          'rounded-full border border-iwana-primary/25 bg-white text-iwana-primary hover:border-iwana-primary hover:bg-iwana-primary-50 focus-visible:ring-iwana-primary active:bg-iwana-primary-100 disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 dark:border-iwana-primary-300/40 dark:bg-dark-surface-2 dark:text-iwana-primary-300 dark:hover:border-iwana-primary-300 dark:hover:bg-dark-surface-3 dark:disabled:border-dark-border dark:disabled:bg-dark-surface-3 dark:disabled:text-gray-400',
        outline:
          'rounded-xl border border-gray-300 bg-white hover:bg-gray-100 hover:text-gray-900 disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 dark:border-dark-border-2 dark:bg-dark-surface-3 dark:hover:bg-dark-surface-2 dark:text-white dark:hover:text-gray-50 dark:disabled:border-dark-border dark:disabled:bg-dark-surface-3 dark:disabled:text-gray-400 focus-visible:ring-iwana-primary',
        // Dark: texto e icono en gris claro visible.
        ghost:
          'rounded-full text-gray-700 hover:bg-gray-100 focus-visible:ring-iwana-primary disabled:text-gray-400 dark:text-gray-300 dark:hover:bg-dark-surface-3 dark:disabled:text-gray-400',
        // Rojo funciona bien en ambos modos — aclarar hover en dark.
        destructive:
          'rounded-full bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-600 active:bg-red-800 disabled:bg-red-100 disabled:text-red-400 dark:bg-red-500 dark:hover:bg-red-400 dark:disabled:bg-dark-surface-3 dark:disabled:text-red-400',
        softDestructive:
          'rounded-full border border-red-200 bg-white text-red-600 hover:bg-red-50 focus-visible:ring-red-500 active:bg-red-100 disabled:border-red-100 disabled:bg-red-50 disabled:text-red-300 dark:border-red-500/30 dark:bg-dark-surface-2 dark:text-red-300 dark:hover:bg-red-500/10 dark:active:bg-red-500/20 dark:disabled:border-dark-border dark:disabled:bg-dark-surface-3 dark:disabled:text-red-400',
        // Dark: usar secondary (#A5C330) que tiene 6.1:1 sobre #222 — contraste excelente.
        link: 'rounded-none h-auto p-0 text-iwana-secondary-700 underline-offset-4 hover:underline focus-visible:ring-iwana-secondary-700 disabled:text-gray-400 disabled:no-underline dark:text-iwana-secondary-400 dark:disabled:text-gray-400',
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
