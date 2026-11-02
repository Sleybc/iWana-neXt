# LAUNCH — privacy · DT-3 R-ER (Ola 3-H: integraciones del clúster)

**Plan:** `docs/plans/2026-11-01-privacy-dt3-rer-orquestacion.md` v1.0 · **Spec:** v1.2
**Reemplaza a:** LAUNCH v1.7. B1-G en verde en su alcance: hash `33E5CF71…1F06653`; precedencia probada; API unitaria 443 suites y 5.964 tests; 0 hallazgos C.
**Abierto:** 12 integraciones PG del clúster en rojo. Son efecto de B1/B1-R (y una de B1-G), sin regresión de producto. Clasificación en §B3-H.
**Visto bueno del clúster: concedido**, con las condiciones de §B3-H: tipos de la migración 150, caso nuevo de 404, prueba `:488` con su motivo y el resto de `CONTRACT_CHANGED` sin cambios. Sin código de producto, stash ni commit.

| # | Subagente | Encargo | Skills a leer antes | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-qa` | `PROMPT-PRIVACY-DT3-RER-v1.0.md` §B3-H | `testing-patterns`, `postgresql`, `iwana-test-evidence` | spec v1.2 D-RER-3 |
| 2 | `test-change-reviewer` | Las tres filas de §B3-H | según su perfil | spec v1.2 |

**Secuencia:** 1 → 2. Con 2 sin hallazgos C y todas las integraciones en verde, avisar a la sesión del clúster para lanzar C4d.

```text
===== B3-H · sr-qa =====
Ejecuta docs/prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md §B3-H. Spec v1.2.
Lee antes: AGENTS.md y SKILL.md de testing-patterns, postgresql, iwana-test-evidence.
Escribe pruebas y fixtures; nunca código de producto. Aplica solo los tres ajustes de la tabla y las 4 condiciones del clúster.
Si otra prueba de CONTRACT_CHANGED necesita cambiar: [BLOQUEO] y no la toques.
Después corre TODAS las integraciones PG de G1 punto 3 y las de DT-3 con IWANA_DB_INTEGRATION_AVAILABLE=true
(DB_NAME=dbiw; privacy-erasure-api en iwana_it_privacy_dt3_b3r2). Una suite omitida cuenta como fallo.
Sin stash ni commit. Entrega: diff, clasificación y conteo real por suite.

===== Revisión · test-change-reviewer (tras B3-H) =====
Revisa las tres filas de §B3-H y su diff contra la spec DT-3 v1.2 y las reglas del clúster. Solo lectura; hallazgos C con archivo:línea.
```
