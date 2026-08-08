/**
 * eslint.config.js — Configuracion ESLint v9 raiz (flat config)
 *
 * Las reglas sintácticas se aplican a todo TypeScript. Las que requieren tipos
 * se limitan a código fuente con tsconfig para conservar los lint focalizados.
 */
import tsParser from '@typescript-eslint/parser';
import tsEslintPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';

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
    plugins: {
      '@typescript-eslint': tsEslintPlugin,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
      },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // E2E queda fuera: no tiene un tsconfig type-aware en el baseline actual.
    files: [
      'apps/*/src/**/*.ts',
      'apps/*/src/**/*.tsx',
      'packages/*/src/**/*.ts',
      'packages/*/src/**/*.tsx',
    ],
    ignores: [
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.integration.spec.ts',
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Deuda de baseline: el informe de remediación registra el rollout a error.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
    },
  },
];
