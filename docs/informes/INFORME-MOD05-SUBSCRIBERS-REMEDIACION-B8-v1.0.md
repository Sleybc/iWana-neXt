# Informe MOD05 Subscribers — Evidencia de cierre B8 v1.0

**Fecha:** 2026-10-12  
**Responsable:** `sr-qa`  
**Alcance:** trazabilidad B1–B10, pruebas PostgreSQL reales y cobertura de `crm/subscribers` y `parties`.  
**Resultado QA:** evidencia recolectada; **NO-GO para cierre integral** por cobertura insuficiente y hallazgo alto B7-01.

## Matriz de trazabilidad hallazgo/criterio ↔ prueba

| Bloque / criterio | Prueba o artefacto de evidencia | Resultado de QA |
| --- | --- | --- |
| **B1 — C-DDL-1:** migración reversible, preflight de duplicados, columnas e índices | `packages/database/src/migrations/tenant/143_subscriber_party_pii_hmac.integration.spec.ts` contra PostgreSQL real | Corrida fresca: **1 suite, 2 tests aprobados**. El test ejerció `up/down/up`, preservación de filas y aborto/reporting de duplicados antes del DDL. Es la evidencia de DDL; los tests unitarios que mockean `runInTenantSchema` no cuentan para este criterio. |
| **B1 — CLI de backfill:** dry-run no escribe y reporta candidatos de fusión | `apps/api/src/cli/backfill-party-pii.postgres.integration.spec.ts` contra PostgreSQL real | Corrida fresca: **1 suite, 1 test aprobado**. El schema de prueba contenía documentos duplicados; el dry-run reportó el candidato sin mutar Party, contactos ni WhatsApp. El informe B1 registra además el dry-run del seed `iwana`: 7 Parties, 8 contactos, 0 WhatsApp vistos; 0 candidatos y 0 fallos; `applied=false`, sin escrituras. |
| **B1 — C-NORM-1:** normalización por tipo documental | `packages/shared/src/utils/normalize-document-number.spec.ts` | Corrida fresca: **1 suite, 10 tests aprobados**, incluidos CC/CE/NIT/RUT/TI, PASAPORTE/PEP/PTP/OTHER y fallo cerrado. |
| **B2 — C-API-1 / SUB-C02:** GET retirado, búsqueda personal en body POST, query sin PII y comodines escapados | `apps/api/src/modules/crm/subscribers/subscribers.controller.fase2.http.spec.ts`; `apps/api/src/modules/crm/subscribers/tests/subscribers.service.spec.ts`; `apps/portal/src/lib/api-client-subscribers.spec.ts` | Las pruebas HTTP de 404, metadata `@Query`, búsqueda y roles corrieron en el Jest API completo. B3 reporta 1 suite/2 tests del transporte POST. El informe B7 da **GO** a SUB-C02. |
| **B2 / B6 — C-API-2 y B4:** proyección fail-closed y presencia/ausencia por rol | `apps/api/src/modules/crm/subscribers/tests/subscriber-projection.spec.ts`; matriz HTTP en `subscribers.controller.fase2.http.spec.ts`; ratificación `docs/specs/2026-10-11-mod05-subscriber-list-field-role-map.md` §6 | La prueba unitaria cubre rol no mapeado; la matriz HTTP cubre los 5 roles permitidos, campos restringidos, y 403 para TECHNICIAN/AUDITOR. B9 añade `vatTreatment` base y `department` restringido a la matriz. B7 da **GO** a SUB-A05. |
| **B2 — SUB-A08:** `audit_logs` sin valores personales después de update | `apps/api/src/modules/crm/subscribers/subscribers-update-audit.postgres.integration.spec.ts` | Corrida fresca contra PostgreSQL real: **1 suite, 1 test aprobado**. El test efectúa PATCH HTTP y consulta la fila de auditoría para verificar que solo contiene `changedFields`, sin los valores personales enviados. Durante QA se actualizó únicamente el fixture de prueba para registrar el nuevo proveedor `IPartyWritePort` y satisfacer la validación vigente del DV del NIT; no se modificó lógica productiva ni contratos. |
| **B3 — consumo portal:** POST con body y sin PII en URL | `apps/portal/src/lib/api-client-subscribers.spec.ts`; gate vigente de B10 en `INFORME-MOD05-SUBSCRIBERS-REMEDIACION-B10-v1.0.md` | La prueba dedicada cubre el transporte del body y query no personal. El gate portal reportado por B10 pasó sin cache: **291 suites, 2.927 tests aprobados, 1 omitido**. |
| **B4 — mapa rol × campo** | `docs/specs/2026-10-11-mod05-subscriber-list-field-role-map.md` §6 y su informe B4 | Entrega documental ratificada. No es una prueba de runtime; la aplicación del mapa se contrasta con la matriz HTTP de B2/B9. |
| **B5 — SUB-A01/A02/A03/A04 y C-PORT-1:** conversión, fallo/reintento, reactivación, unicidad y frontera transaccional | `apps/api/src/modules/crm/subscribers/b5-identity-conversion.postgres.integration.spec.ts`; tests de `party-write.adapter` y `party.service` | Corrida fresca contra PostgreSQL real: **1 suite, 6 tests aprobados**. Incluye dedupe HMAC, carrera de conversiones, restauración, rechazo cuando hay `activatedAt`, y fallo/reintento. La ejecución usa `PartyWriteAdapter` dentro del camino transaccional. El test no cubre una identidad Party `MERGED`; véase B7-01. |
| **B7 — revisión de seguridad:** ASVS L2 para PII, tenancy y auditoría | `docs/informes/INFORME-MOD05-SUBSCRIBERS-REMEDIACION-B7-v1.0.md` | **NO-GO** por B7-01: faltan filtros de estado `MERGED` y borrado lógico en búsquedas de identidad de adaptadores Party, y no existe regresión que los exija. B7-02 deja además G7 de migración/backfill como precondición de release. B7-03 y B7-04 constan como deuda media. |
| **B8 — cobertura de módulos** | Corrida fresca Jest API con cobertura, salida detallada abajo | `parties` supera 80 % en statements/lines/functions; `crm/subscribers` queda en **78,28 % de statements** y 62,19 % de branches. La cobertura no cumple el gate de 80 % de forma consistente; cierre integral bloqueado. |
| **B9 — D-1/D-2/D-3:** `vatTreatment`, `department`, guarda `activatedAt` y Jest sin wrapper | `apps/api/src/modules/crm/subscribers/subscribers.controller.fase2.http.spec.ts`; `tests/subscriber-projection.spec.ts`; test integrado B5 | Los campos están representados en el tipo compartido y la matriz HTTP. El caso PostgreSQL de `activatedAt` es uno de los seis tests aprobados. El reporte B9 registra gate Turbo `--force` con 0 tareas cacheadas. |
| **B10 — presentación portal:** tratamiento IVA real y fallback de ubicación | `apps/portal/src/components/crm/subscribers/SubscribersListClient.spec.tsx` y `SubscribersListClient.tsx` | B10 reporta prueba focalizada **1 suite, 11 tests aprobados**, incluyendo `EXCLUDED → Excluido` y `Sin ubicación` si el rol no recibe `city`/`department`; gate portal completo según la fila B3. |

## Comandos y salidas de verificación

| Verificación | Comando / configuración | Resultado real |
| --- | --- | --- |
| Inventario Jest API | `pnpm --filter @iwana/api exec jest --listTests` | 332 specs listadas para el runner principal. |
| Gate API + cobertura | `pnpm --filter @iwana/api exec jest --no-cache --runInBand --coverage --coveragePathIgnorePatterns='\.spec\.[tj]s$'` | Exit code 0; `Test Suites: 4 skipped, 328 passed, 328 of 332 total`; `Tests: 15 skipped, 4192 passed, 4207 total`; `Time: 213.503 s`. Ejecución directa de Jest con `--no-cache`, no hubo cache hit. Los cuatro bloques omitidos son opt-in (`EV1_REAL_DB=1` en tres suites y `TENANT_MIGRATIONS_REAL_DB=1` en la suite de migración de segundo schema). |
| Cobertura `crm/subscribers` | Misma corrida completa; se excluyeron archivos de prueba del denominador | Statements **78,28 %** · Branches **62,19 %** · Functions **80,18 %** · Lines **80,21 %**. |
| Cobertura `parties` | Misma corrida completa; se excluyeron archivos de prueba del denominador | Statements **96,51 %** · Branches **40,00 %** · Functions **100 %** · Lines **98,75 %**. |
| Migración 143 | `IWANA_DB_INTEGRATION_AVAILABLE=true pnpm --filter @iwana/db test:integration -- --runInBand --runTestsByPath src/migrations/tenant/143_subscriber_party_pii_hmac.integration.spec.ts` | PostgreSQL alcanzable; **1 suite, 2 tests aprobados**. |
| Backfill dry-run integrado | `IWANA_DB_INTEGRATION_AVAILABLE=true pnpm --filter @iwana/api test:integration -- --runInBand --runTestsByPath src/cli/backfill-party-pii.postgres.integration.spec.ts` | PostgreSQL alcanzable; **1 suite, 1 test aprobado**. |
| Conversión B5/B9 | `IWANA_DB_INTEGRATION_AVAILABLE=true`, `E2E_TENANT_SLUG=iwana`; `pnpm --filter @iwana/api test:integration -- --runInBand --runTestsByPath src/modules/crm/subscribers/b5-identity-conversion.postgres.integration.spec.ts` | PostgreSQL alcanzable; **1 suite, 6 tests aprobados**. |
| Auditoría B2 | `IWANA_DB_INTEGRATION_AVAILABLE=true`, `E2E_TENANT_SLUG=iwana`; `pnpm --filter @iwana/api test:integration -- --runInBand --runTestsByPath src/modules/crm/subscribers/subscribers-update-audit.postgres.integration.spec.ts` | PostgreSQL alcanzable; **1 suite, 1 test aprobado** después de actualizar el fixture de integración. |
| Normalización compartida | `pnpm --filter @iwana/shared exec jest --runInBand --no-cache --runTestsByPath src/utils/normalize-document-number.spec.ts` | **1 suite, 10 tests aprobados**. |

La cobertura global API del mismo comando es 80,83 % statements, 61,82 % branches, 76,03 % functions y 83,17 % lines; no sustituye los porcentajes focalizados por módulo. El umbral se evalúa sobre ambas carpetas pedidas, no sobre el total global.

## Deuda, defectos y bloqueos por severidad

| Severidad | Hallazgo |
| --- | --- |
| Crítica | Ninguna identificada por esta revisión QA. |
| Alta | **B7-01 — identidad Party `MERGED`:** `PartyWriteAdapter.ensurePartyWithRole` y `PartyReadAdapter.findByDocument` no excluyen consistentemente registros `MERGED`/soft-deleted. No hay regresión para ese caso. Bloquea GO de SUB-C01; requiere cambio de implementación y tests del dueño de Parties. Referencia y líneas en el informe B7. |
| Alta | **Cobertura del gate:** `crm/subscribers` no alcanza 80 % statements (78,28 %) ni branches (62,19 %); `parties` queda en 40 % branches. La cobertura de líneas de suscriptores apenas supera 80 % (80,21 %). El gate ≥80 % no se declara cumplido mientras statements/branches queden por debajo; priorizar código de alcance y no ampliar a módulos ajenos. |
| Alta | **B7-02 — G7 de release:** el seed de desarrollo sigue sin `--apply`; migración 143 y backfill deben aplicarse/verificarse por tenant antes del despliegue de B5, resolviendo candidatos y fallos. |
| Media | **B7-03:** el placeholder compartido de teléfono puede generar el mismo HMAC y falsos positivos al buscar por ese número; no debe tratarse como identidad/contacto verificable. |
| Media | **B7-04:** `AuditService.log` es fail-open ante fallos del sink y los reintentos administrativos fallidos no conservan actor en un registro durable. La prueba B2 demuestra minimización PII en la fila exitosa, no durabilidad frente a fallo de almacenamiento. |
| Baja | Ninguna deuda nueva introducida por B8. |

## Resultado

B8 entrega la matriz y evidencia con conteos reales. La migración 143, el dry-run integrado, la normalización, la integración B5/B9 y la persistencia de auditoría pasaron contra PostgreSQL real; las pruebas que solo mockean `runInTenantSchema` se excluyeron como evidencia de DDL. El cierre integral de la Ola permanece **NO-GO** hasta resolver B7-01 y completar el gate de cobertura; G7 continúa siendo condición de release.
