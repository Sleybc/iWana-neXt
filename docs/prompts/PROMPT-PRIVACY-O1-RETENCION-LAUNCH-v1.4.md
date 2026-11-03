# LAUNCH — privacy · O-1 reloj de retención (Ola 3: verificación B5)

**Plan:** `docs/plans/2026-11-02-privacy-o1-retencion-orquestacion.md` v1.0, «Estado tras la Ola 2» · **Spec:** v1.0 (G0 2026-11-02)
**Reemplaza a:** LAUNCH v1.3. B3, B2-R3 y B4 en GO: CA-O1-01 a 10 en PASS; 11 suites PG con 135/135 y 0 omitidas; ningún titular de desarrollo cambia de retención.
**Cerrado, no re-despachar:** B1 a B4 y todas sus remediaciones.
**Sin cambios de código en esta ola.** Sin stash ni commit.

| # | Subagente | Encargo | Contrato |
| --- | --- | --- | --- |
| 1 | `sec-eng` | `PROMPT-PRIVACY-O1-RETENCION-v1.0.md` §B5, más la dependencia del `search_path` en los triggers de la 169 y la 170 | spec v1.0 D-O1-1 a D-O1-4 |
| 2 | `test-change-reviewer` | Toda prueba existente modificada en O-1, incluidas las que B3 cambió después de la primera revisión | spec v1.0 |
| 3 | `boundary-reviewer` | `privacy` lee CRM solo por el puerto; sin cambios en `privacy/**` salvo pruebas | spec v1.0 §4 |
| 4 | `gate-verifier` | Gates de AGENTS.md: suite completa de api y db sin caché, integraciones PG con `IWANA_DB_INTEGRATION_AVAILABLE=true` (db en `iwana_it_b2r3_20261102`) y cobertura por servicio frente a su base | AGENTS.md |

**Paralelo:** 1, 2, 3 y 4. **Siguiente:** con B5 en GO, AI-EM-ARCH emite el informe de cierre y el HLD Privacy v1.3, y el usuario ordena commit y push (G6.5).

```text
===== B5 · sec-eng =====
Revisa O-1 según docs/prompts/PROMPT-PRIVACY-O1-RETENCION-v1.0.md §B5 (incluido el bloque del 2026-11-03). Spec docs/specs/2026-11-02-privacy-o1-reloj-retencion-spec.md v1.0.
Lee antes: AGENTS.md y SKILL.md de security-auditor, backend-security-coder y postgresql.
Comprueba: ningún contrato terminal queda sin terminated_at y nada lo reescribe; convive con la 169; los triggers de la 169 y la 170 frente al search_path.
Solo lectura. Hallazgos con archivo:línea y severidad.

===== B5 · test-change-reviewer =====
Revisa toda prueba existente modificada en O-1 (B1, B1-R, B1-F y B3), contra la spec O-1 v1.0. Solo lectura; hallazgos C con archivo:línea.

===== B5 · boundary-reviewer =====
Revisa el diff de O-1 contra los boundaries y la tenancy de AGENTS.md. Solo lectura.

===== B5 · gate-verifier =====
Gates de AGENTS.md sobre @iwana/api y @iwana/db sin caché; integraciones PG con IWANA_DB_INTEGRATION_AVAILABLE=true (las de @iwana/db en iwana_it_b2r3_20261102);
cobertura de ramas por servicio frente a su base (contracts 82,87 %, lifecycle 81,81 %). Una suite omitida no declarada es un fallo. No edita nada.
```
