# PROMPT — MOD05 Cierre de venta · Lanzamiento v1.0

Rige `AGENTS.md`. Fuente: [plan](../plans/2026-11-11-mod05-cierre-de-venta-contrato-firmado.md), [spec](../specs/2026-11-11-mod05-cierre-de-venta-contrato-firmado.md) (G0 2026-11-11) y [ADR-109](../adrs/ADR-109-Contrato-Firmado-en-Instalacion-y-PDF-en-Worker.md). No repetir aquí lo que dicen.

**Principio:** complementar sin retroceso. La activación manual del contrato y el acta de conformidad de la OT se conservan.

**Ola 1 — en paralelo:**

---- `sr-qa` · W0
Inventario de no regresión (plan §2 W0) en verde sobre el código actual: activación manual de contrato, motivos de bloqueo comercial, pasos de la consola de OT y cierre con acta. Skills: plan §5.

---- `sr-backend` · K
Contratos compartidos en `@iwana/shared` (plan §2 K): evento `crm.contract.activated` (solo ids), motivo `CONTRACT_UNSIGNED`, permiso `crm.contracts.pending_signature.notify`, tipo legal `CONTRATO_SERVICIO`, esquemas de firma, estado de generación y permanencia. Traza cada regla de la spec a un campo antes de congelar. Skills: plan §5.

----

**Reglas:** `main` sin ramas; no tocar rutas ajenas; no `pnpm dev` ni `dev.mjs`; no matar `node` por nombre; jest sin caché con conteo real; `DB_NAME=test`; no commitear.

**Cierre de ola (sesión principal):** W0 verde, conteos ≥ línea base, revisores del plan §5, commit por ola. Luego olas 2–5 según plan §3.
