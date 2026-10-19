# Indice de Skills de iWana neXt

**Version:** 1.7
**Estado:** Aprobado
**Fecha:** 2026-10-19

**Cambio v1.6 → v1.7 (2026-10-19):** se gobiernan por primera vez las **skills externas de plugin**: 40 skills que Claude Code recibe de la cuenta (23 de 6 plugins con skills y 17 sincronizadas de claude.ai, el 2026-10-16/17) y que no viven en el repo. Nueva seccion [Skills externas de plugin (solo Claude Code)](#skills-externas-de-plugin-solo-claude-code): 15 se admiten como **apoyo** con disparador, skill del repo que prevalece y subagente; 25 quedan **fuera del dispatch** con su motivo. No entran al catalogo core: `coreCount` sigue en 51 y `pnpm sync:skills` no las toca. Trazabilidad en `docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md`.

**Cambio v1.5 → v1.6 (2026-10-09):** alta de dos skills propias del repo (segunda pasada de `claude-code-setup`): `iwana-matriz-motivos` (testing; matriz motivo de rechazo → test integrado con conteo real para encargos MOD11↔MOD12, norma del CTO del 2026-10-08; se apoya en `iwana-test-evidence`) e `iwana-queue-inspect` (backend; inspeccion de solo lectura de las colas BullMQ de Redis dev, via el MCP `redis-dev` o `redis-cli`; complementa a `bullmq-specialist`, que es de patrones). `coreCount` pasa de 49 a 51. Trazabilidad en `docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md` y `docs/informes/INFORME-CLAUDE-CODE-AUTOMATIZACIONES-v1.0.md`.

**Cambio v1.4 → v1.5 (2026-10-08):** alta de tres skills propias del repo, por la politica de admision estricta: `iwana-tenant-migration` (backend; complementa a `database-migration`, que es generica, con las convenciones de `runner.ts` y `TENANT_MIGRATIONS`), `iwana-test-evidence` (testing; complementa a `verification-before-completion` con las trampas de cache de Turbo, `--passWithNoTests` e integracion en skip) e `iwana-cierre-fase` (flujo de trabajo; empaqueta INFORME + plan con matriz de dispatch + launcher de 40 lineas). Las tres son especializadas por necesidad y no reemplazan a ninguna activa. `coreCount` pasa de 46 a 49. Trazabilidad en `docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md` y `docs/informes/INFORME-CLAUDE-CODE-AUTOMATIZACIONES-v1.0.md`.

**Cambio v1.3 → v1.4 (2026-09-13):** baja de `using-git-worktrees` del catalogo activo. El proyecto trabaja **siempre sobre `main`**, sin ramas de trabajo paralelas ni worktrees, asi que la skill no tenia caso de uso recurrente en el repo (criterio de rechazo: "existe solo por amplitud de catalogo"). El directorio ya no existe en disco; esta version cierra la divergencia entre catalogo y filesystem. `coreCount` pasa de 47 a 46.

## Proposito

Este indice gobierna el estado operativo del catalogo de skills del proyecto.

Estados admitidos:

- core: skill activa y aprobada para uso regular en el proyecto
- candidate: skill archivada con potencial de restauracion futura
- archived: skill retirada del catalogo activo sin prioridad inmediata de retorno
- hold: skill archivada y no recomendada por ahora

## Reglas de precedencia

1. AGENTS.md
2. .github/copilot-instructions.md
3. Este indice
4. La skill individual

`CLAUDE.md` es superficie activa (reactivada 2026-07-09) y aplica el mismo catalogo; desde ADR-092 (2026-10-09) Claude Code lo descubre via los punteros generados en `.claude/skills/` (`pnpm sync:skills`), que remiten al `SKILL.md` de este directorio sin copiar su contenido. `.opencode/` participa como configuracion cliente activa de OpenCode, pero no sustituye la precedencia documental del repo. Codex y Claude Code comparten la misma gobernanza via `AGENTS.md` y `.github/copilot-instructions.md`.

## Skills core activas

### Prioridad de uso

#### Primera linea

- nestjs-expert
- nextjs-app-router-patterns
- frontend-dev-guidelines
- testing-patterns
- monorepo-architect
- core-components
- postgresql

#### Segunda linea

- architect-review
- architecture-decision-records
- auth-implementation-patterns
- backend-security-coder
- docs-architect
- frontend-security-coder
- openapi-spec-generation
- security-auditor
- typescript-expert
- typescript-pro

#### Especializadas por necesidad

- bullmq-specialist
- docker-expert
- i18n-localization
- mermaid-expert
- observability-engineer
- playwright-skill
- senior-ui-systems-designer
- tailwind-patterns
- test-driven-development
- wcag-audit-patterns
- turborepo-caching
- database-migration
- e2e-testing-patterns
- codebase-cleanup-deps-audit
- iwana-identity-ui-review
- system-vocabulary-review
- ui-ux-pro-max
- iwana-tenant-migration
- iwana-test-evidence
- iwana-cierre-fase
- iwana-matriz-motivos
- iwana-queue-inspect

### Arquitectura y gobierno

- architect-review
- architecture-decision-records
- docs-architect
- mermaid-expert
- monorepo-architect
- turborepo-caching

### Backend y plataforma

- auth-implementation-patterns
- backend-security-coder
- bullmq-specialist
- database-migration
- docker-expert
- iwana-queue-inspect
- iwana-tenant-migration
- nestjs-expert
- openapi-spec-generation
- observability-engineer
- postgresql
- security-auditor
- typescript-expert
- typescript-pro

### Frontend y accesibilidad

- core-components
- frontend-dev-guidelines
- frontend-security-coder
- i18n-localization
- iwana-identity-ui-review
- nextjs-app-router-patterns
- senior-ui-systems-designer
- system-vocabulary-review
- tailwind-patterns
- ui-ux-pro-max
- wcag-audit-patterns

### Testing

- e2e-testing-patterns
- iwana-matriz-motivos
- iwana-test-evidence
- playwright-skill
- test-driven-development
- testing-patterns

### Flujos de trabajo

- brainstorming
- dispatching-parallel-agents
- executing-plans
- finishing-a-development-branch
- iwana-cierre-fase
- receiving-code-review
- requesting-code-review
- skill-creator
- subagent-driven-development
- systematic-debugging
- verification-before-completion
- writing-plans
- writing-skills

### Mantenimiento y dependencias

- codebase-cleanup-deps-audit

## Skills externas de plugin (solo Claude Code)

Claude Code recibe skills que **no viven en este repo**: plugins instalados en la cuenta (`~/.claude/plugins/synced/…`) y skills sincronizadas de claude.ai (`~/.claude/skills/synced/…`). Aparecen en la sesion con nombre calificado `plugin:skill` y se actualizan solas cuando cambia la cuenta. Esta seccion decide cuales se usan en el proyecto y en que condiciones.

### Reglas del nivel externo

1. **Solo Claude Code.** Copilot, OpenCode y Codex no las tienen. Por eso **nunca son obligatorias** en una matriz de dispatch: se citan solo como skill **de apoyo**, con su nombre calificado, el sufijo `(solo Claude Code)` y su condicion. Un bloque nunca puede depender de una skill externa para cumplir un gate.
2. **La skill del repo prevalece.** Si una externa choca con el repo en stack, tenancy, seguridad, accesibilidad (WCAG 2.2 AA), idioma (texto visible en español), formato documental o comandos (`pnpm` exclusivamente), manda la skill del repo de la columna «Prevalece» y `AGENTS.md`.
3. **Se verifican contra la sesion, no contra disco.** Antes de citarla, comprobar que figura en la lista de skills de la sesion activa. No existe `.agents/skills/<nombre>/`, y no debe existir: **no se copian** a `.agents/skills/` ni a `.claude/skills/`, no cuentan en `coreCount` y `pnpm sync:skills` no las toca.
4. **Sin efectos externos sin confirmacion.** Publicar, enviar, firmar, subir o descargar desde una skill externa exige el «si» explicito del usuario en el chat, igual que cualquier otra accion.
5. **Altas futuras.** Una skill externa nueva queda **fuera del dispatch** hasta que se evalua aqui con la politica de admision estricta (caso de uso recurrente, relacion con el catalogo, prioridad). Si un plugin se desinstala o cambia de version mayor, se revisa esta tabla.

### Admitidas como apoyo

| Skill externa | Disparador en este repo | Prevalece | Subagente / modo | Restriccion |
| --- | --- | --- | --- | --- |
| `anthropic-skills:built-in-browser` | Antes del primer uso del navegador integrado para evidencia visual de `apps/portal` o `apps/web` (cierre de modulo, verificacion de UI en el dev server) | `playwright-skill` para E2E automatizado | `fe-platform`, `sr-qa` | Las sesiones del navegador son del usuario: no cerrar sesion ni cambiar credenciales |
| `anthropic-skills:chrome-browser` | Solo cuando el usuario pide expresamente su Chrome real | `anthropic-skills:built-in-browser` (por defecto) | `sr-qa` | No es el navegador por defecto; nunca credenciales reales fuera de entornos de prueba |
| `pdf-viewer:view-pdf` (comandos `open`, `annotate`) | Revisar visualmente un PDF generado por el sistema (contratos, facturas, D-PDF) y marcar defectos con el usuario | `testing-patterns` (la asercion automatizada sigue siendo el gate) | `sr-qa` | `fill-form` y `sign` quedan fuera: no se firman ni rellenan documentos en nombre de nadie |
| `anthropic-skills:pdf` | Extraer texto o tablas de un PDF generado para contrastarlo con el contrato de datos, o leer un PDF normativo aportado por el usuario | `testing-patterns` | `sr-qa`, `data-eng` | Datos personales del PDF: solo en el chat, nunca en logs ni en informes |
| `modern-web-guidance:modern-web-guidance` | Al implementar una API de plataforma del navegador que el catalogo no cubre: `<dialog>`, popover, anchor positioning, container queries, `:has()`, View Transitions, scroll-driven animations, INP/LCP | `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `core-components`, `tailwind-patterns` | `fe-platform` | Ver «Restriccion de `modern-web-guidance`» abajo |
| `design:ux-copy` | Estructura de mensajes de error, estados vacios, confirmaciones destructivas y CTA | `system-vocabulary-review` (vocabulario, español, sentence case, sin enums crudos) | `prod-ux`, `fe-platform` | Sus ejemplos estan en ingles; se aplica el patron, nunca el texto |
| `design:design-handoff` | Al redactar la seccion de estados, breakpoints y casos borde de una spec en `docs/specs/` para `fe-platform` | `iwana-identity-ui-review`, `core-components`; formato de `docs/specs/` | `prod-ux`, `ds-owner` | No inventa tokens: solo cita los de `packages/ui` |
| `design:user-research` | Plan de entrevistas, guion de prueba de usabilidad o encuesta con operadores ISP | — (sin equivalente en el catalogo) | `prod-ux` | Datos de participantes bajo Ley 1581: anonimizar antes de versionar |
| `design:research-synthesis` | Sintetizar entrevistas, tickets de soporte o notas de usabilidad en hallazgos para un PRD o una spec | — (sin equivalente en el catalogo) | `prod-ux` | Igual que `design:user-research` |
| `engineering:tech-debt` | Inventario y priorizacion de deuda tecnica de un modulo para un INFORME de deuda o un plan (`docs/plans/`) | `codebase-cleanup-deps-audit` (deuda de dependencias) | AI-EM-ARCH, `sr-backend`, `fe-platform` | El entregable sigue el formato `INFORME-*`/plan del repo, no el suyo |
| `engineering:deploy-checklist` | Preparar una release o despliegue de la beta | `AGENTS.md` → Gates Before Merge; ADR-095 | `plat-ops` | **Latente:** G7 y produccion estan diferidos hasta la beta minima (CTO, 2026-10-16) |
| `engineering:incident-response` | Incidente en un entorno desplegado: triage, comunicacion y postmortem | `observability-engineer` | `plat-ops`, `sec-eng` | **Latente** hasta que exista un entorno desplegado; un incidente con datos personales escala a `sec-eng` |
| `anthropic-skills:deep-research` | Investigacion multi-fuente para un PRD, HLD o ADR: normativa (Ley 1581, Ley 2573, DIAN, CRC), comparativa de proveedores o tecnologias | `architecture-decision-records`, `docs-architect` | AI-EM-ARCH, `data-eng` | Coordina subagentes de investigacion: solo cuando el usuario la pide. El resultado alimenta el artefacto del repo; no lo sustituye |
| `anthropic-skills:prompt-engineering-patterns` | Redactar o depurar un `PROMPT-*` cuando un encargo se ejecuto mal por ambiguedad del prompt | `iwana-cierre-fase`, `docs/prompts/PROMPT-OPERATIVO-*` | AI-EM-ARCH | El formato y la carpeta los fija `AGENTS.md` → Documentation Rules |
| `claude-code-setup:claude-automation-recommender` | Revisar las automatizaciones de Claude Code del repo (hooks, subagentes, skills, MCP) | `writing-skills`, `skill-creator` (del repo) | AI-EM-ARCH | Toda recomendacion aprobada se registra en `docs/informes/INFORME-CLAUDE-CODE-AUTOMATIZACIONES-v1.0.md` |

#### Restriccion de `modern-web-guidance`

Su `SKILL.md` se declara obligatoria «primero» para todo HTML/CSS/JS de cliente. **En este repo no lo es:** prevalecen las skills de frontend del catalogo y la consulta es de apoyo, solo para APIs de plataforma del navegador. Ademas:

- **Primero, las guias locales.** El plugin trae 218 guias en markdown en `guides/` (dentro de `~/.claude/plugins/synced/<cuenta>/modern-web-guidance/skills/modern-web-guidance/`); se buscan con Grep y se leen sin red.
- **`npx -y modern-web-guidance@latest` descarga y ejecuta codigo de npm sin version fijada.** Solo con aprobacion explicita del usuario en el chat. No se agrega como dependencia ni como script del repo.
- Next.js resuelve imagenes, fuentes y carga de scripts: una guia que lo contradiga cede ante `nextjs-app-router-patterns`.

### Fuera del dispatch

No se citan en matrices de dispatch ni se activan en trabajo del repo. Siguen disponibles si el usuario las pide expresamente para algo ajeno al codigo.

| Skill externa | Motivo |
| --- | --- |
| `engineering:architecture` | Duplica `architecture-decision-records`; su plantilla de ADR no usa el vocabulario de estado del repo |
| `engineering:system-design` | Duplica `architect-review` y `monorepo-architect` |
| `engineering:code-review` | Duplica `requesting-code-review` y los revisores `boundary-reviewer` / `contract-drift-reviewer` |
| `engineering:debug` | Duplica `systematic-debugging` |
| `engineering:documentation` | Duplica `docs-architect`; no conoce las Documentation Rules |
| `engineering:testing-strategy` | Duplica `testing-patterns` |
| `engineering:standup` | Uso personal; sin caso de uso en el repo |
| `design:accessibility-review` | Audita WCAG 2.1 AA; el repo exige 2.2 AA (`wcag-audit-patterns`) |
| `design:design-critique` | Duplica el modo review de `iwana-identity-ui-review` |
| `design:design-system` | Duplica `core-components`; el contrato del DS es de `ds-owner` |
| `modern-web-guidance:chrome-extensions` | Sin extensiones de navegador en el roadmap |
| `workflow-audit:workflow-audit` | Especifica de SwiftUI/iOS; no aplica al stack |
| `workflow-audit:plan` | Duplica `writing-plans` e `iwana-cierre-fase` |
| `anthropic-skills:senior-architect`, `anthropic-skills:senior-fullstack` | Empujan stack fuera del baseline (Express, GraphQL, React Native, scaffolding propio); duplican `architect-review` y `nestjs-expert` |
| `anthropic-skills:skill-creator` | Mismo nombre que la `skill-creator` del repo, que prevalece |
| `anthropic-skills:doc-coauthoring`, `anthropic-skills:docs` | La documentacion del repo vive en `docs/` con `docs-architect`; los Claude Docs son para documentos que el usuario comparte fuera del repo |
| `anthropic-skills:docx`, `anthropic-skills:pptx`, `anthropic-skills:xlsx` | Formatos de oficina: solo si el usuario pide ese archivo |
| `anthropic-skills:computer-use` | Control del escritorio; las pruebas usan navegador o Playwright |
| `anthropic-skills:google-workspace`, `anthropic-skills:morning`, `anthropic-skills:import-memory` | Uso personal; sin caso de uso en el repo |

Los comandos `pdf-viewer:fill-form` y `pdf-viewer:sign` del plugin `pdf-viewer` tambien quedan fuera: rellenar o firmar documentos no es tarea de un agente del repo.

## Skills restaurables priorizadas

No hay skills archivadas con decision vigente de restauracion inmediata.

## Skills a mantener archivadas

Estas skills fueron revisadas y se conservan archivadas por valor potencial, pero no deben volver al catalogo activo sin un disparador concreto del roadmap:

- github-actions-templates
- deployment-pipeline-design
- slo-implementation
- prometheus-configuration
- grafana-dashboards
- distributed-tracing

## Skills en hold

- nx-workspace-patterns
- nodejs-best-practices
- context7-auto-research

## Politica de restauracion

Una skill archivada solo puede volver al catalogo activo si cumple todos estos criterios:

1. aporta valor directo al stack o al roadmap activo
2. no duplica una skill core ya activa
3. no contradice la gobernanza documental del repo
4. sus dependencias y herramientas estan disponibles en el entorno real
5. su activacion mejora operacion o entrega, no solo amplitud de catalogo

## Politica de admision y restauracion estricta

Toda alta o restauracion debe cumplir ademas estas reglas operativas:

1. debe existir un caso de uso recurrente y verificable dentro del repo, no una posibilidad abstracta
2. debe asignarse una prioridad de uso: primera linea, segunda linea o especializada por necesidad
3. debe definirse si reemplaza, complementa o vuelve redundante otra skill activa
4. debe dejar trazabilidad en README, INDEX, MANIFEST e informe vigente
5. si depende de tooling, MCPs o flujos no disponibles en el entorno real, no entra al catalogo activo

## Criterios de rechazo inmediato

- duplica cobertura ya resuelta por una skill activa
- empuja stack, arquitectura o tooling fuera del baseline sin ADR aprobado
- depende de servicios externos no disponibles o no aprobados
- existe solo por amplitud de catalogo, no por necesidad del proyecto
- introduce ruido de activacion mayor que el valor operativo que aporta

## Orden sugerido de restauracion

Sin entradas vigentes tras la restauracion ejecutada el 2026-03-12.

## Skills dadas de baja

Una baja no es un archivado: la skill sale del catalogo y del disco porque **no tiene caso de uso en este repo**, no porque se reserve para despues. Reincorporarla exige la politica de admision estricta de este indice, igual que un alta nueva.

| Skill | Fecha | Motivo |
| --- | --- | --- |
| `using-git-worktrees` | 2026-09-13 | El proyecto trabaja siempre sobre `main`, sin ramas de trabajo paralelas ni worktrees. Sin caso de uso recurrente y verificable en el repo. |

## Notas operativas

- **El proyecto trabaja sobre `main`.** No hay flujo de ramas de trabajo paralelas ni worktrees; toda skill, prompt o plan que asuma ese flujo queda fuera del catalogo o debe declarar explicitamente que no aplica aqui.
- El repo ya no mantiene un directorio fisico `.agents/skills-archive/`.
- Las decisiones historicas sobre skills no activas se conservan en `docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md`.
- Toda reincorporacion debe hacerse por alta controlada en `.agents/skills/` y sincronizacion de `skills-lock.json` cuando aplique.
- Toda modificacion sustancial del catalogo debe reflejarse en docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md.
- Toda skill activa debe mantener frontmatter valido con `name` y `description` como minimo.
- `skills-lock.json` puede limitar sets operativos en clientes que lo soporten, pero no reemplaza el catalogo fuente del workspace para OpenCode o Codex.
- `skills-lock.json` vive en la raiz del repo y registra procedencia upstream (GitHub) para `skill-creator` y `ui-ux-pro-max`; el `skillPath` de esas entradas es la ruta dentro del repo upstream, no un directorio local. La copia gobernada de ambas vive en `.agents/skills/`.
