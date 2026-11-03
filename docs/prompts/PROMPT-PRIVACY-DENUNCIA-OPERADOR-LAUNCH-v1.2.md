# LAUNCH — privacy · Denuncia del operador (ajuste B1-D)

**Plan:** `docs/plans/2026-11-03-privacy-denuncia-operador-orquestacion.md` v1.0, «Estado tras las Olas 2 y 3» · **Spec:** v1.0 (G0 2026-11-03)
**Reemplaza a:** LAUNCH v1.1. B4 y B5 están en GO: CA-DO en PASS, gates en verde y cobertura de `privacy/**` en 96,25 % / 85,19 %.
**Cerrado, no re-despachar:** B1 a B5.
**Abierto:** el tipo `DataSubjectRequestTaskKind` de la entidad, con 2 valores (hallazgo menor de `contract-drift-reviewer`).

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-backend` | `PROMPT-PRIVACY-DENUNCIA-OPERADOR-v1.0.md` §B1-D | `typescript-expert`, `iwana-test-evidence` |

**Siguiente:** con B1-D en verde, AI-EM-ARCH emite el cierre y el HLD Privacy v1.4, y el usuario ordena el commit y el push (G6.5 antes del 19-11-2026).

```text
===== B1-D · sr-backend =====
Ejecuta docs/prompts/PROMPT-PRIVACY-DENUNCIA-OPERADOR-v1.0.md §B1-D.
Lee antes: AGENTS.md y SKILL.md de typescript-expert, iwana-test-evidence.
Solo apps/api/src/modules/privacy/entities/data-subject-request-task.entity.ts: el tipo pasa a ser un alias de RequestTaskKind de @iwana/shared.
Typecheck de api y suites de privacy/** sin caché. Sin stash ni commit. Entrega: diff y conteo real.
```
