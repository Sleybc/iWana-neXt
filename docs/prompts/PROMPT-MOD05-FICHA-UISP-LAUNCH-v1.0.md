# PROMPT — MOD05 Ficha estilo UISP · Lanzamiento v1.0

Rige `AGENTS.md`. Fuente: [plan](../plans/2026-11-10-mod05-ficha-suscriptor-estilo-uisp.md) y [spec](../specs/2026-11-10-mod05-ficha-suscriptor-estilo-uisp-ux.md) (G0 2026-11-10). No repetir aquí lo que dicen.

**Principio:** complementar sin retroceso. Ninguna acción, campo ni pestaña actual se pierde (CA-1).

**Ola 1 — en paralelo:**

---- `sr-qa` · W0
Escribe el inventario de no regresión de la ficha (spec H1–H6, CA-1) en verde sobre el código actual. Skills: plan §5.

---- `ds-owner` → `fe-platform` · C
`ds-owner` define la variante de densidad compacta de `PortalPanel` (D1); `fe-platform` la implementa sin primitives nuevas. Skills: plan §5.

---- `sr-backend` · D-be
Notas del suscriptor: migración tenant (verifica que 180 esté libre), entidad, `GET`/`POST /crm/subscribers/:id/notes`, esquemas en `@iwana/shared`, OpenAPI, auditoría y guarda de titular bloqueado o anonimizado. Congela el contrato antes de seguir. Skills: plan §5.

----

**Reglas:** `main` sin ramas; no tocar rutas ajenas; no `pnpm dev` ni `dev.mjs`; no matar `node` por nombre; jest sin caché con conteo real; `DB_NAME=test`.

**Cierre de ola (sesión principal):** inventario W0 verde, conteos ≥ línea base, revisores del plan §5, commit por ola. Luego olas 2–5 según plan §3.
