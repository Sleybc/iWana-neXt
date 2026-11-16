# PROMPT — MOD09 Soporte · Adjuntos en tickets · Lanzamiento v1.0

Rige `AGENTS.md`. Fuente: [plan](../plans/2026-11-16-mod09-adjuntos-en-tickets.md) y [spec](../specs/2026-11-16-mod09-adjuntos-en-tickets.md) v1.0 (G0 2026-11-16). No repetir aquí lo que dicen.

**Principio:** ningún archivo se sirve sin validar su firma y pasar la cuarentena; los adjuntos internos nunca salen del personal autorizado.

**Ola 1 — en paralelo:**

---- `sr-qa` · W0
Línea base de no regresión del plan §2 W0 con conteo real, sobre el código actual. Skills: plan §4.

---- `sr-backend` · A
Contrato compartido y migración tenant 212 del plan §2 A (adjunto, uso `TICKET_ATTACHMENT`, conteo, motivos, supresión y K2); recompilar `@iwana/shared`. Congela el contrato al cerrar. Skills: plan §4.

**Ola 2 — en paralelo, tras A:** `sr-backend` · B (media y Soporte) · `plat-ops` · I (nginx 110M en la ruta).

**Ola 3 — en paralelo, tras B:** `sr-backend` · C (importación) · `fe-platform` · F (portal).

**Ola 4:** `sr-qa` · QA; revisores del plan §4; informe. La reimportación del cliente 22 se hace con el usuario.

----

**Reglas:** `main` sin ramas; no commitear salvo pedido del usuario; no tocar cambios ajenos del árbol; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos; jest sin caché con conteo real; integración con `DB_NAME=test E2E_TENANT_SLUG=test`; archivos de prueba sintéticos, nunca los adjuntos reales.

**Cierre de ola (sesión principal):** conteo ≥ línea base W0; en la ola 2, prueba de que un adjunto interno no se descarga sin permiso y de que una firma falsa se rechaza; luego la ola siguiente.
