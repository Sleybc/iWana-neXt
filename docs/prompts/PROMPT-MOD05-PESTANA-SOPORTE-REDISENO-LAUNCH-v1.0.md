# PROMPT — MOD05 Suscriptores · Rediseño de la pestaña Soporte · Lanzamiento v1.0

Rige `AGENTS.md`. Fuente: [plan](../plans/2026-11-17-mod05-pestana-soporte-rediseno.md) y [spec](../specs/2026-11-17-mod05-pestana-soporte-rediseno-ux.md) v1.0. No repetir aquí lo que dicen.

**Principio:** complementar sin retroceso. Ningún dato, acción, permiso ni estado de la v1.0 desaparece ni queda más lejos.

**Estado al arrancar:** spec con G0 del 2026-11-17 (D1–D5 según su §14; D3 fuera de alcance). Nada construido. Los archivos de Assurance modificados sin commit son de la sesión MOD10: no tocarlos; el bloque C espera a que se publiquen.

**Ola 1 — en paralelo:**

---- `sr-qa` · W0
Línea base con conteo real e inventario de la v1.0 sobre el código actual, más la lista de E2E afectadas (plan §2 W0). No cambia código de producción. Skills: plan §4.

---- `fe-platform` · M
Modelo `assurance-ticket-model.ts` con los dos predicados y el orden de 4 claves según D1/D2; migra los consumidores; fecha con `formatAssuranceDate`. Antes de tocar `AssuranceTicketDetail.tsx`, avisar a la sesión principal. Skills: plan §4.

**Ola 2 — en secuencia, tras M y W0:** `fe-platform` · T (lista densa, franja, filtros, responsable al montar, aviso descartable) y luego V (`PortalSidePeek`).

**Ola 3:** `fe-platform` · C, solo con MOD10 paso 2 publicado o ventana del usuario.

**Ola 4:** `sr-qa` · QA1; revisores del plan §4; punto de control con el usuario.

**Olas 5–6 (paso 2):** `sr-backend` · API → `fe-platform` · P2 → `sr-qa` · QA2 e informe.

----

**Reglas:** `main` sin ramas; no commitear salvo pedido del usuario; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos; jest sin caché con conteo real; E2E en el puerto 3002 del usuario con ventana acordada; leer cada `SKILL.md` en `.agents/skills/<nombre>/` antes de escribir código.

**Cierre de ola 1 (sesión principal):** inventario v1.0 en verde con conteos; prueba unitaria del orden (CA-5) y de los predicados (CA-6) en verde. Sin commit.
