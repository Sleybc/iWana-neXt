# Diseno: HLD MOD01 + Prompt Scaffold + Normalizacion Informes

**Fecha:** 2026-03-08
**Modo activo:** Mixto (EM + Architect)
**Estado:** Aprobado

---

## Objetivo

Materializar tres artefactos documentales pendientes para desbloquear la ejecucion del Modulo 1 (Auth + Tenant + Audit) de iWana neXt.

## Enfoque

Secuencial con dependencia (Enfoque A):

1. HLD primero (es artefacto de entrada obligatorio del prompt)
2. Prompt de ejecucion de Scaffold (referencia el HLD)
3. Renombrado de plantillas de informes (independiente)

---

## Entregable 1: HLD-MOD01-ARQUITECTURA-v1.0.md

**Ubicacion:** `docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md`
**Nivel:** Completo y definitivo

### Estructura (10 secciones)

1. Vision General — responsabilidades, boundaries IN/OUT, dependencias
2. Arquitectura Interna — carpetas, capas, Guards, Decoradores, Interceptors
3. Modelo de Datos Definitivo — 6 entidades TypeORM completas con campos, tipos, constraints, indices
4. Contratos de API — 22 endpoints con DTOs TypeScript, codigos HTTP, roles
5. Diagramas de Secuencia (Mermaid) — Login+MFA, Refresh+reuse, Tenant provisioning, Pipeline seguridad
6. Decisiones de Diseno — referencia ADRs vigentes
7. Guia de Implementacion — orden, npm versions, .env.example, anti-patterns
8. Criterios de Aceptacion — CA-M01-001 a CA-M01-063
9. Definition of Done — checklist completo
10. Matriz Documental por Fase — artefactos por rol, carpeta, gate

### Decisiones clave

- Versiones Sprint 1: Node 22.14.0, NestJS 11.1.0, Next.js 15.2.0, PG 16
- `passwordHash` NO se cifra con AES-256 (bcrypt ya es hash); solo `email` y `mfaSecret` con AES-256-GCM
- Schema routing via `SET search_path` + AsyncLocalStorage
- TenantProvisioningService ejecuta DDL programatico via BullMQ worker

### Fuentes

- `docs/prds/PRD-MOD01-Auth-Tenant-Audit-v1.0.md`
- `docs/prds/PRD-MOD01-DEFINICION-v1.1.md`
- `docs/prompts/PROMPT-ARCHITECT-MOD01-Auth-Tenant-Audit.md`
- `docs/prompts/PROMPT-MOD01-ARQUITECTURA-v1.0.md`
- `docs/sprints/PLAN-MOD01-SPRINT-01-v1.0.md`
- `docs/prds/Stack_Tecnologico.md`
- ADR-001 a ADR-004, ADR-012, ADR-017 a ADR-022

---

## Entregable 2: PROMPT-MOD01-SCAFFOLD-v1.0.md

**Ubicacion:** `docs/prompts/PROMPT-MOD01-SCAFFOLD-v1.0.md`
**Base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`

- Objetivo: Monorepo Turborepo + Docker dev + CI basico + design tokens
- Artefactos de entrada: PRD, HLD, PLAN-MOD01-SPRINT-01
- Instrucciones: 3 dias del scaffold (monorepo, Docker, CI+seguridad)
- CAs del scaffold: docker compose up, turbo build, turbo lint, CI verde, .env.example
- Stop/go: Docker Desktop no disponible = blocker
- Informe de salida: INFORME-MOD01-SCAFFOLD-v1.0.md

---

## Entregable 3: Renombrado de plantillas de informes

| Actual                              | Nuevo                             |
| ----------------------------------- | --------------------------------- |
| `TEMPLATE-INFORME-FASE-MODULO.md`   | `TEMPLATE-INFORME-FASE-v1.0.md`   |
| `TEMPLATE-INFORME-CIERRE-MODULO.md` | `TEMPLATE-INFORME-CIERRE-v1.0.md` |

Se actualizan headers internos y referencias cruzadas.

---

_Diseno aprobado por el usuario el 2026-03-08._
