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
export { headerIconControlClassName, interactiveFocusClassName } from './focus';
export { SkeletonBlock } from './skeleton';
export type { SkeletonBlockProps } from './skeleton';

// Componentes
export * from './components/Button';
export * from './components/Input';
export * from './components/CheckboxCard';
export * from './components/Select';
export * from './components/FormField';
export * from './components/FormSection';
export * from './components/FormStatus';
export * from './components/SectionHeader';
export * from './components/Card';
export * from './components/Badge';
export * from './components/Alert';
export * from './components/OtpInput';
export * from './components/Dialog';
export * from './components/Tabs';
export * from './components/DropdownMenu';
export * from './components/SectionAccordion';
export * from './components/ProgressMeter';
export * from './components/OperationalSidePeek';
export * from './components/Popover';
export * from './components/Calendar';
export * from './components/DatePicker';
export * from './components/MultiSelect';
export * from './components/SearchHighlight';

// Providers
export * from './theme-bootstrap';
export * from './components/ThemeProvider';

// Shell compartido
export * from './components/ThemeToggle';

// Auth premium compartido
export * from './components/auth/AuthPremiumShell';
export * from './components/auth/AuthBrandHeader';
export * from './components/auth/auth-form-styles';
