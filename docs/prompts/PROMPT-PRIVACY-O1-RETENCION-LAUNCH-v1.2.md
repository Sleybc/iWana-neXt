# LAUNCH — privacy · O-1 reloj de retención (Ola 1-F)

**Plan:** `docs/plans/2026-11-02-privacy-o1-retencion-orquestacion.md` v1.0, «Estado tras la Ola 1-R» · **Spec:** v1.0 (G0 2026-11-02)
**Reemplaza a:** LAUNCH v1.1.
**Cerrado, no re-despachar:** B1, cobertura de B1-R (83,82 %) y B2-R (sufijo `1700000000170`, invariante y excepciones).
**Abierto:** defecto de tipo de `$1` en el ciclo de vida (B1-F, autorizado); integración de `@iwana/db` en una base `iwana_it_*` (B2-R2).
**Sin stash ni commit.**

| # | Subagente | Encargo | Skills a leer antes | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | `PROMPT-PRIVACY-O1-RETENCION-v1.0.md` §B1-F | `postgresql`, `nestjs-expert`, `iwana-test-evidence` | spec v1.0 D-O1-1 |
| 2 | `gate-verifier` | §B2-R2 (corre; no edita) | `iwana-test-evidence` | AGENTS.md (gates) |
| 3 | `plat-ops` | §B4 **paso 1 solo**: aplicar la cadena a los tenants de desarrollo, tras 1 y 2 | `iwana-tenant-migration`, `postgresql` | spec v1.0 §3 |

**Secuencia:** 1 y 2 en paralelo → 3 → Ola 2 (`sr-qa` §B3 ∥ `plat-ops` §B4 pasos 2-3) → §B5.

```text
===== B1-F · sr-backend =====
Ejecuta docs/prompts/PROMPT-PRIVACY-O1-RETENCION-v1.0.md §B1-F (autorizado). Spec v1.0.
Lee antes: AGENTS.md y SKILL.md de postgresql, nestjs-expert, iwana-test-evidence.
Solo subscriber-lifecycle.service.ts y sus pruebas (y otro SQL de B1 con $n de dos tipos, si aparece). Sin stash ni commit.
Entrega: diff, prueba PG de TERMINATE con terminated_at y suite unitaria de api sin caché.

===== B2-R2 · gate-verifier =====
Corre la integración de @iwana/db como en CI: base nueva iwana_it_* con migraciones públicas y tenant (procedimiento §H2 del informe de consolidación), nunca dbiw.
Solo lectura sobre el repo. Entrega: conteo con 0 omitidas no declaradas.

===== B4 paso 1 · plat-ops (tras 1 y 2) =====
Aplica la cadena de migraciones tenant a los tenants de desarrollo con el comando del repo; reporta cuáles quedaron en la 170.
No borres ni modifiques datos; no toques tenant_e2e_mod13_f1_41398e (a medio aprovisionar, lo decide el usuario).
```
