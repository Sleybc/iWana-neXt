# PROMPT — Transversal · Hermeticidad de las pruebas PostgreSQL

**Versión:** 1.0
**Estado:** Listo para lanzar
**Fecha:** 2026-11-03
**Emitido por:** AI-EM-ARCH
**Plantilla base:** [`TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)
**Spec:** [`docs/specs/2026-11-03-transversal-hermeticidad-pruebas-pg-spec.md`](../specs/2026-11-03-transversal-hermeticidad-pruebas-pg-spec.md) v1.0
**Plan:** [`docs/plans/2026-11-03-hermeticidad-pruebas-y-g7-privacy-orquestacion.md`](../plans/2026-11-03-hermeticidad-pruebas-y-g7-privacy-orquestacion.md)

## Reglas comunes

- Leer antes `AGENTS.md`, la spec completa y las skills de tu fila del plan.
- `main`, sin ramas, sin stash ni commit. Solo pruebas y fixtures: **nunca código de producto**.
- No cambiar aserciones existentes. Si una tiene que cambiar, `[BLOQUEO]` y consultar.
- Nunca escribir en `tenant_iwana`. Las corridas usan una base `iwana_it_*` nueva (procedimiento §H2 del [informe de consolidación del clúster](../informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md)) y, para CA-H-01, también `dbiw`.
- Integraciones con `IWANA_DB_INTEGRATION_AVAILABLE=true`; una suite omitida no declarada es un fallo. Conteo real sin caché.

## T1 · `sr-qa` · Suites que clonan tablas (D-H-1)

Rutas: las 3 suites H1 de la spec.

1. Sustituir los `LIKE … INCLUDING ALL` por un esquema y un tenant propios, creados con `applyTenantMigrationsInOrder` y limpiados en `afterAll`, como en `contract-plan-change.postgres.integration.spec.ts`.
2. CA-H-01: misma corrida en `iwana_it_*` y en `dbiw`, con resultados idénticos.

## T2 · `sr-qa` · `second-schema` al job de integración (D-H-2)

Rutas: `apps/api/src/modules/tenant/tenant-migrations-second-schema.spec.ts` (se renombra) y su fixture.

1. Renombrar a `tenant-migrations-second-schema.postgres.integration.spec.ts` y quitar la guarda `TENANT_MIGRATIONS_REAL_DB`.
2. Que el fixture cree en `public.tenants` (y en lo que lea la 092, `092_…:93`) la fila canónica de cada esquema desechable antes de migrar, y que la limpie después.
3. CA-H-02: 7/7 en el job de integración.

## T3 · `sr-qa` · Suites EV1 (D-H-3)

Rutas: las 3 suites EV1.

1. Clasificar cada una: ¿necesita solo el esquema o depende de datos de `tenant_iwana`? Entregar la tabla antes de convertir.
2. Las que solo necesitan el esquema se convierten como en T1 y pasan al job de integración (con su nombre `*.postgres.integration.spec.ts`).
3. Las que dependen de datos compartidos quedan con `[BLOQUEO]` y su causa, sin convertir.

## T4 · `sr-qa` · Guarda de arquitectura e inventario (D-H-4 y D-H-5)

1. Prueba de arquitectura en `apps/api` (junto a las `*.arch.spec.ts` existentes): falla si un `*.spec.ts` usa `INCLUDING ALL` o nombra `tenant_iwana` fuera de una guarda que lo rechace. CA-H-04: debe fallar con un caso sembrado de cada patrón y pasar sobre el árbol corregido.
2. Inventario D-H-5 de las suites con `E2E_TENANT_SLUG`: por cada una, si escribe en el tenant compartido, con `archivo:línea`. Se entrega como tabla en el informe; no se convierte nada.

## T-R · `sr-qa` · Remediación tras la Ola 1 (añadido el 2026-11-03, spec v1.1)

**Cerrado, no re-despachar:** T1 (30/30 en las dos bases), T3 (las 3 suites EV1 solo necesitan el esquema; 8/8) y el inventario D-H-5.

1. **T2 (D-H-6):** añadir `EXECUTION_ORDER_REVERSAL` a `EXPECTED_ENUMS.stock_movement_origin` (`tenant-migrations-second-schema.postgres.integration.spec.ts`), en el orden que devuelve `pg_enum`, citando la 141 en un comentario. Ninguna otra expectativa. Objetivo: 7/7.
2. **T4 (D-H-4 v1.1):** acotar la prueba de arquitectura a las pruebas que abren una conexión real. `subscriber-pipeline-listeners.spec.ts` no se toca. Los cinco casos sembrados siguen fallando como deben, y uno nuevo comprueba que un mock con el texto `'tenant_iwana'` **no** activa la regla.
3. **`network-execution-event.wiring` (42501 en `:521` y `:571`):** en CI pasa (no figura en `integration-expected-skips.json` y la corrida de `c25af7dc` terminó en verde). El fallo parece de permisos de la base local. Reproducir el aprovisionamiento del job de integración de `ci.yml` **paso por paso**, roles y grants incluidos, en una base `iwana_it_*` nueva, y correr la suite ahí.
   - Si pasa: se clasifica como entorno, con la diferencia exacta de grants.
   - Si falla: `[BLOQUEO]` con el objeto y el privilegio que faltan.
   
   No se cambia el fixture.

Después, `test-change-reviewer` revisa T-R.1 y T-R.2, y `gate-verifier` repite CA-H-05 en la base aprovisionada como CI.

## T5 · Verificación (tras T1 a T4)

| Agente | Encargo |
| --- | --- |
| `test-change-reviewer` | CA-H-06: ninguna aserción cambió, suite por suite |
| `gate-verifier` | CA-H-05: suite unitaria y de integración completas de `@iwana/api` sin caché; conteo de omitidas antes y después; `integration-expected-skips.json` sin crecer |

**Informe:** `docs/informes/INFORME-TRANSVERSAL-HERMETICIDAD-PG-v1.0.md` (comprobar antes que la ruta esté libre), con las tablas de T3 y T4 y los conteos.
