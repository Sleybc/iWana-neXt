# PROMPT — MOD05 ↔ MOD14 · Facturación en la ficha estilo UISP · Lanzamiento v1.0

Rige `AGENTS.md`. Fuente: [plan](../plans/2026-11-13-mod05-mod14-facturacion-en-la-ficha.md) y [spec](../specs/2026-11-13-mod05-mod14-facturacion-en-la-ficha-estilo-uisp.md).

**Principio:** complementar sin retroceso; nada de lo que hoy se ve en Facturación se pierde.

**Ola 1 — en paralelo:**

---- `sr-qa` · W0
Línea base e inventario de lo visible hoy en Documentos y Facturación de la ficha; conteos reales.

---- `sr-backend` · A
Recibo de pago con consecutivo, PDF y desasociar aplicación de pago (D3, D6, R3, R5).

---- `sr-backend` · B
Estado de cuenta como libro con saldo corrido, filtros y PDF; envío por correo de factura, recibo y estado con registro (D4, D5, R2, R4).

----

**Reglas:** `main` sin ramas; no `pnpm dev` ni `dev.mjs`; no matar procesos; jest sin caché; `DB_NAME=test`; no commitear.

**Cierre:** olas 2–3 según plan §3; un solo commit y push al final.
