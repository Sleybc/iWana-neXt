---
description: "Use when writing or updating Playwright end-to-end tests, browser flows, authentication journeys, or protected route validation in web and portal apps. Covers stable selectors, flow-level assertions, and evidence expectations."
applyTo: "e2e/**,apps/portal/tests/e2e/**"
---

# E2E Testing Instructions

Referencia maestra: `AGENTS.md`.

- Usar Playwright para flujos completos de usuario y validar comportamiento observable, no detalles internos de implementación.
- Preferir selectores accesibles y estables sobre selectores frágiles por estructura visual.
- Cubrir rutas críticas como login, redirecciones, navegación protegida, MFA y journeys del dashboard.
- Registrar mocks o precondiciones de red de forma explícita y consistente con el contrato real.
- Evitar assertions excesivamente acopladas a animaciones, tiempos arbitrarios o copy incidental.
- Si el flujo depende de tenancy, dejar claro el tenant usado y verificar que la navegación respeta el boundary correcto.
- Guardar evidencia útil de fallos solo cuando aporte diagnóstico real; no inflar artifacts innecesariamente en el repo.
