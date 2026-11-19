# PROMPT — MOD11 Operaciones · Bandeja de órdenes de ejecución con colas · Lanzamiento v1.0

**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)

Rige `AGENTS.md`. Fuente: [plan](../plans/2026-11-19-mod11-bandeja-ordenes-colas.md) y [spec](../specs/2026-11-19-mod11-bandeja-ordenes-colas-ux.md) v1.0 (G0 2026-11-19), que complementa la [spec vigente](../specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-ux.md). No repetir aquí lo que dicen.

**Principio:** complementar sin retroceso. Ningún filtro, columna, enlace entrante ni estado vacío de la bandeja desaparece ni queda más lejos. Siguen rigiendo: encabezados sin orden, pie único, estado en la URL y detalle por `?executionOrderId=`.

**Estado al arrancar:** spec aprobada; nada construido. La consola de la orden está cerrada y publicada: no se toca.

**Ola 1:**

---- `sr-qa` · W0
Línea base de no regresión del plan §2 W0 con conteo real, prueba de inventario de la bandeja de órdenes sobre el código actual y lista de las E2E afectadas. No cambia código de producción. Skills: plan §4.

**Ola 2 — tras W0:** `fe-platform` · P1 (bandeja, paso 1).

**Ola 3:** `sr-qa` · QA1; revisores del plan §4; punto de control con el usuario.

**Olas 4–6 (paso 2):** `sr-backend` · API con sus revisores; luego `fe-platform` · P2; luego QA2 e informe.

----

**Reglas:** `main` sin ramas ni worktrees; no commitear ni empujar salvo pedido del usuario; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos; jest sin caché con conteo real; mocks de router, auth y permisos con referencia estable; las E2E usan el puerto 3002 del usuario, acordar la ventana; la columna Cliente no se toca y no se añade búsqueda por cliente (fuga F-4 pendiente de G0); la API no cambia su respuesta sin parámetros; leer cada `SKILL.md` en `.agents/skills/<nombre>/` antes de escribir código.

**Cierre de ola 1 (sesión principal):** línea base con conteos y prueba de inventario en verde. Sin commit.
