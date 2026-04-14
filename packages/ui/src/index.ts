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
export * from './components/Select';
export * from './components/FormField';
export * from './components/Card';
export * from './components/Badge';
export * from './components/OtpInput';
export * from './components/Dialog';
export * from './components/SectionAccordion';
export * from './components/ProgressMeter';

// Providers
export * from './components/ThemeProvider';

// Shell compartido
export * from './components/ThemeToggle';
