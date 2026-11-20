# PROMPT — MOD05 Suscriptores · Soporte en vista dividida · Lanzamiento v1.0

**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)

Rige `AGENTS.md`. Fuente: [plan](../plans/2026-11-20-mod05-soporte-vista-dividida.md) y [spec](../specs/2026-11-20-mod05-soporte-vista-dividida-ux.md) v1.0 (G0 2026-11-20), que complementa las specs vigentes de la pestaña Soporte, el detalle del ticket y la bandeja. No repetir aquí lo que dicen.

**Principio:** complementar sin retroceso. Ninguna cola, filtro, dato de la fila, acción del ticket ni estado vacío desaparece ni queda más lejos. El detalle del ticket no se rediseña: se muestra el mismo, junto a la lista.

**Estado al arrancar:** spec aprobada; nada construido. D2: Mesa de ayuda no pasa a vista dividida. D3: al entrar abre el ticket abierto más reciente; sin abiertos, el más reciente.

**Ola 1 (en paralelo):**

---- `ds-owner` · D1
Dictamen del plan §2 D1: ancho de corte, reparto lista/ticket y destino del lateral del ticket cuando no cabe. Punto de partida: dividir desde 1280 px, lista de unos 400 px. No escribe código. Skills: plan §4.

---- `sr-qa` · W0
Línea base de no regresión del plan §2 W0 con conteo real, prueba de inventario sobre el código actual, datos sintéticos (un suscriptor con 8 tickets, uno con descripción vacía y comentarios) y lista de las E2E afectadas. No cambia código de producción. Skills: plan §4.

**Ola 2 — tras D1 y W0:** `fe-platform` · P1 (ficha, paso 1).

**Ola 3:** `sr-qa` · QA1; revisores del plan §4; punto de control con el usuario.

**Olas 4–6 (paso 2):** `sr-backend` · API e investigación de H10, con sus revisores; luego `fe-platform` · P2; luego QA2 e informe.

----

**Reglas:** `main` sin ramas ni worktrees; no commitear ni empujar salvo pedido del usuario; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos; jest sin caché con conteo real; mocks de router, auth y permisos con referencia estable; las E2E usan el puerto 3002 del usuario, acordar la ventana; antes de mover un texto, buscarlo en `e2e/`; el extracto de comentarios respeta la visibilidad del detalle; sin datos reales de suscriptores en docs, pruebas ni capturas; datos sintéticos con marca y retirados al cierre; si la spec se contradice, detenerse y preguntar al usuario; leer cada `SKILL.md` en `.agents/skills/<nombre>/` antes de escribir código.

**Cierre de ola 1 (sesión principal):** dictamen D1 escrito, línea base con conteos e inventario en verde. Sin commit.
