# PROMPT — Transversal · Importación UISP: usuarios del personal · Lanzamiento v1.0

Rige `AGENTS.md`. Fuente: [plan](../plans/2026-11-15-transversal-importacion-uisp-usuarios.md), [spec](../specs/2026-11-15-transversal-importacion-uisp-usuarios.md) v1.0 (G0 2026-11-15) y [ADR-110](../adrs/ADR-110-Importacion-por-Lotes-desde-UISP-y-Portabilidad.md) v1.2 D15. No repetir aquí lo que dicen.

**Principio:** ningún usuario importado entra sin invitación explícita; el historial conserva a quien ya no trabaja.

**Ola 1 — en paralelo:**

---- `sr-qa` · W0
Línea base de no regresión del plan §2 W0 con conteo real, sobre el código actual. Skills: plan §4.

---- `sr-backend` · A
Contrato compartido y migración tenant 211 del plan §2 A (conexión, filas de revisión, kind `USUARIO`, supresión y K2); recompilar `@iwana/shared`. Congela el contrato al cerrar. Skills: plan §4.

**Ola 2 — en paralelo, tras A:** `sr-backend` · B (conexión y lectura) · `sr-backend` · D (atribución y «Actualizar autores»).

**Ola 3 — en paralelo, tras B:** `sr-backend` · C (resolver e invitar) · `fe-platform` · F (portal).

**Ola 4:** `sr-qa` · QA; revisores del plan §4; informe y runbook.

----

**Reglas:** `main` sin ramas; no commitear salvo pedido del usuario; no tocar cambios ajenos del árbol; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos; jest sin caché con conteo real; `DB_NAME=test E2E_TENANT_SLUG=test`; UISP falso en pruebas, nunca la instancia real; sin PII ni la clave de UISP en logs, colas, auditoría, `counts` ni equivalencias.

**Cierre de ola (sesión principal):** conteo ≥ línea base W0; en la ola 3, prueba de que la clave no aparece en respuestas ni logs; luego la ola siguiente.
