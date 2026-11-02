# LAUNCH — MOD05 · Fase 09 Ciclo de facturación · Ola 4c (R3-bis → V3b)

**Plan:** `docs/plans/2026-10-30-mod05-ciclo-facturacion.md` · **Encargo:** `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md` §R3-bis y §V3b · Sustituye a [v1.4](PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.4.md)
**Gates:** R2 cerrado (portal: 340 suites, 3.421 tests). R1 escrito y sin ejecutar. R3: decisión del control de versión tras el `FOR UPDATE`, con prueba.
**Bloqueos abiertos:** `contracts.service.ts` tiene líneas reordenadas por el staging parcial del checkpoint (diagnóstico en §R3-bis). Nadie más edita ese archivo mientras corre R3-bis.
**Plantilla:** [plantilla](TEMPLATE-PROMPT-LANZAMIENTO.md)

| # | Subagente | Encargo | Skills a leer antes de trabajar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §R3-bis | `nestjs-expert`, `test-driven-development`, `iwana-test-evidence` | Versión sana: `refs/checkpoint/stash-B-rerun` |
| 2 | `gate-verifier` | §V3b, **después de 1** | `iwana-test-evidence`, `verification-before-completion` | AGENTS.md «Gates Before Merge» |

**Estado al arrancar:** índice vacío; sin stash; respaldo previo de R0 fuera del repo; la copia sana está en `refs/checkpoint/stash-B-rerun`.
**Cierre de ola:** el diff contra la versión sana muestra solo el movimiento de R3; API compila; CA-CF-08 ejecutado; V3b en verde.

---

### Bloque copiar-pegar

===== 1 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md` y §R3-bis de `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md`. Lee `nestjs-expert`, `test-driven-development` e `iwana-test-evidence`. Confirma que nadie más edita `contracts.service.ts`; respáldalo fuera del repo; restaura su contenido desde `refs/checkpoint/stash-B-rerun`; reaplica solo el movimiento de `assertContractVersionForSave` tras el `FOR UPDATE`; comprueba que el diff contra la versión sana es solo ese movimiento. Sin stash ni commit. Cierras con typecheck de API verde y la suite `crm/contracts` con CA-CF-08 ejecutado y conteo real.

===== 2 · gate-verifier (después de 1) =====
Actúa como `gate-verifier`. Lee `AGENTS.md` «Gates Before Merge» y §V3b del mismo prompt; lee `iwana-test-evidence` y `verification-before-completion`. Sin caché de turbo: lint y typecheck de `@iwana/api` y `@iwana/portal`, suite completa de `@iwana/portal`, suite `crm/contracts` de `@iwana/api` (confirma CA-CF-08 ejecutado) y `pnpm audit --prod --audit-level critical`. Comandos y cifras reales; no corriges código.
