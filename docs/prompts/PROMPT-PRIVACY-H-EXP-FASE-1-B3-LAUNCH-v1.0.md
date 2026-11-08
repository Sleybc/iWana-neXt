# LAUNCH — privacy · H-EXP Fase 1 · Ola 2 (B3)

**Plan:** `docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md` §1.2, §2 y §4 · **Spec:** `docs/specs/2026-11-07-privacy-h-exp-retencion-spec.md` v1.1
**Ola que lanza:** 2, B3 · **Gates:** G0 ✅ 2026-11-07 · G2 de B1+B2 ✅ 2026-11-08 · G2 de B2-R ✅ 2026-11-08
**Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-qa` | CA-EXP-01 a 09 y 12 a 16 contra PostgreSQL real; carreras; H1 y H2 corregidos; H3 | `testing-patterns`, `test-driven-development`, `postgresql`, `iwana-test-evidence`, `systematic-debugging` |

**Siguiente:** Ola 3 (B4, solo lectura). **Cierre de ola (G3):** CA-EXP de la Fase 1 en verde contra PostgreSQL real, integración completa como en CI.
**Reglas:** `main` sin ramas, **sin stash** (tampoco para probar el rojo) ni commit, cero PII, nunca `tenant_iwana`.

```text
===== H-EXP B3 · sr-qa =====
Actúa como sr-qa. Lee AGENTS.md, el plan docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md §1.2, §2 y §4 (B3) y la spec docs/specs/2026-11-07-privacy-h-exp-retencion-spec.md v1.1 (§5, §6 y §9). Lee antes los SKILL.md de testing-patterns, test-driven-development, postgresql, iwana-test-evidence y systematic-debugging.
El diff de B1+B2 está sin commit (privacy/retention/, cli/expire-retention.ts, migración 179). No cambies código de producción: si una prueba falla por el código, reporta [BLOQUEO] con archivo:línea.
1. Matriz CA-EXP → prueba para CA-EXP-01 a 09 y 12 a 16, cada una en retention-expiry.postgres.integration.spec.ts o la suite que corresponda, contra PostgreSQL real.
2. Canarios sintéticos positivos (vence y se anonimiza) y negativos (contrato vigente, deber fiscal, PQR sin respuesta, recurso pendiente, prospecto sin descarte verificable, tenant inactivo).
3. Reloj congelado en 18:59, 19:00 y 23:59 de Bogotá en el día de vencimiento y el anterior.
4. Carreras con dos conexiones: escritura CRM/PQR/Billing concurrente con runTenantBatch; 20 iteraciones sin deadlock ni datos reintroducidos.
5. H1 y H2 (corregidos en B2-R, plan §1.3): con dos conexiones, una minimización en curso y un UPDATE ajeno de reason o de la evidencia; el ajeno se rechaza y la minimización termina.
6. H3: un plazo PQR no final sin notificar después de la respuesta definitiva. Documenta si retiene para siempre.
7. Job con payload manipulado en Redis (campos extra, tenantId de otro tenant o inactivo): no produce efectos sobre objetos elegidos por el job.
Entrega: matriz CA→prueba, rojo y verde de lo nuevo, integración completa de apps/api y @iwana/db como en CI (DB_NAME=test, tenant_test aprovisionado, K2 con GITHUB_ACTIONS=true) con duración y omitidas frente a integration-expected-skips.json, conteo real sin caché, ESLint y Prettier de lo tocado.
```
