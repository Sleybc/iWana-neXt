# INFORME — Consolidación del catálogo de skills (52 → 43)

**Versión:** 1.4
**Estado:** Aprobado. G0 el 2026-11-08 (§6); en ejecución, avance en §8
**Cambio v1.0 → v1.1 (2026-11-08):** registro de G0 y del cierre de la Ola 1 (G1) en §8; deuda de B1 asignada a B2 y B3a
**Cambio v1.1 → v1.2 (2026-11-08):** registro de la Ola 2 (§8.3); §5.1 quedó corto: el recorte a su lista perdió tres reglas únicas, que se restauran en B2-R; los auxiliares npm de `playwright-skill` salen en B4
**Cambio v1.2 → v1.3 (2026-11-08):** registro de la Ola 3 (§8.4): G2 y G3 cerrados; inventario de referencias vivas a las 9 skills que salen, para B4
**Cambio v1.3 → v1.4 (2026-11-09):** registro de la Ola 4 y de B5 (§8.5): G4 ✅; G5 abrió con 3 bloqueantes en `API_REFERENCE.md`, corregidos en B4-R; G5 ✅ con excepciones históricas; P4 del plan cerrada
**Fecha:** 2026-11-09
**Emitido por:** AI-EM-ARCH
**Convención documental:** {TIPO}-{MODULO}-{FASE}-v{VERSION}.md

## Vínculos de trazabilidad

- Plan de orquestación: [2026-11-08-skills-consolidacion-orquestacion.md](../plans/2026-11-08-skills-consolidacion-orquestacion.md)
- Lanzador de la Ola 1 (cerrada): [PROMPT-SISTEMA-SKILLS-CONSOLIDACION-LAUNCH-v1.0.md](../prompts/PROMPT-SISTEMA-SKILLS-CONSOLIDACION-LAUNCH-v1.0.md)
- Lanzador de la Ola 2 (ejecutada): [PROMPT-SISTEMA-SKILLS-CONSOLIDACION-OLA2-LAUNCH-v1.0.md](../prompts/PROMPT-SISTEMA-SKILLS-CONSOLIDACION-OLA2-LAUNCH-v1.0.md)
- Lanzador de la Ola 3 (ejecutada): [PROMPT-SISTEMA-SKILLS-CONSOLIDACION-OLA3-LAUNCH-v1.0.md](../prompts/PROMPT-SISTEMA-SKILLS-CONSOLIDACION-OLA3-LAUNCH-v1.0.md)
- Lanzador de la Ola 4: [PROMPT-SISTEMA-SKILLS-CONSOLIDACION-OLA4-LAUNCH-v1.0.md](../prompts/PROMPT-SISTEMA-SKILLS-CONSOLIDACION-OLA4-LAUNCH-v1.0.md)
- Historial del catálogo: [INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md](INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md) (adenda del 2026-11-08)
- Fuentes: `AGENTS.md` → Skills Dispatch; `.agents/skills/INDEX.md` v1.8; `.agents/skills/MANIFEST.json` v1.8; `.claude/agents/*.md`

## 1. Alcance y método

- **Auditado:** las 52 skills core de `.agents/skills/` (unas 51.500 palabras en `SKILL.md`; las descripciones, que se cargan en cada sesión de Claude Code, suman unas 1.660), contrastadas con los 14 subagentes de `.claude/agents/` y con `AGENTS.md` → Skills Dispatch.
- **Fuera de alcance:** las 40 skills externas de plugin. `INDEX.md` v1.7 ya las gobierna (15 de apoyo, 25 fuera del dispatch).
- **Método:** frontmatter y tamaño de cada skill; encabezados y criterios de activación de los grupos sospechosos; búsqueda de referencias a skills inexistentes o a flujos que el repo no usa; conteo de invariantes repetidas; conteo de referencias de cada nombre en `AGENTS.md`, `.github/`, `.claude/agents/`, `.opencode/`, `.codex/`, `docs/plans/`, `docs/prompts/` y `.agents/skills/`.
- **Superficie en vuelo:** el 2026-11-08 `git status` no muestra cambios en `.agents/`, `.claude/agents/`, `AGENTS.md`, `.github/`, `.opencode/` ni `.codex/` (solo `.claude/launch.json` sin seguimiento, ajeno).

## 2. Resultado

| Elemento | Cantidad |
| --- | --- |
| Skills core analizadas | 52 |
| Pares que se solapan | 22 (§3) |
| Conflictos de ruteo graves (impacto Alto) | 6 |
| Salen del catálogo | 9: 7 se fusionan, 1 se da de baja y 1 pasa a hold |
| Se refactorizan | 16 (§5.2) |
| Sucesoras que absorben a otra | 7 (§5.1) |
| Sin cambio de alcance ni de disparador | 20 (solo pierden las invariantes repetidas, D1) |
| **Catálogo resultante** | **43** |

Ahorro estimado (estimación, no medición): alrededor de −16 % de palabras en los `SKILL.md` (unas 8.500, de las que 6.450 son de `ui-ux-pro-max`) y unas 300 palabras menos en las descripciones que se cargan en cada sesión.

### 2.1 Instrucciones redundantes o desactualizadas

| # | Skill | Evidencia |
| --- | --- | --- |
| D1 | 8 skills | Repiten «multi-tenant por schema»; 3 repiten «zero-trust PII» y 15 «pnpm». Las tres invariantes ya viven en `AGENTS.md`, que todos los clientes leen |
| D2 | `ui-ux-pro-max` | Declara «Stack: React Native (this project's only tech stack)» y su Paso 4 es de React Native. Pide persistir un design system propio (Master + Overrides), que choca con `ds-owner` y `packages/ui`. Cero menciones de iWana. `scripts/__pycache__/` versionado |
| D3 | `finishing-a-development-branch` | `git checkout`, merge, `branch -d` y limpieza de worktrees en un repo que trabaja solo en `main`. Decisión pendiente del CTO desde el 2026-09-13 |
| D4 | `executing-plans`, `subagent-driven-development` | Exigen `finishing-a-development-branch` como «REQUIRED SUB-SKILL»: la cadena termina en un flujo que el repo no usa |
| D5 | `typescript-pro` | Cuerpo genérico en inglés («You are a TypeScript expert…»). `metadata.model: opus` no lo aplica ningún cliente. Su disparador («cuando typescript-expert no sea suficiente») no es decidible |
| D6 | `writing-skills` | Remite a `opencode-expert`, que no existe, y a niveles pensados para AWS o Convex. Ni ella ni `skill-creator` conocen INDEX, MANIFEST ni `pnpm sync:skills` |
| D7 | `core-components` | Muestra «Estado actual de @iwana/ui (Sprint 1)». Último cambio de la skill: 2026-07-19 (`7cd44be4`); último cambio de `packages/ui/src`: 2026-11-06 (`de0bcfa7`). Inventario probablemente desactualizado |
| D8 | `brainstorming` | Descripción «You MUST use this before any creative work» y HARD-GATE que alcanza incluso a «a config change». Commitea el spec por su cuenta, contra la regla de commitear solo a pedido |
| D9 | `iwana-tenant-migration` | `disable-model-invocation: true` sin motivo documentado (no aparece en `INFORME-CLAUDE-CODE-AUTOMATIZACIONES-v1.0.md`). El modelo no puede elegirla y cae en el patrón tenant genérico de `database-migration` |
| D10 | `AGENTS.md` → Skills Dispatch | «Cierre de rama de desarrollo: `finishing-a-development-branch`»; la línea de migraciones no cita `iwana-tenant-migration`; casi todas las líneas emparejan dos skills con «+», síntoma de fronteras sin definir |
| D11 | INDEX ↔ MANIFEST | Asimetría en `specializedOnDemand` anotada el 2026-09-13 y sin resolver |

## 3. Solapamientos

| # | Skill A | Skill B | Dónde se solapan | Impacto | Acción |
| --- | --- | --- | --- | --- | --- |
| S1 | `iwana-identity-ui-review` | `frontend-dev-guidelines`, `core-components`, `ui-ux-pro-max` | Las cuatro se activan con «crear/construir pantalla» | **Alto**: ruteo impredecible y hasta ~11.000 palabras cargadas a la vez | Refactorizar disparadores |
| S2 | `ui-ux-pro-max` | `iwana-identity-ui-review`, `core-components`, `wcag-audit-patterns` | Heurísticas de UI, color, tipografía, a11y | **Alto**: stack equivocado y design system paralelo (D2) | **Archivar** (hold) |
| S3 | `senior-ui-systems-designer` | `iwana-identity-ui-review` | Dirección visual y revisión visual sistémica; el dispatch las usa siempre juntas | Medio | **Fusionar** |
| S4 | `nextjs-app-router-patterns` | `frontend-dev-guidelines` | Server/Client Components, carga de datos, estructura; siempre en par | Medio | **Fusionar** |
| S5 | `core-components` | `tailwind-patterns` | Las dos tienen sección «Tokens»; variantes con CVA | Medio: dos fuentes para los tokens | Refactorizar |
| S6 | `playwright-skill` | `e2e-testing-patterns` | storageState, verificación de tenant, selectores, flaky y antipatrones, sección por sección | **Alto**: instrucciones divergentes para el mismo test | **Fusionar** |
| S7 | `testing-patterns` | `e2e-testing-patterns` | Sección «E2E con Playwright» | Bajo | Refactorizar |
| S8 | `verification-before-completion` | `iwana-test-evidence` | «Antes de declarar verde» | Medio: la genérica no conoce las trampas de caché de Turbo | Refactorizar |
| S9 | `database-migration` | `iwana-tenant-migration` | Migración en schema tenant (patrón dinámico genérico frente a `runner.ts`) | **Alto** (D9) | Refactorizar |
| S10 | `postgresql` | `database-migration` | «TypeORM y migraciones versionadas» | Bajo | Refactorizar |
| S11 | `typescript-pro` | `typescript-expert` | Tipado; frontera no decidible (D5) | Medio | **Fusionar** |
| S12 | `backend-security-coder` | `security-auditor`, `auth-implementation-patterns` | Tenant por request, PII y audit trail repetidos; el dispatch manda «review → coder + auditor» | Medio | Refactorizar |
| S13 | `frontend-security-coder` | `frontend-dev-guidelines` | Autenticación en UI | Bajo | Refactorizar |
| S14 | `monorepo-architect` | `turborepo-caching` | Caché, pipelines, tiempos de CI; siempre en par | Medio | **Fusionar** |
| S15 | `nestjs-expert` | `postgresql`, `openapi-spec-generation`, `architect-review` | Su descripción dice cubrir TypeORM, PG, OpenAPI, seguridad y pruebas | Medio: captura intenciones de otras cinco skills | Refactorizar |
| S16 | `architect-review` | subagente `boundary-reviewer` | Boundaries | Bajo: se complementan | Mantener |
| S17 | `docs-architect` | `architecture-decision-records` | ADRs | Bajo | Refactorizar |
| S18 | `executing-plans` | `subagent-driven-development` | Ejecución de un plan; la propia `executing-plans` remite a la otra | Medio | **Fusionar** |
| S19 | `finishing-a-development-branch` | `iwana-checkpoint-commit` | Cierre e integración del trabajo | **Alto** (D3, D4) | **Eliminar** |
| S20 | `skill-creator` | `writing-skills` (+ externa `anthropic-skills:skill-creator`) | Crear y mejorar skills | Medio: tres candidatas para el mismo disparador (D6) | **Fusionar** |
| S21 | `requesting-code-review` | subagentes `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer`, `sec-eng` | Revisión de un diff | Medio: despacha un revisor genérico e ignora a los cuatro del repo | Refactorizar (enrutar) |
| S22 | `brainstorming` | subagente `prod-ux`, `writing-plans`, `iwana-cierre-fase` | Diseño previo | **Alto** (D8) | Refactorizar |

Además, sin cambio de contenido: `writing-plans` e `iwana-cierre-fase` escriben ambas en `docs/plans/` (aclarar disparador), y `dispatching-parallel-agents` compite con el modo con subagentes de `executing-plans` (acotar disparador).

## 4. Catálogo resultante (43)

### 4.1 Reglas de activación

1. **Una primaria por intención.** Una complementaria solo se suma si la columna «Se activa cuando» de la primaria la nombra.
2. **Invariantes en un solo lugar.** Tenancy, PII, stack y pnpm viven en `AGENTS.md`. Cada skill las cita en una línea y no las repite.
3. **Desempate por artefacto.** Si la intención es ambigua, decide la ruta tocada: `migrations/tenant/` → `iwana-tenant-migration`; `e2e/` → `e2e-testing-patterns`; `turbo.json` → `monorepo-architect`; `packages/ui/` → `core-components`.
4. **Desempate por verbo.** Escribir código → skill de implementación; revisar o auditar → skill de auditoría más subagente revisor; proponer o diseñar → skill de diseño. Una tarea no carga dos modos a la vez.
5. **Formato de descripción.** «Usar cuando…» más «No usar para… → otra skill».

⊕ = absorbe a la skill indicada. El contenido único de la absorbida pasa a `references/` de la sucesora, para cargarse solo cuando hace falta: no se pierde funcionalidad.

### 4.2 Frontend y UI (8; antes 11)

| Skill | Alcance | Se activa cuando | No usar para |
| --- | --- | --- | --- |
| `frontend-dev-guidelines` ⊕ `nextjs-app-router-patterns` | Código de `apps/web` y `apps/portal`: RSC/client, datos, formularios, estructura | Se escribe o cambia código de pantalla o página | Aspecto visual → `iwana-identity-ui-review` |
| `iwana-identity-ui-review` ⊕ `senior-ui-systems-designer` | Identidad visual en tres modos: dirección (2-3 propuestas), diseño y revisión P0-P3 | Se decide o se audita cómo se ve una UI | Mecánica de RSC → `frontend-dev-guidelines` |
| `core-components` | API e inventario real de `@iwana/ui` y criterios de nuevas primitives; dueña de los tokens | Se crea o cambia una primitive de `packages/ui` | Estilos de una pantalla → `tailwind-patterns` |
| `tailwind-patterns` | Mecánica de Tailwind v4 CSS-first, CVA y dark mode; cita los tokens, no los define | Se escriben clases o variantes | Definir tokens → `core-components` |
| `frontend-security-coder` | XSS, PII en UI, redirecciones | Se renderiza contenido externo o PII, o hay navegación con parámetros | Auditoría → `security-auditor` |
| `wcag-audit-patterns` | WCAG 2.2 AA | Auditoría de accesibilidad | — |
| `i18n-localization` | Catálogos de mensajes y formatos de fecha, moneda y número | Externalizar textos o formatear valores | Qué palabra usar → `system-vocabulary-review` |
| `system-vocabulary-review` | Vocabulario visible en español | Copy, labels, seeds, módulos nuevos | — |

### 4.3 Backend y datos (13; antes 14)

| Skill | Alcance | Se activa cuando | No usar para |
| --- | --- | --- | --- |
| `nestjs-expert` | Módulos, servicios, controladores y DI dentro del Modulith | Se escribe código en `apps/api` o `apps/worker` | Modelo de datos → `postgresql` |
| `postgresql` | Modelado: tipos, constraints, índices, JSONB, retención | Se diseña o cambia una entidad o tabla | Archivo de migración → las dos siguientes |
| `database-migration` | Schema `public` y estrategia zero-downtime | Migración fuera de `migrations/tenant/` | Tenant → `iwana-tenant-migration` |
| `iwana-tenant-migration` | `NNN_*.ts`, `runner.ts`, `migration-order.spec.ts` | Archivo en `migrations/tenant/` (con invocación por el modelo, si G0 lo aprueba) | — |
| `auth-implementation-patterns` | Autenticación y autorización: JWT, rotación, MFA, guards | Se toca login, tokens, permisos o guards | Revisión → `security-auditor` |
| `backend-security-coder` | Código backend seguro: validación Zod, SQL, logs, integraciones | Se escribe un endpoint o una integración expuesta | Revisión → `security-auditor` |
| `security-auditor` | Auditoría de solo lectura con formato de hallazgos (la usa `sec-eng`) | Se revisa la seguridad de un diff o un módulo | Implementar → las *-coder |
| `openapi-spec-generation` | Contrato OpenAPI y DTOs | Cambia un contrato HTTP | — |
| `bullmq-specialist` | Patrones de jobs (idempotencia, payload, reintentos) | Se escribe un productor o un consumidor | Inspeccionar colas → `iwana-queue-inspect` |
| `iwana-queue-inspect` | Lectura del Redis de desarrollo | Depurar colas o afirmar que una cola quedó drenada | — |
| `observability-engineer` | Logs, métricas, healthchecks | Diseño de telemetría | — |
| `docker-expert` | Imágenes y Compose on-prem | Dockerfile o Compose | CI/CD → subagente `plat-ops` |
| `typescript-expert` ⊕ `typescript-pro` | Tipado estricto en el monorepo, incluido el avanzado (generics, condicionales, decoradores) | Un problema de tipos que el código del dominio no resuelve solo | Diseño de módulo → `nestjs-expert` |

### 4.4 Testing (5; antes 6)

| Skill | Alcance | Se activa cuando |
| --- | --- | --- |
| `testing-patterns` | Unitarias e integración (Jest/Supertest), pirámide, cobertura | Se escribe un spec que no es E2E |
| `e2e-testing-patterns` ⊕ `playwright-skill` | Playwright: selectores, storageState, tenant, POM, flaky, sharding | Se escribe o depura un test en `e2e/` |
| `test-driven-development` | Metodología red-green-refactor | Feature o bugfix con TDD explícito en el plan |
| `iwana-test-evidence` | Conteo real sin caché | Cualquier afirmación de que las pruebas pasan |
| `iwana-matriz-motivos` | Matriz MOD11↔MOD12 | Encargo que cruza inventario de OT o motivos de rechazo |

### 4.5 Arquitectura y documentación (5; antes 6)

| Skill | Alcance | Se activa cuando |
| --- | --- | --- |
| `architect-review` | Revisión de boundaries, tenancy y necesidad de ADR | Se evalúa una propuesta o un diseño |
| `mermaid-expert` | Diagramas | Se pide o hace falta un diagrama |
| `monorepo-architect` ⊕ `turborepo-caching` | Packages, dependencias internas, `turbo.json`, caché | Se toca `turbo.json`, el workspace o un package nuevo |
| `architecture-decision-records` | ADRs | Se crea o enmienda un ADR |
| `docs-architect` | PRD, HLD, informes y specs (sin ADRs) | Cualquier otro documento de `docs/` |

### 4.6 Flujo de trabajo y mantenimiento (12; antes 15)

| Skill | Alcance | Se activa cuando |
| --- | --- | --- |
| `brainstorming` | Diseño previo dialogado, sin commit automático | Feature nueva o cambio de comportamiento sin spec aprobada |
| `writing-plans` | Plan de implementación | Hay spec aprobada y faltan los pasos |
| `executing-plans` ⊕ `subagent-driven-development` | Ejecución de un plan, en modo secuencial o con subagentes | Hay un plan escrito para ejecutar |
| `dispatching-parallel-agents` | Investigación paralela | Dos o más fallos o preguntas independientes sin plan |
| `systematic-debugging` | Causa raíz | Bug o test rojo |
| `verification-before-completion` | Evidencia antes de afirmar; para pruebas delega en `iwana-test-evidence` | Antes de afirmar algo que no es una prueba: UI, CI, comportamiento |
| `requesting-code-review` | Enruta a `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer` o `sec-eng` según el diff | Al terminar una ola |
| `receiving-code-review` | Procesar hallazgos recibidos | Llega feedback |
| `iwana-checkpoint-commit` | Commit y push sobre `main` (sustituye a `finishing-a-development-branch`) | El usuario pide commitear |
| `iwana-cierre-fase` | INFORME + plan de orquestación + launcher | El usuario pide cerrar una fase |
| `skill-creator` ⊕ `writing-skills` | Crear o mejorar skills, evals y reglas del catálogo (INDEX, MANIFEST, `sync:skills`) | Alta o cambio de una skill |
| `codebase-cleanup-deps-audit` | Dependencias y CVE | Auditoría de dependencias o antes de un release |

Los grupos siguen los dominios de `INDEX.md` v1.8 («Mantenimiento y dependencias» se une al flujo de trabajo solo para la lectura). Total: 8 + 13 + 5 + 5 + 12 = 43, y 52 − 9 = 43.

## 5. Cambios por skill

### 5.1 Salen del catálogo (9)

| Skill | Destino | Qué se conserva y dónde |
| --- | --- | --- |
| `typescript-pro` | → `typescript-expert` | Focus Areas y checklist de tipos del monorepo → sección «Tipado avanzado» |
| `playwright-skill` | → `e2e-testing-patterns` | Lo no duplicado (estructura de test, casos prioritarios, depuración en VS Code/Windows) y `API_REFERENCE.md` → `references/`. **v1.2:** también «Datos y seguridad» y los antipatrones únicos (§8.3). `run.js`, `package.json` y `lib/` no se conservan: dependen de npm (§8.3) |
| `nextjs-app-router-patterns` | → `frontend-dev-guidelines` | Checklist y heurística de revisión de App Router → `references/app-router.md`. **v1.2:** también la regla de tenant y permisos en carga de datos y navegación (§8.3) |
| `senior-ui-systems-designer` | → `iwana-identity-ui-review` | Método de 2-3 direcciones y heurísticas por tipo de pantalla → modo «dirección» en `references/direccion-visual.md` |
| `turborepo-caching` | → `monorepo-architect` | Pipeline de `turbo.json`, inputs/outputs y depuración de cache misses → sección «Turborepo» |
| `subagent-driven-development` | → `executing-plans` | Flujo con subagentes y plantillas de prompt → modo «con subagentes» y `references/`. **v1.2:** también «no despachar implementadores en paralelo» (§8.3) |
| `writing-skills` | → `skill-creator` | Anti-racionalización y CSO → `references/`. Se descartan los niveles AWS/Convex y la cita a `opencode-expert` |
| `finishing-a-development-branch` | Baja | Nada: la verificación previa a integrar la cubren `iwana-test-evidence` e `iwana-checkpoint-commit` |
| `ui-ux-pro-max` | Hold | Si el CTO lo pide, las reglas de gráficos (§10) → `iwana-identity-ui-review/references/` antes de archivar. `skills-lock.json` conserva la procedencia upstream |

### 5.2 Se refactorizan (16)

| Skill | Cambio |
| --- | --- |
| `testing-patterns` | Quitar «E2E con Playwright»; remitir a `e2e-testing-patterns` |
| `database-migration` | Sustituir «Migración en schema de tenant (dinámica)» por una remisión a `iwana-tenant-migration` |
| `postgresql` | Reducir «TypeORM y migraciones versionadas» a una remisión |
| `iwana-tenant-migration` | Retirar `disable-model-invocation` (decisión G0-3) |
| `backend-security-coder`, `security-auditor`, `auth-implementation-patterns`, `frontend-security-coder` | Invariantes → cita a `AGENTS.md`; descripciones con el verbo que las separa (§4.1 regla 4) |
| `nestjs-expert` | Descripción limitada a Modulith, módulos, servicios y DI |
| `core-components` | Inventario de `@iwana/ui` contra `packages/ui/src`; dueña única de los tokens |
| `tailwind-patterns` | Sección «Tokens» → remisión a `core-components` |
| `docs-architect` | Excluir ADRs de su disparador |
| `brainstorming` | Disparador acotado (§4.6); sin HARD-GATE para cambios sin comportamiento nuevo; sin commit automático; spec en `docs/specs/YYYY-MM-DD-<nombre>.md` sin sufijo `-design` |
| `requesting-code-review` | Tabla diff → revisor del repo; el revisor genérico solo si ninguno aplica |
| `verification-before-completion` | Remisión a `iwana-test-evidence` para toda afirmación sobre pruebas |
| `dispatching-parallel-agents` | Disparador acotado (§4.6) |

Las invariantes repetidas (D1) se retiran también de las skills sin otro cambio que las contengan; eso no las pasa a «refactorizadas» en el conteo.

### 5.3 Superficies fuera de `.agents/skills/`

| Archivo | Cambio |
| --- | --- |
| `AGENTS.md` → Skills Dispatch | Una primaria por línea; sustituir `finishing-a-development-branch` por `iwana-checkpoint-commit`; añadir `iwana-tenant-migration` a migraciones |
| `.claude/agents/fe-platform.md` | `playwright-skill` → `e2e-testing-patterns`; `nextjs-app-router-patterns` → `frontend-dev-guidelines`. Después `pnpm sync:agents` |
| `.github/instructions/frontend.instructions.md` | Retirar la mención a `ui-ux-pro-max` |
| `.agents/skills/INDEX.md` | v1.9: nuevas secciones de prioridad y dominio, y tabla **«Skills fusionadas → sucesora»**, para que las referencias históricas resuelvan sin reescribir `docs/plans/` ni `docs/prompts/` |
| `.agents/skills/MANIFEST.json` | v1.9: `coreCount` 43; reconciliar `specializedOnDemand` con INDEX (D11) |
| `.agents/skills/README.md` | Alinear con INDEX v1.9 |

Referencias históricas medidas el 2026-11-08 (archivos): `playwright-skill` 122, `subagent-driven-development` 102, `nextjs-app-router-patterns` 79, `ui-ux-pro-max` 70, `turborepo-caching` 61, `senior-ui-systems-designer` 35, `typescript-pro` 13, `finishing-a-development-branch` 7, `writing-skills` 5. No se reescriben: la tabla de sucesión las resuelve.

### 5.4 Acciones previas a las fusiones y bajas

No cuentan como refactorización: corrigen dependencias rotas o higiene, y se ejecutan en B1 del plan.

| Acción | Motivo | Cubierta por |
| --- | --- | --- |
| En `executing-plans` y `subagent-driven-development`, la sub-skill de cierre obligatoria pasa de `finishing-a-development-branch` a `iwana-checkpoint-commit` | D4: sin este cambio, la baja de G0-2 deja una sub-skill obligatoria inexistente | G0-2 |
| Borrar `ui-ux-pro-max/scripts/__pycache__/` | D2: caché de Python generada, no es contenido de la skill; se borra aunque G0-1 rechace el archivado | Higiene; no requiere G0 |

## 6. Decisiones abiertas para G0

| # | Decisión | Recomendación |
| --- | --- | --- |
| G0-1 | Archivar `ui-ux-pro-max` | Sí, en hold. Extraer las reglas de gráficos solo si el CTO las quiere conservar |
| G0-2 | Baja de `finishing-a-development-branch`, con la redirección previa de §5.4 | Sí. Cierra la observación del 2026-09-13 |
| G0-3 | Retirar `disable-model-invocation` de `iwana-tenant-migration` | Sí: crea archivos en el repo sin efecto externo, y hoy el modelo cae en el patrón genérico. `iwana-checkpoint-commit` e `iwana-cierre-fase` siguen solo de usuario |
| G0-4 | Nombres de las sucesoras | Los de §5.1: se eligieron por alcance más general; la tabla de sucesión cubre las referencias de los nombres retirados |

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Una fusión pierde contenido único | Cada bloque de fusión lista qué pasa a `references/`; `docs-governance` compara antes y después |
| Un plan o prompt vigente cita una skill retirada | Tabla de sucesión en INDEX v1.9; los lanzadores nuevos se verifican contra disco (checklist de `TEMPLATE-PROMPT-LANZAMIENTO.md`) |
| Copilot, OpenCode o Codex dependen de una descripción antigua | `pnpm sync:skills:check` y `pnpm sync:agents:check` en verde; `.opencode/opencode.json` lee `skills.paths`, que no cambia |
| Retirar las invariantes de una skill deja a un cliente sin ellas | Todos los clientes leen `AGENTS.md` primero (precedencia de INDEX §Reglas) |
| Se publica mezclado con privacidad (171 rutas sin commitear el 2026-11-08) | Commit propio con lista explícita de rutas, vía `iwana-checkpoint-commit` |

## 8. Registro de ejecución

### 8.1 G0 — 2026-11-08

El CTO aprobó G0 en bloque («G0 aprobado»), sin pronunciarse por cada decisión. Rigen las recomendaciones de §6:

| # | Decisión aplicada |
| --- | --- |
| G0-1 | `ui-ux-pro-max` pasa a hold en B4, **sin** extraer sus reglas de gráficos (no se pidió conservarlas) |
| G0-2 | Baja de `finishing-a-development-branch` en B4; la redirección previa de §5.4 ya está hecha (B1) |
| G0-3 | `iwana-tenant-migration` invocable por el modelo; aplicado en B1 |
| G0-4 | Sucesoras con los nombres de §5.1 |

Si el CTO quiere otra cosa en G0-1 o G0-4, debe decirlo antes de lanzar B4 (G0-1) o B2 (G0-4).

### 8.2 Ola 1 (B1) — G1 ✅ 2026-11-08

Ejecutada por AI-EM-ARCH en `main`, sin commit. Verificación del orquestador sobre el árbol:

- **Archivos:** 9 `SKILL.md` en `.agents/skills/` (`brainstorming`, `database-migration`, `postgresql`, `iwana-tenant-migration`, `verification-before-completion`, `requesting-code-review`, `dispatching-parallel-agents`, `executing-plans`, `subagent-driven-development`) y 6 punteros de `.claude/skills/`, regenerados por el hook `.claude/hooks/sync-surfaces.mjs`, no a mano. `ui-ux-pro-max/scripts/__pycache__/` borrado (estaba en `.gitignore`).
- **G1:** `finishing-a-development-branch` ya solo aparece en su directorio, `INDEX.md:144` y `MANIFEST.json` (65, 137, 291), que son de B4. `brainstorming` no commitea y escribe el spec sin sufijo `-design`. `database-migration` remite el tenant a `iwana-tenant-migration`. `iwana-tenant-migration` sin `disable-model-invocation`.
- **Sincronización:** `pnpm sync:skills:check` «OK: 52 skills» y `pnpm sync:agents:check` «OK: 14 agentes», igual que la línea base.
- **Finales de línea:** los archivos tocados están en LF; los avisos de CRLF de `git diff` son de `core.autocrlf`.

**Desviación aceptada:** `database-migration` afirmaba en tres sitios más (viñeta «Usar cuando», regla 6 y nota de estructura) que las migraciones tenant se aplican dinámicamente, en contra de `iwana-tenant-migration`. B1 los sustituyó por remisiones. Es una extensión mínima de la fila de §5.2 y queda dentro de su intención.

**Deuda de B1 y destino:**

| Sev. | Deuda | Destino |
| --- | --- | --- |
| Baja | `executing-plans` (línea 63) y `subagent-driven-development` (línea 239) dicen «Never start implementation on main/master»; `subagent-driven-development` hace que el subagente implementador commitee en cada tarea (líneas 53, 72, 73, 151, 171). Chocan con trabajar solo en `main` y commitear solo a pedido | B2, en la fusión |
| Baja | Las descripciones nuevas de B1 mezclan inglés y español | B3a |
| Baja | `database-migration` conserva «multi-tenant por schema» (línea 11) y un antipatrón de acceso en runtime con `runInTenantSchema` (línea 148), que no es de migraciones | B3a |

### 8.3 Ola 2 (B2 ∥ B3b) — 2026-11-08

**B2 (AI-EM-ARCH).** Las 7 fusiones de §5.1 están hechas. Tras una primera pasada que copió más de lo listado (anti-racionalización y CSO, y además plantillas, gotchas, persuasión, pruebas con subagentes y el playbook de Next.js), se recortó cada migración a lo que lista §5.1. Las 7 absorbidas siguen intactas: `git status` solo muestra en ellas el cambio de B1 en `subagent-driven-development` (3 líneas). `executing-plans` ya no dice «main/master» y ningún subagente commitea. `skill-creator` tiene la sección «Reglas del catálogo iWana».

**Verificación del orquestador:**

- `pnpm sync:skills:check` «OK: 52 skills» y `pnpm sync:agents:check` «OK: 14 agentes». Hubo un puntero desfasado por un `sed` que saltó el hook; se regeneró con `pnpm sync:skills`.
- Los 52 frontmatter parsean como YAML y tienen `name` y `description` (cinco sucesoras tenían «: » sin comillas; corregido en B2).
- **Contenido descartado.** El ejecutor avisó que el recorte no comprobó si lo descartado tenía copia en otra skill. El orquestador lo comprobó sección por sección contra las sucesoras y el resto del catálogo:

| Sev. | Regla descartada | Origen | Copia en el catálogo |
| --- | --- | --- | --- |
| **Media** | Tests sin PII real ni secretos; autenticación por fixtures; tenant de prueba explícito | `playwright-skill` «Datos y seguridad» | Ninguna (`testing-patterns` y `e2e-testing-patterns` no la tienen) |
| **Media** | Un flujo que depende del tenant o de permisos lo contempla desde la carga de datos y el rendering; antipatrón «navegación sin considerar permisos o contexto de tenant» | `nextjs-app-router-patterns` §3 y antipatrones | Ninguna (`frontend-dev-guidelines` no menciona tenant ni permisos) |
| **Media** | No despachar varios implementadores en paralelo (conflictos) | `subagent-driven-development` «Red Flags» | Ninguna en `executing-plans` |
| Baja | Antipatrones E2E: rutas `/tmp`, un test con varios objetivos, flujos sin datos controlados, reproducir validaciones del backend; `waitForURL` | `playwright-skill` | Parcial: `waitForTimeout` y selectores sí están |
| Baja | `pnpm turbo run <task> --dry-run` para diagnosticar la caché | `turborepo-caching` «Comandos» | Ninguna |
| Baja | No proponer landing pages ni heroes de marketing para herramientas operativas | `senior-ui-systems-designer` «Guardrails» | Ninguna |

El resto de lo descartado sí tiene copia o no aplica al repo: guía genérica de `writing-skills` (la cubre `skill-creator`), remote caching on-prem (no implantado; es de `plat-ops`), selección de modelo por tarea (los subagentes del repo fijan su modelo en el frontmatter), principios y guardrails visuales (cubiertos por `iwana-identity-ui-review`, `wcag-audit-patterns` y `AGENTS.md`).

**Causa:** §5.1 enumeró qué conservar dando por duplicado todo lo demás, y no lo era. Es un defecto de esta definición, no de la ejecución. **G2 queda abierto** hasta restaurar las tres reglas de severidad media (bloque B2-R del plan v1.2). Las de severidad baja se restauran en el mismo bloque, en una línea cada una.

**B3b (`ds-owner`).** `core-components` trae el inventario real de `@iwana/ui`. El orquestador resolvió los `export *` de `packages/ui/src/index.ts`: 138 exportaciones; todo nombre citado como existente lo está; los no exportados (`Textarea`, `Toast`, `Table`, `Sidebar`, `PageHeader`, `MetricCard`, `Modal`…) figuran en la lista «no existen» o en «Primitives objetivo (roadmap)». Tokens: `packages/ui/src/styles/globals.css`, bloque `@theme` desde la línea 25, citados sin copiar valores. **La parte de B3b de G3 se cumple.** La reescritura de «Tokens» y el marcado de «Primitives objetivo» como roadmap exceden la letra del encargo, pero son necesarios para la declaración de dueña única; se aceptan.

**Deuda de la Ola 2 y destino:**

| Sev. | Deuda | Destino |
| --- | --- | --- |
| Media | `iwana-identity-ui-review`: descripción de 156 palabras | B3a |
| Media | `iwana-identity-ui-review/references/tokens.md` tiene 38 hex. No se borran: `scripts/audit-ui.mjs` lo usa como tabla hex → token para su regla «hex de marca sin tokenizar». Se declara copia derivada de `globals.css`, que prevalece si divergen | B3a |
| Media | `references/playwright-skill/run.js` ejecuta `npm install` en tiempo de uso, fuera del workspace pnpm (`AGENTS.md`: solo pnpm). Se retiran `run.js`, `package.json` y `lib/`; se conserva `API_REFERENCE.md` | B4 |
| Baja | El `turbo.json` de ejemplo de `monorepo-architect` ya no coincide con el real (sin `inputs` ni `globalDependencies`) | B3a: remitir al `turbo.json` real en vez de copiarlo |
| Baja | `typescript-expert` mantiene `class-validator` (lo usa `apps/api`) junto a Zod | Sin acción: refleja el código real |
| Fuera de alcance | `packages/ui`: `tokens/colors.ts` discrepa de `globals.css` y ninguna app lo consume; `auth/auth-form-styles.ts` lleva hex de marca; el cabecero de `index.ts` dice «Sprint 0» | Encargo aparte: [2026-11-08-ui-tokens-fuente-unica-spec.md](../specs/2026-11-08-ui-tokens-fuente-unica-spec.md) (`ds-owner` + `fe-platform`), pendiente de su G0; no bloquea esta consolidación |

### 8.4 Ola 3 (B2-R → B3a) — G2 ✅ y G3 ✅ 2026-11-08

Ejecutada por AI-EM-ARCH en `main`, sin commit. Verificación del orquestador:

- `pnpm sync:skills:check` «OK: 52 skills» y `pnpm sync:agents:check` «OK: 14 agentes». Los 52 frontmatter parsean y su `name` coincide con el directorio.
- Las 43 descripciones están en español, con «Usar cuando» o «Usar al…» y «No usar para → skill»; la más larga tiene 58 palabras. Las 9 que salen no se tocaron.
- Las absorbidas siguen intactas (solo el cambio de B1 en `subagent-driven-development`).
- **G2.** Presentes: «Datos y seguridad» en `e2e-testing-patterns`; tenant y permisos en `frontend-dev-guidelines`; «Implementadores en paralelo» en `executing-plans` (línea 109); `--dry-run` en `monorepo-architect`; la regla de landing pages en `iwana-identity-ui-review/references/direccion-visual.md`.
- **G3 (parte de B3a).** `grep -il 'multi-tenant por schema\|zero-trust pii'` devuelve solo `postgresql`, `security-auditor` y `architect-review`, las tres justificadas como tema propio. Retiradas en `backend-security-coder`, `auth-implementation-patterns`, `nestjs-expert`, `database-migration`, `observability-engineer`, `architecture-decision-records`, `typescript-expert` y `docker-expert`.
- Deuda de §8.2 y §8.3 asignada a B3a: cerrada. `testing-patterns` perdió su sección E2E, que además llevaba credenciales de ejemplo en el código.

**Referencias vivas a las 9 skills que salen (inventario del orquestador para B4).** Las líneas de procedencia («migrado de…») se conservan; las funcionales se sustituyen:

| Archivo:línea | Referencia | Sustituto |
| --- | --- | --- |
| `.agents/skills/writing-plans/SKILL.md:52` y `:147` | Sub-skill obligatoria `subagent-driven-development` | `executing-plans` (modo con subagentes) |
| `.agents/skills/testing-patterns/SKILL.md:133` | `playwright-skill` | `e2e-testing-patterns` |
| `.agents/skills/iwana-identity-ui-review/SKILL.md:37` | `ui-ux-pro-max` (subordinada) | Retirar la fila |
| `.agents/skills/e2e-testing-patterns/SKILL.md:223` | Scripts auxiliares de `references/playwright-skill/` | Ajustar al retirar `run.js`, `package.json` y `lib/` |
| `AGENTS.md` 63, 196, 198-200, 216, 221, 227, 233 | Skills Dispatch y tabla de superficies | Sucesoras; una primaria por línea |
| `.claude/agents/fe-platform.md:34` | `playwright-skill` | `e2e-testing-patterns` (después `pnpm sync:agents`) |
| `.github/instructions/frontend.instructions.md:17` | `ui-ux-pro-max` | Retirar |
| `skills-lock.json` | Entradas `finishing-a-development-branch`, `subagent-driven-development`, `writing-skills`, `ui-ux-pro-max` | Retirar las tres primeras; la procedencia upstream de `ui-ux-pro-max` pasa a su fila de hold en INDEX |
| `.agents/skills/INDEX.md` 176, 180, 198 y listas de prioridad y dominio | Skills externas con «Prevalece» en una retirada | Sucesoras |

**Deuda de la Ola 3 y destino:**

| Sev. | Deuda | Destino |
| --- | --- | --- |
| Media | `database-migration` (líneas 38 y 44) cita `pnpm --filter @iwana/db migration:generate` y `npx typeorm migration:generate`. `AGENTS.md:105` dice que ese script no existe y que las migraciones se escriben a mano; `npx` contradice además el uso exclusivo de pnpm | B4 |
| Baja | `skill-creator` y `system-vocabulary-review` quedaron en CRLF en la copia de trabajo. Sin efecto en el repo: `.gitattributes` (`* text=auto eol=lf`) normaliza a LF al commitear | Sin acción |
| Baja | `architect-review` conserva «Monorepo: Turborepo + pnpm» en su lista de stack aprobado | Sin acción: es criterio de revisión |

### 8.5 Ola 4 (B4), B5 y B4-R — G4 ✅ y G5 ✅ 2026-11-09

**G4 (verificación del orquestador sobre el árbol, sin commit).** 43 directorios en `.agents/skills/` = `coreCount` 43 = 43 punteros; `pnpm sync:skills:check` «OK: 43 skills» y `pnpm sync:agents:check` «OK: 14 agentes»; `skills-lock.json` con 8 entradas y ninguna retirada. La deuda de `database-migration` (§8.4) está cerrada: ya no cita `migration:generate` ni `npx`.

**B5 (`docs-governance` + AI-EM-ARCH, solo lectura).** `audit-doc-locations` y `audit-adr-citations` sin bloqueantes en archivos del ciclo. INDEX, MANIFEST y README en v1.9 y coherentes; la tabla intención → skill de §4 coincide con las 43 descripciones, con una sola primaria por intención. **Tres bloqueantes**, todos en `e2e-testing-patterns/references/playwright-skill/API_REFERENCE.md`, que el inventario de §8.4 no recogió: instalación por `cd ~/.claude/skills/playwright-skill && npm run setup`, cabeceras `X-Automated-By: playwright-skill` que dependían del `run.js` retirado, y comandos `npm`/`npx`.

**B4-R (AI-EM-ARCH, 2026-11-09).**

| Archivo | Cambio |
| --- | --- |
| `e2e-testing-patterns/references/playwright-skill/API_REFERENCE.md` | Cabecera de procedencia y precedencia; instalación por `pnpm playwright:install`; sección de cabeceras retirada; `npm`/`npx` → scripts `pnpm` del `package.json` raíz y `pnpm exec`; GitHub Actions → remisión a `.github/workflows/` (`plat-ops`); `password123` → `process.env.E2E_PASSWORD` |
| `INDEX.md` regla 5 | Declara las variantes admitidas «Usar al…» y «No usar con/sin…» (seis descripciones las usan) |
| `AGENTS.md` Skills Dispatch | Desempate por ruta entre `backend-security-coder` y `frontend-security-coder`; entrada en el historial del encabezado |

**G5 tras B4-R.** El grep de los 9 nombres sobre `.agents/`, `AGENTS.md`, `.claude/` y `.github/` solo devuelve filas de INDEX (changelog, hold, sucesión, bajas), MANIFEST (`hold`, `mergedSkills`, `removedSkills`) y líneas o rutas de procedencia. **Excepciones aceptadas por AI-EM-ARCH:** (a) registros históricos fechados que nombran skills retiradas: ADR-065, 9 specs de julio a septiembre, `docs/quality/2026-10-26-mod13-interfaces-matriz.md` y la nota de 2026-09-14 de EMA; no se reescriben porque alterarían documentos aprobados; (b) las carpetas `references/writing-skills/` y `references/playwright-skill/` conservan el nombre como procedencia.

**Deuda vista y destino:**

| Sev. | Deuda | Destino |
| --- | --- | --- |
| Baja | `e2e-testing-patterns/resources/implementation-playbook.md` (428, 429, 435, 495) usa `npx`/`npm`; no lo tocó el ciclo | Encargo aparte |
| Baja | Cinco perfiles de `docs/roles/` (EMA, FEP, OPS, PUX, QA) y `.claude/agents/fe-platform.md` cambian sin subir versión | Ola 1 de la auditoría de cruces de roles (G0-1 = A) |
| — | `.playwright-mcp/` tiene tres `INFORME-*.md` fuera de `docs/informes/` | Ajeno al ciclo |

Siguiente: B6 (commit con lista explícita de rutas, push, G6.5).
