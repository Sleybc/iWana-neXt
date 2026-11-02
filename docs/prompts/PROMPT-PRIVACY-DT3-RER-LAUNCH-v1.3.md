# LAUNCH — privacy · DT-3 R-ER (Ola 2-R: reponer hunks perdidos y repetir B3)

**Plan:** `docs/plans/2026-11-01-privacy-dt3-rer-orquestacion.md` v1.0, «Estado tras la Ola 2» · **Spec:** v1.1
**Reemplaza a:** LAUNCH v1.2
**[BLOQUEO] previo (opción A, consolidación conjunta):** no lanzar hasta que la sesión del clúster confirme que C4a (`plat-ops`) cerró la restauración de B1. **La fila 1 (B1-RR) queda anulada:** la restauración es C4a, no una reposición a mano. Se lanzan solo las filas 2 a 4, en paralelo con C4b y C4c. El G1 conjunto lo hace C4d; los commits, C4e (commits 2 y 5). Ver plan, «Orden vigente».
**Cerrado, no re-despachar:** B2 (salvo el registro en `runner.ts`, que repone B1-RR) y B1-R en el resto de archivos.
**Sin commit.** C1 y DT-3 siguen pendientes de la decisión de commit.

| # | Subagente | Encargo | Skills a leer antes | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | `PROMPT-PRIVACY-DT3-RER-v1.0.md` §B1-RR | `nestjs-expert`, `postgresql`, `iwana-test-evidence` | spec v1.1 |
| 2 | `sr-qa` | `PROMPT-PRIVACY-DT3-RER-v1.0.md` §B3-R | `testing-patterns`, `postgresql`, `e2e-testing-patterns`, `iwana-test-evidence` | spec v1.1 §6 |
| 3 | `test-change-reviewer` | Fixture E2E y casos nuevos de B3-R | según su perfil | spec v1.1 |
| 4 | `sr-qa` | Repetir §B3 completo | las de la fila 2 | spec v1.1 §6 |

**Secuencia:** 1 y 2 en paralelo (rutas disjuntas) → 3 → 4. Ola 3 (§B4) con CA-RER-01 a 10 y 12 en PASS y 0 omitidas.

```text
===== B1-RR · sr-backend =====
Ejecuta docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md §B1-RR. Spec v1.1.
Lee antes: AGENTS.md y SKILL.md de nestjs-expert, postgresql, iwana-test-evidence.
Primero comprueba que los 5 archivos siguen como dice el plan; si cambiaron, [BLOQUEO].
Solo esos 5 archivos; conserva los hunks del clúster. No toques pruebas. Sin commit.
Entrega: diff y suite completa de api y db con --force.

===== B3-R · sr-qa =====
Ejecuta docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md §B3-R. Spec v1.1.
Lee antes: AGENTS.md y SKILL.md de testing-patterns, postgresql, e2e-testing-patterns, iwana-test-evidence.
Escribe pruebas y fixtures; nunca código de producto. Sin commit.

===== Tras 1 y 2: test-change-reviewer, y luego sr-qa repite §B3 completo =====
```
