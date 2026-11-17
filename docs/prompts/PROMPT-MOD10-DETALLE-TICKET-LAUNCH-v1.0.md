# PROMPT — MOD10 Mesa de ayuda · Detalle del ticket compacto · Lanzamiento v1.0

Rige `AGENTS.md`. Fuente: [plan](../plans/2026-11-16-mod10-detalle-ticket.md) y [spec](../specs/2026-11-16-mod10-detalle-ticket-ux.md) v1.0 (G0 2026-11-16). No repetir aquí lo que dicen.

**Principio:** complementar sin retroceso. Ninguna propiedad, acción, guarda ni mensaje del panel desaparece ni queda más lejos.

**Estado al arrancar:** spec aprobada; nada construido. La migración tenant 214 y otros cambios del árbol son de otras sesiones: no tocarlos.

**Ola 1 — en paralelo:**

---- `sr-qa` · W0
Línea base de no regresión del plan §2 W0 con conteo real, prueba de inventario sobre el código actual en los dos consumidores del panel y lista de las E2E afectadas. No cambia código de producción. Skills: plan §4.

---- `ds-owner` · DS
Congela la densidad v1.1 del plan §2 DS (spec §5): dos columnas y valor por defecto atenuado en la lista de propiedades, más el ancho del panel con riel. La deja como §8.6 de la spec de la ficha y la registra en `core-components`. No escribe código. Skills: plan §4.

**Ola 2 — en secuencia, tras DS y W0:** `fe-platform` · FE-DS (v1.1 en `portal-ui.tsx`) y luego P1 (panel, paso 1).

**Ola 3:** `sr-qa` · QA1; revisores del plan §4; punto de control con el usuario.

**Olas 4–6 (paso 2):** `sr-backend` · API en paralelo con `fe-platform` · P2a; luego P2b; luego QA2 e informe.

----

**Reglas:** `main` sin ramas; no commitear salvo pedido del usuario; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos; jest sin caché con conteo real; las E2E usan el puerto 3002 del usuario, acordar la ventana; leer cada `SKILL.md` en `.agents/skills/<nombre>/` antes de escribir código.

**Cierre de ola 1 (sesión principal):** línea base con conteos y prueba de inventario en verde; contrato de densidad v1.1 localizable por ruta y versión. Si `ds-owner` no admite dos columnas, parar y avisar (plan §6 R1). Sin commit.
