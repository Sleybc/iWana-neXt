/**
 * eslint.config.js — Configuracion ESLint v9 raiz (flat config)
 *
 * Sprint 0 — Parser TypeScript habilitado, sin reglas adicionales.
 * Reglas estrictas por dominio se configuran en Sprint 1 por paquete.
 *
 * Referencias:
 * - packages/config/.eslintrc.base.js (reglas base - migrar a flat config en Sprint 1)
 * - ADR a definir Sprint 1 (ESLint flat config por paquete)
 */
import tsParser from '@typescript-eslint/parser';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    // Ignorar artefactos de build y dependencias en todos los paquetes
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/build/**',
    ],
  },
  {
    // Configurar parser TypeScript para todos los archivos .ts y .tsx
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        // Sin project para evitar overhead en scaffold — proyecto real en Sprint 1
        sourceType: 'module',
      },
    },
    // Sin reglas en Sprint 0 — 0 errores garantizados
    rules: {},
  },
];
