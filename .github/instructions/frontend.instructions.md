---
description: "Use when working on Next.js frontend code, shared React UI, forms, App Router pages, or client/server component boundaries in apps/web, apps/portal, or shared TSX packages."
applyTo: "apps/web/**,apps/portal/**,packages/*/src/**/*.tsx"
---

# Frontend Next.js Instructions

- Next.js App Router con React Server Components cuando aporte valor.
- Suspense-first data fetching, lazy loading por feature.
- TypeScript estricto, validacion de formularios con Zod.
- Accesibilidad WCAG 2.2 AA minimo.
- i18n segun convenciones del proyecto.
- Tenant resuelto en servidor cuando aplique — nunca hardcodear tenancy en UI.
- Testing: Playwright para E2E, Jest para unit de logica.
- Sin secretos ni API keys en bundle cliente.
- En tablas de datos y listados tabulares, las celdas deben usar `align-middle` por defecto para mantener consistencia visual entre filas; `align-top` solo se permite si la celda necesita anclaje superior por una decision explicita de diseno y contenido multilinea.
- Comentar en espanol componentes, hooks y flujos UI no triviales.
- Tras cambios de frontend, actualizar el informe tecnico vigente en `docs/informes/`; si es correccion, no crear uno nuevo.
