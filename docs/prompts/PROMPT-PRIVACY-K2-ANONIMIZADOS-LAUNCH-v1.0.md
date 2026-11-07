# LAUNCH — privacy · K2 con titulares anonimizados (Ola 1)

**Plan:** `docs/plans/2026-11-03-privacy-k2-recifrado-anonimizados-orquestacion.md` v1.1 · **Spec:** `docs/specs/2026-11-03-privacy-k2-recifrado-anonimizados-spec.md` v1.1
**Ola que lanza:** Ola 1, B1 ∥ B2 · **Gates:** G0 del CTO cerrado el 2026-11-04, salida B
**Bloqueos abiertos:** [BLOQUEO] B1 exige P7 al lanzar: la Ola 2 del barrido fuera de vuelo (plan §1).

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-backend` | Plan §4 B1 · spec D-K2A-1 a 4 | `iwana-tenant-migration`, `database-migration`, `postgresql`, `nestjs-expert`, `backend-security-coder`, `iwana-test-evidence` |
| 2 | `sr-backend` | Plan §4 B2 · spec D-K2A-6 y guarda de D-K2A-8 | `backend-security-coder`, `postgresql`, `testing-patterns`, `iwana-test-evidence` |

**Paralelo:** 1 y 2, con rutas disjuntas. **Siguiente:** Ola 2 (`sr-qa` §4 B3).
**Cierre de ola:** CA-K2A-01, 07, 08 y 09, con conteo real y `Cached: 0`.
**Reglas:** `main` sin ramas, sin stash ni commit, cero PII, nunca `tenant_iwana`, `[BLOQUEO]` si el código contradice la spec.

```text
===== B1 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, el plan docs/plans/2026-11-03-privacy-k2-recifrado-anonimizados-orquestacion.md §4 B1 y la spec docs/specs/2026-11-03-privacy-k2-recifrado-anonimizados-spec.md v1.1, D-K2A-1 a D-K2A-4.
Lee antes los SKILL.md de iwana-tenant-migration, database-migration, postgresql, nestjs-expert, backend-security-coder, iwana-test-evidence.
No toques titular_prevent_anonymized_mutation() ni crees un GUC. Confirma el número libre en runner.ts. main sin ramas, sin stash ni commit, cero PII.
Cierras con CA-K2A-01, 07 y 08. Entrega: diff y conteo real sin caché.

===== B2 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, el plan §4 B2 y la spec v1.1, D-K2A-6 y la guarda de D-K2A-8.
Lee antes los SKILL.md de backend-security-coder, postgresql, testing-patterns, iwana-test-evidence.
El orquestador MFA no cambia. Reporte sin valores ni ids. main sin ramas, sin stash ni commit, cero PII.
Cierras con CA-K2A-09 y la parte unitaria de CA-K2A-05. Entrega: diff y conteo real sin caché.
```
