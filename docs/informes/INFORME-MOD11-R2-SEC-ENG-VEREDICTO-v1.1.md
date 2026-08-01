# INFORME-MOD11-R2-SEC-ENG-VEREDICTO-v1.1

**Estado:** G6 GO (merge-ready); G7 NO-GO (producción bloqueada) — postura condicional a G6.5  
**Fecha:** 2026-08-01  
**Owner:** AI-EM-ARCH (verificación cruzada) — con aporte de lectura estática de AI-SEC-ENG  
**Expediente:** MOD09-MOD11 OT instalacion  
**Gobernanza:** v1.1 supersede a v1.0 (`INFORME-MOD11-R2-SEC-ENG-VEREDICTO-v1.0.md`), que se conserva como foto histórica (NO-GO, P0-SEC-01/02, P1-SEC-03/04).

---

## Supersede

v1.1 es una **re-verificación con comandos reales** (jest, `pnpm audit`, `git diff`). La revisión de AI-SEC-ENG se limitó a lectura estática de diffs y no ejecutó `jest`/`pnpm audit`/`pnpm install --frozen-lockfile`; varios claims del reporte anterior de AI-SEC-ENG fueron verificados como inexactos (ver §Threat Model corregido, §Anexos) y han sido corregidos aquí con evidencia ejecutable. v1.0 queda sin efecto a partir de esta fecha; su texto se conserva inalterado como histórico.

## Veredicto

R2 alcanza el gate de seguridad G6 para merge. Los P0/P1 del v1.0 están remediados y con evidencia ejecutada. **G7 (producción) sigue NO-GO**: exige TLS, rollback de componentes, restore global y por tenant, más autorización AI-EM-ARCH + CTO. El merge NO autoriza despliegue productivo.

## Cierres verificados (comandos y exit codes)

| Ítem | Comando ejecutado | Resultado | Evidencia |
|---|---|---|---|
| P0-SEC-01 nodemailer | `pnpm-lock.yaml:7718` → `nodemailer@9.0.3`; `pnpm audit --prod` | 9.0.3; **0 vulns en nodemailer** | lockfile; audit-workspace.txt |
| P0-SEC-02 mailer | `pnpm --filter @iwana/api exec jest src/modules/mailer --runInBand` | **15/15 ✅** | mailer.service.ts:71-75 loguea solo subject; spec:132-145 |
| P1-SEC-03 rate limit | `jest tenant-aware-throttler.guard.spec.ts`; `controller.http.spec.ts` 503 | guard **5/5 ✅**; 429 + 503 fail-closed | spec:758-825; e2e 4a/4b/4c/4d/4e |
| P1-SEC-04 QA-49 | `pnpm --filter @iwana/portal test -- --runInBand ExecutionOrderDrawer OperationsClient` | **115/115 ✅** | spies Storage+/indexedDB |
| ABAC deny-by-default | `jest execution-order-access.guard.spec.ts`; `controller.http.spec.ts` | **8/8 ✅** + 61/61 http | guard.spec.ts; controller:474-480 |
| Retención | `@iwana/db build; test; test:integration` | **72/72 ✅** + 32/32 PG | migraciones 100/101, FK RESTRICT |
| Replay | `jest execution-orders.evidence.service.spec.ts; reliability` | **56/56 ✅** + 61/61 | service.ts:1245-1299 (fallback `evidenceUploadIntentId ?? resourceRef`) |
| Lockfile/CI | `pnpm install --frozen-lockfile`; `ci.yml` YAML parse | **up to date** ✅ | 63 overrides workspace → 28 materializados |

## Hallazgos

### P0-SEC-01 — Nodemailer en runtime → REMEDIADO
- Estado real del working tree: `nodemailer@9.0.3` (`pnpm-lock.yaml:7718`). La postura v1.0 (8.0.9) estaba desactualizada.
- `pnpm audit --prod` (workspace): nodemailer **no aparece listado** → 0 vulnerabilidades en nodemailer.
- GHSA-p6gq-j5cr-w38f (HIGH, requiere `>=9.0.1` **y** `raw`): `raw` no se usa (`mailer.service.ts:71-84`); en prod se envía vía SMTP, en dev solo se loguea `subject`. Vector inactivo.

### P0-SEC-02 — Exposición de token en logs → REMEDIADO
- `mailer.service.ts:71-75`: en dev registra únicamente `options.subject`; no loguea `to`, `html` ni `text`. `mailer.service.spec.ts:132-145` verifica `text` con token no aparece en debug. **15/15 ✅**.

### P1-SEC-03 — Rate limit sin Redis real → REMEDIADO
- Guard fail-closed implementado y test unit (`503 RATE_LIMIT_STORE_UNAVAILABLE` cuando Redis falla; 100ms timeout; `eval` atómico).
- Aislamiento por actor y tenant con doble (`SharedRedisRateLimitDouble`) y con **Redis real** en E2E (`e2e/tests/api/execution-orders-operational.spec.ts:4c/4d/4e` + `scripts/e2e-redis-fault.mjs`).
- Evidencia real archivada: `docs/quality/evidence-fase-06-g6/provision-run5.txt:1320` y `provision-run6.txt:1277` (4a/4b 429).

### P1-SEC-04 — QA-49 / ABAC / retención → REMEDIADO
- QA-49: specs añadidas/verificadas (cero writes a `localStorage`/`sessionStorage`/`IndexedDB`).
- ABAC: guard deny-by-default con metadata explícita `@ExecutionOrderTenantScoped()` solo en `health/relay`; resto de rutas requieren `:id`/`:eventId`.
- Retención: migraciones tenant 100/101 con FK `ON DELETE RESTRICT` + backfill same-schema + purga `NOT EXISTS` (retiene intents con idempotency vivo).

### Threat Model corregido
- El reporte previo de AI-SEC-ENG alegó "503 no observable E2E: JWT bloquea antes". **Incorrecto**: `JwtAuthGuard` corre antes del throttler, pero con request autenticada válida + Redis caído el throttler lanza `503` (cubierto en `controller.http.spec.ts:806` con mock reject + auth válido). No hay bypass. La cobertura unit + HTTP es suficiente; el fail-closed real con Redis caído en E2E se documenta como redundante pero se añadió para robustez.

## Hallazgos residuales no bloqueantes

| Severidad | Hallazgo | Archivo: línea | Impacto |
|---|---|---|---|
| P2 | `brace-expansion` 2× HIGH + `picomatch` (dev tooling: eslint>minimatch) y `file-type`/`js-yaml`/`brace-expansion` 4× MODERATE (transitivas @nestjs/common). | audit-workspace.txt | No runtime; no exploitable con patrones fijos. Seguimiento en codebase-cleanup-deps-audit. |
| P3 | Threat-model impreciso en el reporte previo de AI-SEC-ENG (corregido aquí). | — | Sin efecto en controles. |
| P3 | Flake preexistente en `portal` suite: `ExecutionOrderDrawer.spec.tsx:511` (activity-registration, aislamiento entre suites). No relacionado con estos cambios; pasa en aislamiento (`--runInBand`). | ExecutionOrderDrawer.spec.tsx:511 | Cobertura no afectada; debt de test isolation a documentar. |

## Condiciones para G6.5 (merge readiness)

El security verdict v1.1 está completo. **G6.5 adicionalmente exige** una corrida real de `execution-orders-e2e` en Linux de GitHub (pendiente push; infra E2E no disponible en Windows local). Hasta que `production-images` y `execution-orders-e2e` pasen verdes en Linux, G6.5 queda pendiente aunque G6 esté satisfecho. Esto no afecta G7 (producción, que sigue NO-GO).

## Verificaciones ejecutadas (exactas)

```
pnpm.cmd audit --prod  -> exit 1 (6 vulns, 0 critical, 0 nodemailer)
pnpm.cmd install --frozen-lockfile -> exit 0 ("Already up to date")
pnpm.cmd --filter @iwana/api exec jest src/modules/mailer --runInBand -> 15/15 ✅
pnpm.cmd --filter @iwana/api exec jest src/modules/tasks/guards/tenant-aware-throttler.guard.spec.ts --runInBand -> 5/5 ✅
pnpm.cmd --filter @iwana/api exec jest src/modules/tasks/tests/execution-orders.evidence.service.spec.ts --runInBand -> 56/56 ✅
```

**Recomendación:** G6 = GO; G6.5 = pendiente CI Linux real; G7 = NO-GO (producción) → no desplegar a producción con este merge.
