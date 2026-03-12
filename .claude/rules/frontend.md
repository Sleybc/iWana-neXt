---
paths: ["apps/web/**", "packages/*/src/**/*.tsx", "packages/*/src/**/*.ts"]
---

# Frontend — Next.js App Router Rules

## Arquitectura

- Next.js App Router con React Server Components cuando aporte valor.
- Suspense-first data fetching.
- Feature-based architecture con lazy loading.
- Componentes UI del design system local (core-components).

## Patrones Obligatorios

- TypeScript estricto.
- Validacion de formularios con Zod.
- i18n con las convenciones del proyecto (ver skill i18n-localization).
- Accesibilidad WCAG 2.2 AA minimo.

## Multi-Tenancy

- Tenant resuelto en el servidor — nunca exponer logica de tenant al cliente.
- Theming por tenant si aplica, basado en design tokens.

## Testing

- Jest para unit tests de logica.
- Playwright para E2E y validacion visual.
- Cobertura >= 80% en flujos core.

## Comentarios e Informe

- Comentar en espanol componentes, hooks, loaders y reglas UI no triviales.
- Despues de cambios de frontend, actualizar el informe vigente en `docs/informes/`.
- Si el trabajo es correctivo, reutilizar el informe existente y no abrir uno nuevo.

## Seguridad

- Nunca exponer secretos ni API keys en el bundle cliente.
- CSP headers configurados.
- Sanitizar inputs del usuario contra XSS.
