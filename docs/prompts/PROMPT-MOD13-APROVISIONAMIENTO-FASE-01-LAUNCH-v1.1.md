# LAUNCH — MOD13 · Aprovisionamiento Fase 01 · Ola 1-bis (re-sync v1.1)

**Plan:** `docs/plans/2026-10-22-mod13-aprovisionamiento.md` v1.1 · **Contrato:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md` v1.1
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) v1.1
**Ola que lanza:** Ola 1-bis — D1-bis ∥ B1a-bis ∥ P0-bis ∥ S0-bis · **Gates:** G0 ✅ · re-sync v1.1 ✅ (CTO, 2026-10-22)
**Estado al arrancar:** S0 y D1 cerrados en la Ola 1, no se re-despachan. P0 y B1a quedaron bloqueados por el contrato v1.0; se retoman.

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `data-eng` | `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §D1-bis | `database-migration`, `postgresql`, `iwana-tenant-migration` | HLD v1.1 §3.2, §12 |
| 2 | `sr-backend` | ídem §B1a-bis | `typescript-expert`, `test-driven-development` | HLD v1.1 §4.4 |
| 3 | `prod-ux` | ídem §P0-bis | `iwana-identity-ui-review`, `system-vocabulary-review`, `wcag-audit-patterns` | HLD v1.1 |
| 4 | `sec-eng` | ídem §S0-bis | `security-auditor`, `backend-security-coder` | HLD v1.1 |

**Paralelo:** 1 ∥ 2 ∥ 3 ∥ 4, sobre archivos disjuntos.
**Cierre (G1):** 161 y 162 de ida y vuelta, con conteo real; tipos y esquemas del §4.4 con tests en verde; spec UX sin `[BLOQUEO]`; verificación de S0 sin P1 abiertos en diseño. Nadie commitea.

---

### Bloque copiar-pegar

===== 1 · data-eng =====
Actúa como `data-eng`. Lee `AGENTS.md`, el plan y tu encargo `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §D1-bis. Lee `database-migration`, `postgresql` e `iwana-tenant-migration`. Ajusta 161, 162 y las entidades según HLD v1.1 §3.2 y §12, sin cambiar el contrato. Ningún tenant `ACTIVE`. No commitees. Cierras con 160–162 de ida y vuelta y conteo real.

===== 2 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md`, el plan y tu encargo §B1a-bis del mismo prompt. Lee `typescript-expert` y `test-driven-development`. Publica en `@iwana/shared` los tipos, cuerpos y listas de códigos de HLD v1.1 §4.4, sin modificar el contrato. No commitees. Cierras con los tests en verde y conteo real.

===== 3 · prod-ux =====
Actúa como `prod-ux`. Lee `AGENTS.md`, el plan y tu encargo §P0-bis. Lee `iwana-identity-ui-review`, `system-vocabulary-review` y `wcag-audit-patterns`. Completa `docs/specs/2026-10-22-mod13-aprovisionamiento-ux.md` sobre HLD v1.1; si falta un campo, emite `[BLOQUEO]` y para.

===== 4 · sec-eng =====
Actúa como `sec-eng`. Lee `AGENTS.md`, el plan y tu encargo §S0-bis. Lee `security-auditor` y `backend-security-coder`. En solo lectura, verifica que HLD v1.1 cierra los hallazgos de tu informe y añade la sección «Verificación v1.1».
