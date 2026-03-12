# Skills activas de iWana neXt

Este directorio mantiene solo el set core de skills necesarias para el proyecto iWana neXt.

## Estado actual

- Skills activas: 25
- Skills archivadas fuera del catalogo activo: 683 entradas no activas
- Desglose del archivo: 679 directorios y 4 archivos legacy
- Ruta de archivo: .agents/skills-archive/
- Criterio rector: AGENTS.md prevalece sobre cualquier skill individual
- Skills core ya potencializadas contra el stack real: 25

## Objetivo de esta reduccion

- Reducir ruido de activacion y discoverability.
- Mantener solo skills alineadas con el stack y la gobernanza real del repo.
- Dejar el resto archivado para una fase posterior de evaluacion, restauracion o potencializacion.

## Prioridad de uso

### Primera linea

Usar primero cuando la tarea caiga claramente en una de estas areas base del stack:

- nestjs-expert
- nextjs-app-router-patterns
- frontend-dev-guidelines
- testing-patterns
- monorepo-architect
- core-components
- postgresql

### Segunda linea

Usar para profundizar seguridad, contratos, arquitectura o integracion cuando la tarea ya este acotada:

- architect-review
- architecture-decision-records
- auth-implementation-patterns
- backend-security-coder
- docs-architect
- frontend-security-coder
- openapi-spec-generation
- security-auditor
- typescript-expert

### Especializadas por necesidad

Activarlas cuando el problema sea especifico del dominio o de una capa puntual:

- bullmq-specialist
- docker-expert
- i18n-localization
- mermaid-expert
- observability-engineer
- playwright-skill
- tailwind-patterns
- test-driven-development
- wcag-audit-patterns

## Skills activas por area

### Arquitectura y gobierno

- architect-review
- architecture-decision-records
- docs-architect
- mermaid-expert
- monorepo-architect

### Backend y plataforma

- auth-implementation-patterns
- backend-security-coder
- bullmq-specialist
- docker-expert
- nestjs-expert
- openapi-spec-generation
- observability-engineer
- postgresql
- security-auditor
- typescript-expert

### Frontend y accesibilidad

- core-components
- frontend-dev-guidelines
- frontend-security-coder
- i18n-localization
- nextjs-app-router-patterns
- tailwind-patterns
- wcag-audit-patterns

### Testing

- playwright-skill
- test-driven-development
- testing-patterns

## Mapa rapido de combinacion

- Si la tarea es de NestJS o backend modular, comenzar por nestjs-expert y complementar con auth-implementation-patterns, postgresql, bullmq-specialist u openapi-spec-generation segun corresponda.
- Si la tarea es de frontend Next.js, comenzar por nextjs-app-router-patterns y complementar con frontend-dev-guidelines, core-components, tailwind-patterns, wcag-audit-patterns e i18n-localization.
- Si la tarea es transversal de seguridad, usar security-auditor y los skills de seguridad por capa.
- Si la tarea es de pruebas, usar testing-patterns, test-driven-development y playwright-skill.

## Estado de homogeneizacion

- Todo el catalogo activo ya fue potencializado o normalizado contra el stack real del repo.
- El catalogo ya no presenta desalineaciones estructurales evidentes frente a AGENTS.md.
- Las siguientes mejoras, si se desean, ya son de profundidad o gobernanza, no de limpieza base.

## Gobernanza de restauracion

- Skills restaurables priorizadas: 0
- Skills revisadas y mantener archivadas: 6
- Skills en hold: 3
- El resto del archivo se considera historico y no debe volver al catalogo activo sin una nueva decision explicita.

## Restaurar skills archivadas

Las skills removidas del catalogo activo no fueron borradas. Se movieron a .agents/skills-archive/.

Restauracion manual:

1. Mover la carpeta deseada desde .agents/skills-archive/ hacia .agents/skills/.
2. Validar que la skill restaurada tenga sentido para el stack y el dominio del repo.
3. Actualizar este README si la skill vuelve a formar parte del set core.

## Criterios para potencializar el catalogo despues

Antes de volver a activar skills archivadas, evaluar:

- compatibilidad con el stack real del repo
- utilidad demostrable para el roadmap activo
- ausencia de solapamiento con skills ya activas
- dependencia de herramientas o MCPs realmente disponibles
- alineacion con AGENTS.md, CLAUDE.md y .github/copilot-instructions.md

## Referencias

- AGENTS.md
- CLAUDE.md
- .github/copilot-instructions.md
- .agents/skills/INDEX.md
- .agents/skills/MANIFEST.json
- docs/quality/CHECKLIST-SISTEMA-SKILLS-GOBERNANZA-v1.0.md
- docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md
