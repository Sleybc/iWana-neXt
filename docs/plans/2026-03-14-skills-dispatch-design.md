# Diseño: Integración de Skills al Flujo de Trabajo de Agentes

**Fecha:** 2026-03-14
**Estado:** Aprobado
**Modo:** Mixto (EM + Architect)
**Referencias:** AGENTS.md, CLAUDE.md, .agents/skills/INDEX.md, .agents/skills/README.md

---

## 1. Contexto y Problema

El catálogo `.agents/skills/` contiene 25 skills activas organizadas por prioridad y dominio,
pero los archivos de instrucción de agentes (CLAUDE.md, AGENTS.md, copilot-instructions.md)
no incluyen reglas de despacho condicional. Esto obliga al agente a inferir qué skill usar
o ignorarlas por completo, reduciendo la calidad y consistencia del trabajo.

---

## 2. Objetivo

Integrar el catálogo de skills al flujo de trabajo de **todos los agentes** del repo mediante
reglas de despacho condicional en CLAUDE.md, AGENTS.md y .github/copilot-instructions.md,
de modo que cada agente sepa **cuándo leer qué skill** antes de actuar.

---

## 3. Decisión de Enfoque

**Enfoque B aprobado:** Despacho por capa/dominio en secciones dedicadas.

Cada archivo recibe una sección `## Despacho de Skills` con subsecciones por dominio.
Se complementa con un bloque de combinaciones frecuentes y reglas anti-duplicación.

---

## 4. Skills a Restaurar del Archivo

Antes de implementar el despacho, restaurar estas 5 skills de `.agents/skills-archive/`
hacia `.agents/skills/`:

| Skill | Dominio | Justificación |
|---|---|---|
| `turborepo-caching` | Arquitectura/Monorepo | Optimización Turborepo; no duplica `monorepo-architect` |
| `database-migration` | Backend | Migraciones TypeORM zero-downtime; profundiza `postgresql` |
| `e2e-testing-patterns` | Testing | Patrones E2E Playwright detallados; profundiza `playwright-skill` |
| `typescript-pro` | Backend/Frontend | Tipos avanzados, generics, decoradores; usa modelo Opus |
| `codebase-cleanup-deps-audit` | Seguridad/Mantenimiento | Auditoría de dependencias pnpm; cobertura nueva |

Tras restauración: **30 skills activas** en total.

---

## 5. Estructura de la Sección de Despacho

### 5.1 Regla General (aplica en los tres archivos)

```
Orden de resolución:
1. Skills de PROCESO primero  → brainstorming, writing-plans, debugging, TDD
2. Skills de DOMINIO segundo  → nestjs-expert, nextjs-app-router-patterns, etc.
3. Skills de SEGUNDA LÍNEA    → security-auditor, architect-review, etc.
4. Skills ESPECIALIZADAS      → bullmq-specialist, playwright-skill, etc.

Ruta de skills: .agents/skills/{nombre}/SKILL.md
El agente DEBE leerla con Read antes de actuar — nunca de memoria.
Máximo 3 skills simultáneas salvo tareas explícitamente transversales.
```

### 5.2 Despacho por Dominio (30 skills)

#### Backend (NestJS / API)

| Condición | Primera skill | Complementar con |
|---|---|---|
| Crear/modificar módulo, servicio, controller | `nestjs-expert` | `typescript-expert` |
| Endpoint auth, JWT, MFA, guards, decorators | `auth-implementation-patterns` | `nestjs-expert`, `backend-security-coder` |
| Queries, entidades, TypeORM, índices | `postgresql` | `nestjs-expert` |
| Migraciones TypeORM, zero-downtime, rollback | `database-migration` | `postgresql` |
| Colas BullMQ, workers, jobs, DLQ, retry | `bullmq-specialist` | `nestjs-expert` |
| Contrato OpenAPI, DTOs, versioning REST | `openapi-spec-generation` | `nestjs-expert` |
| Logs, métricas, trazabilidad | `observability-engineer` | `nestjs-expert` |
| Seguridad en capa backend | `backend-security-coder` | `security-auditor` |
| Tipos complejos, generics, decoradores TS | `typescript-pro` | `typescript-expert` |

#### Frontend (Next.js / UI)

| Condición | Primera skill | Complementar con |
|---|---|---|
| Páginas, layouts, rutas, RSC vs Client | `nextjs-app-router-patterns` | `frontend-dev-guidelines` |
| Componentes UI, design system, tokens | `core-components` | `tailwind-patterns` |
| Estilos Tailwind 4, CSS-first, `@theme` | `tailwind-patterns` | `core-components` |
| Formularios, validación Zod, react-hook-form | `frontend-dev-guidelines` | `nextjs-app-router-patterns` |
| Accesibilidad WCAG 2.2 AA | `wcag-audit-patterns` | `core-components` |
| i18n, textos es-CO, mensajes | `i18n-localization` | `frontend-dev-guidelines` |
| Seguridad en capa cliente, XSS, CSP | `frontend-security-coder` | `security-auditor` |

#### Arquitectura y Gobierno

| Condición | Primera skill | Complementar con |
|---|---|---|
| Inicio de módulo, boundaries, HLD | `monorepo-architect` | `architect-review` |
| Optimización pipelines Turborepo, caché CI | `turborepo-caching` | `monorepo-architect` |
| Crear/revisar ADR | `architecture-decision-records` | `architect-review` |
| Review técnico de PR o diseño | `architect-review` | skill del dominio afectado |
| Documentación técnica, informes, specs | `docs-architect` | `mermaid-expert` |
| Diagramas Mermaid, C4, secuencia | `mermaid-expert` | `docs-architect` |
| Docker, infra on-premise, compose | `docker-expert` | — |

#### Testing

| Condición | Primera skill | Complementar con |
|---|---|---|
| Unit/integration tests Jest + Supertest | `testing-patterns` | skill del dominio |
| TDD — escribir test antes de implementar | `test-driven-development` | `testing-patterns` |
| E2E Playwright, flujos usuario, CI | `playwright-skill` | `e2e-testing-patterns` |
| Patrones E2E avanzados, flaky tests, trazas | `e2e-testing-patterns` | `playwright-skill` |

#### Seguridad y Mantenimiento

| Condición | Primera skill | Complementar con |
|---|---|---|
| Auditoría de seguridad global | `security-auditor` | skill de la capa afectada |
| Seguridad backend específica | `backend-security-coder` | `security-auditor` |
| Seguridad frontend específica | `frontend-security-coder` | `security-auditor` |
| Auditoría dependencias, CVEs, pnpm | `codebase-cleanup-deps-audit` | `security-auditor` |

### 5.3 Combinaciones Frecuentes

| Tarea compuesta | Secuencia |
|---|---|
| Nuevo endpoint backend completo | `nestjs-expert` → `openapi-spec-generation` → `testing-patterns` |
| Nueva página frontend con formulario | `nextjs-app-router-patterns` → `frontend-dev-guidelines` → `core-components` |
| Inicio de módulo nuevo | `monorepo-architect` → `architect-review` → `architecture-decision-records` |
| Bug con impacto en seguridad | `security-auditor` → skill capa afectada → `testing-patterns` |
| Feature con auth multi-tenant | `auth-implementation-patterns` → `nestjs-expert` → `backend-security-coder` |
| Componente accesible con i18n | `core-components` → `wcag-audit-patterns` → `i18n-localization` |
| Migración de schema tenant | `database-migration` → `postgresql` → `testing-patterns` |
| Optimización monorepo / CI | `turborepo-caching` → `monorepo-architect` |
| Tipos complejos compartidos | `typescript-pro` → `typescript-expert` |
| Preparar release / auditoría deps | `codebase-cleanup-deps-audit` → `security-auditor` |

---

## 6. Diferencias por Archivo

| Archivo | Sección | Tono | Contenido |
|---|---|---|---|
| `CLAUDE.md` | `## Despacho de Skills` | Operativo, detallado | Regla general + tablas completas + combinaciones + skills proceso |
| `AGENTS.md` | `## Despacho de Skills` | Gobernanza, compacto | Regla general + tablas compactas + combinaciones |
| `.github/copilot-instructions.md` | `## Skills` | Guía rápida | Listado por dominio, sin tablas extensas |

---

## 7. Archivos a Modificar

1. Mover 5 skills de `.agents/skills-archive/` → `.agents/skills/`
2. Actualizar `.agents/skills/INDEX.md` con las 5 skills restauradas
3. Actualizar `.agents/skills/README.md` con conteo y prioridades actualizadas
4. Actualizar `.agents/skills/MANIFEST.json` con el nuevo estado
5. Agregar sección `## Despacho de Skills` en `CLAUDE.md`
6. Agregar sección `## Despacho de Skills` en `AGENTS.md`
7. Agregar sección `## Skills` en `.github/copilot-instructions.md`

---

## 8. Criterios de Éxito

- Cualquier agente (Claude Code, Copilot, agente genérico) puede resolver qué skill usar
  sin necesidad de leer INDEX.md primero.
- No hay duplicación de reglas entre los tres archivos — solo diferencia de nivel de detalle.
- Las 5 skills restauradas tienen frontmatter válido (`name`, `description`) y están en INDEX.md.
- El catálogo activo sube de 25 a 30 skills sin violar ningún criterio de admisión del INDEX.md.
