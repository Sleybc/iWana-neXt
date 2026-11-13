# PROMPT — MOD14 · Primer cobro completo · Lanzamiento v1.0

Rige `AGENTS.md`. Fuente: [plan](../plans/2026-11-13-mod14-primer-cobro-completo.md) y [spec](../specs/2026-11-13-mod14-primer-cobro-completo.md).

**Ola 1 — en paralelo:**

---- `sr-qa` · W0
Línea base: cierre de OT con consumo, primer cobro, pagos; conteos reales.

---- `sr-backend` · A
Consumo de la OT de instalación asociado al contrato con valor de referencia congelado (R1, R2), por puerto.

---- `sr-backend` · C
Retenciones en el registro de pago (R6–R8, CA-4, CA-5).

----

**Reglas:** `main` sin ramas; no `pnpm dev` ni `dev.mjs`; no matar procesos; jest sin caché; `DB_NAME=test`; no commitear.

**Cierre:** olas 2–4 según plan §3; un solo commit y push al final.
