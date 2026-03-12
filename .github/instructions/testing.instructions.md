---
applyTo: "**/*.test.ts,**/*.spec.ts,**/*.test.tsx,**/*.spec.tsx,tests/**,e2e/**"
---

# Testing Instructions

- Jest + Supertest (backend), Jest (frontend unit), Playwright (E2E).
- Factory functions para data de prueba, no fixtures globales.
- Tests independientes y reproducibles.
- Cobertura >= 80% en modulos core.
- No aprobar PR sin tests de la funcionalidad cambiada.
- Formato: `describe('Modulo') > it('should ...')`.
- Comentar en espanol fixtures, factories y escenarios no obvios.
- Tras ejecuciones de testing que dejen evidencia documental, actualizar el informe vigente en `docs/informes/` en lugar de duplicarlo.
