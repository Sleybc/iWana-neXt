# LAUNCH — privacy · Supresión del historial de ciclo de vida (Ola 3)

**Plan:** `docs/plans/2026-11-03-privacy-supresion-historial-ciclo-vida-orquestacion.md` v1.0 · **Spec:** `docs/specs/2026-11-03-privacy-supresion-historial-ciclo-vida-spec.md` v1.0
**Ola que lanza:** Ola 3, B3 · **Gates:** G0 ✅ · G2 ✅ · G3 ✅ 2026-11-04 · **P4:** libre el 2026-11-04. **Bloqueos abiertos:** ninguno. Lanzar antes de la Ola 3 de MOD14.

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `sec-eng` | Alcance y D-HN-4 | Ahora |
| 2 | `test-change-reviewer` | CA-HN-12 | Ahora |
| 3 | `boundary-reviewer` | Diff de H-2 | Ahora |
| 4 | `gate-verifier` | CA-HN-13 | Tras 1, 2 y 3 |

**Cierre de ola (G6):** sin hallazgos abiertos; CA-HN-12 y 13. **Aviso:** `crm-titular-erasure.participant.ts` lleva también el diff del barrido; revisar solo lo de H-2. Solo lectura; nadie commitea.

```text
===== 1 · sec-eng (ahora) =====
Actúa como sec-eng. Lee AGENTS.md, el plan §4 B3 y la spec, D-HN-4. En solo lectura, confirma el alcance y que no queda otra ruta de lectura de crm_lifecycle_changes.note_encrypted. Hallazgos con archivo:línea.

===== 2 · test-change-reviewer (ahora) =====
Actúa como test-change-reviewer. Clasifica CA-HN-12 en las specs de B1 y B2 de H-2: ninguna aserción existente cambia, salvo conteos de la vista previa con justificación. El ajuste de ubicación y estrato en anonymize-titular es de R-14 del barrido, no de H-2.

===== 3 · boundary-reviewer (ahora) =====
Actúa como boundary-reviewer. Revisa en solo lectura el diff de H-2 en crm-titular-erasure.participant.ts y las pruebas de B2: fronteras, tenancy y PII en logs. Hallazgos con archivo:línea.

===== 4 · gate-verifier (tras 1, 2 y 3) =====
Actúa como gate-verifier. Lee iwana-test-evidence y verification-before-completion. Ejecuta sin caché typecheck, lint y las suites unitaria e integración completas de @iwana/api, con DB_NAME=test y el entorno del job de CI. Entrega comandos, conteos reales y la causa de cada omisión. No apruebas G6: entregas evidencia a AI-EM-ARCH.
```
