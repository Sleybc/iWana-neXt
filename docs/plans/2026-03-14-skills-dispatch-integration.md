# Skills Dispatch Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrar el catálogo de 30 skills activas al flujo de trabajo de todos los agentes del repo mediante reglas de despacho condicional en CLAUDE.md, AGENTS.md y .github/copilot-instructions.md.

**Architecture:** Restaurar 5 skills del archivo a `.agents/skills/`, actualizar el catálogo (INDEX.md, README.md, MANIFEST.json), luego agregar una sección `## Despacho de Skills` en los tres archivos de instrucción con tablas de despacho por dominio ordenadas por prioridad.

**Tech Stack:** pnpm monorepo, Turborepo, NestJS, Next.js App Router, Markdown, bash (mv para mover directorios en Windows via Git Bash).

---

## Task 1: Restaurar `turborepo-caching` al catálogo activo

**Files:**
- Move: `.agents/skills-archive/turborepo-caching/` → `.agents/skills/turborepo-caching/`
- Modify: `.agents/skills/turborepo-caching/SKILL.md` (verificar frontmatter)

**Step 1: Mover la carpeta**

```bash
mv c:/appiw/.agents/skills-archive/turborepo-caching c:/appiw/.agents/skills/turborepo-caching
```

**Step 2: Verificar que el frontmatter tiene `name` y `description`**

Leer `.agents/skills/turborepo-caching/SKILL.md` — debe tener:
```yaml
---
name: turborepo-caching
description: Optimización de pipelines Turborepo con caché local y remoto para iWana neXt. Usar cuando se configuren pipelines de build, se optimice CI/CD o se depuren cache misses en el monorepo.
---
```
Si el `description` no menciona iWana neXt, actualizar para alinearlo al repo.

**Step 3: Verificar que la carpeta está en su lugar**

```bash
ls c:/appiw/.agents/skills/turborepo-caching/
```
Esperado: `SKILL.md` presente.

**Step 4: Commit**

```bash
git add .agents/skills/turborepo-caching .agents/skills-archive/turborepo-caching
git commit -m "feat(skills): restore turborepo-caching to active catalog"
```

---

## Task 2: Restaurar `database-migration` al catálogo activo

**Files:**
- Move: `.agents/skills-archive/database-migration/` → `.agents/skills/database-migration/`
- Modify: `.agents/skills/database-migration/SKILL.md` (verificar/actualizar frontmatter)

**Step 1: Mover la carpeta**

```bash
mv c:/appiw/.agents/skills-archive/database-migration c:/appiw/.agents/skills/database-migration
```

**Step 2: Verificar y actualizar frontmatter**

Leer `.agents/skills/database-migration/SKILL.md`. El `description` debe incluir TypeORM e iWana neXt:
```yaml
---
name: database-migration
description: Migraciones TypeORM versionadas y reversibles para iWana neXt. Usar para crear, aplicar o revertir migraciones PostgreSQL multi-tenant con estrategias zero-downtime.
---
```

**Step 3: Commit**

```bash
git add .agents/skills/database-migration .agents/skills-archive/database-migration
git commit -m "feat(skills): restore database-migration to active catalog"
```

---

## Task 3: Restaurar `e2e-testing-patterns` al catálogo activo

**Files:**
- Move: `.agents/skills-archive/e2e-testing-patterns/` → `.agents/skills/e2e-testing-patterns/`
- Modify: `.agents/skills/e2e-testing-patterns/SKILL.md` (verificar frontmatter)

**Step 1: Mover la carpeta**

```bash
mv c:/appiw/.agents/skills-archive/e2e-testing-patterns c:/appiw/.agents/skills/e2e-testing-patterns
```

**Step 2: Verificar y actualizar frontmatter**

```yaml
---
name: e2e-testing-patterns
description: Patrones E2E avanzados con Playwright para iWana neXt. Usar para flujos de usuario críticos, tests flaky, trazas y CI paralelo. Complementa playwright-skill con patrones de profundidad.
---
```

**Step 3: Commit**

```bash
git add .agents/skills/e2e-testing-patterns .agents/skills-archive/e2e-testing-patterns
git commit -m "feat(skills): restore e2e-testing-patterns to active catalog"
```

---

## Task 4: Restaurar `typescript-pro` al catálogo activo

**Files:**
- Move: `.agents/skills-archive/typescript-pro/` → `.agents/skills/typescript-pro/`
- Modify: `.agents/skills/typescript-pro/SKILL.md` (verificar frontmatter + nota modelo Opus)

**Step 1: Mover la carpeta**

```bash
mv c:/appiw/.agents/skills-archive/typescript-pro c:/appiw/.agents/skills/typescript-pro
```

**Step 2: Verificar y actualizar frontmatter**

Esta skill tiene `metadata: model: opus` — conservar. Actualizar description:
```yaml
---
name: typescript-pro
description: TypeScript avanzado para iWana neXt — generics, tipos condicionales, decoradores NestJS, inferencia compleja. Usar cuando typescript-expert no sea suficiente para el problema de tipado. Usa modelo Opus.
metadata:
  model: opus
---
```

**Step 3: Commit**

```bash
git add .agents/skills/typescript-pro .agents/skills-archive/typescript-pro
git commit -m "feat(skills): restore typescript-pro (Opus) to active catalog"
```

---

## Task 5: Restaurar `codebase-cleanup-deps-audit` al catálogo activo

**Files:**
- Move: `.agents/skills-archive/codebase-cleanup-deps-audit/` → `.agents/skills/codebase-cleanup-deps-audit/`
- Modify: `.agents/skills/codebase-cleanup-deps-audit/SKILL.md` (verificar frontmatter)

**Step 1: Mover la carpeta**

```bash
mv c:/appiw/.agents/skills-archive/codebase-cleanup-deps-audit c:/appiw/.agents/skills/codebase-cleanup-deps-audit
```

**Step 2: Verificar y actualizar frontmatter**

```yaml
---
name: codebase-cleanup-deps-audit
description: Auditoría de dependencias pnpm para iWana neXt — vulnerabilidades CVE, licencias, paquetes desactualizados, supply chain. Usar antes de releases o cuando pnpm audit reporte issues.
---
```

**Step 3: Commit**

```bash
git add .agents/skills/codebase-cleanup-deps-audit .agents/skills-archive/codebase-cleanup-deps-audit
git commit -m "feat(skills): restore codebase-cleanup-deps-audit to active catalog"
```

---

## Task 6: Actualizar INDEX.md con las 5 skills restauradas

**Files:**
- Modify: `.agents/skills/INDEX.md`

**Step 1: Leer el INDEX.md actual**

Leer `.agents/skills/INDEX.md` para entender la estructura vigente.

**Step 2: Agregar las 5 skills en sus secciones correspondientes**

En `## Skills core activas → ### Prioridad de uso`:

- `#### Primera línea` — sin cambios
- `#### Segunda línea` — agregar `typescript-pro` (va junto a `typescript-expert`)
- `#### Especializadas por necesidad` — agregar `turborepo-caching`, `database-migration`, `e2e-testing-patterns`, `codebase-cleanup-deps-audit`

En las secciones por área:

- `### Arquitectura y gobierno` → agregar `turborepo-caching`
- `### Backend y plataforma` → agregar `database-migration`, `typescript-pro`
- `### Frontend y accesibilidad` → sin cambios nuevos
- `### Testing` → agregar `e2e-testing-patterns`
- Agregar nueva sección `### Mantenimiento y dependencias` → `codebase-cleanup-deps-audit`

**Step 3: Actualizar la nota de fecha y conteo al pie**

Cambiar referencia de "25 skills" a "30 skills" si existe.

**Step 4: Commit**

```bash
git add .agents/skills/INDEX.md
git commit -m "feat(skills): update INDEX.md with 5 restored skills (30 total)"
```

---

## Task 7: Actualizar README.md y MANIFEST.json del catálogo

**Files:**
- Modify: `.agents/skills/README.md`
- Modify: `.agents/skills/MANIFEST.json`

**Step 1: Leer ambos archivos**

Leer `.agents/skills/README.md` y `.agents/skills/MANIFEST.json`.

**Step 2: Actualizar README.md**

- Cambiar `Skills activas: 25` → `Skills activas: 30`
- Agregar las 5 skills en sus secciones de área correspondientes
- Actualizar el `## Mapa rápido de combinación` con los nuevos casos:
  - Migración de schema → `database-migration` → `postgresql`
  - Optimización CI/monorepo → `turborepo-caching` → `monorepo-architect`
  - Tipos complejos → `typescript-pro` → `typescript-expert`
  - Auditoría deps → `codebase-cleanup-deps-audit` → `security-auditor`
  - E2E avanzado → `e2e-testing-patterns` → `playwright-skill`

**Step 3: Actualizar MANIFEST.json**

Cambiar:
```json
"coreCount": 25  →  "coreCount": 30
"potentializedCoreCount": 25  →  "potentializedCoreCount": 30
```

Agregar las 5 skills en `"usagePriority"`:
- `"secondLine"` → agregar `"typescript-pro"`
- `"specialized"` → agregar `"turborepo-caching"`, `"database-migration"`, `"e2e-testing-patterns"`, `"codebase-cleanup-deps-audit"`

**Step 4: Commit**

```bash
git add .agents/skills/README.md .agents/skills/MANIFEST.json
git commit -m "feat(skills): update README and MANIFEST to 30 active skills"
```

---

## Task 8: Agregar sección de despacho en CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Leer CLAUDE.md actual**

Leer `CLAUDE.md` para identificar el punto de inserción correcto (después de `## Reglas Modulares` y antes de `## Comandos de Desarrollo`).

**Step 2: Insertar la sección completa**

Agregar la siguiente sección en CLAUDE.md después de `## Reglas Modulares`:

```markdown
## Despacho de Skills

Las skills activas del proyecto viven en `.agents/skills/{nombre}/SKILL.md`.
**Siempre leer la skill con `Read` antes de actuar — nunca de memoria.**

### Regla general de resolución

Resolver en este orden antes de generar código o tomar decisiones:

1. **Skills de proceso** (si la tarea implica diseño, planning o bug): `brainstorming` → `writing-plans` → `systematic-debugging` → `test-driven-development`
2. **Skills de dominio** (primera línea según el área técnica)
3. **Skills de segunda línea** (para profundizar cuando la tarea ya está acotada)
4. **Skills especializadas** (solo cuando el problema es específico del dominio)

Máximo 3 skills simultáneas salvo tareas explícitamente transversales (inicio de módulo, sprint planning).
Anti-duplicación: si dos skills cubren el mismo dominio, usar la de mayor prioridad en INDEX.md.

### Backend (NestJS / API)

| Condición | Primera skill | Complementar con |
|---|---|---|
| Crear/modificar módulo, servicio, controller | `nestjs-expert` | `typescript-expert` |
| Endpoint auth, JWT, MFA, guards, decorators | `auth-implementation-patterns` | `nestjs-expert`, `backend-security-coder` |
| Queries, entidades, TypeORM, índices | `postgresql` | `nestjs-expert` |
| Migraciones TypeORM, zero-downtime, rollback | `database-migration` | `postgresql` |
| Colas BullMQ, workers, jobs, DLQ, retry | `bullmq-specialist` | `nestjs-expert` |
| Contrato OpenAPI, DTOs, versioning REST | `openapi-spec-generation` | `nestjs-expert` |
| Logs, métricas, trazabilidad distribuida | `observability-engineer` | `nestjs-expert` |
| Seguridad capa backend, hardening | `backend-security-coder` | `security-auditor` |
| Tipos complejos, generics, decoradores TS | `typescript-pro` | `typescript-expert` |

### Frontend (Next.js / UI)

| Condición | Primera skill | Complementar con |
|---|---|---|
| Páginas, layouts, rutas, RSC vs Client | `nextjs-app-router-patterns` | `frontend-dev-guidelines` |
| Componentes UI, design system, tokens | `core-components` | `tailwind-patterns` |
| Estilos Tailwind 4, CSS-first, `@theme` | `tailwind-patterns` | `core-components` |
| Formularios, validación Zod, react-hook-form | `frontend-dev-guidelines` | `nextjs-app-router-patterns` |
| Accesibilidad WCAG 2.2 AA | `wcag-audit-patterns` | `core-components` |
| i18n, textos es-CO, mensajes localizados | `i18n-localization` | `frontend-dev-guidelines` |
| Seguridad cliente, XSS, CSP, sanitización | `frontend-security-coder` | `security-auditor` |

### Arquitectura y Gobierno

| Condición | Primera skill | Complementar con |
|---|---|---|
| Inicio de módulo, boundaries, HLD | `monorepo-architect` | `architect-review` |
| Optimización pipelines Turborepo, caché CI | `turborepo-caching` | `monorepo-architect` |
| Crear/revisar ADR | `architecture-decision-records` | `architect-review` |
| Review técnico de PR o diseño | `architect-review` | skill del dominio afectado |
| Documentación técnica, informes, specs | `docs-architect` | `mermaid-expert` |
| Diagramas Mermaid, C4, secuencia | `mermaid-expert` | `docs-architect` |
| Docker, infra on-premise, compose | `docker-expert` | — |

### Testing

| Condición | Primera skill | Complementar con |
|---|---|---|
| Unit/integration tests Jest + Supertest | `testing-patterns` | skill del dominio |
| TDD — escribir test antes de implementar | `test-driven-development` | `testing-patterns` |
| E2E Playwright, flujos usuario críticos | `playwright-skill` | `e2e-testing-patterns` |
| E2E avanzado, tests flaky, trazas, CI | `e2e-testing-patterns` | `playwright-skill` |

### Seguridad y Mantenimiento

| Condición | Primera skill | Complementar con |
|---|---|---|
| Auditoría de seguridad global | `security-auditor` | skill de la capa afectada |
| Seguridad backend específica | `backend-security-coder` | `security-auditor` |
| Seguridad frontend específica | `frontend-security-coder` | `security-auditor` |
| Auditoría deps, CVEs, pnpm audit | `codebase-cleanup-deps-audit` | `security-auditor` |

### Combinaciones Frecuentes

| Tarea compuesta | Secuencia de skills |
|---|---|
| Nuevo endpoint backend completo | `nestjs-expert` → `openapi-spec-generation` → `testing-patterns` |
| Nueva página frontend con formulario | `nextjs-app-router-patterns` → `frontend-dev-guidelines` → `core-components` |
| Inicio de módulo nuevo | `monorepo-architect` → `architect-review` → `architecture-decision-records` |
| Bug con impacto en seguridad | `security-auditor` → skill capa afectada → `testing-patterns` |
| Feature con auth multi-tenant | `auth-implementation-patterns` → `nestjs-expert` → `backend-security-coder` |
| Componente accesible con i18n | `core-components` → `wcag-audit-patterns` → `i18n-localization` |
| Migración de schema tenant | `database-migration` → `postgresql` → `testing-patterns` |
| Optimización monorepo / CI | `turborepo-caching` → `monorepo-architect` |
| Tipos complejos compartidos TS | `typescript-pro` → `typescript-expert` |
| Preparar release / auditoría deps | `codebase-cleanup-deps-audit` → `security-auditor` |
```

**Step 3: Verificar que la sección quedó bien integrada**

Leer CLAUDE.md completo y confirmar que no hay secciones duplicadas ni referencias rotas.

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "feat(claude): add skills dispatch section with 30 skills"
```

---

## Task 9: Agregar sección de despacho en AGENTS.md

**Files:**
- Modify: `AGENTS.md`

**Step 1: Leer AGENTS.md actual**

Leer `AGENTS.md` para identificar dónde insertar (después de `## Skills Prioritarias por Modo` y antes de `## Cumplimiento Regulatorio`).

**Step 2: Insertar sección compacta**

```markdown
## Despacho de Skills

Ruta: `.agents/skills/{nombre}/SKILL.md`. Leer con `Read` antes de actuar.

### Orden de resolución

1. Skills de proceso (`brainstorming`, `writing-plans`, `systematic-debugging`) si la tarea implica diseño o bug.
2. Skills de dominio (primera línea) según área técnica.
3. Skills de segunda línea para profundizar.
4. Skills especializadas solo cuando el problema sea específico.

### Backend

| Condición | Skill principal | Complemento |
|---|---|---|
| Módulo, servicio, controller NestJS | `nestjs-expert` | `typescript-expert` |
| Auth, JWT, MFA, guards | `auth-implementation-patterns` | `nestjs-expert` |
| Queries, entidades, TypeORM | `postgresql` | `nestjs-expert` |
| Migraciones, zero-downtime | `database-migration` | `postgresql` |
| BullMQ, workers, colas | `bullmq-specialist` | `nestjs-expert` |
| OpenAPI, DTOs, contratos | `openapi-spec-generation` | `nestjs-expert` |
| Logs, métricas, trazas | `observability-engineer` | `nestjs-expert` |
| Seguridad backend | `backend-security-coder` | `security-auditor` |
| Tipos complejos TS | `typescript-pro` | `typescript-expert` |

### Frontend

| Condición | Skill principal | Complemento |
|---|---|---|
| Páginas, layouts, RSC | `nextjs-app-router-patterns` | `frontend-dev-guidelines` |
| Componentes UI, tokens | `core-components` | `tailwind-patterns` |
| Tailwind 4, CSS-first | `tailwind-patterns` | `core-components` |
| Formularios, Zod | `frontend-dev-guidelines` | `nextjs-app-router-patterns` |
| Accesibilidad WCAG | `wcag-audit-patterns` | `core-components` |
| i18n, es-CO | `i18n-localization` | `frontend-dev-guidelines` |
| Seguridad cliente | `frontend-security-coder` | `security-auditor` |

### Arquitectura, Testing y Seguridad

| Condición | Skill principal | Complemento |
|---|---|---|
| Inicio de módulo, HLD | `monorepo-architect` | `architect-review` |
| Turborepo, caché CI | `turborepo-caching` | `monorepo-architect` |
| ADR | `architecture-decision-records` | `architect-review` |
| Docs, informes | `docs-architect` | `mermaid-expert` |
| Docker, infra | `docker-expert` | — |
| Unit/integration tests | `testing-patterns` | skill del dominio |
| TDD | `test-driven-development` | `testing-patterns` |
| E2E Playwright | `playwright-skill` | `e2e-testing-patterns` |
| E2E avanzado, flaky | `e2e-testing-patterns` | `playwright-skill` |
| Auditoría seguridad | `security-auditor` | skill de capa |
| Auditoría deps, CVEs | `codebase-cleanup-deps-audit` | `security-auditor` |

### Combinaciones frecuentes

- Nuevo endpoint → `nestjs-expert` → `openapi-spec-generation` → `testing-patterns`
- Nueva página + form → `nextjs-app-router-patterns` → `frontend-dev-guidelines` → `core-components`
- Inicio de módulo → `monorepo-architect` → `architect-review` → `architecture-decision-records`
- Bug seguridad → `security-auditor` → skill capa → `testing-patterns`
- Auth multi-tenant → `auth-implementation-patterns` → `nestjs-expert` → `backend-security-coder`
- Migración schema → `database-migration` → `postgresql` → `testing-patterns`
- Optimización CI → `turborepo-caching` → `monorepo-architect`
- Auditoría deps → `codebase-cleanup-deps-audit` → `security-auditor`
```

**Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "feat(agents): add skills dispatch section with 30 skills"
```

---

## Task 10: Actualizar .github/copilot-instructions.md

**Files:**
- Modify: `.github/copilot-instructions.md`

**Step 1: Leer el archivo actual**

Leer `.github/copilot-instructions.md` para identificar el punto de inserción (después de `## Testing`).

**Step 2: Insertar sección de skills compacta**

```markdown
## Skills

Skills activas en `.agents/skills/{nombre}/SKILL.md`. Leerlas con `Read` antes de actuar.

### Backend
- Módulo/servicio/controller → `nestjs-expert`
- Auth, JWT, MFA, guards → `auth-implementation-patterns`
- Queries, TypeORM → `postgresql`
- Migraciones zero-downtime → `database-migration`
- BullMQ, workers → `bullmq-specialist`
- OpenAPI, contratos → `openapi-spec-generation`
- Logs, métricas → `observability-engineer`
- Seguridad backend → `backend-security-coder`
- Tipos complejos TS → `typescript-pro`

### Frontend
- Páginas, layouts, RSC → `nextjs-app-router-patterns`
- Componentes UI, tokens → `core-components`
- Tailwind 4, CSS-first → `tailwind-patterns`
- Formularios, Zod → `frontend-dev-guidelines`
- Accesibilidad WCAG → `wcag-audit-patterns`
- i18n, es-CO → `i18n-localization`
- Seguridad cliente → `frontend-security-coder`

### Arquitectura, Testing y Seguridad
- Inicio de módulo, HLD → `monorepo-architect`
- Turborepo, caché CI → `turborepo-caching`
- ADR → `architecture-decision-records`
- Review técnico → `architect-review`
- Docs, informes → `docs-architect` + `mermaid-expert`
- Docker → `docker-expert`
- Unit/integration tests → `testing-patterns`
- TDD → `test-driven-development`
- E2E Playwright → `playwright-skill` + `e2e-testing-patterns`
- Auditoría seguridad → `security-auditor`
- Auditoría deps → `codebase-cleanup-deps-audit`
```

**Step 3: Commit**

```bash
git add .github/copilot-instructions.md
git commit -m "feat(copilot): add skills dispatch section with 30 skills"
```

---

## Task 11: Actualizar informe vigente en docs/informes/

**Files:**
- Modify o Create: `docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md` (si existe) o `docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.1.md`

**Step 1: Verificar si existe el informe previo**

```bash
ls c:/appiw/docs/informes/ | grep SKILLS
```

**Step 2a: Si existe — actualizar el informe vigente**

Agregar sección al final:
```markdown
## Actualización 2026-03-14 — Integración de despacho de skills

- Restauradas 5 skills del archivo: turborepo-caching, database-migration, e2e-testing-patterns, typescript-pro, codebase-cleanup-deps-audit
- Catálogo activo: 25 → 30 skills
- Actualizados: INDEX.md, README.md, MANIFEST.json
- Sección `## Despacho de Skills` agregada en: CLAUDE.md, AGENTS.md, .github/copilot-instructions.md
- Documento de diseño: docs/plans/2026-03-14-skills-dispatch-design.md
```

**Step 2b: Si no existe — crear informe inicial**

Crear `docs/informes/INFORME-SISTEMA-SKILLS-INTEGRACION-v1.0.md` con el resumen de cambios.

**Step 3: Commit final**

```bash
git add docs/informes/
git commit -m "docs(informes): register skills dispatch integration in audit report"
```

---

## Verificación final

Después de completar todos los tasks, verificar:

```bash
# 30 skills activas en el catálogo
ls c:/appiw/.agents/skills/ | grep -v -E "(INDEX|MANIFEST|README|gitignore)" | wc -l
# Esperado: 30

# Las 5 skills restauradas están presentes
ls c:/appiw/.agents/skills/ | grep -E "(turborepo|database-migration|e2e-testing|typescript-pro|codebase-cleanup)"
# Esperado: 5 líneas

# Los tres archivos tienen la sección de despacho
grep -l "Despacho de Skills" c:/appiw/CLAUDE.md c:/appiw/AGENTS.md
grep -l "## Skills" c:/appiw/.github/copilot-instructions.md
```
