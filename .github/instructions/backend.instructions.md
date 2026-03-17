---
description: "Use when working on shared NestJS backend patterns in worker services, processors, modules, or package-level backend code outside apps/api. Covers queue consumers, persistence, TypeScript strictness, and cross-module discipline."
applyTo: "apps/worker/src/**/*.ts,packages/*/src/**/*.service.ts,packages/*/src/**/*.module.ts,packages/*/src/**/*.controller.ts"
---

# Backend NestJS Instructions

- Arquitectura Modulith: cada modulo con boundaries explicitos.
- Multi-tenant por schema PostgreSQL — nunca hardcoded.
- TypeScript estricto, validacion con Zod en boundaries.
- Operaciones inter-modulo: interfaces tipadas + eventos BullMQ con retry/DLQ.
- Prohibido acceso directo a tablas de otro modulo.
- En workers y procesos asincronos, pasar contexto de tenant de forma explicita; no depender de `AsyncLocalStorage` propagado automaticamente.
- Testing: Jest + Supertest, cobertura >= 80% core.
- Logs sin PII ni credenciales.
- Versiones: consultar `docs/prds/Stack_Tecnologico.md`.
- Comentar en espanol servicios, processors, validaciones y flujos no triviales.
- Tras cambios de backend, actualizar el informe tecnico vigente en `docs/informes/`; si es correccion, no crear uno nuevo.

