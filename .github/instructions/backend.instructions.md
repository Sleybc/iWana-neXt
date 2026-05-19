---
description: "Use when working on shared NestJS backend patterns in worker services, processors, modules, or package-level backend code outside apps/api. Covers queue consumers, persistence, TypeScript strictness, and cross-module discipline."
applyTo: "apps/worker/src/**/*.ts,packages/*/src/**/*.service.ts,packages/*/src/**/*.module.ts,packages/*/src/**/*.controller.ts"
---

# Backend NestJS Instructions

Referencia maestra: `AGENTS.md`.

- Operaciones inter-modulo: interfaces tipadas + eventos BullMQ con retry/DLQ.
- En workers y procesos asincronos, pasar contexto de tenant de forma explicita; no depender de `AsyncLocalStorage` propagado automaticamente.
- Comentar en espanol servicios, processors, validaciones y flujos no triviales.

