# LAUNCH — MOD05 · Fase 09 Ciclo de facturación · Ola 4d (R3-ter → V3b)

**Plan:** `docs/plans/2026-10-30-mod05-ciclo-facturacion.md` · **Encargo:** `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md` §R3-ter y §V3b · Sustituye a [v1.5](PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.5.md)
**Gates:** R2 cerrado; R3-bis cerrado (servicio restaurado, typecheck de API en verde, CA-CF-08 ejecutado y en verde). Pendiente: 1 de 178 en `crm/contracts`, por el desorden de la prueba.
**Bloqueos abiertos:** ninguno de diseño: el fallo es de restauración (§R3-ter). Nadie más edita la prueba mientras corre.
**Plantilla:** [plantilla](TEMPLATE-PROMPT-LANZAMIENTO.md)

| # | Subagente | Encargo | Skills a leer antes de trabajar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §R3-ter | `test-driven-development`, `iwana-test-evidence` | Versión sana: `refs/checkpoint/stash-B-rerun` |
| 2 | `gate-verifier` | §V3b, **después de 1** | `iwana-test-evidence`, `verification-before-completion` | AGENTS.md «Gates Before Merge» |

**Estado al arrancar:** índice vacío; sin stash; respaldo de R3-bis en el scratchpad de su sesión (no borrar).
**Cierre de ola:** prueba restaurada más los casos de R1 y R3; `crm/contracts` en verde; V3b completo en verde. Luego AI-EM-ARCH consolida el GO de D.

---

### Bloque copiar-pegar

===== 1 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md` y §R3-ter de `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md`. Lee `test-driven-development` e `iwana-test-evidence`. Respalda `contracts.service.spec.ts` fuera del repo con SHA-256; restáuralo desde `refs/checkpoint/stash-B-rerun`; reaplica del respaldo solo el caso CA-CF-08 de R1 y la prueba de versión obsoleta de R3; Prettier permitido; comprueba que el diff contra la versión sana es solo esas adiciones más formato. No cambies expectativas existentes. Sin stash ni commit. Cierras con la suite `crm/contracts` con conteo real y ambos casos ejecutados.

===== 2 · gate-verifier (después de 1) =====
Actúa como `gate-verifier`. Lee `AGENTS.md` «Gates Before Merge» y §V3b del mismo prompt; lee `iwana-test-evidence` y `verification-before-completion`. Sin caché de turbo: lint y typecheck de `@iwana/api` y `@iwana/portal`, suite completa de `@iwana/portal`, suite `crm/contracts` de `@iwana/api` (confirma CA-CF-08 ejecutado) y `pnpm audit --prod --audit-level critical`. Comandos y cifras reales; no corriges código.
