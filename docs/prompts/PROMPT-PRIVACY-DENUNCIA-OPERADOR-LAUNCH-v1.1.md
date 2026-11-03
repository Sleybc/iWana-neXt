# LAUNCH — privacy · Denuncia del operador (Olas 2 y 3)

**Plan:** `docs/plans/2026-11-03-privacy-denuncia-operador-orquestacion.md` v1.0, «Estado tras la Ola 1» · **Spec:** v1.0 (G0 2026-11-03)
**Reemplaza a:** LAUNCH v1.0. La Ola 1 (B1, B2 y B3) está en GO.
**Cerrado, no re-despachar:** B1, B2 y B3.
**Plazo:** G6.5 antes del 19-11-2026. **Reglas:** sin stash ni commit, cero PII, la nota fuera de logs y de la auditoría.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-qa` | `PROMPT-PRIVACY-DENUNCIA-OPERADOR-v1.0.md` §B4 | `testing-patterns`, `e2e-testing-patterns`, `postgresql`, `iwana-test-evidence` |
| 2 | `sec-eng`, `contract-drift-reviewer`, `test-change-reviewer` y `gate-verifier` | §B5, tras 1 | según su perfil; `sec-eng`: `security-auditor` |

**Secuencia:** 1 → 2. Con 2 en GO, AI-EM-ARCH emite el cierre y el HLD Privacy v1.4, y el usuario ordena commit y push.

```text
===== B4 · sr-qa =====
Ejecuta docs/prompts/PROMPT-PRIVACY-DENUNCIA-OPERADOR-v1.0.md §B4. Spec docs/specs/2026-11-03-privacy-suplantacion-denuncia-operador-spec.md v1.0.
Lee antes: AGENTS.md y SKILL.md de testing-patterns, e2e-testing-patterns, postgresql, iwana-test-evidence. Pruebas y fixtures; nunca producto.
Además: comprueba en solo lectura que ninguna SUPLANTACION abierta tenga impersonation_complaint_due_at nulo (el backfill de la 172 lo usa).
Ajustes de 2 a 4 tareas solo como categoría (b), citando D-DO-1 y D-DO-2; otro ajuste: [BLOQUEO].
Integraciones con IWANA_DB_INTEGRATION_AVAILABLE=true en una iwana_it_* aprovisionada como CI; E2E en un tenant sintético. Sin stash ni commit.
Entrega: tabla CA-DO → archivo:línea → PASS/FAIL, con conteo real y 0 omitidas.

===== B5 (tras B4) · sec-eng · contract-drift-reviewer · test-change-reviewer · gate-verifier =====
sec-eng: la nota no aparece en logs ni en la auditoría; los permisos no cambian; el down de la 172 no borra datos.
contract-drift-reviewer: requestTaskKindSchema frente al CHECK de la 172, el DTO, OpenAPI y los mapas del portal.
test-change-reviewer: las expectativas ajustadas en B4.
gate-verifier: suite completa de api, db, shared y portal sin caché; integraciones PG con 0 omitidas no declaradas; cobertura de privacy/** frente a su línea base (94,61 % / 82,73 %).
Todos de solo lectura.
```
