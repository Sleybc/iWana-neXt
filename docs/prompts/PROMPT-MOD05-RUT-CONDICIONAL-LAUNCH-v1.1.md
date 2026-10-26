# LAUNCH — MOD05 · Responsabilidades del RUT condicionales · Ola 3 (B1-bis) → Ola 4 (V2-r)

**Plan:** `docs/plans/2026-10-26-mod05-rut-condicional.md` v1.1 · **Decisión:** ADR-100 (Aprobado, 2026-10-26)
**Gates:** G0 ✅ · G3 ⛔ · G4 ✅ · G5 ✅ · G6 ⛔ · G7
**Estado al arrancar:** B1 y F1 están entregados, y V1 no encontró deriva. V2 dejó rojo el gate de suites, y la revisión de AI-EM-ARCH encontró dos regresiones:
- el alta inválida devuelve `fieldErrors: {}` por pasar a `z.union`;
- la edición de fichas antiguas de jurídicas o responsables de IVA sin RUT da 400.

| # | Subagente | Encargo (`PROMPT-MOD05-RUT-CONDICIONAL-v1.0.md`) | Skills a leer antes de codificar | Cierra |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §B1-bis | `systematic-debugging`, `test-driven-development`, `iwana-test-evidence` | Las dos regresiones, sin tocar el fixture de `subscribers-update-audit` (G3) |
| 2 | `gate-verifier` | §V2 | `iwana-test-evidence`, `verification-before-completion` | G6 |

**Secuencia:** 1 → 2. Nadie commitea. No se usa `git stash`, porque `main` tiene cambios de otros frentes.

---

### Bloque copiar-pegar

===== 1 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-26-mod05-rut-condicional.md` v1.1, ADR-100 y tu encargo `docs/prompts/PROMPT-MOD05-RUT-CONDICIONAL-v1.0.md` §B1-bis. Lee `systematic-debugging`, `test-driven-development` e `iwana-test-evidence`. Corrige las dos regresiones en el código, no en las pruebas:
- vuelve a `z.discriminatedUnion` y mueve la regla del RUT al `.superRefine` de la unión;
- en la edición, valida solo si el DTO trae `personType`, `vatResponsibility` o `rutResponsibilities`.

No cambies el fixture de `subscribers-update-audit`. Ajusta solo las expectativas de `global-validation-pipes.http.spec.ts` y el fixture del portal que el encargo indica, y añade las unitarias de la edición. No uses `git stash`. Sin migraciones ni `tenant_iwana`. No commitees. Cierras con el conteo real: suite del API, `global-validation-pipes` y las 8 integraciones de `crm/subscribers`.

===== 2 · gate-verifier =====
Actúa como `gate-verifier`. Lee `AGENTS.md` y el encargo §V2 y §B1-bis. Lee `iwana-test-evidence` y `verification-before-completion`. Cuando termine 1, repite sin caché lint, typecheck y suites de `@iwana/shared`, `@iwana/api` y `@iwana/portal`, y las 8 integraciones de `crm/subscribers` contra Postgres real. Confirma que `subscribers-update-audit` pasa con su fixture original y que el alta inválida devuelve `fieldErrors` por campo. Si `subscriber-enum-parity` falla, comprueba en solo lectura que es del entorno local. No corrijas código.
