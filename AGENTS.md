# iWana neXt — Agent Instructions

> **Stack:** NestJS + Next.js + PostgreSQL + TypeORM + Turborepo + pnpm  
> **Identidad:** EM + Architect unificado  
> **Fuente maestra:** Este documento
> **Stack validado:** [Stack_Tecnologico.md](docs/prds/Stack_Tecnologico.md)

---

## AI Workflow Activo

**Asistente activo:** GitHub Copilot en VS Code.

**Superficies activas:**

- `.github/copilot-instructions.md` — bootstrap minimo para Copilot.
- `.github/instructions/*.instructions.md` — reglas contextuales por path.
- `.github/prompts/*.prompt.md` — prompts operativos reutilizables.
- `.agents/skills/` — skills bajo demanda; este archivo prevalece sobre cualquier skill individual.

**Superficies pasivas por ahora:**

- `CLAUDE.md` — deprecado hasta que Claude Code vuelva a ser herramienta activa.
- `.opencode/` — contingencia recuperable, no fuente activa de gobernanza.

### Reactivacion De Herramientas Pasivas

Si `CLAUDE.md` u OpenCode vuelven a estar activos:

1. Comparar su bootstrap contra este documento.
2. Reemplazar reglas duplicadas por referencias a `AGENTS.md`.
3. Actualizar este documento si cambia la precedencia, el stack, los boundaries o la seguridad.
4. Validar PRD, HLD y ADR vigentes antes de ejecutar tareas productivas.

### Prompts Operativos

- `.github/prompts/actualizar-informe-vivo.prompt.md` — actualizar el informe vivo relacionado sin duplicarlo.
- `.github/prompts/revisar-boundary-modulith.prompt.md` — revisar boundaries Modulith, accesos cruzados y riesgos de arquitectura.

---

## Build, Lint & Test Commands

**Package manager:** `pnpm` (never npm/yarn)

| Objetivo | Comando |
| --- | --- |
| Dev local | `pnpm dev` |
| Build | `pnpm build` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Unit tests monorepo | `pnpm test` |
| E2E web | `pnpm test:e2e` |
| E2E portal | `pnpm test:e2e:portal` |
| Limpiar artefactos | `pnpm clean` |

| Caso puntual | Comando |
| --- | --- |
| API tests | `pnpm --filter @iwana/api test` |
| Web tests | `pnpm --filter @iwana/web test` |
| DB migrations | `pnpm --filter @iwana/db migration:run` |
| Generar migracion | `pnpm --filter @iwana/db migration:generate -- src/migrations/CreateUsersTable` |
| Jest backend individual | `cd apps/api && npx jest src/modules/auth/auth.service.spec.ts` |
| Playwright individual | `npx playwright test e2e/tests/web-auth-dashboard.spec.ts` |

---

## Code Style Summary

### Critical Rules

| Nivel | Aplicacion |
| --- | --- |
| Critico | TypeScript estricto; sin `any` explicito; sin promesas flotantes; imports sin ciclos; logs sin PII, secretos ni payloads sensibles. |

### General Recommendations

| Area | Recomendacion |
| --- | --- |
| Convencion | Prettier y ESLint del repo son fuente ejecutable; usar aliases `@iwana/*`, grupos de imports externo → workspace → relativo y naming consistente. |
| UI y docs | Texto visible en espanol, sentence case, sin enums crudos en vistas finales; comentarios en espanol solo para logica no trivial. |

---

## Architecture Rules

| Area | Regla critica |
| --- | --- |
| Modulith | Boundaries explicitos; sin acceso directo a tablas de otro modulo; comunicacion via interfaces tipadas o eventos; sin imports circulares. |
| Multi-tenancy | Aislamiento PostgreSQL por schema; nunca hardcodear tenant/schema; resolver desde contexto aprobado; usar `SET LOCAL search_path` por transaccion. |
| Security | Cero PII en codigo, tests, logs y docs; `@Roles()` usa `UserRole.*`; Zod en boundaries externos; sin `synchronize: true` en produccion. |

### Regulatory Reference Map

No inventar regulacion. Si no aplica una fuente oficial o ADR, detener el trabajo y notificar al responsable del proyecto para resolucion.

| Dominio | Referencias operativas a verificar |
| --- | --- |
| Billing | IVA por estrato, DIAN UBL 2.1, CUFE |
| CRM/Portal | Ley 1581, Habeas Data, ARCO |
| Assurance/PQR | CRC tiempos, compensaciones |
| Reporting | CRC, SUI, Colombia TIC |
| HCM/SG-SST | Jornada 42h, IPERC, FURAT |

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

## Skills Dispatch

- Frontend App Router y arquitectura de pantalla: `nextjs-app-router-patterns` + `frontend-dev-guidelines`
- Componentes, design system y tokens: `core-components` + `tailwind-patterns`
- Direccion visual SaaS, propuestas esteticas fuertes y review visual sistemico: `senior-ui-systems-designer`
- Accesibilidad visual y validacion WCAG: `wcag-audit-patterns`
- Formularios, i18n y UX de detalle: complementar con `i18n-localization` y la skill del dominio afectado

---

## Project Structure

```text
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
5. **MFA setup idempotente** → `setupMfa()` tolera dobles invocaciones de React Strict Mode
6. **MFA setup effects** → hooks que llaman setup MFA usan dependencia estable; no disparar ciclos por router mutable
7. **Auth controller flags** → Propagar explicitamente `mfaRequired` y `mfaSetupRequired`; NestJS no serializa campos omitidos
8. **Tailwind v4** → CSS-first; don't add `tailwind.config.js`
9. **Color contrast** → Use `iwana-secondary-700` for text on white (AA compliance)
10. **Portal localStorage — two tokens** → `iwana.portal.access-token` (full session) and `iwana.portal.mfa-setup-token` (limited scope, MFA setup only); `mfaSetup()` and `mfaVerifySetup()` read the second token directly, bypassing `request()`
11. **TenantContext.getOrThrow()** → Throws a generic `Error` (→ 500), not `UnauthorizedException` (→ 401); a missing context on a protected route surfaces as 500, not 401

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

If coverage drops below 80%, identify untested areas and prioritize writing new tests before merging.
