# INFORME-MOD13 — Corrección de migraciones 163 y 164

**Versión:** 1.0 · **Estado:** Cerrado en código y aplicado a los tenants `ACTIVE` · **Fecha:** 2026-10-23
**Fuentes:** [HLD MOD13 v1.1](../hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md) §12 · [plan de ejecución](../plans/2026-10-22-mod13-aprovisionamiento.md) · [encargo B-mig](../prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md)

## Resultado

La migración 163 amplía `chk_execution_order_template_requirements_kind` antes de insertar `PROVISIONING` y publica una copia de la última versión publicada de `INSTALACION_ESTANDAR`, con el requisito añadido. La migración 164 repite esa garantía para tenants donde 163 ya aparece aplicada pero la versión publicada aún no incluye el requisito. Ambas son idempotentes cuando la última versión publicada ya contiene `PROVISIONING`.

Los `down()` eliminan solo la versión atribuible a su migración, bloquean la reversión si una orden la referencia y restauran el CHECK original cuando ya no quedan requisitos `PROVISIONING`. Se conserva la v3 heredada y no se actualizan snapshots de órdenes.

## Evidencia

La integración creó un schema aleatorio de prueba y una fila tenant `INACTIVE`, y aplicó directamente las migraciones tenant reales del array hasta la 162. No invocó el runner de tenants ni modificó filas de `typeorm_migrations`. Los casos verificaron:

1. Desde v2, 163 publica v3 con un único requisito `PROVISIONING`; 164 no genera otra versión y el `down()` de 163 restaura v2 y el CHECK original.
2. Desde una v3 heredada sin el requisito, 164 publica v4; su `down()` conserva v3 y restaura el CHECK original.
3. La segunda aplicación de 164 no duplica la versión ni el requisito.

| Paquete | Verificación / comando desde `packages/database/` | Suites | Tests | Resultado | Fecha y hora (COT) |
| --- | --- | ---: | ---: | --- | --- |
| `@iwana/db` | Jest sin caché, specs 163, 164 y `migration-order.spec.ts` | 3 | 10 | 10 aprobados | 2026-10-23 06:05 |
| `@iwana/db` | Jest sin caché, integración 163/164 contra PostgreSQL real con migraciones 000–162 | 1 | 3 | 3 aprobados | 2026-10-23 06:05 |
| `@iwana/db` | ESLint sobre los archivos modificados | — | — | código de salida 0 | 2026-10-23 06:05 |
| `@iwana/db` | TypeScript `tsconfig.typecheck.json` | — | — | código de salida 0 | 2026-10-23 06:05 |

Comandos de Jest: `node ../../node_modules/jest/bin/jest.js --no-cache --runInBand` con las tres specs unitarias; para la integración se añadió `--config jest.integration.config.js src/migrations/tenant/163_publish_instalacion_estandar_v3.integration.spec.ts`. El cache de Jest se dirigió fuera del repositorio.

Los tests se ejecutaron con el cache de Jest dirigido fuera del repositorio. La suite PostgreSQL no quedó omitida.

## Aplicación operativa

El 2026-10-23 el CTO ejecutó el segundo `pnpm db:migrate:all`: código de salida 0, con `db:apply-least-privilege` en OK. La verificación en solo lectura sobre los 6 tenants `ACTIVE` confirmó, en cada uno, que 163 y 164 figuran en `typeorm_migrations`, que la última versión publicada de `INSTALACION_ESTANDAR` contiene exactamente un requisito `PROVISIONING` (v3; en `tenant_iwana`, v4 publicada por la 164), que la restricción de tipos está ampliada y que `iwana_app` conserva privilegios sobre las tablas nuevas. No se borraron filas de `typeorm_migrations` ni se modificaron tenants fuera de los `ACTIVE` recorridos por el runner.
