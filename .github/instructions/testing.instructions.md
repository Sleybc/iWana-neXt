---
description: "Use when writing or updating unit tests in source folders across the monorepo. Covers isolated test design, deterministic mocks, factories, and expectations for non-E2E tests."
applyTo: "apps/api/src/**/*.spec.ts,apps/api/src/**/*.test.ts,apps/worker/src/**/*.spec.ts,apps/worker/src/**/*.test.ts,apps/web/src/**/*.spec.ts,apps/web/src/**/*.test.ts,apps/web/src/**/*.spec.tsx,apps/web/src/**/*.test.tsx,apps/portal/src/**/*.spec.ts,apps/portal/src/**/*.test.ts,apps/portal/src/**/*.spec.tsx,apps/portal/src/**/*.test.tsx,packages/*/src/**/*.spec.ts,packages/*/src/**/*.test.ts,packages/*/src/**/*.spec.tsx,packages/*/src/**/*.test.tsx"
---

# Unit Testing Instructions

Referencia maestra: `AGENTS.md`.

- Factory functions para data de prueba, no fixtures globales.
- Tests independientes y reproducibles.
- No aprobar PR sin tests de la funcionalidad cambiada.
- Formato: `describe('Modulo') > it('should ...')`.
- Comentar en espanol fixtures, factories y escenarios no obvios.

