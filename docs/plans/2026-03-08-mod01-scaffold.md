# MOD01 Scaffold — Plan de Implementación

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Monorepo Turborepo funcional con apps scaffoldeados, infraestructura Docker dev operativa, CI básico en GitHub Actions y design tokens iWana integrados — base técnica para Sprint 1.

**Architecture:** Monorepo pnpm workspaces + Turborepo con cuatro apps (api, web, portal, worker) y cuatro packages (shared, database, config, ui). Todos los apps vacíos pero compilando con TypeScript strict. Docker stack completo (PostgreSQL + Redis + MinIO + pgBouncer + Nginx + Adminer). No hay lógica de negocio en esta fase.

**Tech Stack:** Node 24.13.1 LTS, pnpm 10.30.3 (Corepack), Turborepo 2.x, NestJS 11.1.14, Next.js 16.1.6, TypeScript 5.9, Tailwind 4.x (CSS-first), Zod 4.x, PostgreSQL 16, Redis 8.x
**Referencias:** `docs/prompts/PROMPT-MOD01-SCAFFOLD-v1.0.md`, `docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md` (Sección 7), `docs/prds/Stack_Tecnologico.md`
**Documentación verificada vía:** Context7 MCP — Tailwind CSS, Next.js v16.1.6, Turborepo, NestJS, Zod v4, pnpm

> ✅ **Stack actualizado al latest verificado (2026-03-08):** Tailwind 4 usa configuración CSS-first (`@theme {}`, `@import "tailwindcss"`, sin `tailwind.config.js`). Next.js 16 introduce `cacheComponents`. pnpm 10 usa Corepack. Zod 4 depreca `z.string().email()` → usar `z.email()`. Node 24 LTS en todos los Dockerfiles.

---

## Task 1: Inicializar repositorio git y estructura raíz

**Files:**

- Create: `.gitignore`
- Create: `package.json` (raíz)
- Create: `pnpm-workspace.yaml`

**Step 1: Inicializar git y configurar repositorio**

```bash
cd c:/appiw
git init
git branch -M main
```

Resultado esperado: `Initialized empty Git repository in c:/appiw/.git/`

**Step 2: Verificar versión de node y activar pnpm via Corepack**

```bash
node --version   # Debe ser v24.x.x
```

Activar pnpm 10 via Corepack (recomendado — viene incluido con Node 24):

```bash
corepack enable
corepack install -g pnpm@latest-10
pnpm --version   # Debe ser 10.x.x
```

Si Corepack no está disponible: `npm install -g pnpm@10`

**Step 3: Crear package.json raíz**

Crear `c:/appiw/package.json`:

```json
{
  "name": "iwana-next",
  "private": true,
  "version": "0.1.0",
  "description": "iWana neXt — ISP/OSS/BSS/NMS Platform Colombia",
  "engines": {
    "node": ">=24.0.0",
    "pnpm": ">=10.0.0"
  },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean && rm -rf node_modules"
  },
  "devDependencies": {
    "turbo": "latest",
    "typescript": "^5.9.0",
    "@commitlint/cli": "^19.0.0",
    "@commitlint/config-conventional": "^19.0.0",
    "husky": "^9.0.0",
    "lint-staged": "^15.0.0",
    "prettier": "^3.0.0"
  }
}
```

**Step 4: Crear pnpm-workspace.yaml**

Crear `c:/appiw/pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"

# pnpm 10: especifica versión de Node para el workspace
useNodeVersion: 24.13.1
```

**Step 5: Crear .gitignore**

Crear `c:/appiw/.gitignore`:

```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build outputs
dist/
.next/
.turbo/
build/
out/

# Env files
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Secrets — NUNCA versionar claves RSA ni encryption keys
secrets/
*.pem
*.key
*.p12

# Logs
*.log
npm-debug.log*
pnpm-debug.log*

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/

# Testing
coverage/

# Turbo
.turbo/
```

**Step 6: Instalar dependencias raíz**

```bash
cd c:/appiw
pnpm install
```

Resultado esperado: lockfile creado en `pnpm-lock.yaml`

**Step 7: Verificar**

```bash
ls c:/appiw
# Debe mostrar: package.json, pnpm-workspace.yaml, .gitignore, pnpm-lock.yaml, node_modules/, docs/
```

---

## Task 2: Instalar y configurar Turborepo

**Files:**

- Create: `turbo.json`

**Step 1: Crear turbo.json**

Crear `c:/appiw/turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "typecheck": {
      "dependsOn": ["^typecheck"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

**Step 2: Verificar que turbo está instalado**

```bash
cd c:/appiw
pnpm exec turbo --version
```

Resultado esperado: versión de turbo (2.x.x)

---

## Task 3: Crear packages/config (TypeScript + ESLint + Prettier base)

**Files:**

- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.base.json`
- Create: `packages/config/tsconfig.nestjs.json`
- Create: `packages/config/tsconfig.nextjs.json`
- Create: `packages/config/.eslintrc.base.js`
- Create: `packages/config/prettier.config.js`

**Step 1: Crear estructura del paquete**

```bash
mkdir -p c:/appiw/packages/config
```

**Step 2: Crear packages/config/package.json**

```json
{
  "name": "@iwana/config",
  "version": "0.1.0",
  "private": true,
  "description": "Configuración compartida de TypeScript, ESLint y Prettier para iWana neXt",
  "exports": {
    "./tsconfig/base": "./tsconfig.base.json",
    "./tsconfig/nestjs": "./tsconfig.nestjs.json",
    "./tsconfig/nextjs": "./tsconfig.nextjs.json",
    "./eslint/base": "./.eslintrc.base.js",
    "./prettier": "./prettier.config.js"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "eslint-config-prettier": "^9.0.0",
    "typescript": "^5.9.0"
  }
}
```

**Step 3: Crear tsconfig.base.json**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "exclude": ["node_modules", "dist", "build", "coverage"]
}
```

**Step 4: Crear tsconfig.nestjs.json**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "paths": {
      "@iwana/shared": ["../../packages/shared/src/index.ts"],
      "@iwana/db": ["../../packages/database/src/index.ts"],
      "@iwana/config": ["../../packages/config/index.ts"]
    }
  }
}
```

**Step 5: Crear tsconfig.nextjs.json**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"],
      "@iwana/ui": ["../../packages/ui/src/index.ts"],
      "@iwana/shared": ["../../packages/shared/src/index.ts"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**Step 6: Crear .eslintrc.base.js**

```javascript
// Configuración base de ESLint para todos los paquetes iWana neXt
module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "prettier",
  ],
  rules: {
    // Seguridad: prevenir console.log accidental en producción
    "no-console": ["warn", { allow: ["warn", "error"] }],
    // TypeScript: no usar 'any' explícito
    "@typescript-eslint/no-explicit-any": "error",
    // TypeScript: no ignorar promesas sin await
    "@typescript-eslint/no-floating-promises": "error",
    // Seguridad: no usar variables no utilizadas
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  },
};
```

**Step 7: Crear prettier.config.js**

```javascript
// Configuración de Prettier para iWana neXt
module.exports = {
  semi: true,
  singleQuote: true,
  trailingComma: "all",
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  endOfLine: "lf",
};
```

---

## Task 4: Crear packages/shared (enums e interfaces compartidos)

**Files:**

- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/enums/user-role.enum.ts`
- Create: `packages/shared/src/enums/user-status.enum.ts`
- Create: `packages/shared/src/enums/tenant-status.enum.ts`
- Create: `packages/shared/src/enums/audit-action.enum.ts`
- Create: `packages/shared/src/interfaces/api-response.interface.ts`
- Create: `packages/shared/src/dto/pagination.dto.ts`

**Step 1: Crear estructura**

```bash
mkdir -p c:/appiw/packages/shared/src/enums
mkdir -p c:/appiw/packages/shared/src/interfaces
mkdir -p c:/appiw/packages/shared/src/dto
```

**Step 2: Crear packages/shared/package.json**

```json
{
  "name": "@iwana/shared",
  "version": "0.1.0",
  "private": true,
  "description": "Enums, interfaces y DTOs compartidos — iWana neXt",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "@iwana/config": "workspace:*",
    "typescript": "^5.9.0"
  }
}
```

**Step 3: Crear enums**

Crear `packages/shared/src/enums/user-role.enum.ts`:

```typescript
// Roles de usuario — 14 roles definidos en PRD-MOD01 Sección 3
export enum UserRole {
  // Roles de empleados del ISP
  ADMIN = "ADMIN",
  NOC = "NOC",
  SUPPORT = "SUPPORT",
  SALES = "SALES",
  TECHNICIAN = "TECHNICIAN",
  ACCOUNTANT = "ACCOUNTANT",
  HR = "HR",
  // Roles externos
  SUBSCRIBER = "SUBSCRIBER",
  CONTRACTOR = "CONTRACTOR",
  PARTNER = "PARTNER",
  AUDITOR = "AUDITOR",
  INVESTOR = "INVESTOR",
  // Roles de plataforma (schema público) — ref: ADR-018
  SYSTEM_ADMIN = "SYSTEM_ADMIN",
  IWANA_SUPPORT = "IWANA_SUPPORT",
}
```

Crear `packages/shared/src/enums/user-status.enum.ts`:

```typescript
// Estados del ciclo de vida de un usuario
export enum UserStatus {
  PENDING_VERIFICATION = "PENDING_VERIFICATION",
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
  INACTIVE = "INACTIVE",
}
```

Crear `packages/shared/src/enums/tenant-status.enum.ts`:

```typescript
// Estados del ciclo de vida de un tenant — ref: RF-TNT-05
export enum TenantStatus {
  PROVISIONING = "PROVISIONING",
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED", // Bloquea acceso de usuarios (HTTP 403)
  INACTIVE = "INACTIVE",
  PROVISIONING_FAILED = "PROVISIONING_FAILED",
}
```

Crear `packages/shared/src/enums/audit-action.enum.ts`:

```typescript
// Acciones auditables — ref: RF-AUD-01, ADR-004
export enum AuditAction {
  // Operaciones CRUD estándar
  CREATE = "CREATE",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
  // Acciones de autenticación
  LOGIN = "LOGIN",
  LOGOUT = "LOGOUT",
  LOGIN_FAILED = "LOGIN_FAILED",
  ACCOUNT_LOCKED = "ACCOUNT_LOCKED",
  // Acciones de seguridad
  PASSWORD_CHANGED = "PASSWORD_CHANGED",
  PASSWORD_RESET_REQUESTED = "PASSWORD_RESET_REQUESTED",
  MFA_ENABLED = "MFA_ENABLED",
  MFA_DISABLED = "MFA_DISABLED",
  // Acciones de tenant
  TENANT_PROVISIONED = "TENANT_PROVISIONED",
  TENANT_SUSPENDED = "TENANT_SUSPENDED",
  TENANT_ACTIVATED = "TENANT_ACTIVATED",
}
```

**Step 4: Crear interfaces y DTO**

Crear `packages/shared/src/interfaces/api-response.interface.ts`:

```typescript
// Estándar de respuestas API — ref: HLD-MOD01 Sección 4
export interface ApiResponse<T> {
  data: T;
  meta?: {
    cursor?: string;
    total?: number;
  };
}

// Error estándar RFC 7807 Problem Details
export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
}
```

Crear `packages/shared/src/dto/pagination.dto.ts`:

```typescript
// DTO de paginación cursor-based — ref: HLD-MOD01 Sección 4
export class PaginationQueryDto {
  cursor?: string;
  limit?: number = 50;
}
```

**Step 5: Crear index.ts**

Crear `packages/shared/src/index.ts`:

```typescript
// Exportaciones públicas del paquete @iwana/shared
export * from "./enums/user-role.enum";
export * from "./enums/user-status.enum";
export * from "./enums/tenant-status.enum";
export * from "./enums/audit-action.enum";
export * from "./interfaces/api-response.interface";
export * from "./dto/pagination.dto";
```

**Step 6: Crear tsconfig.json**

Crear `packages/shared/tsconfig.json`:

```json
{
  "extends": "@iwana/config/tsconfig/base",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

---

## Task 5: Crear packages/database (entidades TypeORM — solo tipos, sin lógica)

**Files:**

- Create: `packages/database/package.json`
- Create: `packages/database/tsconfig.json`
- Create: `packages/database/src/index.ts`

**Step 1: Crear estructura**

```bash
mkdir -p c:/appiw/packages/database/src/entities
mkdir -p c:/appiw/packages/database/src/migrations/public
mkdir -p c:/appiw/packages/database/src/templates
mkdir -p c:/appiw/packages/database/src/seeds
```

**Step 2: Crear package.json**

```json
{
  "name": "@iwana/db",
  "version": "0.1.0",
  "private": true,
  "description": "Entidades TypeORM, migraciones y templates SQL — iWana neXt",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "typeorm": "0.3.28",
    "reflect-metadata": "^0.2.0"
  },
  "devDependencies": {
    "@iwana/config": "workspace:*",
    "@iwana/shared": "workspace:*",
    "typescript": "^5.9.0"
  }
}
```

**Step 3: Crear src/index.ts vacío (se poblará en Sprint 1)**

```typescript
// Exportaciones del paquete @iwana/db
// Las entidades TypeORM se implementan en Sprint 1 (Semana 1)
// Referencia: HLD-MOD01-ARQUITECTURA-v1.0.md Sección 3
export {};
```

**Step 4: Crear tenant_template.sql vacío como placeholder**

Crear `packages/database/src/templates/tenant_template.sql`:

```sql
-- tenant_template.sql — DDL programático para schemas de tenant
-- Implementado en Sprint 1 Semana 1 (TenantProvisioningService)
-- Referencia: HLD-MOD01 Sección 3 — Estrategia de migración, ADR-017
--
-- Este archivo es ejecutado por TenantProvisioningService (BullMQ worker)
-- al provisionar un nuevo tenant. Crea tablas, índices y políticas RLS.
--
-- PLACEHOLDER — contenido completo en Sprint 1 Semana 1
```

---

## Task 6: Crear packages/ui (design tokens iWana)

**Files:**

- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/tokens/colors.ts`
- Create: `packages/ui/src/tokens/typography.ts`
- Create: `packages/ui/src/tokens/spacing.ts`
- Create: `packages/ui/src/tokens/index.ts`
- Create: `packages/ui/src/styles/globals.css`
- Create: `packages/ui/postcss.config.mjs`

> 📌 **Tailwind 4 (verificado Context7):** No existe `tailwind.config.js`. La configuración y custom tokens van en CSS vía `@theme {}`. PostCSS usa `@tailwindcss/postcss`. Replace de `@tailwind` directives por `@import "tailwindcss"`.

**Step 1: Crear estructura**

```bash
mkdir -p c:/appiw/packages/ui/src/tokens
mkdir -p c:/appiw/packages/ui/src/styles
mkdir -p c:/appiw/packages/ui/src/components
```

**Step 2: Crear package.json**

```json
{
  "name": "@iwana/ui",
  "version": "0.1.0",
  "private": true,
  "description": "Design system y componentes UI iWana neXt",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts,.tsx",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "@iwana/config": "workspace:*",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "postcss": "^8.4.0",
    "typescript": "^5.9.0"
  }
}
```

**Step 3: Crear design tokens de colores (TypeScript — uso programático en componentes)**

Crear `packages/ui/src/tokens/colors.ts`:

```typescript
// Design tokens de colores iWana — fuente: Manual_Implementacion_Identidad_Iwana.md
// Uso: importar en componentes TypeScript o referenciar las CSS vars generadas por Tailwind 4
export const iwanaColors = {
  primary: {
    DEFAULT: "#17163A",
    50: "#F8F8FB",
    100: "#E8E7F0",
    200: "#D1CFE1",
    300: "#A8A4C8",
    400: "#7B75AB",
    500: "#5A5190",
    600: "#4A4176",
    700: "#3D3461",
    800: "#342E52",
    900: "#17163A",
    950: "#0F0E24",
  },
  secondary: {
    DEFAULT: "#A5C330",
    50: "#F7FCE8",
    100: "#EDF8CC",
    200: "#DCF19F",
    300: "#C5E668",
    400: "#B2D93C",
    500: "#A5C330",
    600: "#8BA020",
    700: "#6A7A1C",
    800: "#55621C",
    900: "#48531D",
  },
  neutral: {
    50: "#F9FAFB",
    100: "#F3F4F6",
    200: "#E5E7EB",
    300: "#D1D5DB",
    400: "#9CA3AF",
    500: "#6B7280",
    600: "#4B5563",
    700: "#374151",
    800: "#1F2937",
    900: "#111827",
  },
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",
} as const;
```

**Step 4: Crear design tokens de tipografía**

Crear `packages/ui/src/tokens/typography.ts`:

```typescript
// Design tokens de tipografía iWana — fuente: Manual_Implementacion_Identidad_Iwana.md
// Fuente principal: Exo 2 (Google Fonts)
export const iwanaTypography = {
  fontFamily: {
    sans: ["Exo 2", "Inter", "SF Pro Display", "system-ui", "sans-serif"],
    mono: ["JetBrains Mono", "Fira Code", "Courier New", "monospace"],
    display: ["Exo 2", "sans-serif"],
  },
} as const;
```

**Step 5: Crear design tokens de espaciado**

Crear `packages/ui/src/tokens/spacing.ts`:

```typescript
// Design tokens de espaciado y bordes iWana
export const iwanaSpacing = {
  borderRadius: {
    sm: "0.375rem",
    md: "0.5rem",
    lg: "0.75rem",
    xl: "1rem",
    "2xl": "1.5rem",
    full: "9999px",
  },
} as const;
```

**Step 6: Crear index.ts de tokens**

Crear `packages/ui/src/tokens/index.ts`:

```typescript
export * from "./colors";
export * from "./typography";
export * from "./spacing";
```

**Step 7: Crear globals.css con Tailwind 4 CSS-first (verificado Context7)**

Crear `packages/ui/src/styles/globals.css`:

```css
/* Estilos globales iWana neXt — Tailwind CSS v4 */
/* Fuente: Manual_Implementacion_Identidad_Iwana.md */
/* Sintaxis verificada: https://tailwindcss.com/docs */

/* Importar fuente Exo 2 de Google Fonts */
@import url("https://fonts.googleapis.com/css2?family=Exo+2:wght@100;300;400;500;600;700;800&display=swap");

/* Tailwind v4: @import en lugar de @tailwind base/components/utilities */
@import "tailwindcss";

/* Tailwind v4: @theme {} define tokens que Tailwind expone como utilities */
@theme {
  /* Tipografía — fuente principal iWana */
  --font-sans: "Exo 2", Inter, "SF Pro Display", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "Fira Code", monospace;

  /* Colores primarios iWana */
  --color-iwana-primary: #17163a;
  --color-iwana-primary-50: #f8f8fb;
  --color-iwana-primary-100: #e8e7f0;
  --color-iwana-primary-200: #d1cfe1;
  --color-iwana-primary-300: #a8a4c8;
  --color-iwana-primary-400: #7b75ab;
  --color-iwana-primary-500: #5a5190;
  --color-iwana-primary-600: #4a4176;
  --color-iwana-primary-700: #3d3461;
  --color-iwana-primary-800: #342e52;
  --color-iwana-primary-900: #17163a;
  --color-iwana-primary-950: #0f0e24;

  /* Color de acento — verde lima iWana */
  --color-iwana-secondary: #a5c330;
  --color-iwana-secondary-50: #f7fce8;
  --color-iwana-secondary-100: #edf8cc;
  --color-iwana-secondary-200: #dcf19f;
  --color-iwana-secondary-300: #c5e668;
  --color-iwana-secondary-400: #b2d93c;
  --color-iwana-secondary-500: #a5c330;
  --color-iwana-secondary-600: #8ba020;

  /* Semánticos */
  --color-iwana-success: #22c55e;
  --color-iwana-warning: #f59e0b;
  --color-iwana-error: #ef4444;
  --color-iwana-info: #3b82f6;

  /* Border radius iWana */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-2xl: 1.5rem;
}

/* Base global */
body {
  font-family: var(--font-sans);
  color: var(--color-iwana-primary);
  background-color: #ffffff;
}
```

**Step 8: Crear postcss.config.mjs (Tailwind 4 — verificado Context7)**

Crear `packages/ui/postcss.config.mjs`:

```javascript
// PostCSS config para Tailwind CSS v4
// En v4: usar @tailwindcss/postcss en lugar de tailwindcss
// postcss-import y autoprefixer ya los maneja Tailwind 4 automáticamente
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

**Step 9: Crear index.ts principal**

Crear `packages/ui/src/index.ts`:

```typescript
// Exportaciones públicas del paquete @iwana/ui
export * from "./tokens";
// Los componentes React se agregan en Sprint 1 Semana 3-4
```

---

## Task 7: Crear apps/api (NestJS scaffold vacío)

**Files:**

- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`

**Step 1: Crear estructura**

```bash
mkdir -p c:/appiw/apps/api/src
```

**Step 2: Instalar dependencias NestJS vía pnpm**

En `apps/api/package.json`:

```json
{
  "name": "@iwana/api",
  "version": "0.1.0",
  "private": true,
  "description": "API principal iWana neXt — NestJS",
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start": "node dist/main",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@nestjs/common": "^11.1.14",
    "@nestjs/core": "^11.1.14",
    "@nestjs/platform-express": "^11.1.14",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0"
  },
  "devDependencies": {
    "@iwana/config": "workspace:*",
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@nestjs/testing": "^11.1.14",
    "@types/express": "^5.0.0",
    "@types/node": "^24.0.0",
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "typescript": "^5.9.0"
  }
}
```

**Step 3: Crear tsconfig.json**

```json
{
  "extends": "@iwana/config/tsconfig/nestjs",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

**Step 4: Crear src/app.module.ts**

```typescript
// Módulo raíz de la API iWana neXt
// Los módulos de negocio (auth, tenant, audit, users) se integran en Sprint 1
import { Module } from "@nestjs/common";

@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

**Step 5: Crear src/main.ts**

```typescript
// Punto de entrada de la API iWana neXt
// Configuración completa (Guards, Pipes, Interceptors, Helmet) en Sprint 1
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = process.env["PORT"] ?? 3000;
  await app.listen(port);
  console.warn(`[API] iWana neXt corriendo en http://localhost:${port}`);
}

// Arrancar la aplicación
void bootstrap();
```

---

## Task 8: Crear apps/web y apps/portal (Next.js scaffolds vacíos)

**Files:**

- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/portal/package.json`
- Create: `apps/portal/tsconfig.json`
- Create: `apps/portal/next.config.ts`
- Create: `apps/portal/postcss.config.mjs`
- Create: `apps/portal/src/app/layout.tsx`
- Create: `apps/portal/src/app/page.tsx`

**Step 1: Crear estructuras**

```bash
mkdir -p c:/appiw/apps/web/src/app
mkdir -p c:/appiw/apps/portal/src/app
```

**Step 2: Crear apps/web/package.json**

```json
{
  "name": "@iwana/web",
  "version": "0.1.0",
  "private": true,
  "description": "Portal web de empleados iWana neXt — Next.js",
  "scripts": {
    "build": "next build",
    "dev": "next dev --port 3001",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf .next out"
  },
  "dependencies": {
    "@iwana/ui": "workspace:*",
    "@iwana/shared": "workspace:*",
    "next": "^16.1.6",
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@iwana/config": "workspace:*",
    "@types/node": "^24.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "postcss": "^8.4.0",
    "typescript": "^5.9.0"
  }
}
```

**Step 3: Crear apps/web/tsconfig.json**

```json
{
  "extends": "@iwana/config/tsconfig/nextjs",
  "compilerOptions": {
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"],
      "@iwana/ui": ["../../packages/ui/src/index.ts"],
      "@iwana/shared": ["../../packages/shared/src/index.ts"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**Step 4: Crear apps/web/next.config.ts**

```typescript
import type { NextConfig } from "next";

// Configuración del portal de empleados iWana neXt
// Next.js 16: cacheComponents reemplaza experimental.dynamicIO (ref: Context7 v16.1.6 docs)
const nextConfig: NextConfig = {
  // Habilitar output standalone para contenedor Docker
  output: "standalone",
  // Transpilación de paquetes del workspace
  transpilePackages: ["@iwana/ui", "@iwana/shared"],
  // Next.js 16: habilitar caching de componentes del servidor
  cacheComponents: true,
};

export default nextConfig;
```

**Step 4b: Crear apps/web/postcss.config.mjs (Tailwind 4 — verificado Context7)**

Crear `apps/web/postcss.config.mjs`:

```javascript
// PostCSS para Tailwind CSS v4 en Next.js 16
// Fuente: https://tailwindcss.com/docs/installation/framework-guides/nextjs
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

**Step 5: Crear apps/web/src/app/layout.tsx**

```tsx
import type { Metadata } from "next";
import "@iwana/ui/src/styles/globals.css";

export const metadata: Metadata = {
  title: "iWana neXt — Portal Administrativo",
  description: "Portal de gestión para operadores de iWana Network",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="es">
      <body style={{ fontFamily: "'Exo 2', sans-serif" }}>{children}</body>
    </html>
  );
}
```

**Step 6: Crear apps/web/src/app/page.tsx**

```tsx
// Placeholder — la página de login se implementa en Sprint 1 Semana 3
export default function HomePage(): React.JSX.Element {
  return (
    <main>
      <h1>iWana neXt — Portal Administrativo</h1>
      <p>Scaffold listo. Implementación en Sprint 1.</p>
    </main>
  );
}
```

**Step 7: Repetir para apps/portal (portal de suscriptores, puerto 3002)**

Crear `apps/portal/package.json` — igual a web pero con:

- `"name": "@iwana/portal"`
- `"description": "Portal de suscriptores iWana neXt — Next.js"`
- `"dev": "next dev --port 3002"`

Crear `apps/portal/tsconfig.json` — idéntico a apps/web/tsconfig.json.

Crear `apps/portal/next.config.ts` — idéntico a apps/web/next.config.ts.

Crear `apps/portal/postcss.config.mjs` — idéntico a apps/web/postcss.config.mjs.

Crear `apps/portal/src/app/layout.tsx` — igual pero con title `'iWana neXt — Portal de Suscriptores'`.

Crear `apps/portal/src/app/page.tsx` — igual pero con texto "Portal de Suscriptores".

---

## Task 9: Crear apps/worker (NestJS BullMQ worker scaffold vacío)

**Files:**

- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/main.ts`
- Create: `apps/worker/src/worker.module.ts`

**Step 1: Crear estructura**

```bash
mkdir -p c:/appiw/apps/worker/src
```

**Step 2: Crear package.json**

```json
{
  "name": "@iwana/worker",
  "version": "0.1.0",
  "private": true,
  "description": "Worker BullMQ iWana neXt — NestJS (tenant provisioning, purga de tokens, etc.)",
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start": "node dist/main",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@nestjs/common": "^11.1.14",
    "@nestjs/core": "^11.1.14",
    "@nestjs/platform-express": "^11.1.14",
    "bullmq": "^5.70.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0"
  },
  "devDependencies": {
    "@iwana/config": "workspace:*",
    "@nestjs/cli": "^11.0.0",
    "@types/node": "^24.0.0",
    "typescript": "^5.9.0"
  }
}
```

**Step 3: Crear tsconfig.json**

```json
{
  "extends": "@iwana/config/tsconfig/nestjs",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

**Step 4: Crear src/worker.module.ts**

```typescript
// Módulo raíz del worker iWana neXt
// Workers implementados en Sprint 1 Semana 2:
//   - TenantProvisioningWorker (crea schema PostgreSQL + seed)
//   - RefreshTokenPurgeWorker (purga tokens expirados cada 24h)
// Referencia: HLD-MOD01 Sección 3 — Estrategia de migración, ADR-003
import { Module } from "@nestjs/common";

@Module({
  imports: [],
  providers: [],
})
export class WorkerModule {}
```

**Step 5: Crear src/main.ts**

```typescript
// Punto de entrada del worker iWana neXt
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(WorkerModule);
  await app.init();
  console.warn("[Worker] iWana neXt worker inicializado");
}

void bootstrap();
```

---

## Task 10: Crear .env.example completo

**Files:**

- Create: `.env.example`

**Step 1: Crear .env.example**

Crear `c:/appiw/.env.example`:

```dotenv
# =============================================================
# iWana neXt — Variables de Entorno
# IMPORTANTE: Este archivo es un EJEMPLO. No usar valores reales.
# Copiar a .env.local y reemplazar con valores de desarrollo.
# NUNCA commitear .env.local — está en .gitignore
# Referencia: HLD-MOD01-ARQUITECTURA-v1.0.md Sección 7
# =============================================================

# --- Runtime ---
NODE_ENV=development
PORT=3000

# --- Base de datos ---
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=iwana
DATABASE_PASSWORD=changeme
DATABASE_NAME=iwana_next
DATABASE_SCHEMA=public

# --- Redis ---
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# --- JWT (RS256 — generar con: openssl genrsa -out secrets/jwt-private.pem 2048) ---
JWT_PRIVATE_KEY_PATH=./secrets/jwt-private.pem
JWT_PUBLIC_KEY_PATH=./secrets/jwt-public.pem
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# --- Cifrado AES-256-GCM para PII (email, mfaSecret) ---
# Generar con: openssl rand -hex 32
ENCRYPTION_KEY=<reemplazar-con-openssl-rand-hex-32>

# --- Rate Limiting ---
THROTTLE_TTL=60000
THROTTLE_LIMIT=100

# --- BullMQ ---
BULL_REDIS_HOST=localhost
BULL_REDIS_PORT=6379

# --- Email (usar Mailtrap en desarrollo: https://mailtrap.io) ---
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=changeme
SMTP_PASS=changeme
SMTP_FROM=noreply@iwananetwork.com

# --- MinIO (almacenamiento de objetos) ---
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=changeme
MINIO_USE_SSL=false
MINIO_BUCKET=iwana-dev

# --- URLs de la aplicación ---
APP_URL=http://localhost:3000
PORTAL_URL=http://localhost:3002
WEB_URL=http://localhost:3001

# --- Logging (Pino) ---
LOG_LEVEL=debug
```

---

## Task 11: Crear infraestructura Docker

**Files:**

- Create: `docker-compose.dev.yml`
- Create: `docker-compose.yml`
- Create: `Dockerfile.api`
- Create: `Dockerfile.web`
- Create: `Dockerfile.worker`
- Create: `nginx/nginx.dev.conf`

**Step 1: Crear directorio nginx**

```bash
mkdir -p c:/appiw/nginx
```

**Step 2: Crear nginx/nginx.dev.conf**

Crear `c:/appiw/nginx/nginx.dev.conf`:

```nginx
# Configuración Nginx para desarrollo iWana neXt
events {
  worker_connections 1024;
}

http {
  upstream api {
    server api:3000;
  }

  server {
    listen 80;
    server_name localhost;

    # Reverse proxy hacia la API NestJS
    location /api/ {
      proxy_pass http://api;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Health check
    location /health {
      proxy_pass http://api/health;
    }
  }
}
```

**Step 3: Crear docker-compose.dev.yml**

Crear `c:/appiw/docker-compose.dev.yml`:

```yaml
# Docker Compose — Entorno de Desarrollo iWana neXt
# Servicios: PostgreSQL 16, Redis 8, MinIO, pgBouncer, Nginx, Adminer
# Uso: docker compose -f docker-compose.dev.yml up

version: "3.9"

services:
  # --- PostgreSQL 16 ---
  postgres:
    image: postgres:16-alpine
    container_name: iwana_postgres_dev
    restart: unless-stopped
    environment:
      POSTGRES_USER: iwana
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: iwana_next
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U iwana -d iwana_next"]
      interval: 5s
      timeout: 5s
      retries: 10

  # --- Redis 8 ---
  redis:
    image: redis:8-alpine
    container_name: iwana_redis_dev
    restart: unless-stopped
    command: redis-server --save 60 1 --loglevel warning
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  # --- pgBouncer (connection pooling para PostgreSQL) ---
  pgbouncer:
    image: bitnami/pgbouncer:latest
    container_name: iwana_pgbouncer_dev
    restart: unless-stopped
    environment:
      POSTGRESQL_HOST: postgres
      POSTGRESQL_PORT: 5432
      POSTGRESQL_DATABASE: iwana_next
      POSTGRESQL_USERNAME: iwana
      POSTGRESQL_PASSWORD: changeme
      PGBOUNCER_DATABASE: iwana_next
      PGBOUNCER_POOL_MODE: transaction
      PGBOUNCER_MAX_CLIENT_CONN: 200
      PGBOUNCER_DEFAULT_POOL_SIZE: 20
    ports:
      - "6432:6432"
    depends_on:
      postgres:
        condition: service_healthy

  # --- MinIO (almacenamiento de objetos compatible S3) ---
  minio:
    image: minio/minio:latest
    container_name: iwana_minio_dev
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: changeme
    ports:
      - "9000:9000" # API S3
      - "9001:9001" # Consola web MinIO
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5

  # --- Nginx (reverse proxy) ---
  nginx:
    image: nginx:alpine
    container_name: iwana_nginx_dev
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.dev.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - postgres
      - redis

  # --- Adminer (UI para PostgreSQL — solo desarrollo) ---
  adminer:
    image: adminer:latest
    container_name: iwana_adminer_dev
    restart: unless-stopped
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
    name: iwana_postgres_data_dev
  redis_data:
    name: iwana_redis_data_dev
  minio_data:
    name: iwana_minio_data_dev
```

**Step 4: Crear docker-compose.yml (producción)**

Crear `c:/appiw/docker-compose.yml`:

```yaml
# Docker Compose — Producción On-Premise iWana neXt
# Sin Adminer, con restart policies y healthchecks robustos

version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    container_name: iwana_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${DATABASE_USERNAME}
      POSTGRES_PASSWORD: ${DATABASE_PASSWORD}
      POSTGRES_DB: ${DATABASE_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test:
        ["CMD-SHELL", "pg_isready -U ${DATABASE_USERNAME} -d ${DATABASE_NAME}"]
      interval: 10s
      timeout: 5s
      retries: 10
    networks:
      - iwana_internal

  redis:
    image: redis:8-alpine
    container_name: iwana_redis
    restart: unless-stopped
    command: redis-server --save 60 1 --requirepass ${REDIS_PASSWORD:-}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 10
    networks:
      - iwana_internal

  pgbouncer:
    image: bitnami/pgbouncer:latest
    container_name: iwana_pgbouncer
    restart: unless-stopped
    environment:
      POSTGRESQL_HOST: postgres
      POSTGRESQL_PORT: 5432
      POSTGRESQL_DATABASE: ${DATABASE_NAME}
      POSTGRESQL_USERNAME: ${DATABASE_USERNAME}
      POSTGRESQL_PASSWORD: ${DATABASE_PASSWORD}
      PGBOUNCER_DATABASE: ${DATABASE_NAME}
      PGBOUNCER_POOL_MODE: transaction
      PGBOUNCER_MAX_CLIENT_CONN: 500
      PGBOUNCER_DEFAULT_POOL_SIZE: 25
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - iwana_internal

  minio:
    image: minio/minio:latest
    container_name: iwana_minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY}
    volumes:
      - minio_data:/data
    networks:
      - iwana_internal

  nginx:
    image: nginx:alpine
    container_name: iwana_nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    networks:
      - iwana_internal
      - iwana_external

networks:
  iwana_internal:
    name: iwana_internal
    driver: bridge
  iwana_external:
    name: iwana_external
    driver: bridge

volumes:
  postgres_data:
    name: iwana_postgres_data
  redis_data:
    name: iwana_redis_data
  minio_data:
    name: iwana_minio_data
```

**Step 5: Crear Dockerfile.api**

Crear `c:/appiw/Dockerfile.api`:

```dockerfile
# Dockerfile multi-stage para apps/api (NestJS)
# Stage 1: Dependencias
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Instalar pnpm
RUN corepack enable pnpm && corepack install -g pnpm@latest-10

# Copiar manifiestos
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/config/package.json ./packages/config/
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/

RUN pnpm install --frozen-lockfile --filter @iwana/api...

# Stage 2: Build
FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm && corepack install -g pnpm@latest-10

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .

RUN pnpm --filter @iwana/shared build
RUN pnpm --filter @iwana/db build
RUN pnpm --filter @iwana/api build

# Stage 3: Producción
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules

USER nestjs

EXPOSE 3000
CMD ["node", "dist/main"]
```

**Step 6: Crear Dockerfile.web**

Crear `c:/appiw/Dockerfile.web`:

```dockerfile
# Dockerfile multi-stage para apps/web (Next.js — portal empleados)
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN corepack enable pnpm && corepack install -g pnpm@latest-10

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/config/package.json ./packages/config/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/

RUN pnpm install --frozen-lockfile --filter @iwana/web...

FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm && corepack install -g pnpm@latest-10

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm --filter @iwana/ui build
RUN pnpm --filter @iwana/shared build
RUN pnpm --filter @iwana/web build

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3001
CMD ["node", "apps/web/server.js"]
```

**Step 7: Crear Dockerfile.worker**

Crear `c:/appiw/Dockerfile.worker`:

```dockerfile
# Dockerfile multi-stage para apps/worker (NestJS BullMQ workers)
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN corepack enable pnpm && corepack install -g pnpm@latest-10

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/config/package.json ./packages/config/
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/

RUN pnpm install --frozen-lockfile --filter @iwana/worker...

FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm && corepack install -g pnpm@latest-10

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm --filter @iwana/shared build
RUN pnpm --filter @iwana/db build
RUN pnpm --filter @iwana/worker build

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker

COPY --from=builder --chown=worker:nodejs /app/apps/worker/dist ./dist
COPY --from=builder --chown=worker:nodejs /app/node_modules ./node_modules

USER worker

CMD ["node", "dist/main"]
```

---

## Task 12: Configurar Husky, commitlint y CI

**Files:**

- Create: `.husky/pre-commit`
- Create: `.husky/commit-msg`
- Create: `commitlint.config.js`
- Create: `.lintstagedrc.js`
- Create: `.github/workflows/ci.yml`

**Step 1: Crear directorios**

```bash
mkdir -p c:/appiw/.husky
mkdir -p c:/appiw/.github/workflows
```

**Step 2: Inicializar Husky**

```bash
cd c:/appiw
pnpm exec husky init
```

**Step 3: Crear .husky/pre-commit**

```bash
#!/usr/bin/env sh
# Hook pre-commit: ejecuta lint-staged antes de cada commit
. "$(dirname -- "$0")/_/husky.sh"

pnpm exec lint-staged
```

**Step 4: Crear .husky/commit-msg**

```bash
#!/usr/bin/env sh
# Hook commit-msg: valida el formato del mensaje (Conventional Commits)
. "$(dirname -- "$0")/_/husky.sh"

pnpm exec commitlint --edit "$1"
```

**Step 5: Crear commitlint.config.js**

```javascript
// Reglas de mensajes de commit para iWana neXt
// Formato: tipo(scope): descripcion (máx 100 chars)
// Tipos aceptados: feat, fix, docs, style, refactor, test, chore, ci, perf, revert
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 100],
  },
};
```

**Step 6: Crear .lintstagedrc.js**

```javascript
// Configuración de lint-staged para iWana neXt
// Solo valida archivos que se están commiteando
module.exports = {
  "**/*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "**/*.{json,md,yaml,yml}": ["prettier --write"],
};
```

**Step 7: Crear .github/workflows/ci.yml**

Crear `c:/appiw/.github/workflows/ci.yml`:

```yaml
# CI iWana neXt — lint + typecheck + build
# Trigger: push a main y pull requests

name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    name: Lint + Typecheck + Build
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: "24.x"

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 10

      - name: Get pnpm store directory
        id: pnpm-cache
        shell: bash
        run: echo "STORE_PATH=$(pnpm store path)" >> $GITHUB_OUTPUT

      - name: Cache pnpm store
        uses: actions/cache@v4
        with:
          path: ${{ steps.pnpm-cache.outputs.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Build
        run: pnpm build
```

---

## Task 13: Generar par RSA para JWT y verificación final

**Files:**

- Create: `secrets/.gitkeep` (directorio vacío versionado para documentación)
- Create: `scripts/generate-secrets.sh`

**Step 1: Crear directorio secrets y placeholder**

```bash
mkdir -p c:/appiw/secrets
touch c:/appiw/secrets/.gitkeep
# .gitignore ya tiene 'secrets/*.pem' — solo .gitkeep se versiona
```

**Step 2: Crear script para generar secretos**

Crear `c:/appiw/scripts/generate-secrets.sh`:

```bash
#!/usr/bin/env bash
# Script para generar secretos locales de desarrollo iWana neXt
# NUNCA ejecutar en producción con los mismos valores
# NUNCA commitear los archivos generados (están en .gitignore)

set -e

echo "[iWana] Generando par RSA 2048-bit para JWT (RS256)..."
openssl genrsa -out secrets/jwt-private.pem 2048
openssl rsa -in secrets/jwt-private.pem -pubout -out secrets/jwt-public.pem
echo "[iWana] Par RSA generado: secrets/jwt-private.pem y secrets/jwt-public.pem"

echo "[iWana] Generando ENCRYPTION_KEY para AES-256-GCM..."
ENCRYPTION_KEY=$(openssl rand -hex 32)
echo "ENCRYPTION_KEY=${ENCRYPTION_KEY}" >> .env.local
echo "[iWana] ENCRYPTION_KEY agregada a .env.local"

echo "[iWana] Copia .env.example a .env.local y revisa los valores antes de continuar."
```

**Step 3: Ejecutar generación de secretos localmente**

```bash
cd c:/appiw
mkdir -p scripts
chmod +x scripts/generate-secrets.sh
bash scripts/generate-secrets.sh
```

Resultado esperado: `secrets/jwt-private.pem` y `secrets/jwt-public.pem` creados localmente.

**Step 4: Instalar todas las dependencias del monorepo**

```bash
cd c:/appiw
pnpm install
```

Resultado esperado: todas las dependencias instaladas sin errores.

**Step 5: Verificar turbo build**

```bash
cd c:/appiw
pnpm build
```

Resultado esperado: todos los packages y apps compilan sin errores TypeScript.

**Step 6: Verificar turbo lint**

```bash
cd c:/appiw
pnpm lint
```

Resultado esperado: 0 errores de lint.

**Step 7: Verificar Docker dev stack**

```bash
docker compose -f c:/appiw/docker-compose.dev.yml up -d
docker compose -f c:/appiw/docker-compose.dev.yml ps
```

Resultado esperado: todos los servicios en estado `healthy` o `running`.

**Step 8: Verificar PostgreSQL accesible**

```bash
docker exec iwana_postgres_dev pg_isready -U iwana -d iwana_next
```

Resultado esperado: `localhost:5432 - accepting connections`

**Step 9: Verificar Redis accesible**

```bash
docker exec iwana_redis_dev redis-cli ping
```

Resultado esperado: `PONG`

**Step 10: Commit inicial del scaffold**

```bash
cd c:/appiw
git add .
git commit -m "feat(scaffold): monorepo Turborepo + Docker + CI base MOD01 Semana 0"
```

---

## Criterios de Aceptación (ref: PROMPT-MOD01-SCAFFOLD-v1.0.md)

| ID              | Criterio                                                     | Verificación                              |
| --------------- | ------------------------------------------------------------ | ----------------------------------------- |
| CA-SCAFFOLD-001 | `docker compose -f docker-compose.dev.yml up -d` sin errores | Todos los servicios `healthy` o `running` |
| CA-SCAFFOLD-002 | `pnpm build` sin errores TypeScript                          | Exit code 0                               |
| CA-SCAFFOLD-003 | `pnpm lint` sin errores                                      | Exit code 0                               |
| CA-SCAFFOLD-004 | CI verde en GitHub Actions                                   | Todos los checks en verde                 |
| CA-SCAFFOLD-005 | `.env.example` con todas las variables documentadas          | 0 variables faltantes vs HLD Sección 7    |

---

_Plan generado por: AI-EM-ARCH — iWana neXt Platform_
_Fecha: 2026-03-08_
_Referencia principal: docs/prompts/PROMPT-MOD01-SCAFFOLD-v1.0.md_
_HLD: docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md Sección 7_
