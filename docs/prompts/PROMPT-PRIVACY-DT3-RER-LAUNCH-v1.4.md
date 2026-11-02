# LAUNCH — privacy · DT-3 R-ER (Ola 2-R: B3-R y repetición de B3, sobre el árbol de C4a-R)

**Plan:** `docs/plans/2026-11-01-privacy-dt3-rer-orquestacion.md` v1.0, «Orden vigente» · **Spec:** v1.1
**Reemplaza a:** LAUNCH v1.3 (su bloqueo quedó resuelto: C4a-R en verde, §C4a-R del informe del clúster)
**Cerrado, no re-despachar:** B1, B1-R, B2 y la restauración de C4a-R (API 443 suites y 5.955 tests; DB 77 y 423; 0 fallos).
**Archivos congelados (los 9 de C4a-R):** `contracts.service.ts` y su `.spec`, `crm-contract-impersonation.adapter.ts`, `subscriber-lifecycle.service.ts`, `subscriber-tax-profile.service.ts`, `subscriber-tax.controller.ts` y su `.http.spec`, `subscribers.service.ts`, `runner.ts`. Si un hallazgo exige tocar alguno, se emite `[BLOQUEO]` y se para.
**Sin stash ni commit:** los commits los hace C4e (commits 2 y 5).

| # | Subagente | Encargo | Skills a leer antes | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-qa` | `PROMPT-PRIVACY-DT3-RER-v1.0.md` §B3-R | `testing-patterns`, `postgresql`, `e2e-testing-patterns`, `iwana-test-evidence` | spec v1.1 §6 |
| 2 | `test-change-reviewer` | Fixture E2E y casos nuevos de B3-R | según su perfil | spec v1.1 |
| 3 | `sr-qa` | Repetir §B3 completo (CA-RER-01 a 10 y 12) | las de la fila 1 | spec v1.1 §6 |

**Secuencia:** 1 → 2 → 3. Corre en paralelo con C4b y C4c del clúster. Con 3 en PASS se lanza B4 sin `gate-verifier` (lo reemplaza C4d) y después se avisa a la sesión del clúster para lanzar C4d.

```text
===== B3-R · sr-qa =====
Ejecuta docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md §B3-R. Spec v1.1.
Lee antes: AGENTS.md y SKILL.md de testing-patterns, postgresql, e2e-testing-patterns, iwana-test-evidence.
Primero comprueba que la 169 esté registrada en runner.ts y que haya 5 GuardBlockedTitular en subscriber-tax.controller.ts; si no, [BLOQUEO].
Rutas: e2e/tests/portal-privacy-fase-1b-live.spec.ts y la suite titular-anonymized-concurrency. Escribe pruebas y fixtures; nunca código de producto.
No toques los 9 archivos congelados (lista en LAUNCH v1.4). Sin stash ni commit.
Entrega: diff, clasificación (b) del fixture con la regla citada y conteo real, con 0 omitidas.

===== Revisión · test-change-reviewer (tras B3-R) =====
Revisa el fixture E2E y los casos nuevos de B3-R contra la spec DT-3 v1.1 y la spec de ciclo v1.1. Solo lectura; hallazgos C con archivo:línea.

===== B3 · sr-qa (tras la revisión sin hallazgos C) =====
Repite docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md §B3 completo, sobre Postgres real (DB_NAME=dbiw), con la 169 migrada por la cadena.
Si un CA falla por producto, NO corrijas: repórtalo con archivo:línea como [REGRESIÓN]. Sin stash ni commit.
Entrega: tabla CA → archivo:línea → PASS/FAIL, con conteo real y 0 omitidas.
```
