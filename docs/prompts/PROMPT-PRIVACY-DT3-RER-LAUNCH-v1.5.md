# LAUNCH — privacy · DT-3 R-ER (Ola 2-F: archivo permitido y ajustes de aceptación)

**Plan:** `docs/plans/2026-11-01-privacy-dt3-rer-orquestacion.md` v1.0 · **Spec:** v1.2 (CA-RER-05 corregido; guarda HTTP del archivo)
**Reemplaza a:** LAUNCH v1.4. B3 repetido: CA-RER-01, 02, 04, 06 a 10 y 12 en PASS; CA-RER-03 en FAIL (guarda HTTP); CA-RER-05 en FAIL (error de la spec).
**Cerrado, no re-despachar:** B1, B1-R, B2, C4a-R y B3-R (`test-change-reviewer` sin hallazgos C).
**[BLOQUEO] resuelto:** la sesión del clúster autorizó B1-F (C4b y C4c cerrados; nadie tiene `contracts.service.ts` abierto). Condiciones en §B1-F: alcance cerrado, `PATCH` sigue en 409 y hashes antes y después en los dos informes. Los otros 8 archivos congelados no se tocan.
**Sin stash ni commit** (C4e).

| # | Subagente | Encargo | Skills a leer antes | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | `PROMPT-PRIVACY-DT3-RER-v1.0.md` §B1-F | `nestjs-expert`, `backend-security-coder`, `testing-patterns`, `iwana-test-evidence` | spec v1.2 §5 |
| 2 | `sr-qa` | §B3-R2 | `testing-patterns`, `postgresql`, `e2e-testing-patterns`, `iwana-test-evidence` | spec v1.2 §6 |
| 3 | `test-change-reviewer` | Pruebas de B1-F y B3-R2 | según su perfil | spec v1.2 |
| 4 | `sr-qa` | Repetir §B3 completo | las de la fila 2 | spec v1.2 §6 |

**Secuencia:** 1 y 2 en paralelo (rutas disjuntas) → 3 → 4. Con 4 en PASS, B4 sin `gate-verifier` y aviso a la sesión del clúster para C4d.

```text
===== B1-F · sr-backend =====
Ejecuta docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md §B1-F. Spec v1.2.
Lee antes: AGENTS.md y SKILL.md de nestjs-expert, backend-security-coder, testing-patterns, iwana-test-evidence.
De los 9 congelados solo puedes tocar contracts.service.ts, y solo para allowAnonymized. Sin stash ni commit.
Antes de editar: SHA-256 de contracts.service.ts y contracts.controller.ts; repítelo al terminar y regístralo como pide §B1-F.
Entrega: diff, hunk aislado, los cuatro hashes, prueba de que PATCH sigue en 409 y suite de api con --force.

===== B3-R2 · sr-qa =====
Ejecuta docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md §B3-R2. Spec v1.2.
Lee antes: AGENTS.md y SKILL.md de testing-patterns, postgresql, e2e-testing-patterns, iwana-test-evidence.
Escribe pruebas y fixtures; nunca código de producto. No toques los 9 congelados. Sin stash ni commit.

===== Tras 1 y 2: test-change-reviewer; luego sr-qa repite §B3 completo (tabla CA con conteo real y 0 omitidas) =====
```
