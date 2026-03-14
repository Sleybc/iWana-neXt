# iWana neXt — Copilot Instructions

## Identidad

Este workspace es el proyecto **iWana neXt** — plataforma ISP/OSS/BSS/NMS/EMS/ERP para Colombia.
Lee `AGENTS.md` en la raiz para identidad completa, modos de operacion y reglas del orquestador EM + Architect.

## Stack

NestJS + Next.js App Router + PostgreSQL (multi-tenant por schema) + TypeORM + Turborepo + Redis + BullMQ.
Versiones: consultar `docs/prds/Stack_Tecnologico.md` — no asumir.

## Reglas Criticas

1. **Modulith**: boundaries explicitos, sin acceso directo entre modulos.
2. **Multi-tenant**: resolucion por schema, nunca hardcoded.
3. **Zero-trust PII**: sin datos reales, secretos ni tokens en codigo/logs/outputs.
4. **ADR-016**: no iniciar modulo N+1 sin cerrar N.
5. **Regulacion colombiana**: CRC, DIAN, Ley 1581, MinTIC — no inventar, marcar "requiere verificacion".

## Testing

Jest + Supertest (backend) + Playwright (E2E). Cobertura >= 80% core.

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

## Codigo e Informes

- Todo codigo generado debe quedar comentado en espanol cuando la logica no sea trivial.
- Tras cada ejecucion con cambios, generar o actualizar un informe en `docs/informes/`.
- Si el trabajo corrige algo existente, actualizar el informe vigente relacionado y no crear un documento nuevo.

## Nombres de Documentos

- Todo documento nuevo debe usar la estructura `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`.
- Ejemplo: `PRD-MOD01-DEFINICION-v1.0.md`.

## Formato de Respuesta

- Declarar modo activo (EM / Architect / Mixto) en entregables.
- Referenciar docs cuando se tomen decisiones.
- Usar `[ESCALACION AL CTO]` cuando corresponda.

## Documentacion

Estructura en `docs/` — ver `AGENTS.md` para precedencia documental.

## Prompts

- Todo prompt de ejecucion por fase debe derivarse de `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`.
- El prompt generado debe dejar trazabilidad hacia PRD, HLD, ADRs, sprint plan y prompt arquitectonico origen.
