# PROMPT — MOD10 Mesa de ayuda · Bandeja con colas de trabajo · Lanzamiento v1.0

**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)

Rige `AGENTS.md`. Fuente: [plan](../plans/2026-11-18-mod10-bandeja-colas-de-trabajo.md) y [spec](../specs/2026-11-18-mod10-bandeja-colas-de-trabajo-ux.md) v1.0 (G0 2026-11-18). No repetir aquí lo que dicen.

**Principio:** complementar sin retroceso. Ningún indicador, filtro, enlace entrante ni acción de la bandeja desaparece ni queda más lejos.

**Estado al arrancar:** spec aprobada; nada construido. El detalle del ticket está cerrado y publicado (G6.5 2026-11-18): no se toca.

**Ola 1:**

---- `sr-qa` · W0
Línea base de no regresión del plan §2 W0 con conteo real, prueba de inventario de la bandeja sobre el código actual y lista de las E2E afectadas. No cambia código de producción. Skills: plan §4.

**Ola 2 — tras W0:** `fe-platform` · P1 (bandeja, paso 1).

**Ola 3:** `sr-qa` · QA1; revisores del plan §4; punto de control con el usuario.

**Olas 4–6 (paso 2):** `sr-backend` · API con sus revisores; luego `fe-platform` · P2; luego QA2 e informe.

----

**Reglas:** `main` sin ramas ni worktrees; no commitear ni empujar salvo pedido del usuario; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos; jest sin caché con conteo real; mocks de router, auth y permisos con referencia estable; las E2E usan el puerto 3002 del usuario, acordar la ventana; leer cada `SKILL.md` en `.agents/skills/<nombre>/` antes de escribir código.

**Cierre de ola 1 (sesión principal):** línea base con conteos y prueba de inventario en verde. Sin commit.
