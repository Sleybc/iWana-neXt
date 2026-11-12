# PROMPT — Transversal · Importación desde UISP · Lanzamiento v1.0

Rige `AGENTS.md`. Fuente: [plan](../plans/2026-11-12-transversal-importacion-uisp.md), [spec](../specs/2026-11-10-transversal-exportacion-importacion-suscriptor-uisp.md) v1.1 (G0 2026-11-12) y [ADR-110](../adrs/ADR-110-Importacion-por-Lotes-desde-UISP-y-Portabilidad.md). No repetir aquí lo que dicen.

**Principio:** complementar sin retroceso; la importación nunca degrada datos cifrados, tipados o calculados ni consume numeración DIAN.

**Ola 1 — en paralelo:**

---- `sr-qa` · W0
Inventario de no regresión (plan §2 W0) en verde sobre el código actual. Skills: plan §4.

---- `sr-backend` · A
Esquema de ADR-110 D1–D5, D8 y D10: lotes, intermedias cifradas, equivalencias, etiquetas, `external_id` + `import_batch_id` con índice único parcial, estado `IMPORTADO` excluido de emisión, numeración, eventos y anulación, permiso `migration.import.manage`. Manifiesto de supresión e inventario K2. Skills: plan §4.

----

**Reglas:** `main` sin ramas; no tocar rutas ajenas; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos; jest sin caché con conteo real; `DB_NAME=test`; fixtures sintéticos; no commitear.

**Cierre de ola (sesión principal):** W0 verde, conteos ≥ línea base, revisores del plan §4, commit por ola. Luego olas 2–5 según plan §3.
