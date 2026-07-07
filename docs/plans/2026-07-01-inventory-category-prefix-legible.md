# Prefijo legible de categorías — Plan de implementación

**Goal:** Reemplazar truncado ciego de prefijos por siglas legibles (base + distintivo) con unicidad verificada en servidor.

**Architecture:** Algoritmo compartido en `@iwana/shared`; endpoint `GET /inventory/categories/suggest-prefix`; portal consume sugerencia con debounce y oculta código interno en tabla.

**Tech Stack:** TypeScript, NestJS, Next.js portal, Zod, Jest.

---

## Entregables

- [x] `packages/shared/src/inventory/inventory-category-code.ts`
- [x] `GET /api/v1/inventory/categories/suggest-prefix`
- [x] Portal: drawer con sugerencia server-side + tabla sin columna Código
- [x] Tests unitarios portal y API
