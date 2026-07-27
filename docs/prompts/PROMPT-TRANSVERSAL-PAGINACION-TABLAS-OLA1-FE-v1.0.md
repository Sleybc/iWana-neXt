# PROMPT — Paginación tablas operativas (Ola 1 FE-PLATFORM)

**Emisor:** AI-EM-ARCH  
**Destinatario:** AI-FE-PLATFORM  
**Fecha:** 2026-07-24  
**Precondición:** ADR-064 aprobado por CTO (o go condicionado del CTO)  
**Contrato DS:** [DS-OWNER](89b2e45a-85bd-464e-853f-c5959c91cc00) · **UX:** [PROD-UX](61b340c7-4300-429f-a02b-4fb5f08afa71)

## Alcance

1. Crear `PortalTablePagination` en `apps/portal/src/components/shared/portal-ui.tsx` (primitive **portal**, no `@iwana/ui`):
   - Props obligatorias: `hasMore: boolean`, `onLoadMore: () => void`, `loading: boolean`.
   - Props opcionales: `resourceLabel?: string` (aria / vocabulario), `className?`, `loadMoreLabel?` (default «Cargar más»), `shown?` / `total?` **solo** para sr-only / `aria-live` — **prohibido** pintar «Mostrando X de Y» en el footer.
   - Si `!hasMore` → **return null** (sin envoltorio vacío).
   - UI visible: `border-t border-gray-100` + `Button` `variant="secondary"` `size="sm"` «Cargar más» con estado loading/disabled.
2. Remedir `UsersTable` / strip Users:
   - Conteo visible solo en `PortalResultsStrip` (`{total} usuarios`).
   - Eliminar «Fin de resultados» y cualquier «Mostrando…» del pie; usar `PortalTablePagination`.
3. Tests Jest del primitive y UsersTable.

## Restricciones

- No tokens nuevos de marca; no CTA primary para load-more; no paginación numerada.
- Español UI. Skills: `iwana-identity-ui-review`, `core-components`, `frontend-dev-guidelines`.

## DoD

- Tests verdes scoped.
- `audit-ui.mjs` sin P0/P1 nuevos en archivos tocados.
- Footer ausente cuando no hay más páginas.
