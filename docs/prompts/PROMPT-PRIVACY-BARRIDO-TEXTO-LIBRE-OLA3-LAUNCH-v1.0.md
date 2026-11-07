# LAUNCH — privacy · Barrido de texto libre · Ola 3 (B4)

**Plan:** `docs/plans/2026-11-03-privacy-barrido-texto-libre-orquestacion.md` v1.2 · **Spec:** `docs/specs/2026-11-03-privacy-barrido-texto-libre-supresion-spec.md` v1.1, Aprobada
**Ola que lanza:** 3, B4 · **Gates:** G0 ✅ 2026-11-07 · G2 ✅ 2026-11-07 (Ola 2, sin commit)
**Bloqueos abiertos:** ninguno. P3: nadie más en vuelo sobre `privacy-erasure-api.postgres.integration.spec.ts` ni `anonymize-titular.postgres.integration.spec.ts`; se comprueba al lanzar.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-qa` | Plan §4 B4 · spec D-BT-10, D-BT-12, D-BT-13 y CA-BT-01 a 14 | `testing-patterns`, `test-driven-development`, `postgresql`, `iwana-test-evidence`; de apoyo `systematic-debugging` |

**Paralelo:** ninguno. **Siguiente:** Ola 4 (B5, revisores y `gate-verifier`).
**Cierre de ola (G3):** CA-BT-01 a 14 en verde contra PostgreSQL real con conteo; integración completa de `apps/api` como en CI sin fallos.
**Reglas:** `main` sin ramas, sin stash ni commit, cero PII, nunca `tenant_iwana`, `[BLOQUEO]` si el código contradice la spec.

```text
===== B4 · sr-qa =====
Actúa como sr-qa. Lee AGENTS.md, el plan docs/plans/2026-11-03-privacy-barrido-texto-libre-orquestacion.md v1.2 §4 B3-R y B4, y la spec docs/specs/2026-11-03-privacy-barrido-texto-libre-supresion-spec.md v1.1, Aprobada: §5, §11, D-BT-10, D-BT-12 y D-BT-13.
Lee antes los SKILL.md de testing-patterns, test-driven-development, postgresql, iwana-test-evidence; de apoyo systematic-debugging.
Árbol: B3 está sin commit en main; no lo modifiques. Si una prueba exige tocar código de producción, [BLOQUEO] y vuelve a AI-EM-ARCH.
1. Canarios como integración normal (*.postgres.integration.spec.ts), partiendo de docs/informes/evidence/privacy-barrido-texto-libre-2026-11-03/barrido-b3.sweep.spec.ts.txt: ya registra billing y los participantes nuevos. Corre con DB_NAME=test, sin omisión esperada; skipped vacío o justificado una a una; cubre RESIDENTIAL y NON_RESIDENTIAL.
2. CA-BT-01 a 14. Para R-3 y R-7, además de la siembra SQL, una pasada por el servicio real. CA-BT-03 con otro titular completo. CA-BT-13: proveedor del mismo Party bloquea; de otro Party no.
3. D-BT-10: manifiesto de toda columna textual tenant, partiendo de clasificacion-columnas.csv, e igualdad exacta con el esquema migrado. Amplía apps/api/src/cli/erasure-coverage.invariant.spec.ts o crea uno hermano; no lo dupliques. Demuestra que muerde con una columna temporal y revierte. Las de MOD14 como PENDIENTE-MOD14, sin decidir por ellas.
4. CA-BT-11 (D-BT-12): --verify-only delata canarios previos, --apply los limpia, otro --verify-only da 0. Si --apply no remedia un titular ya anonimizado, [BLOQUEO].
El paso de integración de CI tiene timeout de 5 minutos: informa la duración de tus suites y de la integración completa.
Sin migración, sin tocar audit-sanitize.policy.ts ni billing. main sin ramas, sin stash ni commit, cero PII, nunca tenant_iwana.
Entrega: diff, CA→prueba, conteo real sin caché, integración completa de apps/api como en CI con migraciones y duración, typecheck, ESLint y Prettier de las rutas tocadas.
```
