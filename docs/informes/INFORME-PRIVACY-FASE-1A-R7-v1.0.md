# INFORME — Privacy Fase 1a · R7: fixture de contratos sigue las migraciones

**Versión:** 1.0
**Fecha:** 2026-10-14
**Emisor:** `sr-backend` (bloque R7, prompt v1.3 §5 «R6: resultado y R7»)
**Base:** plan v1.6; informe R6 v1.0; `AGENTS.md` → Gates Before Merge; skills `testing-patterns`, `postgresql`, `iwana-test-evidence` (leídas como documentación antes de escribir).
**Ruta:** verificada libre antes de escribir (`Test-Path …INFORME-PRIVACY-FASE-1A-R7-v1.0.md` → `False`).

## 1. Propiedad y alcance

Propiedad exclusiva: `apps/api/src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts`. Solo tests: no se tocó producción ni contratos, y **no se revirtió nada de R6** (`git status` conserva intactos los dos specs de `crm/subscribers/**`). Ninguna aserción eliminada: conteo `it(`/`expect(` idéntico antes/después — 80/80.

## 2. Causa (confirmada en CI y reproducida en local)

El fixture creaba a mano `subscribers (id, tenant_id, person_type, deleted_at)` (líneas 169–178). Desde `ee5e494d`, `ContractsService.create` selecciona `partyId` (`contracts.service.ts:105-107`) y exige autorización contractual (`:112`, A18). Con el tenant migrado → `42703 column Subscriber.party_id does not exist` (CI `38644689892`, `contracts…spec.ts:133`; reproducido en local contra `dbiw` migrada: 18/19, mismo sqlstate).

## 3. Cambios (solo el spec)

- **DDL por clonación:** `subscribers` y `contracts` se crean con `LIKE <schema origen>.<tabla> INCLUDING ALL` (igual que `audit_logs`), así siguen las migraciones. El DDL manual de ambas tablas se elimina. El índice `uq_contracts_stratum_evidence` (migración 145) se conserva con `IF NOT EXISTS` para el origen sin migrar — lo exige el test de `23505`.
- **INSERT completo con `party_id`:** nuevo helper `insertSubscriber()` que satisface los NOT NULL sin default de la tabla real (`customer_segment`, `email/phone_encrypted`, `vat_treatment`, `tax_regime`, `address`, `created_by`) y ambas ramas de `chk_subscriber_person_fields` (documento+nombre+estrato y nit+razón social) con valores sintéticos únicos por fila, sin PII; devuelve `party_id` (UUID fresco). Lo usan `createContract()` (conserva su firma, incluido `personType`) y el test de auditoría.
- **Stub del puerto:** `IPrivacyAuthorizationReadPort.hasActive` devuelve `{ active: true, authorizationId: 'fixture-authorization-1', legalTextVersion: 'fixture-legal-v1', legacyUnverified: false }` (misma forma que el unit spec). Aísla el IVA del spec; el 422 sin autorización ya lo cubre B5. Solo `create`/`createFromExpediente` consumen el puerto (`_transition` no lo usa).
- Nota de tipado: la firma del helper declara `personType?: PersonType | undefined` por `exactOptionalPropertyTypes` (primer intento falló en ts-jest con TS2379; corregido antes de ejecutar).

## 4. Evidencia local (conteos reales, sin caché)

| Comprobación | Comando | Resultado |
| --- | --- | --- |
| Spec contra `dbiw` migrada (slug `iwana`) | `E2E_TENANT_SLUG=iwana jest --config jest.integration.config.js contracts…` | **19/19 pass** (1 suite) |
| Spec con `E2E_TENANT_SLUG=test` sobre base migrada (espejo `tenant_test`, eliminado después) | mismo con `E2E_TENANT_SLUG=test` | **19/19 pass** (1 suite) |
| `test:integration` entero con `E2E_TENANT_SLUG=test` (incluido B5 de R6) | `jest --config jest.integration.config.js` | exit 0; **14 suites pass / 2 skip; 73 tests pass / 14 skip** (ver §5) |
| API completa sin caché | `pnpm exec turbo run test --filter=@iwana/api --force` | exit 0; **372 suites pass / 4 skip; 4963 tests pass / 15 skip; 0 cached** |
| Lint + typecheck sin caché | `pnpm exec turbo run lint typecheck --filter=@iwana/api --force` | exit 0; 8/8 tareas, 0 cached; warnings api 7 / db 5 (preexistentes, idénticos a GATES v1.1; cero en el spec tocado) |

## 5. Notas del entorno (no son hallazgos del bloque)

- **Espejo `test`:** el clon `LIKE` de 12 tablas no basta para la suite entera — los specs wfm/tasks clonan otras tablas del origen (primera corrida: 6 suites en rojo por esquema E1 ausente) y el spec wfm corre **directo en el schema origen**, donde el `LIKE` tampoco replica los tipos enum (`42704 type schedule_event_status[] does not exist`; copiar los tipos sin reapuntar columnas da `42883` por tipos distintos). Espejo final: `pg_dump --schema-only` de `tenant_iwana` restaurado como `tenant_test` (128 tablas, 74 enums, secuencias propias). Con él, la suite entera pasa. Fila `test` en `public.tenants` y schema eliminados después; verificado sin residuos (`test tenant rows: []`, `leftover schemas: []`). Los scripts del espejo viven solo en Temp, fuera del repo.
- **2 suites en skip** (`inventory-execution-request.ola3d`, `execution-orders.item-usage-projection`): exigen `DB_NAME` sintética por diseño (`describe.skip` sin ella); idéntico skip en CI (`38644689892`: 2 skipped). No es regresión.
- **CI verde:** pendiente del push del CTO (mis cambios siguen sin commitear, como exige el encargo). Con R6+R7 locales en verde, el paso «API R2.3» ya no tiene causas abiertas conocidas: B5 (42701) y contracts (42703) quedan corregidos y la 027 pasó en `38644689892`.

## 6. Cierre R7

- Verde en local con conteos reales en los tres niveles exigidos (spec ×2 slugs, integración entera, unitaria `--force`).
- Archivos del bloque: el spec de contracts; este informe. R6 intacto.
- Tras el push del CTO, verificar en CI los PASS de `b5-identity-conversion.postgres.integration.spec.ts` y `027_media_usage_privacy_evidence.integration.spec.ts` en la misma corrida antes de declarar G6.5.
