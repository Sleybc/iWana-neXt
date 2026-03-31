# iWana neXt — Agent Instructions

> **Stack:** NestJS + Next.js + PostgreSQL + TypeORM + Turborepo + pnpm  
> **Identidad:** EM + Architect unificado  
> **Fuentes:** [Stack_Tecnologico.md](docs/prds/Stack_Tecnologico.md) | [copilot-instructions.md](.github/copilot-instructions.md)

---

## Build, Lint & Test Commands

**Package manager:** `pnpm` (never npm/yarn)

### Root Commands

```bash
pnpm dev          # Docker + DB + migrations + turbo dev
pnpm build        # turbo run build
pnpm lint         # turbo run lint
pnpm typecheck    # turbo run typecheck
pnpm test         # turbo run test
pnpm clean        # Clean node_modules, .turbo, dist, coverage
```

### Testing Commands

**Run all tests:**

```bash
pnpm test                    # All workspaces
pnpm test:e2e               # Playwright web tests
pnpm test:e2e:portal        # Playwright portal tests
pnpm test:e2e:headed        # Playwright with browser visible
```

**Run single test file (CRITICAL):**

```bash
# Backend (NestJS + Jest)
cd apps/api && npx jest src/modules/auth/auth.service.spec.ts
cd apps/api && npx jest --testNamePattern="should validate token"

# Frontend (Next.js + Jest)
cd apps/web && npx jest src/components/Button.test.tsx

# Specific workspace via filter
pnpm --filter @iwana/api test -- auth.service.spec.ts
```

**Run tests with coverage:**

```bash
cd apps/api && npx jest --coverage
```

**E2E single test:**

```bash
npx playwright test e2e/tests/web-auth-dashboard.spec.ts
npx playwright test --grep "login flow"
```

### Workspace-Specific Commands

```bash
pnpm --filter @iwana/api test
pnpm --filter @iwana/web test
pnpm --filter @iwana/db migration:run
pnpm --filter @iwana/db migration:generate -- src/migrations/CreateUsersTable
```

---

## Code Style Guidelines

### TypeScript Configuration

- **Target:** ES2022, CommonJS modules
- **Strict mode:** enabled (`strict: true`, `strictNullChecks: true`)
- **No implicit any:** error
- **Unused vars:** prefix with `_` to ignore

### Formatting (Prettier)

```javascript
semi: true;
singleQuote: true;
trailingComma: 'all';
printWidth: 100;
tabWidth: 2;
useTabs: false;
endOfLine: 'lf';
```

### ESLint Rules

```javascript
'no-console': ['warn', { allow: ['warn', 'error'] }]
'@typescript-eslint/no-explicit-any': 'error'
'@typescript-eslint/no-floating-promises': 'error'
'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
```

### Naming Conventions

- **Files:** kebab-case (`auth.controller.ts`, `user.service.ts`)
- **Classes:** PascalCase (`UserService`, `AuthController`)
- **Interfaces:** PascalCase with prefix (`IUser`, optional)
- **Types:** PascalCase (`UserRole`, `ApiResponse`)
- **Enums:** PascalCase, members UPPER_SNAKE_CASE
- **Variables/functions:** camelCase
- **Constants:** UPPER_SNAKE_CASE for true constants
- **Private methods:** prefix with `_` (optional but consistent)
- **Test files:** `*.spec.ts` (unit), `*.test.ts` (integration/e2e)

### Import Guidelines

```typescript
// 1. External libraries
import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';

// 2. Internal workspace packages
import { User } from '@iwana/db';
import { ApiResponse } from '@iwana/shared';

// 3. Relative imports (same module)
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
```

**Rules:**

- Use workspace aliases (`@iwana/*`) for cross-package imports
- Group imports: external → workspace → relative
- Sort alphabetically within groups
- No circular imports between bounded contexts

### Error Handling

```typescript
// Use custom exceptions for domain errors
throw new BadRequestException('Invalid credentials');
throw new NotFoundException(`User ${id} not found`);

// Async/await with proper error boundaries
try {
  await this.riskyOperation();
} catch (error) {
  this.logger.error('Operation failed', error.stack);
  throw new InternalServerErrorException('Unable to process request');
}
```

### Comments

- Write in **Spanish** when logic is non-trivial
- Explain intent, business rules, validations
- Do NOT repeat obvious code line-by-line
- Document WHY, not WHAT

```typescript
// ✓ Bien: explica la regla de negocio
// Los usuarios de estrato 1-2 requieren aprobación adicional según CRC
if (user.estrato <= 2 && !user.aprobado) {
  await this.notificarAprobacion(user);
}
```

---

## Architecture Rules

### Modulith Boundaries

- Each module has explicit boundaries
- No direct table access from other modules
- Inter-module communication via typed interfaces or events
- No circular imports between bounded contexts

### Multi-Tenancy

- PostgreSQL schema-based isolation
- Never hardcode tenant/schema
- Resolve from request context or approved flow
- Use `SET LOCAL search_path` per transaction (pgBouncer compatible)

### Security

- **Zero PII** in code, tests, logs, docs
- `@Roles()` decorator must use `UserRole.*` enums (not string literals)
- Zod validation on external boundaries
- No `synchronize: true` in production

---

## Testing Guidelines

### Unit Tests

- Location: `src/**/*.spec.ts`
- Framework: Jest + ts-jest
- Naming: `[subject].[method].spec.ts`
- Coverage: ≥80% for core modules

### Integration Tests

- Location: `src/**/*.integration.spec.ts` or `tests/**/*.spec.ts`
- Use Supertest for HTTP endpoints
- Test database transactions with rollback

### E2E Tests

- Location: `e2e/tests/**/*.spec.ts`
- Framework: Playwright
- Separate configs: `playwright.web.config.ts`, `playwright.portal.config.ts`

### Test Structure

```typescript
describe('UserService', () => {
  describe('create', () => {
    it('should create user with valid data', async () => {
      // Arrange
      const dto = createUserDto();

      // Act
      const result = await service.create(dto);

      // Assert
      expect(result).toBeDefined();
      expect(result.email).toBe(dto.email);
    });
  });
});
```

---

## Project Structure

```
├── apps/
│   ├── api/              # NestJS API (port 3000)
│   ├── web/              # Platform console (port 3001)
│   ├── portal/           # Tenant console (port 3002)
│   └── worker/           # BullMQ consumers
├── packages/
│   ├── database/         # TypeORM entities, migrations
│   ├── shared/           # DTOs, enums, contracts
│   ├── ui/               # Design system, Tailwind v4
│   └── config/           # tsconfig, eslint, prettier
├── e2e/                  # Playwright tests
└── docs/                 # PRDs, ADRs, HLDs, informes
```

---

## Critical Gotchas

1. **@Roles()** → Use `UserRole.*`, not string literals
2. **pgBouncer** → `search_path` doesn't persist; use `SET LOCAL` per transaction
3. **AsyncLocalStorage** → Doesn't propagate to BullMQ; pass tenant context explicitly
4. **MFA setup token** → Includes `tenantId` + `schemaName`; don't rely on `X-Tenant-Slug`
5. **Tailwind v4** → CSS-first; don't add `tailwind.config.js`
6. **Color contrast** → Use `iwana-secondary-700` for text on white (AA compliance)

---

## Documentation Rules

- **New documents:** `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`
- **Types:** PRD, HLD, ADR, INFORME, PROMPT
- **After changes:** Update/create report in `docs/informes/`
- **Use Spanish** for business logic comments

---

## Gates Before Merge

- [ ] No critical vulnerabilities
- [ ] No boundary violations
- [ ] Tests ≥80% core modules
- [ ] OpenAPI updated (if new endpoints)
- [ ] Migrations reversible
- [ ] No PII in logs
- [ ] Lint and typecheck passing
