---
description: "Use when writing or updating integration or HTTP tests for NestJS modules, tenant isolation, controller contracts, or request-level behavior. Covers transactional assertions, realistic test wiring, and boundary validation."
applyTo: "apps/api/src/**/*.http.spec.ts,apps/api/src/**/*isolation.spec.ts,apps/api/src/**/*self.spec.ts,apps/api/src/**/*settings.spec.ts"
---

# Integration Testing Instructions

Referencia maestra: `AGENTS.md`.

- Priorizar pruebas de contrato HTTP, aislamiento por tenant, middleware y wiring realista entre controller, guards, services y persistencia.
- Verificar auth, tenancy y errores esperados a nivel request/response, no solo comportamiento interno del servicio.
- Para pruebas multi-tenant, afirmar explícitamente el schema o boundary esperado y cubrir negativos cross-tenant.
- No reemplazar toda la cadena por mocks si el objetivo es validar integración o contratos del modulo.
- Cubrir happy path, errores de autorizacion, validacion y regresiones de boundary.
- Cuando se prueben endpoints, mantener nombres de casos y asserts alineados al contrato publico y a OpenAPI si aplica.
