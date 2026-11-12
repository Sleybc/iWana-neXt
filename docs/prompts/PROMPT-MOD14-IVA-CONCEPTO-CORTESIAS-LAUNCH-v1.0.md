# PROMPT — MOD14 · IVA por concepto y cortesías · Lanzamiento v1.0

Rige `AGENTS.md`. Fuente: [plan](../plans/2026-11-12-mod14-iva-por-concepto-y-cortesias.md) y [spec](../specs/2026-11-12-mod14-iva-por-concepto-y-cortesias.md) (G0 2026-11-12).

**Ola 1 — en paralelo:**

---- `sr-qa` · W0
Línea base de no regresión (plan §2 W0) con conteos reales.

---- `sr-backend` · A
IVA por ítem del catálogo (D1, D2, R1, R2): instalación y adicionales congelan su tratamiento en el contrato; la línea de instalación deja de copiar el IVA del internet; CA-1.

----

**Reglas:** `main` sin ramas; no `pnpm dev` ni `dev.mjs`; no matar procesos; jest sin caché; `DB_NAME=test`; no commitear.

**Cierre:** olas 2–4 según plan §3; un solo commit y push al final.
