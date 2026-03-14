# Indice de Skills de iWana neXt

**Version:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-03-12

## Proposito

Este indice gobierna el estado operativo del catalogo de skills del proyecto.

Estados admitidos:

- core: skill activa y aprobada para uso regular en el proyecto
- candidate: skill archivada con potencial de restauracion futura
- archived: skill retirada del catalogo activo sin prioridad inmediata de retorno
- hold: skill archivada y no recomendada por ahora

## Reglas de precedencia

1. AGENTS.md
2. CLAUDE.md
3. .github/copilot-instructions.md
4. Este indice
5. La skill individual

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
- tailwind-patterns
- test-driven-development
- wcag-audit-patterns
- turborepo-caching
- database-migration
- e2e-testing-patterns
- codebase-cleanup-deps-audit

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
- nextjs-app-router-patterns
- tailwind-patterns
- wcag-audit-patterns

### Testing

- e2e-testing-patterns
- playwright-skill
- test-driven-development
- testing-patterns

### Mantenimiento y dependencias

- codebase-cleanup-deps-audit

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

## Notas operativas

- El resto del material archivado permanece en .agents/skills-archive/ como repositorio historico.
- La separacion fisica del archivo es: `candidate-restore/`, `candidate-keep/`, `hold/` y resto historico en la raiz del archivo.
- La restauracion debe hacerse por movimiento controlado desde .agents/skills-archive/ hacia .agents/skills/.
- Toda modificacion sustancial del catalogo debe reflejarse en docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md.
- Toda skill activa debe mantener frontmatter valido con `name` y `description` como minimo.
