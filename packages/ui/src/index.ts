/**
 * @iwana/ui — Sistema de diseno iWana neXt.
 *
 * Sprint 0 — Scaffold: solo design tokens.
 * Componentes React (Button, Input, Card, etc.) se implementan
 * en Sprint 1 Semana 3-4 con shadcn/ui + Radix Primitives + CVA.
 *
 * Referencias:
 * - ADR-026: shadcn/ui + Radix Primitives + Tailwind + CVA
 * - docs/identity/ (brand guidelines iWana)
 */

// Design tokens
export * from './tokens';

// Utilidades
export * from './lib/utils';

// Componentes
export * from './components/Button';
export * from './components/Input';
export * from './components/Card';
export * from './components/Badge';
export * from './components/OtpInput';

// Providers
export * from './components/ThemeProvider';
