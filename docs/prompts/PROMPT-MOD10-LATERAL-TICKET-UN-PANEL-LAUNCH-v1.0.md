# PROMPT — MOD10 Mesa de ayuda · Lateral del ticket en un solo panel · Lanzamiento v1.0

**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)

Rige `AGENTS.md`. Fuente: [plan](../plans/2026-11-20-mod10-detalle-ticket-lateral-un-panel.md) y [spec](../specs/2026-11-20-mod10-detalle-ticket-lateral-un-panel-ux.md) v1.0 (G0 2026-11-20), que reemplaza solo la disposición del riel de la spec del detalle del ticket. No repetir aquí lo que dicen.

**Principio:** complementar sin retroceso. Ningún dato, acción ni aviso del lateral desaparece: se agrupan y se ordenan por uso. El hilo, el redactor y la cabecera del ticket no se tocan.

**Estado al arrancar:** spec aprobada con D1–D4 según la recomendación; nada construido. Sin API ni contrato. El cambio se ve en tres contenedores: vista dividida de la ficha, panel de Mesa de ayuda y página propia del ticket.

**Ola 1 (en paralelo):**

---- `ds-owner` · D3
Dictamen del plan §2 D3: panel único por composición o pieza nueva, separadores, densidad y línea de fechas. No escribe código. Skills: plan §4.

---- `sr-qa` · W0
Línea base de no regresión del plan §2 W0 con conteo real, prueba de inventario del lateral en los tres contenedores, medición «antes» con un ticket sintético con visita y orden, y lista de las E2E afectadas. No cambia código de producción. Skills: plan §4.

**Ola 2 — tras D3 y W0:** `fe-platform` · P1 (lateral).

**Ola 3:** `sr-qa` · QA1; revisores del plan §4; informe; punto de control con el usuario.

----

**Reglas:** `main` sin ramas ni worktrees; no commitear ni empujar salvo pedido del usuario; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos; jest sin caché con conteo real; mocks de router, auth y permisos con referencia estable; las E2E usan el puerto 3002 del usuario, acordar la ventana; antes de mover un texto, buscarlo en `e2e/`; los nombres accesibles de las acciones no cambian; ninguna verificación vale si no cubre los tres contenedores; sin datos reales de suscriptores; si la spec se contradice, detenerse y preguntar al usuario; leer cada `SKILL.md` en `.agents/skills/<nombre>/` antes de escribir código.

**Cierre de ola 1 (sesión principal):** dictamen D3 escrito, línea base con conteos, inventario en verde y medición «antes». Sin commit.
