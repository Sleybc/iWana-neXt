# LAUNCH — privacy · O-1 reloj de retención (Ola 3-R: INSERT terminal)

**Plan:** `docs/plans/2026-11-02-privacy-o1-retencion-orquestacion.md` v1.0, «Estado tras B5» · **Spec:** v1.0 (G0 2026-11-02)
**Reemplaza a:** LAUNCH v1.4. B5: `test-change-reviewer`, `boundary-reviewer` y la parte del `search_path` de `sec-eng` en GO; gate bloqueado por el P2 del `INSERT` terminal.
**Cerrado, no re-despachar:** B1 a B4, sus remediaciones y la cobertura (85,29 % y 85,36 %).
**Sin stash ni commit.** La 170 no se edita: la corrección va en la 171.

| # | Subagente | Encargo | Skills a leer antes | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | `PROMPT-PRIVACY-O1-RETENCION-v1.0.md` §B2-R4 | `iwana-tenant-migration`, `database-migration`, `postgresql`, `iwana-test-evidence` | spec v1.0 D-O1-1 |
| 2 | `sr-qa` | §B3-R, tras 1 | `testing-patterns`, `postgresql`, `iwana-test-evidence` | spec v1.0 D-O1-1 |
| 3 | `test-change-reviewer` | Los fixtures ajustados por B3-R | según su perfil | spec v1.0 |
| 4 | `gate-verifier` | Repetir el gate de B5 completo, en `iwana_it_o1_b5_20261103` migrada hasta la 171 | `iwana-test-evidence` | AGENTS.md |

**Secuencia:** 1 → 2 → 3 → 4. Con 4 en GO, AI-EM-ARCH emite el cierre y el HLD Privacy v1.3.

```text
===== B2-R4 · sr-backend =====
Ejecuta docs/prompts/PROMPT-PRIVACY-O1-RETENCION-v1.0.md §B2-R4. Spec docs/specs/2026-11-02-privacy-o1-reloj-retencion-spec.md v1.0.
Lee antes: AGENTS.md y SKILL.md de iwana-tenant-migration, database-migration, postgresql, iwana-test-evidence.
Migración 171 aditiva: INSERT terminal sin terminated_at → 23514 (rechazar, no autocompletar); la 170 no se toca; down vuelve al estado de la 170.
Aplícala en los 7 tenants ACTIVE de dev y cuenta (solo lectura) los terminales sin fecha no anonimizados: deben ser 0, o [BLOQUEO].
Sin stash ni commit. Entrega: número y sufijo, diff, up→down→up y el conteo.

===== B3-R · sr-qa (tras B2-R4) =====
Ejecuta §B3-R: b5-identity-conversion:214 y cualquier otro fixture con INSERT terminal ponen terminatedAt (categoría b; sin cambiar aserciones).
Repite las integraciones PG de API y DB con IWANA_DB_INTEGRATION_AVAILABLE=true en iwana_it_o1_b5_20261103. Pruebas y fixtures; nunca producto.

===== Tras B3-R: test-change-reviewer (fixtures), luego gate-verifier repite el gate de B5 =====
```
