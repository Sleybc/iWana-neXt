# LAUNCH — MOD05 · Fase 09 Ciclo de facturación · Ola 4b (R3 → V3b)

**Plan:** `docs/plans/2026-10-30-mod05-ciclo-facturacion.md` · **Encargo:** `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md` §R3 y §V3b · Sustituye a [v1.3](PROMPT-MOD05-CICLO-FACTURACION-LAUNCH-v1.3.md) (Ola 4)
**Gates:** R1 y R2 implementados; R2 con evidencia (portal: 340 suites, 3.421 tests). V3b en `[BLOQUEO]` por compilación de API.
**Bloqueos abiertos:** `contracts.service.ts:_transition`, fusión corrupta ajena a R1 y R2. Ninguna otra sesión debe editar ese archivo mientras corre R3.
**Plantilla:** [plantilla](TEMPLATE-PROMPT-LANZAMIENTO.md)

| # | Subagente | Encargo | Skills a leer antes de trabajar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §R3 | `nestjs-expert`, `test-driven-development`, `iwana-test-evidence` | PRD Fase 09 v1.1; plan y spec del cambio de plan para la línea 2 |
| 2 | `gate-verifier` | §V3b, **después de 1** | `iwana-test-evidence`, `verification-before-completion` | AGENTS.md «Gates Before Merge» |

**Estado al arrancar:** R1 añadido en `contracts.service.spec.ts`, sin ejecutar; R2 cerrado; portal en verde; índice vacío; sin stash.
**Cierre de ola:** API compila, caso R1 ejecutado con conteo y V3b en verde. Luego AI-EM-ARCH consolida el GO de D; el commit sigue D-CK-1.

---

### Bloque copiar-pegar

===== 1 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md` y tu encargo §R3 de `docs/prompts/PROMPT-MOD05-CICLO-FACTURACION-v1.0.md`. Lee los `SKILL.md` de `nestjs-expert`, `test-driven-development` e `iwana-test-evidence`. Repara solo las dos líneas desplazadas de `_transition` en `contracts.service.ts`: el parámetro `requestedBillingCycleDay` va en la firma; decide con evidencia del plan y la spec del cambio de plan si `assertContractVersionForSave` va tras el `FOR UPDATE` (con prueba) o se retira; si no se puede determinar, `[BLOQUEO]`. Confirma antes que nadie más edita el archivo. Sin stash ni commit. Cierras con typecheck de API verde y la suite `crm/contracts` con el caso R1 ejecutado y conteo real.

===== 2 · gate-verifier (después de 1) =====
Actúa como `gate-verifier`. Lee `AGENTS.md` «Gates Before Merge» y el encargo §V3b; lee los `SKILL.md` de `iwana-test-evidence` y `verification-before-completion`. Sin caché de turbo: lint y typecheck de `@iwana/api` y `@iwana/portal`, la suite completa de `@iwana/portal`, la suite de `crm/contracts` de `@iwana/api` (confirma que el caso CA-CF-08 de R1 se ejecutó) y `pnpm audit --prod --audit-level critical`. Entrega comandos y cifras reales; no corrijas código.
