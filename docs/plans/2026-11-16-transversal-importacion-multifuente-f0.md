# Transversal · Importación multi-fuente · F0 marco y refactor de UISP · Plan de orquestación

> **Para quien ejecute:** skill obligatoria `executing-plans` (modo subagente). Cada bloque se descompone en pasos TDD al iniciarlo. Este plan es el encargo de cada bloque: por ADR-107 D8 no hay prompt de ejecución aparte, igual que en las fases UISP anteriores.

**Objetivo:** generalizar el lado fuente de la importación (adaptador, canónico, conexiones y CHECK) sin cambiar ningún comportamiento de UISP.
**Spec:** [2026-11-16-transversal-importacion-multifuente](../specs/2026-11-16-transversal-importacion-multifuente.md) v1.0 §4–§5 (**G0 pendiente**). **ADR:** [ADR-111](../adrs/ADR-111-Importacion-Multi-Fuente.md) (propuesto).
**Launcher:** [PROMPT-TRANSVERSAL-IMPORTACION-MULTIFUENTE-F0-LAUNCH-v1.0](../prompts/PROMPT-TRANSVERSAL-IMPORTACION-MULTIFUENTE-F0-LAUNCH-v1.0.md)
**Fuera de alcance:** spec §4, «Fuera de F0».

## 1. Reglas

- Se trabaja en `main`, sin ramas.
  - Commit local por ola, sin push salvo pedido (ADR-107).
  - No usar `pnpm dev` ni `dev.mjs`, ni matar procesos ajenos.
- **Secuencia:** no arrancar mientras sigan sin commit los cambios de la ola MOD09 «adjuntos en tickets» en `assurance/migration-adapters/` y `migration/`. Comprobar con `git status --short apps/api/src/modules/migration apps/api/src/modules/assurance`.
- No tocar ni reformatear los cambios ajenos que haya en el árbol.
- **Pruebas:**
  - Jest sin caché y con conteo real.
  - Integración con `DB_NAME=test E2E_TENANT_SLUG=test IWANA_DB_INTEGRATION_AVAILABLE=true`.
  - Si cambia un `@Module`, correr la suite completa de la API.
- **Migración tenant:** la última es la 212; esta fase usa la **213**. Columna cifrada nueva → manifiesto de supresión e inventario K2 en la misma ola.
- **UISP:** en pruebas, solo `test/fake-uisp-server.ts` y `test/uisp-zip.fixture.ts`; nunca la instancia real.
- **Boundaries:** destino solo por puertos. Fuera de `sources/uisp/`, nada importa código de UISP.

## 2. Bloques

| Bloque | Spec | Superficie | Dueño |
|---|---|---|---|
| **W0** Línea base y golden | §4.1, CA1 | Conteo real de `apps/api/src/modules/{migration,billing/migration-adapters,crm/migration-adapters,assurance/migration-adapters}`. Golden `migration/test/uisp-golden.postgres.integration.spec.ts`: del fixture UISP a staging, simulación, promoción, conciliación y reversión, con instantáneas de conteos, motivos, `external_id` y totales | `sr-qa` |
| **A** Contrato | §4.2–§4.3 | `migration-canonical.contract.ts` v1: titular, contrato, documento de cobro, pago, ticket y soporte (los campos que hoy consume `uisp-promotion-mapping.ts`). En `migration-import.contract.ts`: fuentes, sistemas y prefijo por fuente con el helper `migrationExternalId`. Recompilar `@iwana/shared`. **Se congela al cerrar** | `sr-backend` |
| **B** Migración 213 | §4.4 | `213_migration_multi_source_framework.ts`: CHECK de 194 (`source`, `external_id`, `source_system`) y de 211, columnas de conexión, copia de la clave y `down()` bloqueante. Integration spec | `data-eng` |
| **C** Adaptador y UISP | §4.5 | `migration/sources/source-adapter.port.ts`, `source-registry.ts`, `sources/uisp/` (`uisp/`, `uisp-api/` y `zip/` movidos, normalizador al canónico) y `sources/shared/` con el HTTP seguro. Servicios de simulación y lotes vía registro | `sr-backend` |
| **D** Promoción desacoplada | §4.6 | `migration-promotion.service.ts` consume el canónico. El puerto de Facturación (`migration-import.ports.ts:345`) y `billing-migration-import.adapter.ts:232,241,266` reciben las fuentes en lugar de `uisp:%` literal. `restageForPromotion` para staging sin versión | `sr-backend` |
| **QA** | §5 | Golden de W0 sin modificar; E2E `portal-importacion-uisp-live.spec.ts` y `portal-importacion-uisp-usuarios-live.spec.ts`; CA4 y CA5 por grep | `sr-qa` |

## 3. Olas

| Ola | Bloques | Depende de |
|---|---|---|
| 1 | W0 · A · B | — |
| 2 | C | W0 (golden verde) y A |
| 3 | D | C |
| 4 | QA · revisores · informe | 1–3 |

- **Ruta crítica:** W0 → C → D → QA.
- **Sincronización:**
  - A congela el contrato; cualquier cambio exige re-sync de C y D.
  - C es dueño de `sources/**` y de los servicios de simulación y lotes; D es dueño de `migration-promotion.service.ts` y del adaptador de Facturación.

## 4. Matriz agente × skill

| Bloque | Agente | Obligatorias | De apoyo (condición) | Descartadas (motivo) |
|---|---|---|---|---|
| W0, QA | `sr-qa` | `testing-patterns`, `iwana-test-evidence`, `e2e-testing-patterns` | `e2e-triage` (si una E2E falla) | `iwana-matriz-motivos` (no cruza MOD11↔MOD12) |
| A | `sr-backend` | `typescript-expert`, `openapi-spec-generation` | `backend-security-coder` (si un esquema lleva PII) | `bullmq-specialist` (sin colas) |
| B | `data-eng` | `iwana-tenant-migration`, `postgresql` | `security-auditor` (por las credenciales) | `database-migration` (es tenant) |
| C | `sr-backend` | `nestjs-expert`, `typescript-expert`, `backend-security-coder`, `testing-patterns` | `bullmq-specialist` (si toca el procesador) | `brainstorming` (spec definida) |
| D | `sr-backend` | `nestjs-expert`, `postgresql`, `testing-patterns` | `systematic-debugging` | `openapi-spec-generation` (sin cambio HTTP) |
| Revisión | `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer`, `sec-eng`, `gate-verifier` | `requesting-code-review`, `verification-before-completion` | — | `iwana-identity-ui-review` (sin UI) |

## 5. Gates

- **G6 por ola:** el conteo es igual o mayor a la línea base de W0, y el golden pasa sin cambios en su archivo (lo verifica `test-change-reviewer`).
- **Ola 1:** la 213 hace up/down contra Postgres real.
- **Ola 3:** la clave de UISP no aparece en respuestas ni logs (se reutiliza la prueba de 211).
- **Antes de cerrar:**
  - E2E en verde;
  - `sec-eng` GO sobre `credentials_encrypted`;
  - `pnpm audit:adr-citations` sin bloqueantes.
- **Push:** la 213 lleva CHECK, así que se publica al cerrar la fase (ADR-107 D8.4). G6.5 se da con el CI del SHA publicado.

## 6. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | El refactor cambia el resultado | Golden escrito antes (W0) e intocable |
| R2 | Lote vivo con staging antiguo | `restageForPromotion` desde el ZIP (D) |
| R3 | Pérdida de la clave al migrar la conexión | Copia y verificación en la 213; prueba de descifrado tras up |
| R4 | Choque con trabajo ajeno en `migration/` | Regla de secuencia §1 |

## 7. Cierre

Informe `docs/informes/INFORME-TRANSVERSAL-IMPORTACION-MULTIFUENTE-F0-v1.0.md`, con conteos reales y deudas. El siguiente paso es la spec de F1 (identidad y conflictos).

## Lanzamiento

Espejo de [PROMPT-TRANSVERSAL-IMPORTACION-MULTIFUENTE-F0-LAUNCH-v1.0](../prompts/PROMPT-TRANSVERSAL-IMPORTACION-MULTIFUENTE-F0-LAUNCH-v1.0.md); el archivo prevalece si divergen.
