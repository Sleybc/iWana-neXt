# PROMPT — MOD05 · Equipos del suscriptor · Lanzamiento v1.0

Rige `AGENTS.md`. Fuente: [plan](../plans/2026-11-16-mod05-mod12-equipos-del-suscriptor.md) y [spec](../specs/2026-11-16-mod05-mod12-equipos-del-suscriptor.md) v1.0 (G0 2026-11-16). No se repite aquí lo que dicen.

**Estado al arrancar:** G0 aprobado el 2026-11-16. Ninguna ola ha corrido. MOD12 5A (ficha 360) y 5B (comodato) están cerradas y no se tocan.

**Principio:** solo lectura. El portal consume el endpoint de MOD12, y la pestaña nunca muestra la historia de un equipo fuera del periodo de comodato del suscriptor. El drawer de Inventario queda fuera de ese recorte (spec CA-6).

**Ola 1 — en paralelo:**

---- `sr-qa` · W0
Línea base de no regresión del plan §2 W0, con conteo real. Skills: plan §4.

---- `sr-backend` · A1
Contrato del endpoint según la spec §2.1: tipos en `@iwana/shared`, DTO y OpenAPI; recompilar. Al cerrar, congélalo y cita la ruta y la versión. Skills: plan §4.

---- `ds-owner` · DS
Revisa y congela el contrato de `PortalTimeline` de la spec §3, por el carril rápido, y anótalo en el changelog del DS. Skills: plan §4.

**Ola 2 — tras A1 y DS:** `sr-backend` · A2 (endpoint, `EXPLAIN`, CA-4 y CA-5; consulta a `sec-eng` por el bloqueo) y D (nota en el PRD) · `fe-platform` · F1 y luego F2, con mocks derivados de los tipos de A1.

**Ola 3:** `sr-qa` · QA; los revisores del plan §4; el informe.

----

**Reglas:** `main` sin ramas; no commitear salvo que el usuario lo pida; no tocar cambios ajenos del árbol; no ejecutar `pnpm dev` ni `dev.mjs`; no matar procesos ajenos; jest sin caché y con conteo real; integración con `DB_NAME=test E2E_TENANT_SLUG=test`. Cambiar un contrato congelado → `[BLOQUEO]` y parar.

**Cierre de ola (sesión principal):** conteo mayor o igual a la línea base W0. En la ola 2, CA-4 y CA-5 en verde contra Postgres real. Luego, la ola siguiente.
