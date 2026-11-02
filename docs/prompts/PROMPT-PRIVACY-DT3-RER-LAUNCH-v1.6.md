# LAUNCH — privacy · DT-3 R-ER (Ola 3: verificación B4)

**Plan:** `docs/plans/2026-11-01-privacy-dt3-rer-orquestacion.md` v1.0 · **Spec:** v1.2
**Reemplaza a:** LAUNCH v1.5. B3 en GO: CA-RER-01 a 10 y 12 en PASS con 0 omitidas ([informe DT-3](../informes/INFORME-PRIVACY-DT3-B1R-v1.0.md) §B1-F y §B3); API completa 443 suites y 5.960 tests.
**Cerrado, no re-despachar:** B1, B1-R, B2, C4a-R, B1-F, B3-R2 y B3.
**Referencia de hash:** `contracts.service.ts` = `21D44C54…1BD1205` (B1-F). Los otros 8 archivos congelados, los de C4a-R.
**Sin cambios de código en esta ola.** Sin stash ni commit (C4e).

| # | Subagente | Encargo | Contrato |
| --- | --- | --- | --- |
| 1 | `sec-eng` | `PROMPT-PRIVACY-DT3-RER-v1.0.md` §B4: D-RER-1 a 6 y CA-RER-11 | spec v1.2 |
| 2 | `boundary-reviewer` | Diff DT-3: `privacy` no lee tablas de CRM; puerto `standing` con su dueño | spec v1.2 §5 |
| 3 | `docs-governance` | Documentos DT-3 de `docs/` (spec, plan, prompt, lanzadores e informes) antes del commit 5 de C4e | AGENTS.md |

**Paralelo:** 1, 2 y 3. `gate-verifier` no corre aquí: lo reemplaza el G1 conjunto C4d. Con B4 en GO, avisar a la sesión del clúster para lanzar C4d.
**Para C4d:** la integración `privacy-erasure-api.postgres.integration.spec.ts` corre en `iwana_it_privacy_dt3_b3r2` (comando en el informe DT-3); cobertura por servicio frente a la línea base del G1.

```text
===== B4 · sec-eng =====
Revisa DT-3 según docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md §B4 y la spec v1.2 (D-RER-1 a 6, CA-RER-11).
Lee antes: AGENTS.md y SKILL.md de security-auditor y backend-security-coder.
Comprueba: ningún escritor de §5 deja pasar una mutación; ningún save de una entidad leída antes del bloqueo;
iwana.titular_erasure solo en el adaptador de supresión y en el CLI; allowAnonymized solo en la ruta de archivo.
Solo lectura. Hallazgos con archivo:línea y severidad.

===== B4 · boundary-reviewer =====
Revisa el diff DT-3 (spec v1.2 §5) contra los boundaries y la tenancy de AGENTS.md. Solo lectura.

===== B4 · docs-governance =====
Revisa los documentos DT-3 de docs/ contra Documentation Rules de AGENTS.md. Solo lectura.
```
