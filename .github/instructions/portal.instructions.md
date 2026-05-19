---
description: "Use when working on apps/portal tenant-aware screens, auth flows, dashboard, portal navigation, or tenant self-service integrations. Covers tenant-safe frontend rules specific to the enterprise portal."
applyTo: "apps/portal/**"
---

# Portal Tenant-Aware Instructions

Referencia maestra: `AGENTS.md`.

- `apps/portal` es la consola empresarial tenant-aware; no mezclarla con la consola de plataforma de `apps/web`.
- Consumir contratos self-service del tenant autenticado; no usar endpoints globales de plataforma como atajo.
- Mantener la separacion entre sesion autenticada completa y tokens temporales de MFA o flujos intermedios.
- No poblar estado global de usuario con tokens de alcance limitado.
- La navegacion visible del portal no debe apuntar a rutas inexistentes; usar placeholders controlados o retirar accesos.
- Los dashboards y pantallas del portal deben usar copy empresarial, no copy de suscriptor residencial ni copy de plataforma.
- Si una pantalla depende de datos aun no disponibles, renderizar estado vacio o `no disponible`; no inventar metricas.
- Respetar gating por rol y tenancy en componentes, loaders y llamadas del `api-client`.
- Mantener accesibilidad WCAG AA en formularios, alertas, loaders y estados de error del portal.
