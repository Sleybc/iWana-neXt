---
paths:
  [
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/*.test.tsx",
    "**/*.spec.tsx",
    "tests/**",
    "e2e/**",
  ]
---

# Testing Rules

## Estrategia

- Jest + Supertest para backend (unit + integracion).
- Jest para frontend (unit de logica).
- Playwright para E2E.
- Cobertura minima: 80% en modulos core.

## Patrones

- Usar factory functions para data de prueba — no fixtures globales mutables.
- Tests deben ser independientes y reproducibles.
- Nombrar tests con formato: `describe('Modulo') > it('should comportamiento esperado')`.
- Mock externo (APIs, DB) en unit tests; real en integracion cuando sea posible.

## Gates

- No aprobar PR sin evidencia de tests para la funcionalidad cambiada.
- Sin tests rotos en CI.
- Definition of Done incluye tests como evidencia de criterios de aceptacion.

## Comentarios e Informe

- Comentar en espanol factories, dobles de prueba y escenarios de negocio no obvios.
- La evidencia de testing debe consolidarse en el informe vigente de `docs/informes/`.
- Si la tarea corrige fallos o regresiones, actualizar el informe existente y no crear uno nuevo.
