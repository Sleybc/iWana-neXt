/**
 * eslint.config.js — Configuracion ESLint v9 raiz (flat config)
 *
 * Las reglas sintácticas se aplican a todo TypeScript. Las que requieren tipos
 * se limitan a código fuente con tsconfig para conservar los lint focalizados.
 */
import tsParser from '@typescript-eslint/parser';
import tsEslintPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';

const rechartsRestriction = {
  name: 'recharts',
  message: 'Recharts solo se importa en packages/ui/src/chart (ADR-112 D2): usa Chart/PortalChart.',
};
const rechartsSubpathRestriction = {
  group: ['recharts/*'],
  message: 'Recharts solo se importa en packages/ui/src/chart (ADR-112 D2): usa Chart/PortalChart.',
};

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
    // ADR-112 D2: Recharts solo en la entrada `@iwana/ui/chart` (packages/ui/src/chart/**).
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['packages/ui/src/chart/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { paths: [rechartsRestriction], patterns: [rechartsSubpathRestriction] },
      ],
    },
  },
  {
    // ADR-112 D4: en las apps, `@iwana/ui/chart` solo por `import()` dinámico (PortalChart/WebChart) o `import type`.
    // Este bloque reemplaza la regla del anterior para apps/**: repite la restricción de Recharts.
    files: ['apps/**/*.ts', 'apps/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            rechartsRestriction,
            {
              name: '@iwana/ui/chart',
              allowTypeImports: true,
              message:
                'Carga diferida obligatoria (ADR-112 D4): usa PortalChart (portal) o WebChart (web) de components/shared/.',
            },
          ],
          patterns: [rechartsSubpathRestriction],
        },
      ],
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
      '**/*.fixture.ts',
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
