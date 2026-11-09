# iWana neXt — Agent Instructions

> **Stack:** NestJS + Next.js + PostgreSQL + TypeORM + Turborepo + pnpm  
> **Identidad de gobernanza:** AI-EM-ARCH (EM + Product Architect + Orchestrator)  
> **Modo de sesion por defecto:** ejecutor (puede implementar codigo respetando gates)  
> **Fuente maestra:** Este documento
> **Historial:** 2026-10-30 — Documentation Rules: nueva fila «Textos legales y actas jurídicas» (`docs/legal/`, sin PII). 2026-10-31 — Superficies activas: sexto verificador auxiliar (`test-change-reviewer`) y hooks `post-push-ci`, CI de `main` en `session-context` y guarda de sobrescritura de documentos versionados. 2026-11-07 — Gates: carraca de conteos de pruebas contra la linea base de la ola; Code Style: criterio de simplicidad. 2026-11-09 — ADR-107 v1.1: commit por ola, push por tren y G6.5 asíncrono en «Gates Before Merge»; topes de ceremonia documental (D8) en «Documentation Rules». 2026-11-08 — Skills Dispatch: consolidacion del catalogo 52 → 43 (sucesoras en lugar de las 9 retiradas) y desempate por ruta entre `backend-security-coder` y `frontend-security-coder`. 2026-11-09 — Regulatorio: la jornada se cita por la Ley 2101 sin cifra (decision del CTO, auditoria de cruces de roles §7).
> **Stack validado:** [Stack_Tecnologico.md](docs/prds/Stack_Tecnologico.md)

---

## AI Workflow Activo

**Asistentes activos:** GitHub Copilot (VS Code), OpenCode (CLI / TUI / web), Codex y Claude Code (CLI / IDE extension). Los cuatro estan subordinados a `AGENTS.md`, no se prefiere uno sobre otro salvo que el usuario lo indique explicitamente para una tarea concreta.

**Gobernanza vs modo de sesion:** la identidad AI-EM-ARCH es la *autoridad de gobernanza* del workspace (boundaries, multi-tenancy, gates, precedencia, protocolo multiagente). No implica que toda sesion opere en modo Orquestador. Por defecto la sesion actua como **ejecutor** subordinado a esa gobernanza. El **modo Orquestador** (define/delega, sin codigo productivo ni UI detallada) solo se activa con el prompt [`docs/prompts/PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md`](docs/prompts/PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md) o citando la Parte II de [`docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md`](docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md). Una nueva sesion sin ese prompt vuelve al modo ejecutor.

**Superficies activas:**

- `.github/copilot-instructions.md` — bootstrap agnostico de IA, leido por Copilot automaticamente y referenciado por OpenCode desde `instructions`. Codex y Claude Code tambien deben consumirlo como capa de arranque despues de `AGENTS.md`. Cualquier IA que arranque en el workspace debe leerlo.
- `.opencode/opencode.json` — declaracion explicita de OpenCode: `instructions`, `skills.paths` y `mcp.servers` en forma nativa V2 (chrome-devtools, context7, github, playwright, postgres-dev, redis-dev; `disabled`, `timeout.startup`, `oauth` donde aplica). La clave `mcp` es **generada** desde `.agents/mcp/servers.json` por `pnpm sync:mcp` (ADR-092); el resto del archivo se edita a mano. Es la superficie de paridad con Copilot.
- `CLAUDE.md` — bootstrap propio de Claude Code, leido automaticamente al arrancar en el workspace. Reactivado el 2026-07-09 (ver `docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md`); sigue subordinado a `AGENTS.md` y no debe duplicar reglas que ya viven aqui.
- `.github/instructions/*.instructions.md` — reglas contextuales por path; aplican en su `applyTo` para todas las IAs.
- `docs/prompts/PROMPT-*.md` — **todos** los prompts del workspace, sin excepcion: de ejecucion por fase y operativos reutilizables. Disponibles para cualquier asistente compatible con prompts markdown. **No existe ninguna otra carpeta de prompts**; `.github/prompts/` quedo suprimida el 2026-07-27 (ver Documentation Rules).
- `.agents/skills/` — catalogo activo de skills. `INDEX.md` y `MANIFEST.json` son la fuente de verdad. OpenCode las descubre via `skills.paths`; Claude Code via `.claude/skills/`, que contiene **punteros generados** por `pnpm sync:skills` (ADR-092) — mismo frontmatter, cuerpo que remite al `SKILL.md` canonico, sin copia de contenido. Copilot y Codex las usan como referencia documental: leen el `SKILL.md` relevante segun `INDEX.md` antes de actuar.
- `.claude/agents/*.md` — **fuente canonica de los subagentes de rol** (8 ejecutores del protocolo multiagente; AI-EM-ARCH no es subagente: es el modo Orquestador del agente padre) **y de 6 verificadores auxiliares** (`boundary-reviewer`, `gate-verifier`, `docs-governance`, alta 2026-10-08 y perfiles 2026-10-09; `contract-drift-reviewer` y `e2e-triage`, alta 2026-10-09; `test-change-reviewer`, alta 2026-10-31): tienen perfil en `docs/roles/` pero no son roles de la RACI ni destinos de escalacion (Protocolo §9). La leen nativamente Claude Code, Cursor y VS Code/Copilot. `.opencode/agents/` y `.codex/agents/` son **generados** por `pnpm sync:agents` — no se editan a mano; `pnpm sync:agents:check` verifica la sincronizacion. Cada subagente remite a su perfil en `docs/roles/` y al protocolo (los perfiles definen el rol; el subagente es su adaptador operativo).
- `.claude/settings.json` + `.claude/hooks/*.mjs` — hooks compartidos de Claude Code (2026-10-08): bloqueo de rutas reservadas (`.env` reales, `secrets/`, lockfile, agentes generados, prompts fuera de `docs/prompts/`), gate de migracion tenant reversible y registrada, Prettier al editar, regeneracion de superficies al editar sus fuentes (`.claude/agents/`, `.agents/skills/`, `.agents/mcp/servers.json`) y auditorias documentales al cerrar turno. Desde 2026-10-09, `guard-bash` niega por Bash lo que `guard-paths` no ve: ramas y worktrees, `--no-verify`, escrituras a rutas protegidas y acciones destructivas (`reset --hard`, `push --force`, `down -v`, revert de migraciones, `db:restore`), que ejecuta el usuario en su terminal; niega siempre porque un `ask` se ignora en modo bypassPermissions. Tambien desde 2026-10-09: `rejection-reason-coverage` exige un `*.integration.spec.ts` por cada motivo de `INVENTORY_CONSUMPTION_REJECTION_REASON_CODES` (norma del CTO para MOD11↔MOD12), `pii-log-guard` señala logs de `apps/api` y `apps/worker` que interpolan datos personales (gate «No PII in logs») y `session-context` informa rama, cambios y plan mas reciente al abrir la sesion. Desde 2026-10-31: `session-context` informa tambien la ultima corrida de CI de `main` (via `gh`; se omite sin red o sin remoto), `post-push-ci` recuerda tras cada `git push` revisar la corrida de ese commit antes de declarar G6.5, y `guard-paths` niega un `Write` sobre un documento existente de `docs/{adrs,hlds,informes,plans,prds,prompts,specs}/` (se cambia con `Edit` o se crea la siguiente version libre). Cada hook tiene un caso que bloquea y uno que pasa en `scripts/claude-hooks.test.mjs` (`test:tooling`). Solo aplican a Claude Code; las demas IAs siguen cubiertas por lint-staged y CI. `.claude/settings.local.json` sigue siendo personal y no versionado.
- `.agents/mcp/servers.json` — **fuente unica de servidores MCP** (ADR-092). `pnpm sync:mcp` genera `.mcp.json` (Claude Code: `context7`, `playwright`, `postgres-dev`, `redis-dev`) y la clave `mcp` de `.opencode/opencode.json`; `pnpm sync:mcp:check` lo verifica en CI. `postgres-dev` usa el rol de solo lectura `iwana_readonly` de la base de desarrollo, creado con `pnpm db:dev:readonly-role` (credencial local en `.claude/mcp-postgres.local.env`, no versionada). `redis-dev` usa el usuario ACL `iwana_readonly` del Redis de desarrollo (solo `bull:*`, escritura → `NOPERM`), creado con `pnpm dev:redis-readonly-user`; vive en memoria, asi que se re-ejecuta tras recrear `iwana_redis_dev` (credencial en `.claude/mcp-redis.local.env`, no versionada).

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
| Prompts | `docs/prompts/` | **Unica carpeta de prompts del repo.** Aplica a los tres tipos, sin excepcion: prompts de **ejecucion por fase** (`PROMPT-{MODULO}-{FASE}-v{VERSION}.md`, un solo encargo, versionados), prompts de **lanzamiento** (`PROMPT-{MODULO}-{FASE}-LAUNCH-v{VERSION}.md`, max. 40 lineas, lanzan una ola sin repetir el encargo) y prompts **operativos reutilizables** (`PROMPT-OPERATIVO-{NOMBRE}-v{VERSION}.md`, agnosticos de proveedor). Todos deben remitir a `AGENTS.md`, artefactos del modulo y restricciones reales. **Depositar un prompt fuera de `docs/prompts/` es defecto bloqueante**, no cuestion de estilo. |
| Reglas por path | `.github/instructions/*.instructions.md` | Complementan a `AGENTS.md`; aplican por `applyTo`, no reemplazan la gobernanza global. |
| MCP | `.agents/mcp/servers.json` → `.mcp.json` (Claude Code) y `.opencode/opencode.json` (OpenCode) via `pnpm sync:mcp` | Los MCP son cliente-dependientes: OpenCode los declara en config versionada; en Codex dependen de la sesion activa y no de un archivo ficticio del repo. |
| Agentes / subagentes | Skills de workflow existentes | Preferir `brainstorming`, `writing-plans`, `architect-review` y `executing-plans` antes que inventar agentes custom paralelos del repo. |

### Prompts Operativos

Viven en `docs/prompts/` como el resto, con el subtipo `PROMPT-OPERATIVO-` que los distingue de los prompts de ejecucion por fase: no tienen modulo ni fase porque son reutilizables.

- `docs/prompts/PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md` — activar modo Orquestador AI-EM-ARCH (define/delega; sin codigo productivo).
- `docs/prompts/PROMPT-OPERATIVO-ANALISIS-DISPATCH-v1.0.md` — al cerrar una definicion: derivar el agente ejecutor y las skills de cada bloque, y emitir el prompt corto de lanzamiento.
- `docs/prompts/PROMPT-OPERATIVO-DESPACHO-MULTIAGENTE-v1.0.md` — despachar los agentes de un plan aprobado: gates, olas, encargo de siete elementos, consolidacion.
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
| Simplicidad | Ver «Escritura mínima». Una mejora marginal que agrega complejidad se justifica en el INFORME o se retira. |

---

## Escritura mínima

Aplica a código, documentos y respuestas. Origen: [ponytail v5](https://github.com/DietrichGebert/ponytail) (−53 % de código sin perder controles en su benchmark) y `program.md` de autoresearch ([referencia](docs/referencias/REFERENCIA-KARPATHY-METODOLOGIA-IA-v1.0.md) §5.2). Criterio de revisión, no gate bloqueante.

**Antes de escribir:** leer la tarea y lo que toca, y listar todo lo que el cambio debe alcanzar: llamadores, pruebas, fixtures, config, exports y documentos vivos que lo citan. Eso es el alcance; lo que nadie pidió no.

**Código.** Tomar la primera opción que resuelva por completo:

1. ¿Hace falta? Omitir opciones y flexibilidad que nadie pidió, y nombrarlas en una línea.
2. ¿Ya existe en el repo (helper, servicio, primitive de `@iwana/ui`, patrón)? Usarlo como lo usa el código vecino.
3. ¿Lo da la plataforma o la biblioteca estándar? Usarlo, salvo que el repo tenga el suyo.
4. ¿Lo da una dependencia instalada? Usarla. Nunca una dependencia nueva por unas líneas.
5. ¿Cabe en una línea que se entienda a la primera? Una línea.
6. Si no: el mínimo código que funcione.

**Documentos.** La misma escalera:

1. ¿Hace falta el documento? Ver los topes de ADR-107 D8.
2. ¿Hay un documento vivo donde va? Actualizar su sección, no crear otro.
3. ¿Basta un enlace a la fuente? Enlazar, no copiar ni resumir lo que la fuente ya dice.
4. ¿Basta una tabla, una lista o una línea? Usarla.
5. Si no: el mínimo texto que sirva a una decisión o a una ejecución, sin contexto que el lector ya tiene, sin repetir el historial de git y sin relleno.

**Reglas**

- Perezoso con la solución, nunca con el cambio: se termina todo lo que la tarea toca.
- A igual resultado gana el diff más chico, y borrar conservando el comportamiento cuenta como mejora. Un one-liner que hay que descifrar no es corto.
- Sin abstracción, wrapper, opción, flag ni código «para después» que nadie pidió. Se conserva la estructura del Modulith.
- Comentar solo el porqué que el código no muestra, en una línea.
- Bugfix: buscar todos los llamadores antes de editar y arreglar la causa una sola vez, en el código compartido.
- La lógica no trivial (rama, bucle, parser, dinero, seguridad, tenancy) deja una prueba; lo trivial no.
- Un atajo con límite conocido lleva `// atajo: <límite>, <cuándo subir>`. El INFORME de cierre los lista.
- Cada respuesta y cada INFORME terminan con una o dos líneas: qué se omitió, qué no se verificó y qué riesgo queda.

**Nunca recortar:** validación en fronteras de confianza, aislamiento de tenant, manejo de errores que evita pérdida de datos, seguridad, PII, accesibilidad, trazabilidad regulatoria y de decisiones (porqué y fuente), evidencia de gates con conteo real, ni nada que haya pedido el usuario.

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
| HCM/SG-SST | Jornada maxima legal (Ley 2101 de 2021), IPERC, FURAT |

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

- Codigo de pantalla de `apps/web` y `apps/portal` (App Router, RSC, datos, formularios): `frontend-dev-guidelines`
- Primitives de `@iwana/ui` y tokens: `core-components`
- Clases y variantes Tailwind: `tailwind-patterns`
- Identidad visual iWana (direccion, diseno y review de UI): `iwana-identity-ui-review`
- Accesibilidad visual y validacion WCAG: `wcag-audit-patterns`
- Formularios, i18n y UX de detalle: complementar con `i18n-localization` y la skill del dominio afectado
- Vocabulario visible, copy de producto, labels, seeds, auditorias, secciones o modulos nuevos: `system-vocabulary-review`

Backend y datos:

- Modulos NestJS, servicios, boundaries, TypeORM: `nestjs-expert`
- Flujos de autenticacion: `auth-implementation-patterns`
- Codigo seguro: `backend-security-coder` en `apps/api`, `apps/worker` y `packages/`; `frontend-security-coder` en `apps/web` y `apps/portal` (desempate por ruta tocada); revision o auditoria de seguridad: `security-auditor`
- Modelado de tablas y entidades: `postgresql`
- Migracion del schema `public`: `database-migration`; migracion en `migrations/tenant/`: `iwana-tenant-migration`
- Jobs y workers BullMQ: `bullmq-specialist`
- Cambios de contrato OpenAPI: `openapi-spec-generation`

Testing y calidad:

- Tests unit/integration: `testing-patterns`; E2E: `e2e-testing-patterns`; TDD explicito: `test-driven-development`
- Auditorias de dependencias y limpieza: `codebase-cleanup-deps-audit`

Arquitectura, docs y flujo de trabajo:

- Estructura monorepo/Turborepo: `monorepo-architect`
- ADRs: `architecture-decision-records`; review arquitectonico: `architect-review`
- Documentacion e informes vivos: `docs-architect`
- Debugging de fallas dificiles: `systematic-debugging`
- Planificacion multi-paso: `writing-plans` → `executing-plans`
- Solicitar/recibir code review: `requesting-code-review` / `receiving-code-review`
- Commit y publicacion en `main`: `iwana-checkpoint-commit`

Para dominios no listados, consultar `.agents/skills/INDEX.md` (lista autoritativa vigente).

Skills externas de plugin (solo Claude Code; siempre **de apoyo**, nunca obligatorias, y la skill del repo indicada prevalece):

- Evidencia visual en el navegador integrado: `anthropic-skills:built-in-browser` (con `e2e-testing-patterns` para lo automatizado)
- APIs de plataforma del navegador (`<dialog>`, popover, container queries, View Transitions, INP): `modern-web-guidance:modern-web-guidance`, guias locales primero y `npx` solo con aprobacion del usuario
- Estructura de errores, estados vacios y confirmaciones: `design:ux-copy`, subordinada a `system-vocabulary-review`
- Investigacion con usuarios y sintesis para PRD/spec: `design:user-research` + `design:research-synthesis`; handoff de spec: `design:design-handoff`
- Revision visual de PDFs generados: `pdf-viewer:view-pdf` + `anthropic-skills:pdf`
- Deuda tecnica de un modulo: `engineering:tech-debt`; release e incidentes (latentes hasta la beta): `engineering:deploy-checklist` / `engineering:incident-response`
- Investigacion normativa o comparativa para PRD/HLD/ADR: `anthropic-skills:deep-research`

Tabla completa, restricciones y skills externas fuera del dispatch: `.agents/skills/INDEX.md` → «Skills externas de plugin (solo Claude Code)».

**Este mapa se resuelve por bloque, no por modulo.** Al cerrar la definicion de una fase, AI-EM-ARCH emite la **matriz de dispatch** dentro del plan de orquestacion (perfil v2.5 §3.6): una fila por bloque con su subagente de `.claude/agents/` y tres listas de skills — **obligatorias** (leer antes de escribir codigo), **de apoyo** con su condicion, y **descartadas con su motivo**. **El mapa de arriba es un atajo por dominio, no el limite de lo citable:** la matriz puede asignar cualquier skill del catalogo de `.agents/skills/INDEX.md`, que es la lista autoritativa. Cada skill se verifica contra disco (`ls .agents/skills/<nombre>/SKILL.md`) antes de citarse: el `INDEX.md` puede ir por delante del filesystem. Las skills externas de plugin (`plugin:skill`) son la excepcion: se verifican contra la lista de skills de la sesion y solo entran en la lista **de apoyo**, con el sufijo `(solo Claude Code)`. Procedimiento: `docs/prompts/PROMPT-OPERATIVO-ANALISIS-DISPATCH-v1.0.md`.

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
  | **PROMPT** | **`docs/prompts/`** | **Sin excepcion.** Cubre los tres subtipos: ejecucion por fase (`PROMPT-{MODULO}-{FASE}-v{VERSION}.md`), lanzamiento corto (`PROMPT-{MODULO}-{FASE}-LAUNCH-v{VERSION}.md`, max. 40 lineas) y operativo reutilizable (`PROMPT-OPERATIVO-{NOMBRE}-v{VERSION}.md`) |
  | Spec UX / contrato DS | `docs/specs/` | `YYYY-MM-DD-<nombre>.md` |
  | Plan | `docs/plans/` | `YYYY-MM-DD-<nombre>.md` |
  | Textos legales y actas jurídicas | `docs/legal/` | `{TIPO}-{TEMA}-{EMPRESA}-v{VERSION}.md` o `ACTA-{TEMA}-{EMPRESA}-{YYYY-MM-DD}.md`. **Sin PII**: el original firmado se custodia fuera del repo y aquí solo se referencia. El texto que se publica en el sistema vive en el anexo de la spec del módulo |

  **Ningun prompt se deposita fuera de `docs/prompts/`.** No existe `.github/prompts/` ni ninguna otra carpeta de prompts: fue suprimida el 2026-07-27 y sus 33 archivos migrados. Esta regla vive aqui, y no solo en `.github/instructions/docs.instructions.md`, precisamente porque aquel archivo solo se activa en su `applyTo: docs/**` — es decir, no se aplicaba a quien se equivocaba de carpeta. `AGENTS.md` se lee siempre.

- **After changes:** actualizar el informe de la fase en `docs/informes/` (uno por fase, no por ola; ADR-107 D8.1)
- **Topes de ceremonia (ADR-107 D8):** launcher solo para olas multiagente o que ejecuta otra sesión; revisión `docs-governance` una vez por fase, al cierre; el registro de G6.5 viaja en el siguiente commit funcional, nunca en un commit ni en un launcher propio
- **Use Spanish** for business logic comments

---

## Gates Before Merge

- [ ] No critical vulnerabilities
- [ ] No boundary violations
- [ ] Tests ≥80% core modules
- [ ] Test counts not below the wave baseline: `Tests`/`Suites` no bajan ni `Skipped` sube sin justificar (linea base al iniciar la ola; skill `iwana-test-evidence`)
- [ ] OpenAPI updated (if new endpoints)
- [ ] Migrations reversible
- [ ] No PII in logs
- [ ] Lint and typecheck passing

If coverage drops below 80%, identify untested areas and prioritize writing new tests before merging.

**Commit y push ([ADR-107](docs/adrs/ADR-107-Publicacion-por-Lotes-y-G6.5-Asincrono.md)):** cada ola se commitea en local al llegar a G6. El push sale por tren: cierre de fase, código que otra sesión o el CI necesita, corrección de un rojo o una jornada sin respaldo. G6.5 se exige para cerrar la fase y no para lanzar la ola siguiente, salvo en olas de CI o infraestructura, migraciones con NOT NULL, CHECK o FK, y correcciones de un rojo. Tabla completa en `docs/informes/INFORME-TRANSVERSAL-TIEMPOS-ENTREGA-v1.0.md` §4; procedimiento en la skill `iwana-checkpoint-commit`.
