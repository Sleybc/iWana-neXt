# LAUNCH — MOD13 · Aprovisionamiento Fase 01 · Ola 4 (B3 ∥ F1-v)

**Plan:** `docs/plans/2026-10-22-mod13-aprovisionamiento.md` v1.4 · **Contrato:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md` v1.1
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) v1.1
**Ola que lanza:** Ola 4 · **Gates:** G0 ✅ · G1 ✅ · G2 ✅ · Ola 3: B2 ✅, P0-ter ✅, F1 construido con su prueba contra el API vivo pendiente
**Bloqueo abierto:** F1-v necesita que el CTO deje el API local en `127.0.0.1:3000` y las credenciales E2E de un tenant de pruebas no `ACTIVE` en variables de entorno. Sin eso, F1-v emite `[BLOQUEO]` y B3 sigue igual.

| # | Subagente | Encargo (`PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md`) | Skills a leer antes de codificar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §B3.0 y luego §B3 | `bullmq-specialist`, `nestjs-expert`, `backend-security-coder`, `test-driven-development`; apoyo: `iwana-queue-inspect`, `observability-engineer` | HLD v1.1 §4.3, §5.2, §5.4, §6.2 (regularize), §6.3, §6.4, §6.7, §6.8 |
| 2 | `fe-platform` | §F1-v | `playwright-skill`, `iwana-test-evidence` | HLD v1.1 §4.4; spec UX §3–4 |

**Paralelo:** 1 ∥ 2. F1-v solo ejecuta pruebas y no edita código de producto.
**Cierre de ola (G3 + F1):**
- B3.0 sin `NetworkModule` en `TasksModule`;
- CA-NET-07 a 11 contra Postgres y Redis reales, incluido el fallo del listener CRM dentro de `@OnEvent`;
- `network-execution-events` drenada;
- suites de `tasks`, `network` y worker intactas;
- F1 en verde contra el API vivo;
- conteo real.

Nadie commitea.

---

### Bloque copiar-pegar

===== 1 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-22-mod13-aprovisionamiento.md` y tu encargo `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §B3.0 y §B3, con las reglas comunes 1 a 9. Antes de escribir código, lee los `SKILL.md` de `bullmq-specialist`, `nestjs-expert`, `backend-security-coder`, `test-driven-development`, `iwana-queue-inspect` y `observability-engineer`. Primero B3.0: módulo estrecho del puerto y `TasksModule` sin `NetworkModule`. Consumes el contrato congelado HLD v1.1 y lo ya entregado; no los modifiques. Si algo no cabe, emite `[BLOQUEO]` y para. Fuera de alcance: UI (F2). Sin carpetas de caché de jest en el repo. No commitees ni migres tenants `ACTIVE`. Cierras con los tests del §B3 contra Postgres y Redis reales, la cola drenada y las suites intactas, con conteo real.

===== 2 · fe-platform =====
Actúa como `fe-platform`. Lee `AGENTS.md`, el plan y tu encargo §F1-v del mismo prompt. Lee `playwright-skill` e `iwana-test-evidence`. Comprueba primero la precondición: API en `127.0.0.1:3000` y credenciales E2E en variables de entorno; si falta algo, emite `[BLOQUEO]` y para. Ejecuta las pruebas de routers y redes IPv4 contra el API real. No corrijas código de producto; reporta los fallos. Cierras con el conteo real.
