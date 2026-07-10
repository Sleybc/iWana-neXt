# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Source of truth

Claude Code is an active assistant in this workspace, at parity with GitHub Copilot, OpenCode, and Codex (reactivated 2026-07-09 — see `docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md`).

**`AGENTS.md` is the master governance document** for this repo — it outrules everything, including this file. Read it before acting. It carries the authoritative rules for architecture boundaries, multi-tenancy, security, code style, testing, documentation naming, and the merge gates. This file only distills the parts a Claude Code session needs most; when the two disagree, `AGENTS.md` wins.

Read order for any non-trivial task (matches the precedence chain in `AGENTS.md` → "Precedencia entre IAs y superficies"):
1. `AGENTS.md`
2. `.github/copilot-instructions.md` — provider-agnostic bootstrap layer
3. `docs/prds/Stack_Tecnologico.md` (validated stack)
4. The current PRD/HLD/ADR for the affected module (`docs/`)
5. `.github/instructions/*.instructions.md` — path-scoped rules that apply by their `applyTo`
6. `.agents/skills/INDEX.md`, then the individual skill's `SKILL.md` whose description matches the task — see **Skills** below

If two artifacts conflict on multi-tenancy, security, boundaries, or stack, do **not** synthesize a convenient answer — document the conflict and escalate.

## Skills

The repo's skill catalog lives in `.agents/skills/` (source of truth: `.agents/skills/INDEX.md` + `MANIFEST.json`). It's a shared, provider-agnostic catalog — OpenCode discovers it via `skills.paths`; Copilot and Codex use it per their own session mechanism. **Claude Code has no native `skills.paths`-style loader for arbitrary project directories**, so do not create a parallel `.claude/skills/` copy. Instead, apply the catalog by reading it as documentation:

1. Before a non-trivial task, check whether its domain matches an entry in `.agents/skills/INDEX.md`.
2. If it does, `Read` that skill's `SKILL.md` in full and apply its "Usar este skill cuando" / "No usar este skill cuando" rules, base decisions, and guardrails as if they were part of this file.
3. The `Skill` tool only invokes skills the harness itself exposes (generic client utilities, listed in the system reminder) — it does **not** see this repo's catalog. Don't try to invoke `.agents/skills/*` by name through that tool; read the file directly instead.

Dispatch by domain (first line = read by default for that kind of task; see `AGENTS.md` → "Skills Dispatch" for the full table):

| Domain | Skill(s) |
| --- | --- |
| NestJS modules, services, boundaries, TypeORM | `nestjs-expert` |
| Next.js App Router, screen architecture | `nextjs-app-router-patterns` + `frontend-dev-guidelines` |
| Design system, components, tokens | `core-components` + `tailwind-patterns` |
| SaaS visual direction, strong aesthetic proposals | `senior-ui-systems-designer` |
| iWana visual identity on new interfaces/modules | `iwana-identity-ui-review` + `senior-ui-systems-designer` |
| Advanced UI/UX heuristics, typography, responsive, perf | `ui-ux-pro-max` (subordinate to `iwana-identity-ui-review`, `core-components`, `tailwind-patterns`, real repo tokens) |
| Accessibility / WCAG | `wcag-audit-patterns` |
| Forms, i18n, detail UX | `i18n-localization` + the affected domain's skill |
| Visible copy, labels, seeds, product vocabulary | `system-vocabulary-review` |
| Auth flows | `auth-implementation-patterns` |
| Backend/frontend security review | `backend-security-coder` / `frontend-security-coder`, `security-auditor` |
| DB schema changes, migrations | `database-migration` + `postgresql` |
| BullMQ jobs/workers | `bullmq-specialist` |
| OpenAPI/contract changes | `openapi-spec-generation` |
| Unit/integration/E2E tests | `testing-patterns`, `test-driven-development`, `e2e-testing-patterns`, `playwright-skill` |
| Monorepo/Turborepo structure | `monorepo-architect` + `turborepo-caching` |
| ADRs, architecture review | `architecture-decision-records` + `architect-review` |
| Docs, living reports | `docs-architect` |
| Debugging a hard/unclear failure | `systematic-debugging` |
| Planning multi-step work | `writing-plans` → `executing-plans` |
| Requesting/receiving a code review | `requesting-code-review` / `receiving-code-review` |
| Wrapping up a branch | `finishing-a-development-branch` |
| Dependency/cleanup audits | `codebase-cleanup-deps-audit` |

For anything not in this table, check `.agents/skills/INDEX.md` directly — it's the authoritative, current list (this table can drift).

## Commands

Package manager is **`pnpm`** (never `npm`/`yarn`). Node ≥ 24, pnpm ≥ 10. Monorepo orchestrated by Turborepo.

| Task | Command |
| --- | --- |
| Full dev stack (Docker + migrations + all apps) | `pnpm dev` |
| Build all | `pnpm build` |
| Lint all | `pnpm lint` |
| Typecheck all | `pnpm typecheck` |
| Unit tests all | `pnpm test` |
| E2E web console | `pnpm test:e2e` |
| E2E tenant portal | `pnpm test:e2e:portal` |
| Clean artifacts | `pnpm clean` |

Scoped / single-target:

| Task | Command |
| --- | --- |
| One package's tests | `pnpm --filter @iwana/api test` (or `@iwana/portal`, `@iwana/web`) |
| A single Jest spec | `cd apps/api && npx jest src/modules/auth/auth.service.spec.ts` |
| A single Playwright spec | `npx playwright test e2e/tests/web-auth-dashboard.spec.ts` |
| Run DB migrations (public + tenant schemas) | `pnpm db:migrate:all` |
| Public-schema migrations only | `pnpm --filter @iwana/db migration:run` |
| Tenant-schema migrations | `pnpm --filter @iwana/db migration:tenant:run` |
| Revert last public-schema migration | `pnpm --filter @iwana/db migration:revert` |

There is **no `migration:generate` script** — migrations are written by hand under `packages/database/src/migrations/` (public) and `packages/database/src/migrations/tenant/` (numbered, e.g. `057_create_stock_issues.ts`).

`pnpm dev` is an orchestrator (`scripts/dev.mjs`): it frees dev ports, brings up Docker infra (postgres, redis, pgbouncer, minio, nginx, adminer), builds `@iwana/shared` + `@iwana/storage`, runs all migrations, then starts the API in watch mode and waits for its healthcheck (`GET http://127.0.0.1:3000/api/v1/health`) **before** starting web/portal/worker. In a TTY it renders an interactive dashboard (`↑↓` select, `a` all, `e` errors, `q` quit). The db package must be **built** before migrations run — migrations execute against compiled `dist/` (`migration:run -d dist/data-source.js`).

## Architecture

Monorepo: `apps/*` + `packages/*` (pnpm workspaces, see `pnpm-workspace.yaml`). Workspace alias prefix is `@iwana/*`.

**Apps**
- `apps/api` — NestJS 11 REST API. Port 3000, global prefix `/api/v1`. Swagger UI at `/api/v1/docs` (non-prod only).
- `apps/web` — Next.js platform console (SYSTEM_ADMIN / support). Port 3001.
- `apps/portal` — Next.js tenant console. Port 3002. React 19, Tailwind v4.
- `apps/worker` — BullMQ consumers (async jobs, provisioning, search indexing).

**Packages**
- `packages/database` (`@iwana/db`) — TypeORM entities, migrations, `data-source.ts`, tenant-migration CLI. No `synchronize` — migrations only.
- `packages/shared` (`@iwana/shared`) — DTOs, enums, cross-module contracts. Must be built before API/worker start.
- `packages/storage` (`@iwana/storage`) — media/object-storage abstraction (local driver in dev, MinIO/S3 in prod).
- `packages/ui` (`@iwana/ui`) — design system, Tailwind v4 (CSS-first).
- `packages/config` (`@iwana/config`) — shared tsconfig, eslint, prettier.

### NestJS Modulith
The API is a modular monolith. Every domain lives under `apps/api/src/modules/*` (auth, tenant, users, crm, commercial, taxation, parties, wfm, assurance, inventory, tasks, media, search, audit, …) and is wired in `app.module.ts`. **Boundaries are explicit**: no direct access to another module's tables; cross-module communication goes through typed interfaces or events; no circular imports. Global cross-cuts: `AuditInterceptor` (`APP_INTERCEPTOR`, routes CUD ops to `platform_audit_logs` or `<schema>.audit_logs` by JWT type), global `ValidationPipe` (whitelist + `forbidNonWhitelisted` + transform, in `main.ts`), Helmet, `ThrottlerModule` (100 req/min global), and `TenantMiddleware`.

### Multi-tenancy (critical)
Tenant isolation is **PostgreSQL schema per tenant**. `TenantMiddleware` runs on all routes except `/tenants/**` and `/health`; on protected routes the tenant is resolved from verified JWT claims (public auth routes fall back transitively to `X-Tenant-Slug`). **Never hardcode tenant/schema** — resolve from approved context. Because pgBouncer does not persist `search_path`, use `SET LOCAL search_path` per transaction (or the approved helpers). Config is validated fail-fast with Joi in `app.module.ts`; migrations run automatically only in production (`migrationsRun`), never `synchronize`.

## Non-obvious gotchas (from AGENTS.md — read the full list there)

- `@Roles()` takes `UserRole.*` enum members, **not** string literals.
- `AsyncLocalStorage` does **not** propagate into BullMQ jobs — pass tenant context explicitly to the worker.
- Auth controller must explicitly propagate `mfaRequired` / `mfaSetupRequired` — NestJS drops omitted fields on serialization.
- Portal keeps **two** localStorage tokens: `iwana.portal.access-token` (full session) and `iwana.portal.mfa-setup-token` (MFA-setup scope only); `mfaSetup()` / `mfaVerifySetup()` read the second directly, bypassing the normal `request()` path.
- `TenantContext.getOrThrow()` throws a generic `Error` (→ HTTP 500), not `UnauthorizedException` (→ 401): a missing context on a protected route surfaces as **500**.
- Tailwind is **v4, CSS-first** — do not add a `tailwind.config.js` without an ADR. For text on white use `iwana-secondary-700` for AA contrast.
- `InventoryItem.sku` is immutable after creation (`PATCH .../items/:id` ignores any `sku`); auto-generated from category `codePrefix` on `POST` when omitted, with `-001` suffix on `23505` collision.

## Conventions

- Strict TypeScript: no explicit `any`, no floating promises, no circular imports. Prettier + ESLint (`@iwana/config`) are the executable source of truth for style.
- Import grouping: external → workspace (`@iwana/*`) → relative.
- User-visible text and business-logic comments are in **Spanish**, sentence case; never expose raw enums in final views.
- No PII, secrets, tokens, or connection strings in code, tests, docs, or logs.
- New docs follow `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md` (PRD, HLD, ADR, INFORME, PROMPT) under `docs/`; after a change, update or create the living report in `docs/informes/`.

## Tests

- Unit: `src/**/*.spec.ts`, Jest + ts-jest, named `[subject].[method].spec.ts`, ≥80% coverage on core modules.
- Integration: `src/**/*.integration.spec.ts` or `tests/**/*.spec.ts`, Supertest for HTTP, DB transactions with rollback.
- E2E: `e2e/tests/**/*.spec.ts`, Playwright, separate `playwright.web.config.ts` / `playwright.portal.config.ts`.

Merge gates (see `AGENTS.md`): no critical vulns, no boundary violations, ≥80% coverage on core, OpenAPI updated for new endpoints, reversible migrations, no PII in logs, lint + typecheck passing.
