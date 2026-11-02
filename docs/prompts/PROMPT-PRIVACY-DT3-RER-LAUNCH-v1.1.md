# LAUNCH — privacy · DT-3 R-ER (Ola 1-R: remediación de B1)

**Plan:** `docs/plans/2026-11-01-privacy-dt3-rer-orquestacion.md` v1.0, «Estado tras la Ola 1» · **Spec:** `docs/specs/2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md` v1.1
**Reemplaza a:** LAUNCH v1.0 (Ola 1 ya lanzada)
**Cerrado, no re-despachar:** B2 (migración 169; PG 13/13 y 17/17).
**Abierto:** B1 en rojo (84/419). C1 sin commitear: no commitear nada hasta que B1-R esté en verde y el usuario decida cómo separar los commits.

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | `docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md` §B1-R | `nestjs-expert`, `testing-patterns`, `postgresql`, `iwana-test-evidence`, `systematic-debugging` | spec v1.1 §4–§6 |
| 2 | `test-change-reviewer` | Revisar la tabla de clasificación y cada spec modificada por B1 y B1-R | según su perfil | spec v1.1 |

**Secuencia:** 1 → 2. La Ola 2 (`sr-qa` §B3) arranca solo con B1-R en verde en la suite completa y con 2 sin hallazgos C.

```text
===== B1-R · sr-backend =====
Ejecuta docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md §B1-R.
Contrato: docs/specs/2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md v1.1.
Lee antes: AGENTS.md y SKILL.md de nestjs-expert, testing-patterns, postgresql, iwana-test-evidence, systematic-debugging.
Clasifica cada test rojo (a/b/c) ANTES de editarlo; en (a) cambia el doble, nunca la aserción.
No re-despachar B2. Sin commit. Entrega: tabla de clasificación, diff y conteo de la suite completa de api y db con --force.

===== Revisión · test-change-reviewer (tras B1-R) =====
Revisa la tabla de clasificación de B1-R y cada spec modificada por B1/B1-R contra la spec DT-3 v1.1.
Reporta hallazgos C con archivo:línea. Solo lectura.
```
