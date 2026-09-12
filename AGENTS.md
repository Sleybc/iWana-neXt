# iWana neXt — Agent Instructions

> **Stack:** NestJS + Next.js + PostgreSQL + TypeORM + Turborepo + pnpm  
> **Identidad de gobernanza:** AI-EM-ARCH (EM + Product Architect + Orchestrator)  
> **Modo de sesion por defecto:** ejecutor (puede implementar codigo respetando gates)  
> **Fuente maestra:** Este documento
> **Stack validado:** [Stack_Tecnologico.md](docs/prds/Stack_Tecnologico.md)

---

## AI Workflow Activo

**Asistentes activos:** GitHub Copilot (VS Code), OpenCode (CLI / TUI / web), Codex y Claude Code (CLI / IDE extension). Los cuatro estan subordinados a `AGENTS.md`, no se prefiere uno sobre otro salvo que el usuario lo indique explicitamente para una tarea concreta.

**Gobernanza vs modo de sesion:** la identidad AI-EM-ARCH es la *autoridad de gobernanza* del workspace (boundaries, multi-tenancy, gates, precedencia, protocolo multiagente). No implica que toda sesion opere en modo Orquestador. Por defecto la sesion actua como **ejecutor** subordinado a esa gobernanza. El **modo Orquestador** (define/delega, sin codigo productivo ni UI detallada) solo se activa con el prompt [`docs/prompts/PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md`](docs/prompts/PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md) o citando la Parte II de [`docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md`](docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md). Una nueva sesion sin ese prompt vuelve al modo ejecutor.

**Superficies activas:**

- `.github/copilot-instructions.md` — bootstrap agnostico de IA, leido por Copilot automaticamente y referenciado por OpenCode desde `instructions`. Codex y Claude Code tambien deben consumirlo como capa de arranque despues de `AGENTS.md`. Cualquier IA que arranque en el workspace debe leerlo.
- `.opencode/opencode.json` — declaracion explicita de OpenCode: `instructions`, `skills.paths` y `mcp` (chrome-devtools, context7, playwright). Es la superficie de paridad con Copilot.
- `CLAUDE.md` — bootstrap propio de Claude Code, leido automaticamente al arrancar en el workspace. Reactivado el 2026-07-09 (ver `docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md`); sigue subordinado a `AGENTS.md` y no debe duplicar reglas que ya viven aqui.
- `.github/instructions/*.instructions.md` — reglas contextuales por path; aplican en su `applyTo` para todas las IAs.
- `docs/prompts/PROMPT-*.md` — **todos** los prompts del workspace, sin excepcion: de ejecucion por fase y operativos reutilizables. Disponibles para cualquier asistente compatible con prompts markdown. **No existe ninguna otra carpeta de prompts**; `.github/prompts/` quedo suprimida el 2026-07-27 (ver Documentation Rules).
- `.agents/skills/` — catalogo activo de skills. `INDEX.md` y `MANIFEST.json` son la fuente de verdad. OpenCode las descubre via `skills.paths`; Copilot, Codex y Claude Code las usan como referencia documental: leen el `SKILL.md` relevante segun `INDEX.md` antes de actuar, ya que ninguno de los tres tiene en este repo un mecanismo nativo de carga automatica de skills de proyecto.
- `.claude/agents/*.md` — **fuente canonica de los subagentes de rol** (8 ejecutores del protocolo multiagente; AI-EM-ARCH no es subagente: es el modo Orquestador del agente padre). La leen nativamente Claude Code, Cursor y VS Code/Copilot. `.opencode/agents/` y `.codex/agents/` son **generados** por `pnpm sync:agents` — no se editan a mano; `pnpm sync:agents:check` verifica la sincronizacion. Cada subagente remite a su perfil en `docs/roles/` y al protocolo (los perfiles definen el rol; el subagente es su adaptador operativo).

**Superficies pasivas:** ninguna por ahora. Todas las IAs listadas arriba estan activas.

### Precedencia entre IAs y superficies

Orden efectivo cuando una IA arranca en el workspace y ejecuta una tarea:

1. `AGENTS.md` — fuente maestra, prevalece sobre todo lo demas.
2. `.github/copilot-instructions.md` — bootstrap agnostico que apunta a este documento y resume flujo, recordsatorios criticos y reglas de precedencia.
3. PRD/HLD/ADR vigente del modulo afectado.
4. `.github/instructions/*.instructions.md` — reglas contextuales por path, complementan a este documento en su `applyTo`.
5. `.agents/skills/INDEX.md` y la skill individual activada por descripcion.
6. Configuracion especifica del cliente (`.opencode/opencode.json`, ajustes de Copilot, variables de entorno) — auxiliar, nunca debe contradecir los puntos anteriores.

Si dos artefactos chocan en multi-tenancy, seguridad, boundaries o stack, no sintetices por conveniencia: documenta el conflicto y escala.

### Reactivacion o desactivacion de herramientas IA

Si una IA nueva se suma al workflow o una existente se desactiva:

1. Comparar su bootstrap contra este documento.
2. Reemplazar reglas duplicadas por referencias a `AGENTS.md`.
3. Actualizar este documento si cambia la precedencia, el stack, los boundaries o la seguridad.
4. Si OpenCode se desactiva, vaciar `.opencode/opencode.json` (dejar solo `$schema`) o borrarlo, y restaurar `.opencode/DISABLED.md` si se conserva trazabilidad historica.
5. Validar PRD, HLD y ADR vigentes antes de ejecutar tareas productivas con la IA reactivada.

### Matriz operativa por capacidad

| Capacidad | Fuente principal | Regla operativa |
| --- | --- | --- |
| Skills | `.agents/skills/INDEX.md` + `.agents/skills/MANIFEST.json` | Reutilizables por cualquier asistente que soporte skills del workspace; no crear catalogos paralelos por cliente. Claude Code no tiene `skills.paths`: aplica el dispatch leyendo `SKILL.md` como documentacion, no invocandolo como tool nativa. |
| Prompts | `docs/prompts/` | **Unica carpeta de prompts del repo.** Aplica a los dos tipos, sin excepcion: prompts de **ejecucion por fase** (`PROMPT-{MODULO}-{FASE}-v{VERSION}.md`, un solo encargo, versionados) y prompts **operativos reutilizables** (`PROMPT-OPERATIVO-{NOMBRE}-v{VERSION}.md`, agnosticos de proveedor). Todos deben remitir a `AGENTS.md`, artefactos del modulo y restricciones reales. **Depositar un prompt fuera de `docs/prompts/` es defecto bloqueante**, no cuestion de estilo. |
| Reglas por path | `.github/instructions/*.instructions.md` | Complementan a `AGENTS.md`; aplican por `applyTo`, no reemplazan la gobernanza global. |
| MCP | `.opencode/opencode.json` para OpenCode | Los MCP son cliente-dependientes: OpenCode los declara en config versionada; en Codex dependen de la sesion activa y no de un archivo ficticio del repo. |
| Agentes / subagentes | Skills de workflow existentes | Preferir `brainstorming`, `writing-plans`, `architect-review` y `subagent-driven-development` antes que inventar agentes custom paralelos del repo. |

### Prompts Operativos

Viven en `docs/prompts/` como el resto, con el subtipo `PROMPT-OPERATIVO-` que los distingue de los prompts de ejecucion por fase: no tienen modulo ni fase porque son reutilizables.

- `docs/prompts/PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md` — activar modo Orquestador AI-EM-ARCH (define/delega; sin codigo productivo).
- `docs/prompts/PROMPT-OPERATIVO-ACTUALIZAR-INFORME-VIVO-v1.0.md` — actualizar el informe vivo relacionado sin duplicarlo.
- `docs/prompts/PROMPT-OPERATIVO-REVISAR-BOUNDARY-MODULITH-v1.0.md` — revisar boundaries Modulith, accesos cruzados y riesgos de arquitectura.

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
| Migraciones public + tenant | `pnpm db:migrate:all` |
| Migraciones schema public | `pnpm --filter @iwana/db migration:run` |
| Migraciones schemas tenant | `pnpm --filter @iwana/db migration:tenant:run` |
| Revertir ultima migracion public | `pnpm --filter @iwana/db migration:revert` |
| Backup por tenant | `pnpm db:backup:tenant --tenant <uuid\|slug>` |
| Restore por tenant | `pnpm db:restore:tenant --file <ruta.dump> --into <base-destino>` |
| Jest backend individual | `pnpm --filter @iwana/api exec jest src/modules/auth/auth.service.spec.ts` |
| Playwright individual | `pnpm exec playwright test e2e/tests/web-auth-dashboard.spec.ts` |

No existe script `migration:generate`: las migraciones se escriben a mano en `packages/database/src/migrations/` (public) y `packages/database/src/migrations/tenant/` (numeradas). El paquete `@iwana/db` debe compilarse antes de ejecutar migraciones (corren contra `dist/`).

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

Frontend y UX:

- Frontend App Router y arquitectura de pantalla: `nextjs-app-router-patterns` + `frontend-dev-guidelines`
- Componentes, design system y tokens: `core-components` + `tailwind-patterns`
- Direccion visual SaaS, propuestas esteticas fuertes y review visual sistemico: `senior-ui-systems-designer`
- Identidad visual iWana en nuevas interfaces, secciones o modulos: `iwana-identity-ui-review` + `senior-ui-systems-designer`
- Apoyo UI/UX avanzado, heuristicas, patrones, tipografia, color, responsive y performance visual: `ui-ux-pro-max`, siempre subordinada a `iwana-identity-ui-review`, `core-components`, `tailwind-patterns` y tokens reales del repo.
- Accesibilidad visual y validacion WCAG: `wcag-audit-patterns`
- Formularios, i18n y UX de detalle: complementar con `i18n-localization` y la skill del dominio afectado
- Vocabulario visible, copy de producto, labels, seeds, auditorias, secciones o modulos nuevos: `system-vocabulary-review`

Backend y datos:

- Modulos NestJS, servicios, boundaries, TypeORM: `nestjs-expert`
- Flujos de autenticacion: `auth-implementation-patterns`
- Review de seguridad backend/frontend: `backend-security-coder` / `frontend-security-coder` + `security-auditor`
- Cambios de schema y migraciones: `database-migration` + `postgresql`
- Jobs y workers BullMQ: `bullmq-specialist`
- Cambios de contrato OpenAPI: `openapi-spec-generation`

Testing y calidad:

- Tests unit/integration/E2E: `testing-patterns`, `test-driven-development`, `e2e-testing-patterns`, `playwright-skill`
- Auditorias de dependencias y limpieza: `codebase-cleanup-deps-audit`

Arquitectura, docs y flujo de trabajo:

- Estructura monorepo/Turborepo: `monorepo-architect` + `turborepo-caching`
- ADRs y review arquitectonico: `architecture-decision-records` + `architect-review`
- Documentacion e informes vivos: `docs-architect`
- Debugging de fallas dificiles: `systematic-debugging`
- Planificacion multi-paso: `writing-plans` → `executing-plans`
- Solicitar/recibir code review: `requesting-code-review` / `receiving-code-review`
- Cierre de rama de desarrollo: `finishing-a-development-branch`

Para dominios no listados, consultar `.agents/skills/INDEX.md` (lista autoritativa vigente).

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
│   ├── storage/          # Abstracción de almacenamiento local/MinIO/S3
│   ├── ui/               # Design system, Tailwind v4
│   └── config/           # tsconfig, eslint, prettier
├── e2e/                  # Playwright tests
└── docs/                 # TODA la documentacion del repo
    ├── prds/             # PRDs          ├── adrs/      # ADRs
    ├── hlds/             # HLDs          ├── informes/  # informes vivos y de cierre
    ├── prompts/          # PROMPTS (unica carpeta de prompts)
    ├── specs/            # specs UX y contratos DS
    ├── plans/            # planes de ejecucion
    ├── roles/            # perfiles de agente y protocolo
    └── runbooks/ quality/ sprints/ identity/ prototipo/
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
12. **InventoryItem SKU inmutable** → El `sku` de `InventoryItem` no se modifica tras la creacion; `PATCH /inventory/items/:id` ignora cualquier valor de `sku` enviado. Si se omite el `sku` en `POST /inventory/items`, se autogenera como `{CAT}-{TIPO}-{NOMBRE}-{MARCA}-{MODELO}` (segmentos normalizados, marca/modelo opcionales, max 60 chars) con sufijo `-001` ante colision `23505`.
13. **InventoryCategory codePrefix controlado** → El `codePrefix` de `InventoryCategory` (varchar(3), regex `^[A-Z0-9]{2,3}$`, unico por tenant) alimenta nuevas emisiones de SKU. No recalcular SKUs existentes cuando cambie una regla de prefijo; documentar cualquier migracion de prefijos como compatibilidad v2.
14. **Aislamiento de cookies por host en dev + ruteo del refresh por audiencia** → El portal sirve en `http://localhost:3002` y la consola plataforma en `http://127.0.0.1:3001`: hosts distintos → jars de cookies distintos → la cookie de una consola nunca viaja a la otra (`scripts/next-dev.mjs` lo recuerda en su log inicial). `POST /auth/refresh` rutea por audiencia: con `X-Tenant-Slug` declarado (el portal siempre lo envia, la plataforma nunca) es fail-fast — solo intenta la rama tenant y responde 401 inmediato si su cookie falta o es rechazada, ignorando la cookie de plataforma sin consumirla. Sin header conserva platform-first + fallback a tenant.

---

## Documentation Rules

- **New documents:** `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`
- **Types:** PRD, HLD, ADR, INFORME, PROMPT
- **Location — toda la documentacion vive bajo `docs/`, y cada tipo tiene UNA carpeta:**

  | TIPO | Carpeta | Regla |
  | --- | --- | --- |
  | PRD | `docs/prds/` | — |
  | HLD | `docs/hlds/` | — |
  | ADR | `docs/adrs/` | Estado del vocabulario canonico: `Aprobado` · `En revision` · `Propuesto` · `Superado` |
  | INFORME | `docs/informes/` | — |
  | **PROMPT** | **`docs/prompts/`** | **Sin excepcion.** Cubre los dos subtipos: ejecucion por fase (`PROMPT-{MODULO}-{FASE}-v{VERSION}.md`) y operativo reutilizable (`PROMPT-OPERATIVO-{NOMBRE}-v{VERSION}.md`) |
  | Spec UX / contrato DS | `docs/specs/` | `YYYY-MM-DD-<nombre>.md` |
  | Plan | `docs/plans/` | `YYYY-MM-DD-<nombre>.md` |

  **Ningun prompt se deposita fuera de `docs/prompts/`.** No existe `.github/prompts/` ni ninguna otra carpeta de prompts: fue suprimida el 2026-07-27 y sus 33 archivos migrados. Esta regla vive aqui, y no solo en `.github/instructions/docs.instructions.md`, precisamente porque aquel archivo solo se activa en su `applyTo: docs/**` — es decir, no se aplicaba a quien se equivocaba de carpeta. `AGENTS.md` se lee siempre.

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
