# PROMPT — MOD09 Programación · Agenda: densidad y enlaces · Lanzamiento v1.0

**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)

Rige `AGENTS.md`. Fuente: [plan](../plans/2026-11-19-mod09-agenda-programacion-densidad-y-enlaces.md) y [spec](../specs/2026-11-19-mod09-agenda-programacion-densidad-y-enlaces-ux.md) v1.0 (G0 2026-11-19), que complementa las specs vigentes de la agenda. No repetir aquí lo que dicen.

**Principio:** complementar sin retroceso. Ninguna vista, filtro, acción, enlace entrante ni estado vacío de la agenda desaparece ni queda más lejos. Siguen rigiendo: borrador de despacho, arrastre de pendientes, crear evento desde la celda y el motor de recomendaciones.

**Estado al arrancar:** spec aprobada; nada construido. El tenant de pruebas no tiene eventos en noviembre: la medición «antes» con carga la hace W0 con datos sembrados.

**Ola 1:**

---- `sr-qa` · W0
Línea base de no regresión del plan §2 W0 con conteo real, prueba de inventario de la agenda sobre el código actual, datos sembrados (8 técnicos y un día con eventos) con su medición «antes», y lista de las E2E afectadas. No cambia código de producción. Skills: plan §4.

**Ola 2 — tras W0:** `fe-platform` · P1 (agenda, paso 1).

**Ola 3:** `sr-qa` · QA1; revisores del plan §4; punto de control con el usuario.

**Olas 4–6 (paso 2):** `sr-backend` · API (primero cruzar qué viaja hoy; construir solo lo que falte) con sus revisores; luego `fe-platform` · P2; luego QA2 e informe.

----

**Reglas:** `main` sin ramas ni worktrees; no commitear ni empujar salvo pedido del usuario; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos; jest sin caché con conteo real; mocks de router, auth y permisos con referencia estable; las E2E usan el puerto 3002 del usuario, acordar la ventana; antes de quitar un texto, buscarlo en `e2e/`; no tocar recomendaciones, reglas del borrador ni las bandejas de pendientes; no añadir datos del cliente; si la spec se contradice, detenerse y preguntar al usuario; leer cada `SKILL.md` en `.agents/skills/<nombre>/` antes de escribir código.

**Cierre de ola 1 (sesión principal):** línea base con conteos, inventario en verde y medición «antes» con datos sembrados. Sin commit.
