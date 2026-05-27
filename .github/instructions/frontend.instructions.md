---
description: "Use when working on Next.js frontend code, shared React UI, forms, App Router pages, or client/server component boundaries in apps/web, apps/portal, or shared TSX packages."
applyTo: "apps/web/**,apps/portal/**,packages/*/src/**/*.tsx"
---

# Frontend Next.js Instructions

Referencia maestra: `AGENTS.md`.

- Next.js App Router con React Server Components cuando aporte valor.
- Suspense-first data fetching, lazy loading por feature.
- i18n segun convenciones del proyecto.
- Tenant resuelto en servidor cuando aplique — nunca hardcodear tenancy en UI.
- Sin secretos ni API keys en bundle cliente.
- Toda nueva interfaz, seccion o modulo debe aplicar la identidad operativa iWana documentada en `docs/identity/Manual_Implementacion_Identidad_Iwana.md`: fresca, minimalista, equilibrada, profesional y clara para trabajo B2B.
- Antes de crear o rediseñar pantallas, usar la skill `iwana-identity-ui-review` junto con `system-vocabulary-review` cuando haya texto visible.
- Para decisiones UI/UX amplias, se puede usar `ui-ux-pro-max` como biblioteca consultiva de heuristicas, patrones, tipografia, color, responsive y performance visual. Sus recomendaciones no reemplazan el manual de identidad iWana, los tokens reales ni las primitives del repo.
- Usar tokens del sistema (`iwana-primary`, `iwana-secondary-700`, superficies dark, radios y sombras iWana) antes que estilos arbitrarios. `iwana-secondary` no debe usarse como texto sobre blanco; usar `iwana-secondary-700`.
- Las pantallas operativas deben priorizar jerarquia, escaneo, densidad controlada y acciones frecuentes visibles. No convertir cada bloque en card ni anidar cards si una seccion sin marco resuelve mejor la lectura.
- Glassmorphism y blur se usan de forma selectiva en overlays, controles flotantes o capas sobre contenido; no como estilo masivo de paneles, tablas o formularios.
- Toolbars con mas de dos acciones deben ser responsive: en mobile se apilan o ocupan ancho completo; en desktop pueden volver a fila compacta.
- En tablas de datos y listados tabulares, las celdas deben usar `align-middle` por defecto para mantener consistencia visual entre filas; `align-top` solo se permite si la celda necesita anclaje superior por una decision explicita de diseno y contenido multilinea.
- Comentar en espanol componentes, hooks y flujos UI no triviales.
