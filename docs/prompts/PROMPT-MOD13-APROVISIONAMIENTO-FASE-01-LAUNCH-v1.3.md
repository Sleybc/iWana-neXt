# LAUNCH — MOD13 · Aprovisionamiento Fase 01 · Ola 3 (B2 ∥ F1 ∥ P0-ter)

**Plan:** `docs/plans/2026-10-22-mod13-aprovisionamiento.md` v1.3 · **Contrato:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md` v1.1
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) v1.1
**Ola que lanza:** Ola 3 · **Gates:** G0 ✅ · G1 ✅ · G2 ✅ (B1b, 2026-10-22)
**Estado al arrancar:** catálogo, IPAM, puerto de actores y permisos ya entregados por B1b; no se rehacen. G5 sigue abierto hasta la V2.

| # | Subagente | Encargo (`PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md`) | Skills a leer antes de codificar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §B2 | `nestjs-expert`, `architect-review`, `openapi-spec-generation`, `test-driven-development`, `database-migration`; apoyo: `backend-security-coder` | HLD v1.1 §3.4, §4.4, §5, §6.2, §6.5, §6.6, §6.8, §6.9, §8 |
| 2 | `fe-platform` | §F1 | `core-components`, `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `iwana-identity-ui-review`, `tailwind-patterns`, `system-vocabulary-review` | HLD v1.1 §4.4, §9; spec UX §3–4 |
| 3 | `prod-ux` | §P0-ter | `iwana-identity-ui-review`, `system-vocabulary-review`, `wcag-audit-patterns` | HLD v1.1 §4.4, §9 |

**Paralelo:** 1 ∥ 2 ∥ 3, sobre archivos disjuntos. B2 es dueño de `apps/api` (tasks, crm, inventory, network) y de la migración 163. F1 es dueño de `apps/portal/.../network/{routers,ipv4-networks}` y de la navegación. P0-ter solo escribe en la spec.
**Cierre de ola (G3 parcial + F1):**
- CA-NET-04 a 06, R6 ter, R6 bis y la proyección del técnico en verde;
- suite de `tasks` intacta;
- F1 contra el API real, no solo mocks;
- addendum de UX sin `[BLOQUEO]`;
- lint, typecheck y build, con conteo real.

Nadie commitea.

---

### Bloque copiar-pegar

===== 1 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-22-mod13-aprovisionamiento.md` y tu encargo `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §B2, con las reglas comunes 1 a 9. Antes de escribir código, lee los `SKILL.md` de `nestjs-expert`, `architect-review`, `openapi-spec-generation`, `test-driven-development`, `database-migration` y `backend-security-coder`. Consumes el contrato congelado HLD v1.1 y lo entregado en las Olas 1, 1-bis y 2; no los modifiques. Si algo no cabe, emite `[BLOQUEO]` y para. Fuera de alcance: eventos, consumidor, regularizar y UI (B3 y F2). Los caches de jest van fuera de `src/`. No commitees. Cierras con los tests del §B2 en verde y la suite de `tasks` intacta, con conteo real.

===== 2 · fe-platform =====
Actúa como `fe-platform`. Lee `AGENTS.md`, el plan y tu encargo §F1 del mismo prompt. Antes de escribir código, lee los `SKILL.md` de `core-components`, `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `iwana-identity-ui-review`, `tailwind-patterns` y `system-vocabulary-review`. Construye routers y redes IPv4 según la spec UX §3–4 y HLD v1.1 §4.4 y §9, contra el API de B1b. Sin primitivas nuevas sin `ds-owner`; no formatees `docs/` con Prettier. No commitees. Cierras con lint, typecheck, build y pruebas contra el API real, con conteo real.

===== 3 · prod-ux =====
Actúa como `prod-ux`. Lee `AGENTS.md`, el plan y tu encargo §P0-ter del mismo prompt. Lee `iwana-identity-ui-review`, `system-vocabulary-review` y `wcag-audit-patterns`. Añade a `docs/specs/2026-10-22-mod13-aprovisionamiento-ux.md` la sección de Ajustes de red, sin campos fuera de HLD v1.1 §4.4; si falta uno, emite `[BLOQUEO]` y para. No formatees el documento con Prettier.
