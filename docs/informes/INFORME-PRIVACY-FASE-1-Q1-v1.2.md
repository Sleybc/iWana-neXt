# INFORME-PRIVACY-FASE-1-Q1-v1.2

**Fecha:** 2026-10-14  
**Bloque:** Q1Δ — adenda DDL A10, A12, A13 y A17  
**Estado:** migración tenant 146 implementada y comprobada en PostgreSQL real. Sin commit.

## Entrega

- A10: `data_subject_requests.transferred_to` ahora es `varchar(200)`, nombre de la entidad receptora.
- A12: `privacy_incidents.reported_at` es `date`; se añade `external_reference varchar(100)` y el CHECK de pareja. El trigger admite únicamente la primera actualización de ambos campos, sin alterar otros campos; bloquea cambios posteriores y `DELETE`.
- A13: el trigger congela `identity_verified_at`, `identity_verified_by`, `identity_verification_method` y `requester_evidence_media_id` después de fijar la verificación.
- A17: `disputed_contract_ids uuid[] NOT NULL DEFAULT '{}'` y los dos CHECK del contrato v1.2 para exigir identidad, Party y contratos impugnados en suplantaciones, y prohibirlos en los demás tipos.
- Se actualizaron los mappings TypeORM de solicitudes e incidentes. El backfill y las tablas de origen heredadas no cambiaron.

## Verificación

| Comando                                                                                                                                                                                                              | Evidencia real                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @iwana/db exec jest --runInBand --no-cache src/migrations/tenant/146_privacy_module.spec.ts src/migrations/tenant/147_seed_privacy_permissions.spec.ts src/migrations/tenant/migration-order.spec.ts` | **3 suites aprobadas; 11 tests aprobados.**                                                                                                                                 |
| `DB_HOST=127.0.0.1 DB_PORT=5433 DB_NAME=dbiw pnpm --filter @iwana/db exec jest --config jest.integration.config.js --runInBand src/migrations/tenant/146_privacy_module.integration.spec.ts`                         | PostgreSQL alcanzable en `127.0.0.1:5433/dbiw`; schema efímero limpiado. **1 suite aprobada; 6 tests aprobados.** Ejecutó `up/down/up`, y probó cada CHECK y trigger nuevo. |
| `pnpm --filter @iwana/db typecheck`                                                                                                                                                                                  | Pasa.                                                                                                                                                                       |
| `pnpm --filter @iwana/api typecheck`                                                                                                                                                                                 | La corrida intermedia falló mientras Q2/Q3 seguían en curso; quedó superada por el gate final de typecheck de abajo.                                                        |
| `pnpm exec turbo run typecheck --filter=@iwana/api --filter=@iwana/shared --force`                                                                                                                                   | **Q5 reporta 4/4 tareas, 0 cache, sin errores.** Q1 no ejecutó este comando. La evidencia final confirma resuelta la falla transitoria del árbol concurrente.               |

## Backfill de 146

Conteos observados en fixtures sintéticos del schema efímero. No representan datos de tenants existentes. Las cifras permanecieron iguales en las tres ejecuciones de `up` (inicial, repetición y después de `down`).

| Origen heredado        | Filas de origen | Resueltas | No resueltas |    Filas destino |
| ---------------------- | --------------: | --------: | -----------: | ---------------: |
| `consent_records`      |               2 |         1 |            1 | 2 autorizaciones |
| `habeas_data_consents` |               2 |         1 |            1 |   1 autorización |
| `arco_requests`        |               2 |         1 |            1 |    2 solicitudes |

Las tres tablas fuente conservaron sus dos filas tras `down`. El backfill no se alteró en esta adenda.

## Rutas y deuda

- La ruta del informe estaba libre al inicio (`Test-Path` devolvió `False`). Se trabajó únicamente en la migración 146, sus specs y `privacy/entities/**`; no se tocaron CRM ni rutas Q2/Q3. Los archivos ya eran parte del árbol sin commitear de la Ola 1 y se preservaron.
- **Resolución verificada — typecheck/API:** el fallo transitorio de la corrida aislada quedó resuelto; el gate final reportado por Q5 completó 4/4 tareas sin cache y sin errores.
- **P1 heredada — G6.5:** la integración de la migración pública 027 permanece diferida según el informe Q1 v1.1 y el encargo anterior; esta adenda no cambia esa condición.
- **P2 heredada — operación:** conciliar en despliegue los registros de origen no resueltos. Los conteos anteriores son solo fixtures.

**Resultado Q1Δ:** A10, A12, A13 y A17 pasan `up/down/up` y sus pruebas contra PostgreSQL real. No se hizo commit ni se ejecutó la Fase 04 de suscriptores.
