# LAUNCH — privacy · Revisión de las correcciones de G7 (v1.1)

**Plan:** `docs/plans/2026-11-07-privacy-g7-correcciones-orquestacion.md` v1.0 §6 y §6.1 · **Sustituye:** [v1.0](PROMPT-PRIVACY-G7-REVISION-LAUNCH-v1.0.md), anterior a R1
**Ola que lanza:** G7-R y G7-Q, solo lectura, en paralelo · **Gates:** firma ✅ · R1 ✅ 2026-11-08 · H-EXP con G0, sin construir
**Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sec-eng` | Diff de G7-M, evidencia de G7-T y hallazgo del CLI | `security-auditor`, `backend-security-coder`, `postgresql` |
| 2 | `gate-verifier` | Gates del diff de G7-M | `iwana-test-evidence`, `verification-before-completion` |

**Siguiente:** commit y push de G7-M y G7-T; después, la Fase 1 de H-EXP.
**Cierre (G6):** sin P1 abierto; suites completas en verde con conteo real.
**Reglas:** solo lectura, `main`, cero PII. Hallazgos con archivo:línea y severidad.

```text
===== G7-R · sec-eng =====
Actúa como sec-eng. Lee AGENTS.md, el plan docs/plans/2026-11-07-privacy-g7-correcciones-orquestacion.md §6 y §6.1, docs/informes/INFORME-MOD14-PRIVACY-CLASIFICACION-v1.0.md y docs/informes/INFORME-PRIVACY-G7-TENANTS-v1.0.md. Lee antes los SKILL.md de security-auditor, backend-security-coder y postgresql.
Revisa el diff sin commit de apps/api (G7-M): que void_note y el respaldo 175 no dejen texto tras la supresión, que las guardas de anulación no tengan carrera con la supresión y que las 30 columnas excluidas lo estén con razón (escritor real, no supuesto).
Revisa la evidencia de G7-T: cero identificadores, causas codificadas y la remediación de T01.
Valora el hallazgo del CLI: --apply con solo --request sobre una solicitud resuelta sale con exit 0 sin cambiar nada (resolveCliScope no resuelve por anonymized_request_id). Propón la corrección (fallar o resolver el alcance) y su severidad.
Solo lectura; archivo:línea y severidad.
===== G7-Q · gate-verifier =====
Actúa como gate-verifier. Ejecuta los Gates Before Merge de AGENTS.md sobre el diff sin commit de apps/api (G7-M): unitarias sin caché, integración completa como en CI (DB_NAME=test, sin filtro) con duración y suites omitidas frente a integration-expected-skips.json, typecheck, lint y Prettier de las rutas tocadas. Cuenta los U+FFFD de text-erasure-manifest.ts (debe ser 0). Conteo real, cero PII, nunca tenant_iwana. Solo lectura.
```
