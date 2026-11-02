# LAUNCH — privacy · DT-3 R-ER (Ola 2: concurrencia contra Postgres real)

**Plan:** `docs/plans/2026-11-01-privacy-dt3-rer-orquestacion.md` v1.0, «Estado tras la Ola 1-R» · **Spec:** `docs/specs/2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md` v1.1
**Reemplaza a:** LAUNCH v1.1 (Ola 1-R cerrada en GO)
**Cerrado, no re-despachar:** B2 (migración 169) y B1-R ([informe](../informes/INFORME-PRIVACY-DT3-B1R-v1.0.md); suite completa en verde; 0 hallazgos C).
**Abierto:** cobertura por servicio (la mide B4); decisión de commit de C1 y DT-3. Sin commit.

| # | Subagente | Encargo | Skills a leer antes de escribir pruebas | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-qa` | `docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md` §B3 | `testing-patterns`, `postgresql`, `iwana-test-evidence`, `systematic-debugging` | spec v1.1 §6 |

**Secuencia:** 1 sola. La Ola 3 (§B4: `sec-eng`, `test-change-reviewer`, `boundary-reviewer`, `gate-verifier` en paralelo) arranca cuando CA-RER-01 a 10 y 12 estén en PASS con 0 omitidas.

```text
===== B3 · sr-qa =====
Ejecuta docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md §B3.
Contrato: docs/specs/2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md v1.1 (§6, CA-RER-01 a 10 y 12).
Eres verificador Y autor de pruebas: escribe pruebas y fixtures; nunca código de producto.
Lee antes: AGENTS.md y SKILL.md de testing-patterns, postgresql, iwana-test-evidence, systematic-debugging.
Postgres real (DB_NAME=dbiw), schema por migraciones hasta la 169, dos conexiones reales; orden forzado con bloqueos, no con setTimeout.
Si un CA falla por producto, NO corrijas: repórtalo con archivo:línea como [REGRESIÓN].
No re-despachar B1-R ni B2. Sin commit.
Entrega: tabla CA → archivo:línea → PASS/FAIL, con conteo real y 0 omitidas.
```
