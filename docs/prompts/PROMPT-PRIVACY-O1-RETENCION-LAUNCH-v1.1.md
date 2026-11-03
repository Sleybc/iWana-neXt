# LAUNCH — privacy · O-1 reloj de retención (Ola 1-R)

**Plan:** `docs/plans/2026-11-02-privacy-o1-retencion-orquestacion.md` v1.0, «Estado tras la Ola 1» · **Spec:** v1.0 (G0 2026-11-02)
**Reemplaza a:** LAUNCH v1.0.
**Cerrado, no re-despachar:** el inventario de escritores y el adaptador `standing` (B1), y la migración 170 salvo su sufijo (B2).
**Abierto:** ramas de `contracts.service.ts` en 81,51 % frente a una base de 82,87 %; sufijo de la 170 duplicado con la 000; fixture de ciclo de vida sin `terminated_at` (lo resuelve B3).
**Sin stash ni commit.** No aplicar la 170 en tenants de desarrollo hasta que cierre B2-R.

| # | Subagente | Encargo | Skills a leer antes | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | `PROMPT-PRIVACY-O1-RETENCION-v1.0.md` §B1-R | `testing-patterns`, `nestjs-expert`, `iwana-test-evidence` | spec v1.0 §5 (gates) |
| 2 | `sr-backend` | §B2-R | `iwana-tenant-migration`, `database-migration`, `iwana-test-evidence` | spec v1.0 §4 |

**Paralelo:** 1 y 2 (rutas disjuntas). **Siguiente:** Ola 2, `sr-qa` §B3 (pasa el fixture a la cadena migrada, más CA-O1) ∥ `plat-ops` §B4; luego §B5.

```text
===== B1-R · sr-backend =====
Ejecuta docs/prompts/PROMPT-PRIVACY-O1-RETENCION-v1.0.md §B1-R. Spec docs/specs/2026-11-02-privacy-o1-reloj-retencion-spec.md v1.0.
Lee antes: AGENTS.md y SKILL.md de testing-patterns, nestjs-expert, iwana-test-evidence.
Solo pruebas. Objetivo: ramas de contracts.service.ts ≥ 82,87 % y lifecycle sin bajar su línea base. Si una rama no se puede alcanzar: [BLOQUEO].
Sin stash ni commit. Entrega: tabla de cobertura por servicio con la corrida de C4d y conteo real.

===== B2-R · sr-backend =====
Ejecuta docs/prompts/PROMPT-PRIVACY-O1-RETENCION-v1.0.md §B2-R. Spec v1.0.
Lee antes: AGENTS.md y SKILL.md de iwana-tenant-migration, database-migration, iwana-test-evidence.
Renombra el sufijo de la 170 a uno único de 13 dígitos y añade la prueba invariante de sufijos únicos en runner.ts.
Si la 170 ya se aplicó en algún tenant con el nombre viejo: [BLOQUEO]. Sin stash ni commit.
Entrega: diff, up→down→up y suite completa de @iwana/db.
```
