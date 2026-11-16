# PROMPT — Transversal · Importación multi-fuente · F0 · Lanzamiento v1.0

Rige `AGENTS.md`. Fuente: [plan](../plans/2026-11-16-transversal-importacion-multifuente-f0.md), [spec](../specs/2026-11-16-transversal-importacion-multifuente.md) v1.0 §4–§5 y [ADR-111](../adrs/ADR-111-Importacion-Multi-Fuente.md) (propuesto). No repetir aquí lo que dicen.

**Gates:** FD (verificación de APIs con el ISP) y G0 pendientes; ADR-111 (propuesto). **No lanzar hasta cerrar FD y tener G0.**
**Bloqueo de secuencia:** la ola MOD09 «adjuntos en tickets» no tiene commit en `migration/` y `assurance/migration-adapters/`; no arrancar hasta que esté commiteada.
**Principio:** cero cambio de comportamiento de UISP; el golden se escribe primero y no se toca.

**Ola 1 — en paralelo:**

---- `sr-qa` · W0
Línea base con conteo real y golden UISP del plan §2 W0. Skills: plan §4.

---- `sr-backend` · A
Contrato canónico v1 y catálogos del plan §2 A; recompilar `@iwana/shared`. Congela el contrato al cerrar. Skills: plan §4.

---- `data-eng` · B
Migración tenant 213 del plan §2 B, con up/down contra Postgres real. Skills: plan §4.

**Ola 2, tras W0 en verde y A congelado:** `sr-backend` · C (adaptador, registro, UISP a `sources/uisp/`, HTTP seguro). Consume `migration-canonical.contract.ts` v1.

**Ola 3, tras C:** `sr-backend` · D (promoción desacoplada, fin del `uisp:%` literal).

**Ola 4:** `sr-qa` · QA; revisores del plan §4; informe F0.

----

**Reglas:**
- `main` sin ramas; commit local por ola, sin push.
- No tocar cambios ajenos del árbol.
- No usar `pnpm dev` ni `dev.mjs`.
- Jest sin caché, con conteo real; `DB_NAME=test E2E_TENANT_SLUG=test`.
- UISP falso; nunca la instancia real.
- Sin PII ni claves en logs, colas ni auditoría.

**Cierre de ola (sesión principal):** conteo ≥ línea base W0 y golden sin diff → commit local → ola siguiente.
