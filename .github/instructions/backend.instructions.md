---
applyTo: "apps/api/**,packages/*/src/**/*.service.ts,packages/*/src/**/*.module.ts,packages/*/src/**/*.controller.ts"
---

# Backend NestJS Instructions

- Arquitectura Modulith: cada modulo con boundaries explicitos.
- Multi-tenant por schema PostgreSQL — nunca hardcoded.
- TypeScript estricto, validacion con Zod en boundaries.
- Operaciones inter-modulo: interfaces tipadas + eventos BullMQ con retry/DLQ.
- Prohibido acceso directo a tablas de otro modulo.
- JWT + tenant resolution + RBAC/ABAC en endpoints protegidos.
- Testing: Jest + Supertest, cobertura >= 80% core.
- Logs sin PII ni credenciales.
- Versiones: consultar `docs/prds/Stack_Tecnologico.md`.
- Comentar en espanol servicios, validaciones y flujos no triviales.
- Tras cambios de backend, actualizar el informe tecnico vigente en `docs/informes/`; si es correccion, no crear uno nuevo.
