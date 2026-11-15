# PROMPT — Transversal · Importación UISP: complementar titular · Lanzamiento v1.0

Rige `AGENTS.md`. Fuente: [plan](../plans/2026-11-15-transversal-importacion-uisp-complementar-titular.md), [spec](../specs/2026-11-15-transversal-importacion-uisp-complementar-titular.md) v1.0 (G0 2026-11-15) y [ADR-110](../adrs/ADR-110-Importacion-por-Lotes-desde-UISP-y-Portabilidad.md) v1.1 D11. No repetir aquí lo que dicen.

**Principio:** complementar sin retroceso; nunca fusionar suscriptores ni sobrescribir datos de iWana.

**Ola 1 — en paralelo:**

---- `sr-qa` · W0
Línea base de no regresión del plan §2 W0 con conteo real, sobre el código actual. Skills: plan §4.

---- `sr-backend` · A
Contrato compartido (kind `TITULAR`, motivos, observaciones, `candidateRef`, error y conteo) y migración tenant 210 del plan §2 A; recompilar `@iwana/shared`. Congela el contrato al cerrar. Skills: plan §4.

**Ola 2:** `sr-backend` · B (simulación y equivalencia), tras A.

**Ola 3 — en paralelo:** `sr-backend` · C (promoción, conciliación y reversión) · `fe-platform` · F (portal), tras B.

**Ola 4:** `sr-qa` · QA; revisores del plan §4; informe de cierre.

----

**Reglas:** `main` sin ramas; no commitear (el usuario commitea al cerrar el módulo); no tocar cambios ajenos del árbol; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos; jest sin caché con conteo real; `DB_NAME=test`; fixtures sintéticos; sin PII en equivalencias, meta, logs ni colas.

**Cierre de ola (sesión principal):** conteo ≥ línea base W0; en la ola 3, prueba de que revertir no borra al suscriptor complementado; luego la ola siguiente.
