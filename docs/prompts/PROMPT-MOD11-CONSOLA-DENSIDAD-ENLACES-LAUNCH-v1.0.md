# PROMPT — MOD11 Operaciones · Consola de la orden: densidad y enlaces · Lanzamiento v1.0

**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)

Rige `AGENTS.md`. Fuente: [plan](../plans/2026-11-18-mod11-consola-orden-densidad-y-enlaces.md) y [spec](../specs/2026-11-18-mod11-consola-orden-densidad-y-enlaces-ux.md) v1.0 (G0 2026-11-18), que complementa la [spec vigente v1.5](../specs/2026-10-05-mod11-consola-ot-requisito-ux.md). No repetir aquí lo que dicen.

**Principio:** complementar sin retroceso. Ningún dato, requisito, acción ni aviso de la consola desaparece ni queda más lejos. Siguen rigiendo: acciones solo desde `allowedActions`, sin acordeones, firma al final, custodia solo al abrir el registro.

**Estado al arrancar:** spec aprobada; nada construido. Mesa de ayuda (detalle y bandeja) cerrada y publicada: no se toca.

**Ola 1 (en paralelo):**

---- `prod-ux` · R0
Dictamen sobre D2: el índice de un requisito a la vez frente a «sin acordeones» de la spec vigente §4, y el anuncio del requisito activo. No escribe código. Skills: plan §4.

---- `sr-qa` · W0
Línea base de no regresión del plan §2 W0 con conteo real, prueba de inventario de la consola por momento sobre el código actual y lista de las E2E afectadas. No cambia código de producción. Skills: plan §4.

**Ola 2 — tras R0 y W0:** `fe-platform` · P1 (consola, paso 1), empezando por D1 con las pruebas del gate de cierre en verde.

**Ola 3:** `sr-qa` · QA1; revisores del plan §4; punto de control con el usuario.

**Olas 4–6 (paso 2):** `sr-backend` · API con sus revisores; luego `fe-platform` · P2; luego QA2 e informe.

----

**Reglas:** `main` sin ramas ni worktrees; no commitear ni empujar salvo pedido del usuario; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos; jest sin caché con conteo real; mocks de router, auth y permisos con referencia estable; las E2E usan el puerto 3002 del usuario, acordar la ventana; no tocar el gate de cierre, la plantilla ni MOD13 fuera de D1, y detenerse si D1 lo exige; leer cada `SKILL.md` en `.agents/skills/<nombre>/` antes de escribir código.

**Cierre de ola 1 (sesión principal):** dictamen de D2, línea base con conteos y prueba de inventario en verde. Sin commit.
