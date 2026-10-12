# Informe de cierre G6 — MOD05 Suscriptores

**Versión:** 1.0
**Fecha:** 2026-10-12
**Responsable:** AI-EM-ARCH
**Estado:** G6 cerrado — GO
**Base de revisión:** plan y prompt MOD05 v1.3; árbol de trabajo verificado el 2026-10-12.

## 1. Decisión

**G6: GO.** Gate-verifier y SEC-ENG terminaron en GO. La revisión independiente confirma las suites de API, portal, shared y DB, cobertura de `crm/subscribers` y `parties` por encima del 80 % en statements y branches, lint, typecheck, integración B5 contra PostgreSQL real y los controles de seguridad del alcance.

Este cierre registra G6 local. G6.5 queda pendiente de la corrida Linux de CI por SHA después del commit. G7 queda pendiente de ejecutar el runbook por tenant y de resolver las decisiones E-1, E-2 y E-3.

## 2. Entregables revisados

| Bloque | Entregables |
| --- | --- |
| B11 | Adaptadores Party excluyen identidades `MERGED` y eliminadas; `findByDocument` resuelve un alias a su canónico en un salto. Regresiones unitarias y de PostgreSQL están documentadas en [informe B11](INFORME-MOD05-SUBSCRIBERS-REMEDIACION-B11-v1.0.md). |
| B12 | Tests observables y cobertura de ambos módulos; casos de conversión MERGED→canónico y Party eliminado en [informe B12](INFORME-MOD05-SUBSCRIBERS-REMEDIACION-B12-v1.0.md). |
| B13 | Runbook por tenant en [RUNBOOK-MOD05-PARTY-PII-BACKFILL-v1.0.md](../runbooks/RUNBOOK-MOD05-PARTY-PII-BACKFILL-v1.0.md); detalle y riesgos en [informe B13](INFORME-MOD05-SUBSCRIBERS-REMEDIACION-B13-v1.0.md). |

## 3. Evidencia independiente de gates

| Gate | Resultado y evidencia |
| --- | --- |
| API, portal, shared y DB | `pnpm exec turbo run test --filter=@iwana/api --filter=@iwana/portal --filter=@iwana/shared --filter=@iwana/db --force`: **7 tareas, 0 cacheadas**. API: 329 suites aprobadas, 4 omitidas; 4.242 tests aprobados, 15 omitidos. Portal: 291 suites, 2.927 tests aprobados, 1 omitido. Shared: 11 suites / 135 tests. DB: 60 suites / 368 tests. |
| Cobertura focalizada | Corrida API independiente con Jest `--no-cache --runInBand --coverage`; 329 suites y 4.242 tests aprobados, 4 suites y 15 tests omitidos. Desde `coverage-final.json`: `crm/subscribers` **97,44 % statements (1.104/1.133) / 89,24 % branches (514/576)**; `parties` **94,24 % (524/556) / 88,00 % (132/150)**. |
| B5 contra PostgreSQL real | `b5-identity-conversion.postgres.integration.spec.ts`: **1 suite / 8 tests aprobados**. Incluye Party MERGED→canónico, Party eliminado no reutilizado y guarda `activatedAt`. PostgreSQL de desarrollo respondió en `127.0.0.1:5433/dbiw`. |
| Auditoría tras `update` | `subscribers-update-audit.postgres.integration.spec.ts`: **1 suite / 1 test aprobado**; `audit_logs` no conserva PII del diff. |
| Migración 143 | `migration-order.spec.ts`: **1 suite / 6 tests**. Integración contra PostgreSQL real: **1 suite / 2 tests**, ciclo `up/down/up` y aborto con reporte ante duplicados. |
| Lint y typecheck | `pnpm exec turbo run lint --force`: **6 tareas, 0 cacheadas**, exit 0, sin errores. Hay avisos ESLint en archivos ajenos al cambio; la línea `apps/api/src/modules/inventory/tests/support/in-memory-tenant-store.ts:18` ya existe en `HEAD`. `pnpm exec turbo run typecheck --force`: **6 tareas, 0 cacheadas**, exit 0. |
| OpenAPI y PII | `POST /search` tiene operación, body y respuesta `SubscriberListItem`; el GET retirado no aparece en OpenAPI. La revisión de logs no encontró PII en líneas añadidas; la integración de auditoría confirma la omisión de valores personales. |
| Boundary y tenancy | Revisión previa: sin nuevos límites ni problemas de tenancy. B11 permanece en `parties/adapters/**`, sin imports entre módulos. `inventory-parties-boundary.arch.spec.ts`: **1 suite / 2 tests aprobados**. No se localizó un informe de boundary separado. |
| Auditorías documentales | `pnpm audit:doc-locations`: 0 bloqueantes y 3 avisos bajo `.playwright-mcp/`. `pnpm audit:adr-citations`: 0 bloqueantes y 142 avisos heurísticos. |
| Vulnerabilidades de dependencias | No aplica: este diff no modificó `package.json` ni `pnpm-lock.yaml`. |

## 4. Revisión de seguridad

SEC-ENG dio **GO** a B7-01: ambos adaptadores excluyen Parties `MERGED` y eliminadas; el lector sigue `merged_into_party_id` un solo salto y devuelve `null` si el destino no es válido. Las regresiones unitarias y la integración B5 cubren esas condiciones.

SEC-ENG dio **GO** al runbook B13 frente a los criterios de la fase: backup y restore de ensayo, migración 143, dry-run, resolución humana, `--apply`, conteos, B5 en el mismo release, límites de rollback, contracción separada y ventana de rotación ADR-058. No se ejecutó el runbook contra ningún entorno.

## 5. Deuda y gates pendientes

| Severidad | Estado al cierre |
| --- | --- |
| Crítica | Ninguna conocida. |
| Alta | G7 sigue siendo precondición de release: backup verificable, migración y backfill por tenant, resolución humana de fallos/candidatos, conteos aprobados y despliegue de B5 en el mismo release. El runner puede dejar tenants parcialmente migrados. |
| Media | E-1 (IVA), E-2 (Habeas Data) y E-3 (placeholders / `NOT NULL`) siguen pendientes de decisión. B7-04 — `AuditService` fail-open transversal — conserva como dueños a `sr-backend` y `sec-eng`. ADR-058 fase 2 (`PII_ENCRYPTION_KEY`) sigue asignada a `plat-ops` y `sr-backend`. B12 deja ramas individuales sin cubrir, aunque los agregados de ambos módulos cumplen el umbral. |
| Baja | SEC-ENG observó que los comandos de compilación del runbook compilan DB y API directamente, pero no `@iwana/shared`; en un checkout limpio conviene compilar shared antes o invocar Turbo con dependencias. B12 registra una discrepancia entre los agregados recalculados del snapshot B8 y los porcentajes publicados en ese informe; conservar `coverage-final.json` con cada corrida para comparar tendencias. |

| Gate | Estado |
| --- | --- |
| G6 — calidad local | **Cerrado — GO** |
| G6.5 — merge readiness | Pendiente de CI Linux por SHA después del commit. |
| G7 — release | Pendiente de ejecución y evidencia por tenant; E-1/E-2/E-3 continúan abiertos. |
