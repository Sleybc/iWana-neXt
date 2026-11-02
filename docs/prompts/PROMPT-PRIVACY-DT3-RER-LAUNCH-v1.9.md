# LAUNCH — privacy · DT-3 R-ER (Ola 3-H2: tres pruebas bloqueadas)

**Plan:** `docs/plans/2026-11-01-privacy-dt3-rer-orquestacion.md` v1.0 · **Spec:** v1.2
**Reemplaza a:** LAUNCH v1.8. B3-H: 66 PASS, 2 FAIL y 0 omitidas en las suites completadas; `contract-plan-change` sin completar. Los 3 ajustes aprobados, aplicados; 0 hallazgos C.
**Visto bueno del clúster: concedido para A, B y C.** C está condicionada a dos pruebas deterministas, una por orden, con 20/20 corridas estables, y un comentario que explique el cambio. Ver §B3-H2.
**Sin código de producto, stash ni commit.** El esquema efímero lo borra el usuario, no el agente.

| # | Subagente | Encargo | Skills a leer antes | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-qa` | `PROMPT-PRIVACY-DT3-RER-v1.0.md` §B3-H2 (solo las filas aprobadas) | `testing-patterns`, `postgresql`, `iwana-test-evidence` | spec v1.2 D-RER-3 |
| 2 | `test-change-reviewer` | Filas aplicadas de §B3-H2 | según su perfil | spec v1.2 |

**Secuencia:** 1 → 2. Con todas las integraciones completas, 0 FAIL y 0 omitidas, avisar a la sesión del clúster para lanzar C4d.

```text
===== B3-H2 · sr-qa =====
Ejecuta docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md §B3-H2, solo las filas que aprobó la sesión del clúster. Spec v1.2.
Lee antes: AGENTS.md y SKILL.md de testing-patterns, postgresql, iwana-test-evidence.
Escribe pruebas y fixtures; nunca código de producto. Aplica las condiciones del visto bueno de §B3-H2.
C: dos pruebas deterministas, (i) changePlan primero → PATCH 200 y (ii) PATCH primero → changePlan 409, cada orden forzado con un bloqueo
que controla la prueba (FOR UPDATE propio o pg_stat_activity con timeout explícito); 20 corridas seguidas, 20/20. Si no se puede: [BLOQUEO].
B: lista en el informe las columnas añadidas al DDL. Otra prueba de CONTRACT_CHANGED por tocar: [BLOQUEO].
Repite la corrida de §B3-H con IWANA_DB_INTEGRATION_AVAILABLE=true; una suite omitida o sin completar cuenta como fallo.
No borres esquemas. Sin stash ni commit. Entrega: diff, clasificación y conteo real por suite.

===== Revisión · test-change-reviewer (tras B3-H2) =====
Revisa las filas aplicadas de §B3-H2 contra la spec DT-3 v1.2 y las reglas del clúster. Solo lectura; hallazgos C con archivo:línea.
```
