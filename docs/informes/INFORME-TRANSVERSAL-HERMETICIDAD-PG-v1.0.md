# INFORME — Transversal · Hermeticidad de pruebas PG y runbook G7 de privacidad

**Versión:** 1.0
**Fecha:** 2026-11-03
**Autor:** AI-EM-ARCH
**Estado:** **G6 en GO.** G6.5 queda pendiente del commit y el push.
**Spec:** [2026-11-03-transversal-hermeticidad-pruebas-pg-spec.md](../specs/2026-11-03-transversal-hermeticidad-pruebas-pg-spec.md) v1.1 · **Plan:** [orquestación](../plans/2026-11-03-hermeticidad-pruebas-y-g7-privacy-orquestacion.md) · **Prompts:** [hermeticidad](../prompts/PROMPT-TRANSVERSAL-HERMETICIDAD-PG-v1.0.md) (T1 a T5 y T-R) · [runbook G7](../prompts/PROMPT-PRIVACY-G7-RUNBOOK-DELTA-v1.0.md) · lanzadores v1.0 y v1.1

## 1. Resultado

| Frente | Resultado |
| --- | --- |
| **Tenant `tenant_e2e_mod13_f1_41398e`** | Borrado el 2026-11-03 por orden del usuario. El esquema ya no existía. La fila de `public.tenants` se eliminó con los mismos eventos de auditoría que el job de purga (`TENANT_PURGE_STARTED`/`COMPLETED`, `request_id = manual:tenant-schema-purge`) |
| **H1 · suites que clonaban tablas** | 3 suites (`report-subscriber-phone-readiness`, `contracts.service`, `subscribers-update-audit`) con esquema propio por la cadena migrada. 30/30, con resultados idénticos en una base `iwana_it_*` y en `dbiw` |
| **H2 · `second-schema`** | Pasa al job de integración como `tenant-migrations-second-schema.postgres.integration.spec.ts`, sin guarda opcional. El fixture crea las filas canónicas que pide la 092. 7/7 |
| **H3 · suites EV1** | Las 3 solo necesitaban el esquema. Pasan al job de integración como `*.postgres.integration.spec.ts`, con fixtures sintéticos propios. 8/8, sin tocar `tenant_iwana` |
| **D-H-4 · guarda de arquitectura** | `tenant/tests/postgres-integration-hermeticity.arch.spec.ts`. Cubre las pruebas que abren una conexión real (incluidos imports con alias, `DataSource`, `Pool`, `Client` y `QueryRunner`) y falla con `INCLUDING ALL` o con `tenant_iwana` fuera de una guarda. 8/8, incluidos los casos sembrados; un mock con el texto no activa la regla |
| **D-H-6 · expectativa vencida** | `EXECUTION_ORDER_REVERSAL` (migración 141) añadido al final de `EXPECTED_ENUMS.stock_movement_origin`, en el orden de `pg_enum`. Categoría (b) |
| **G · runbook G7** | `RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT` en la versión 1.2. Añade las migraciones de privacidad hasta la 171, con triggers y el conteo de backfill de la 170 como evidencia; las comprobaciones de humo en solo lectura; la parada si se cae en la clave MFA; la supresión por la aplicación, con el procedimiento manual como emergencia; y los dictámenes como condición de la ventana. `sec-eng` no encontró hallazgos P0 a P3 ni PII; `docs-governance`, sin hallazgos. **No ejecuta G7:** no hay producción (ADR-095) |

## 2. Gate (CA-H-05, base aprovisionada como CI)

| Gate | Resultado |
| --- | --- |
| Unitarias de API | 446/446 suites y 5.997/5.997 pruebas, **0 omitidas** (antes eran 4). Turbo, 0 en caché |
| Integraciones de API | 60 suites: 56 pasan y 4 omitidas; 374 pruebas: 354 pasan y 20 omitidas; 0 fallidas. Las omisiones coinciden exactamente con `integration-expected-skips.json`, que no creció |
| Lint y typecheck de API | 0 errores; 7 advertencias preexistentes |
| `test-change-reviewer` | Sin hallazgos C. La única aserción tocada es la de D-H-6 |

**El 42501 de `network-execution-event.wiring` era de entorno.** En una réplica del aprovisionamiento del job de integración de `ci.yml` (contenedor `postgres:18-alpine` aislado, roles sintéticos, grants de mínimo privilegio antes y después de migrar) pasó 8/8 sin tocar producto ni fixture. La base local anterior tenía tres diferencias:
- `iwana_app` sin `CREATE`;
- 0 de los 6 privilegios por defecto de `iwana_migrator`;
- 2 de los 22 grants directos sobre las tablas públicas.

## 3. Pendiente

| Tema | Dueño | Prioridad |
| --- | --- | --- |
| Commit, push y G6.5 | Usuario y AI-EM-ARCH | Ahora |
| 11 suites que escriben en el tenant de `E2E_TENANT_SLUG` (inventario D-H-5; todas de órdenes de ejecución, WFM, inventario y RUT de CRM) | Fase siguiente de hermeticidad | P2 |
| Las bases locales creadas a mano no tienen los grants de mínimo privilegio de CI. Conviene un script de aprovisionamiento `iwana_it_*` idéntico al de CI | `plat-ops` | P3 |
| Contenedor `iwana-pg-tr-20261103-8d32` y bases `iwana_it_*` de esta ola | El usuario decide si se borran | — |
| Dictámenes jurídicos (ADR-094 §7.3 y Ley 2573) | Siguiente, por orden del usuario | — |
