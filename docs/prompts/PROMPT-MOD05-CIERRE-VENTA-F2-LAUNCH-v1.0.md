# PROMPT — MOD05 Cierre de venta · Fase 2 · Lanzamiento v1.0

Rige `AGENTS.md`. Fuente: [plan](../plans/2026-11-11-mod05-cierre-de-venta-fase-2.md) y [spec](../specs/2026-11-11-mod05-cierre-de-venta-fase-2-contrato-automatico-e-instalacion.md) (G0 2026-11-11). No repetir aquí lo que dicen.

**Principio:** complementar sin retroceso. La creación manual del contrato y la activación manual se conservan.

**Ola 1 — en paralelo:**

---- `sr-qa` · W0
Inventario de no regresión (plan §2 W0) en verde sobre el código actual. Skills: plan §4.

---- `sr-backend` · C+E
Unificar el cargo de instalación en `installation_fee`: la permanencia lo lee del precio vigente, el contrato lo congela y una migración retira `plan_details.connection_fee` con auditoría. Actualiza manifiesto de supresión e inventario K2 si aplica. Skills: plan §4.

----

**Reglas:** `main` sin ramas; no tocar rutas ajenas; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos; jest sin caché con conteo real; `DB_NAME=test`; no commitear.

**Cierre de ola (sesión principal):** W0 verde, conteos ≥ línea base, revisores del plan §4, commit por ola. Luego olas 2–4 según plan §3.
