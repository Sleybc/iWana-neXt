# Spec — Transversal · Hermeticidad de las pruebas PostgreSQL

**Versión:** 1.1
**Cambio v1.0 → v1.1 (2026-11-03, tras la Ola 1):** D-H-4 se limita a las pruebas que abren una conexión real. Un mock que lleva `'tenant_iwana'` como texto (`subscriber-pipeline-listeners.spec.ts:51`) no escribe en ninguna base. Se añade D-H-6: las expectativas que se pudrieron mientras la suite estaba deshabilitada se actualizan como categoría (b), citando la migración que las motiva.
**Estado:** Aprobada por el usuario el 2026-11-03 («Deudas transversales de pruebas: soluciona»)
**Fecha:** 2026-11-03
**Autor:** AI-EM-ARCH
**Origen:** [cierre de O-1](../informes/INFORME-PRIVACY-O1-RETENCION-CIERRE-v1.0.md) §6. Ahí quedaron dos deudas: tres suites PG que clonan tablas del tenant compartido (P2) y la suite `second-schema`, que falla frente a la migración 092 (P3). También salen de DT-3: los fixtures de DDL a mano se rompieron varias veces.
**Plan:** [2026-11-03-hermeticidad-pruebas-y-g7-privacy-orquestacion.md](../plans/2026-11-03-hermeticidad-pruebas-y-g7-privacy-orquestacion.md) · **Prompt:** [PROMPT-TRANSVERSAL-HERMETICIDAD-PG-v1.0](../prompts/PROMPT-TRANSVERSAL-HERMETICIDAD-PG-v1.0.md)

> Las rutas se leyeron en `main` (`c25af7dc`) el 2026-11-03.

## 1. Problema

Una prueba PG es hermética cuando crea su esquema con la cadena de migraciones (`applyTenantMigrationsInOrder`), trabaja en un tenant propio y lo limpia al terminar. Así lo hacen ya 14 suites. Hay tres patrones que rompen esa regla:

| # | Patrón | Suites | Efecto observado |
| --- | --- | --- | --- |
| H1 | Copian tablas del tenant de `E2E_TENANT_SLUG` con `LIKE … INCLUDING ALL` | `cli/report-subscriber-phone-readiness.postgres…`, `crm/contracts/tests/contracts.service.postgres…`, `crm/subscribers/subscribers-update-audit.postgres…` | El resultado depende de que el tenant de origen esté migrado. En O-1, 22 casos fallaron porque `tenant_iwana` no tenía la 170 |
| H2 | Suite real de migraciones con guarda opcional `TENANT_MIGRATIONS_REAL_DB` en el job unitario | `tenant/tenant-migrations-second-schema.spec.ts` (`:101`, `:171`) | En CI nunca corre. A mano, 3 de 7 fallan porque el fixture no crea las filas canónicas que exige la 092 (`092_seed_execution_order_permissions.ts:93`) |
| H3 | Suites EV1 opcionales que apuntan a `tenant_iwana` | `inventory/tests/asset-loan.transactional.ev1.spec.ts`, `stock-reservations.transactional.ev1.spec.ts`, `useful-life-alerts.parity.ev1.spec.ts` | En CI nunca corren. Escribirían sobre el tenant principal de desarrollo |

## 2. Decisiones

- **D-H-1.** Las suites H1 pasan a esquema y tenant propios creados con la cadena migrada, con limpieza en `afterAll`. Es categoría (a): ninguna aserción cambia. El patrón ya probado está en `contract-plan-change`, `responsibilities` y `subscriber-lifecycle`.
- **D-H-2.** `second-schema` pasa al job de integración: se renombra a `*.postgres.integration.spec.ts`, se quita la guarda opcional y el fixture crea las filas de `public.tenants` (y lo que la 092 lea) para cada esquema desechable antes de migrar. Así deja de ser una omisión permanente del job unitario.
- **D-H-3.** Cada suite EV1 se clasifica antes de tocarla:
  - si solo necesita el esquema, se lleva al job de integración con un tenant propio, como en D-H-1;
  - si depende de datos compartidos de `tenant_iwana`, se para con `[BLOQUEO]` y la causa, y la decisión vuelve a AI-EM-ARCH.
  
  Ninguna prueba puede escribir en `tenant_iwana`.
- **D-H-4 (v1.1).** El alcance son los `*.postgres.integration.spec.ts` y cualquier `*.spec.ts` que abra un `DataSource`, un `Pool` o un `QueryRunner` reales. Los mocks quedan fuera. Una prueba de arquitectura en `apps/api` falla si una de esas pruebas:
  - usa `INCLUDING ALL` para clonar tablas de otro esquema; o
  - nombra `tenant_iwana` fuera de una guarda que lo rechace.
  
  Evita que el patrón vuelva.
- **D-H-6 (v1.1).** `second-schema` estuvo deshabilitada en CI, y su lista `EXPECTED_ENUMS` no incluye `EXECUTION_ORDER_REVERSAL` en `stock_movement_origin`, que añade la migración 141 (`ADD VALUE 'EXECUTION_ORDER_REVERSAL'`, `141_…spec.ts:16`). Se actualiza como categoría (b), citando la 141, con el orden exacto que devuelve `pg_enum` tras la cadena. Es la única expectativa autorizada; si aparecen más, `[BLOQUEO]`.
- **D-H-5.** Las otras suites que leen `E2E_TENANT_SLUG` (14 en total, contando las de H1) se inventarían: cuáles escriben en el tenant compartido y cuáles solo lo resuelven. No se convierten en esta fase: el inventario es la entrada de la siguiente.

## 3. Criterios de aceptación

| # | Criterio |
| --- | --- |
| CA-H-01 | Las 3 suites H1 corren en verde contra una base `iwana_it_*` recién creada y también contra `dbiw`, **sin que su resultado dependa** del estado de `tenant_iwana`. La prueba: correrlas con la 171 aplicada y con un tenant de origen en una versión anterior, y obtener el mismo resultado |
| CA-H-02 | `second-schema` corre en el job de integración, 7/7, sin guarda opcional |
| CA-H-03 | Cada suite EV1 está convertida (y en verde) o tiene su `[BLOQUEO]` documentado con la causa |
| CA-H-04 | La prueba de arquitectura de D-H-4 pasa sobre el árbol corregido y falla con un caso sembrado de cada patrón |
| CA-H-05 | El job unitario de `@iwana/api` baja de 4 suites omitidas a 0, o al número de suites EV1 bloqueadas, con su causa. `integration-expected-skips.json` no crece |
| CA-H-06 | No cambia ninguna aserción existente. `test-change-reviewer` lo confirma suite por suite |
| CA-H-07 | El CI de `main` termina en verde sobre el SHA publicado, con todos sus pasos ejecutados (G6.5) |

## 4. Fuera de alcance

Convertir las suites del inventario D-H-5 (va en la fase siguiente) y cambiar `ci.yml`, salvo lo necesario para que el job de integración descubra la suite renombrada, si no la descubre ya por su patrón.
