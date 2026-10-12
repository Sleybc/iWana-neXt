# Informe — MOD05 Suscriptores · Remediación B1

**Versión:** 1.0
**Fecha:** 2026-10-12
**Estado:** Implementado en `main`; migración y backfill integrados verificados contra PostgreSQL real.
**Responsable:** `data-eng`
**Contrato:** C-DDL-1 y C-NORM-1 de `PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.0.md` §2

## Entregables

| Ruta | Resultado |
| --- | --- |
| `packages/database/src/migrations/tenant/143_subscriber_party_pii_hmac.ts` | Migración tenant reversible: columnas HMAC/cifradas, unicidad por expediente con preflight de duplicados, tabla `crm_conversion_failures`, índice trigram y retiro/restauración de índices sobre columnas cifradas. |
| `packages/database/src/migrations/tenant/runner.ts` | Registro de migración 143 en el orden tenant. |
| `packages/database/src/migrations/tenant/143_subscriber_party_pii_hmac.integration.spec.ts` | Prueba integrada PostgreSQL real de `up/down/up` con datos y abortado de duplicados antes de cualquier DDL. |
| `apps/api/src/cli/backfill-party-pii.ts` | CLI tenant-aware por UUID/slug de tenant ACTIVE; dry-run predeterminado, `--apply` explícito, cifra/HMAC idempotente y reporte de candidatos sin fusión. |
| `apps/api/src/cli/backfill-party-pii.postgres.integration.spec.ts` | Prueba integrada PostgreSQL real de dry-run sin escrituras y con candidatos a fusión. |
| `apps/api/package.json` | Comando `backfill:party-pii`. |
| `apps/api/src/modules/parties/entities/party.entity.ts` | Mapeo de `document_number_hmac` e índice único HMAC. |
| `apps/api/src/modules/parties/entities/party-contact.entity.ts` | Mapeo de `value_encrypted` y `value_hmac`. |
| `apps/api/src/modules/crm/subscribers/entities/subscriber.entity.ts` | Mapeo de WhatsApp cifrado/HMAC y retiro de metadatos de los dos índices de columnas cifradas. |
| `packages/shared/src/utils/normalize-document-number.ts` | Implementación compartida de C-NORM-1, exportada desde `@iwana/shared`. |
| `packages/shared/src/utils/normalize-document-number.spec.ts` | Cobertura unitaria de tipos numéricos, pasaporte/PEP/PTP y tipo no soportado. |

## Evidencia

Los tests reportados se ejecutaron sobre PostgreSQL alcanzable en `127.0.0.1:5433/dbiw`; los conteos son los impresos por Jest.

| Verificación | Resultado real |
| --- | --- |
| `pnpm --filter @iwana/shared test -- --runInBand` | 11 suites, 133 tests aprobados. |
| `pnpm --filter @iwana/db test:integration -- --runTestsByPath src/migrations/tenant/143_subscriber_party_pii_hmac.integration.spec.ts` | 1 suite, 2 tests aprobados. Ejecutó `up/down/up` con filas sembradas; verificó preservación de datos, índices/columnas y reporte de duplicados antes del DDL. |
| `pnpm --filter @iwana/api test:integration -- --runTestsByPath src/cli/backfill-party-pii.postgres.integration.spec.ts` | 1 suite, 1 test aprobado. Encontró candidatos a fusión y confirmó que dry-run no cambió documento, HMAC ni columnas de contacto. |
| `pnpm --filter @iwana/shared typecheck`, `pnpm --filter @iwana/db typecheck`, `pnpm --filter @iwana/api typecheck` | Los tres finalizaron con código 0. |
| `pnpm --filter @iwana/shared build`, `pnpm --filter @iwana/db build`, `pnpm --filter @iwana/api build` | Los tres finalizaron con código 0. |

Dry-run del seed de desarrollo:

```text
Comando: pnpm --filter @iwana/api backfill:party-pii -- --tenant=iwana --dry-run
Tenant: iwana (tenant ACTIVE)
Modo: dry-run; applied=false
Parties: 7 vistas, 7 HMAC pendientes, 4 cifrados pendientes
Party contacts: 8 vistas, 8 HMAC pendientes, 8 cifrados pendientes
WhatsApp: 0 vistas
NODATA: 0
Candidatos a fusión: 0
Fallos: 0
Resultado: sin escrituras
```

El seed aún no tiene aplicadas las columnas nuevas; el dry-run soporta este estado previo y lee solo las columnas legadas. `--apply` exige C-DDL-1 aplicada. La prueba PostgreSQL separada ejerce el CLI con el esquema expandido.

## Deuda nueva por severidad

| Severidad | Deuda |
| --- | --- |
| Crítica | Ninguna introducida. |
| Alta | La aplicación del backfill en tenants con candidatos de Party queda bloqueada hasta resolución manual; el CLI no fusiona identidades y no escribe parcialmente. El seed `iwana` no presenta candidatos. |
| Media | Se conservan `party_contact.value` y `subscribers.whatsapp` legados durante la expansión. El corte de lectores/escritores y la retirada posterior del dato en claro corresponden a trabajo posterior, fuera de B1. |
| Media | `DocumentTypeParty` también incluye `RUT` y `OTHER`, pero C-NORM-1 no define su normalización. La implementación falla de forma cerrada y reporta esos registros; el seed `iwana` no produjo fallos. El backfill de un tenant que los contenga queda bloqueado hasta resolver esos tipos, sin alterar este contrato congelado. |

La migración no se aplicó al tenant de desarrollo y el dry-run no escribió datos. El test integrado creó y eliminó schemas efímeros propios.
