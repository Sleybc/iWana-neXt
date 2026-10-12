# Informe — MOD05 Suscriptores · Remediación B5

**Versión:** 1.0  
**Fecha:** 2026-10-12  
**Estado:** Implementado; pruebas unitarias e integración PostgreSQL en verde.  
**Responsable:** `sr-backend`  
**Contratos:** C-PORT-1 v1.0 y C-NORM-1 v1.1 de `PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.1.md` §2

## Entregables

| Ruta | Resultado |
| --- | --- |
| `apps/api/src/modules/parties/adapters/party-write.adapter.ts` | Implementa C-PORT-1 sobre el manager transaccional del llamante: normaliza por C-NORM-1, cifra el documento y contactos, calcula HMAC, serializa resolución por identidad y reutiliza Party/rol existentes. |
| `apps/api/src/modules/parties/party-pii.util.ts` | Centraliza cifrado, descifrado, HMAC de documento/contacto y el valor vacío temporal para `party_contact.value NOT NULL`. |
| `apps/api/src/modules/parties/services/party.service.ts` | `create`, `findByDocument` y actualizaciones de documento resuelven unicidad por HMAC; los lectores descifran documento y contactos. |
| `apps/api/src/modules/parties/adapters/party-read.adapter.ts`, `apps/api/src/modules/parties/services/party-contact.service.ts` | Consultan identidad por HMAC; leen contactos desde `value_encrypted`; los escritores guardan solo cifrado/HMAC y mantienen vacío el campo legado obligatorio. |
| `packages/shared/src/utils/normalize-document-number.ts` | C-NORM-1 v1.1: RUT usa solo dígitos y OTHER usa alfanuméricos en mayúsculas, sin separadores. |
| `apps/api/src/common/crypto/nit-verification-digit.util.ts` | Calcula y valida el DV módulo 11 del NIT; acepta el DV del expediente y lo propaga a Party y Subscriber. |
| `apps/api/src/modules/crm/subscribers/subscribers.service.ts`, `apps/api/src/modules/crm/subscribers/subscriber-creation.service.ts` | Alta manual y conversión usan solo `IPartyWritePort`; Party y Subscriber se escriben en una misma transacción. Las conversiones duplicadas por expediente retornan el Subscriber existente. WhatsApp se persiste encriptado/HMAC y se descifra al leer. |
| `apps/api/src/modules/crm/subscribers/subscriber-status-transition.service.ts` | Permite únicamente la restauración protegida `CANCELLED → PROSPECT` del mismo expediente, con auditoría de motivo fijo `EXPEDIENTE_REACTIVATED`; conserva CANCELLED terminal para transiciones generales. |
| `apps/api/src/modules/crm/expedientes/expediente.service.ts`, `apps/api/src/modules/crm/expedientes/expedientes.controller.ts`, `apps/api/src/modules/crm/expedientes/entities/crm-conversion-failure.entity.ts`, `apps/api/src/modules/crm/expedientes/expedientes.module.ts` | Persiste fallos de emisión con códigos estables, re-emite el evento del estado restaurado y expone reintento administrativo idempotente con `CRM_SUBSCRIBERS_MANAGE`. No serializa excepciones en errores ni logs. |
| `apps/api/src/modules/crm/subscribers/b5-identity-conversion.postgres.integration.spec.ts` | Integra contra PostgreSQL real dedupe HMAC, conversión concurrente, reactivación, fallo/reintento, cifrado/HMAC de contactos y WhatsApp. |
| `apps/api/src/common/crypto/nit-verification-digit.util.spec.ts`, tests de Parties/CRM e inventario | Añaden cobertura de normalización, DV, cifrado/HMAC y compatibilidad de los consumidores de Parties. |

## Evidencia

Los conteos son los impresos por Jest. PostgreSQL estaba disponible en `127.0.0.1:5433/dbiw`. La suite B5 tomó `iwana` como schema fuente, creó un schema `tenant_b5_<uuid>` para sus datos y lo eliminó al finalizar; no aplicó la migración ni escribió sobre el tenant de desarrollo.

| Verificación | Resultado real |
| --- | --- |
| `pnpm --filter @iwana/api test -- --force` | 328 suites aprobadas, 4.192 tests aprobados; 4 suites y 15 tests omitidos. Exit code 0, sin caché. |
| `E2E_TENANT_SLUG=iwana pnpm --filter @iwana/api test:integration -- --runInBand --runTestsByPath src/modules/crm/subscribers/b5-identity-conversion.postgres.integration.spec.ts` | 1 suite y 5 tests aprobados contra PostgreSQL real. Incluye `PartyService.create/findByDocument`, igualdad de documentos con distinto formato, dos conversiones simultáneas, restauración hasta `ACTIVE`, fallo durable y reintento, y comprobación de persistencia cifrada/HMAC en contactos y WhatsApp. |
| `pnpm --filter @iwana/shared exec jest --runInBand --runTestsByPath src/utils/normalize-document-number.spec.ts` | 1 suite y 10 tests aprobados; incluye RUT, OTHER y fallo cerrado para valores fuera del enum. |
| Tests dirigidos de Parties/CRM/NIT | 7 suites y 133 tests aprobados. |
| Suites afectadas del consumidor MOD12 | 3 suites y 31 tests aprobados; el store de prueba ahora representa el esquema HMAC/cifrado. |
| `pnpm --filter @iwana/api typecheck` | Exit code 0. |
| ESLint sobre los archivos API modificados por B5 | Exit code 0. |

En el escenario concurrente PostgreSQL ejerció `uq_subscribers_expediente` (SQLSTATE `23505`); el servicio capturó la violación y ambas llamadas devolvieron el mismo Subscriber. El log seguro de TypeORM retuvo solo el tipo de operación y SQLSTATE.

La ruta de reactivación también muestra una advertencia deprecada de `pg@8.20.0`, originada en el `RelationIdLoader` de TypeORM al leer el expediente. La suite concluyó correctamente; B5 no modifica ese cargador.

## `[BLOQUEO]` parcial — E-3

E-3 no está decidido. Se conservaron los placeholders existentes durante la conversión y no se relajó `NOT NULL` en `party_contact.value`. Los escritores nuevos dejan `value=''` y guardan el dato encriptado/HMAC; la retirada física de columnas legadas queda para una migración posterior, después del backfill por tenant.

## Deuda por severidad

| Severidad | Deuda / condición |
| --- | --- |
| Crítica | Ninguna introducida por B5. |
| Alta | Precondición de release: aplicar C-DDL-1, ejecutar `backfill:party-pii -- --tenant=<tenant> --apply` en cada tenant y resolver antes los candidatos/fallos del CLI; después activar B5 dentro del mismo release que migración 143. Sin HMAC en las filas legadas, las búsquedas de B5 no pueden encontrar esas identidades. En esta tarea no se ejecutó `--apply` ni se modificó el tenant de desarrollo. |
| Media | E-3 continúa bloqueando la eliminación del placeholder y el cambio de nulabilidad de `party_contact.value`; las columnas legadas se mantienen durante la expansión. |
| Baja (observación preexistente) | `pg@8.20.0` avisa sobre consultas concurrentes disparadas por el cargador de relation IDs de TypeORM 0.3.31 durante la lectura para reactivar. No falla el flujo y no deriva de cambios B5. |

