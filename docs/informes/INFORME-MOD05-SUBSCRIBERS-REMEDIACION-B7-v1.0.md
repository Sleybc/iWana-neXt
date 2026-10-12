# Informe — MOD05 Suscriptores · Revisión de seguridad B7

**Versión:** 1.0  
**Fecha:** 2026-10-12  
**Responsable:** `sec-eng`  
**Alcance revisado:** B1 (`59e425eea8dd01426f7acc3f70754a71ef799cca`) y cambios locales B2, B3, B5 y B9.  
**Contratos:** C-API-1 v1.1, C-API-2 v1.2 y C-PORT-1 v1.0.  
**Veredicto global:** **NO-GO** hasta resolver el hallazgo alto bloqueante de selección de Parties `MERGED`. Para producción también se debe satisfacer el gate G7 de migración y backfill por tenant.

## Resumen ejecutivo

La búsqueda personal ya usa el cuerpo de `POST`, los listados aplican una proyección cerrada por rol y los cambios de `update` guardan en auditoría solo nombres de campos. La conversión usa `IPartyWritePort` dentro de la transacción del suscriptor; la unicidad por expediente y la guarda `activatedAt` están respaldadas por el código y por informes de pruebas previos.

Hay un fallo de identidad que impide GO: la resolución por documento HMAC en el adaptador de escritura no descarta Parties `MERGED`. Puede enlazar un nuevo suscriptor al registro fusionado, y el adaptador de lectura tampoco excluye Parties fusionadas o eliminadas. Además, el dry-run de desarrollo no aplicó el backfill; la migración por sí sola no cifra las filas históricas.

## Matriz de controles

| Control | Veredicto | Evidencia y fundamento |
| --- | --- | --- |
| SUB-C01 — documento de Party cifrado y deduplicación por HMAC | **NO-GO** | Las escrituras nuevas cifran el documento y lo resuelven por HMAC (`apps/api/src/modules/parties/adapters/party-write.adapter.ts:47-60`; `apps/api/src/modules/parties/services/party.service.ts:69-95`). Sin embargo, el adaptador omite `status <> MERGED`, a diferencia del servicio y del índice (`party-write.adapter.ts:47-53`; `party.service.ts:69-75`; `apps/api/src/modules/parties/entities/party.entity.ts:22-24`). Ver B7-01. Las filas legadas siguen pendientes de backfill; ver B7-02. |
| SUB-C02 — PII fuera de URL y query string | **GO** | `GET /search` está retirado con 404 (`apps/api/src/modules/crm/subscribers/subscribers.controller.ts:174-187`). `POST /search` toma criterios personales del cuerpo y sus `@Query` solo declaran filtros/paginación no personales (`subscribers.controller.ts:192-256`). El escape literal de `\\`, `%` y `_` se aplica antes de una consulta ILIKE parametrizada (`apps/api/src/modules/crm/subscribers/subscribers.service.ts:112-114,380-386`). El portal envía `search` en el body y construye query solo con filtros no personales (`apps/portal/src/lib/api-client.ts:6413-6450,6460-6468`). Los tests HTTP verifican el 404 y que no haya campos personales en metadata `@Query` (`subscribers.controller.fase2.http.spec.ts:287-297,421-448`). |
| SUB-A01 — fallo de conversión persistido y reintentable | **GO** | La emisión fallida persiste `EVENT_EMIT_FAILED`, incrementa intentos y mantiene tiempos de fallo sin guardar el error original (`apps/api/src/modules/crm/expedientes/expediente.service.ts:2916-2950`). El retry se limita a fallos pendientes y reemite el evento (`expediente.service.ts:1206-1238`). El rastro del actor en los intentos fallidos se detalla como deuda media B7-04. |
| SUB-A02 — reactivación no restaura suscriptor previamente ACTIVE | **GO** | `reactivateFromExpediente` rechaza `activatedAt` no nulo y el UPDATE vuelve a exigir `activatedAt IS NULL` (`apps/api/src/modules/crm/subscribers/subscriber-status-transition.service.ts:196-213,225-235`). La integración B9 verifica rechazo y persistencia de `CANCELLED`/fecha (`b5-identity-conversion.postgres.integration.spec.ts:387-430`). |
| SUB-A03 — idempotencia de conversión por expediente | **GO** | La migración preflight aborta con reporte si ya hay más de un suscriptor activo por expediente y crea el índice parcial único `uq_subscribers_expediente` (`packages/database/src/migrations/tenant/143_subscriber_party_pii_hmac.ts:13-35,71-75`). La creación CRM ocurre en una transacción y solo traduce la violación de ese índice a la lectura del suscriptor existente (`apps/api/src/modules/crm/subscribers/subscribers.service.ts:273-318,1122-1126`). B5/B9 reportan prueba PostgreSQL real de concurrencia e idempotencia. |
| SUB-A04 — frontera `IPartyWritePort` y transacción | **GO** para la frontera; la identidad resultante queda **NO-GO** por B7-01 | `SubscribersService` llama al puerto inyectado y pasa el manager transaccional antes de guardar Subscriber (`apps/api/src/modules/crm/subscribers/subscribers.service.ts:273-311`). `runInTenantSchema` valida el schema, abre transacción, aplica `SET LOCAL search_path` y confirma o revierte (`packages/database/src/data-source.ts:197-220`). El puerto y la transacción cumplen; la selección de un Party `MERGED` no. |
| SUB-A05 — proyección de listado por finalidad y rol | **GO** | El allowlist ratificado restringe campos por rol y falla cerrado para rol no mapeado (`apps/api/src/modules/crm/subscribers/subscriber-projection.ts:4-17,29-59,87-104`). `vatTreatment` permanece en la base; `department` sigue la regla de `city`. GET y POST list/search limitan acceso a los cinco roles decididos (`subscribers.controller.ts:117-125,192-200`). La matriz HTTP cubre presencia/ausencia y 403 de TECHNICIAN/AUDITOR (`subscribers.controller.fase2.http.spec.ts:237-285,356-406`). |
| SUB-A08 — auditoría de cambios sin valores PII | **GO** para minimización; **NO-GO** para garantía de persistencia ante fallo | El update registra `changedFields` sin valores (`apps/api/src/modules/crm/subscribers/subscribers.service.ts:569-579`); el controlador evita el interceptor genérico con `@SkipAudit` (`subscribers.controller.ts:328-339`). `LIST_ACCESS` y `RECORD_ACCESS` se esperan y guardan marcador, rol, filtros no personales o ID de registro, nunca el body ni la fila (`subscribers.controller.ts:160-162,271-296,317-320,417-462`). La prueba PostgreSQL B2 consultó `audit_logs` tras PATCH y comprobó ausencia de NIT/dirección (`subscribers-update-audit.postgres.integration.spec.ts:210-239`). `AuditService.log` captura errores y solo advierte, por lo que la llamada awaited no garantiza durabilidad (`apps/api/src/modules/audit/audit.service.ts:54-102`); ver B7-04. |
| Tenancy en rutas evaluadas | **GO** en los flujos examinados | Las operaciones CRM y Party se ejecutan bajo `TenantContext` y `runInTenantSchema`; el nombre del schema se valida y el `search_path` es local a la transacción (`packages/database/src/data-source.ts:197-220`; `party-read.adapter.ts:53-57`). No observé una consulta de aplicación que cruce schemas. Los HMAC deterministas pueden revelar igualdad a un lector con acceso de base a varios schemas; la nota específica del placeholder está en B7-03. |

## Hallazgos

### B7-01 — Alta, bloqueante: las búsquedas Party no excluyen `MERGED`

**Veredicto: NO-GO para SUB-C01 y para asociar identidad canónica.**

`PartyWriteAdapter.ensurePartyWithRole` busca por `documentType`, HMAC y `deletedAt IS NULL`, pero no filtra el estado (`apps/api/src/modules/parties/adapters/party-write.adapter.ts:47-53`). Si coexiste el registro canónico con su antecedente fusionado, el resultado no está ordenado y puede reutilizar el Party fusionado al asignar el rol y crear el suscriptor. El índice único confirma que `MERGED` queda fuera de la unicidad activa (`apps/api/src/modules/parties/entities/party.entity.ts:22-24`). `PartyService.create` y `findByDocument` sí excluyen explícitamente `MERGED` y eliminados (`apps/api/src/modules/parties/services/party.service.ts:69-75,114-121`), lo que demuestra la diferencia de criterio.

El adaptador de lectura tiene un hueco paralelo: `findByDocument` consulta solo por tipo y HMAC, sin filtrar `deletedAt` ni `MERGED` (`apps/api/src/modules/parties/adapters/party-read.adapter.ts:49-57`). Su port de consumo incluye `apps/api/src/modules/inventory/ports/supplier-party.port.ts:134`.

**Impacto:** asociaciones y lecturas pueden resolver una identidad retirada en vez de la canónica, mezclar relaciones/roles y devolver datos de una entidad incorrecta. El test actual del adaptador de escritura comprueba la búsqueda por documento y soft-delete, pero no exige condición de estado no fusionado (`apps/api/src/modules/parties/adapters/party-write.adapter.spec.ts:105-111`).

**Acción para dueño:** excluir explícitamente `MERGED` y eliminados en todas las búsquedas por identidad de los adaptadores y añadir regresiones para Party fusionado y soft-deleted. No se realizó corrección en esta auditoría.

### B7-02 — Alta, gate de release: el backfill de desarrollo sigue en dry-run

**Veredicto: NO-GO de producción hasta completar G7 en cada tenant.**

La migración 143 añade columnas y estructura, pero no cifra ni calcula HMAC de las filas existentes (`packages/database/src/migrations/tenant/143_subscriber_party_pii_hmac.ts:6-9,38-48`). El informe B1 confirma que el seed `iwana` sigue sin escritura: 7 Parties tenían HMAC pendiente, 4 cifrado pendiente; 8 contactos tenían HMAC y cifrado pendientes; el CLI terminó con `applied=false` (`docs/informes/INFORME-MOD05-SUBSCRIBERS-REMEDIACION-B1-v1.0.md:39-52`).

El prompt v1.2 define como precondición de release: migrar, dry-run, resolver candidatos/fallos y ejecutar `--apply` en cada tenant antes de desplegar B5 (`docs/prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.2.md:66-68`). Es un gate operativo ya declarado, no un cambio de contrato. Sin él, permanece PII histórica en claro y las búsquedas HMAC nuevas no encuentran esas filas.

### B7-03 — Media: HMAC compartido del placeholder `0000000000`

**Veredicto: NO-GO para considerar ese HMAC identidad o contacto verificable; no bloquea por sí solo la separación lógica de tenants.**

Cuando el expediente no tiene teléfono, la conversión devuelve el literal `0000000000` (`apps/api/src/modules/crm/subscribers/subscriber-creation.service.ts:305-307`). El flujo de alta lo pasa como contacto de tipo PHONE al port Party (`apps/api/src/modules/crm/subscribers/subscribers.service.ts:278-279`). El adaptador cifra el valor, guarda el marcador legacy vacío y calcula `valueHmac` (`apps/api/src/modules/parties/adapters/party-write.adapter.ts:163-176`); `contactHmac` solo hace `trim()` al teléfono antes de HMAC-SHA-256 (`apps/api/src/modules/parties/party-pii.util.ts:38-43`). Por tanto, todos esos placeholders producen el mismo `party_contact.value_hmac`; si la clave es compartida por el servicio, la igualdad se observa también entre schemas de tenant por lectores con acceso directo a la base.

En el código examinado no hay lookup ni unicidad por `party_contact.value_hmac`: las lecturas y el upsert localizan por `partyId` y tipo, y el único índice único es para contacto primario por `(partyId,type)` (`apps/api/src/modules/parties/services/party-contact.service.ts:31-60`; `apps/api/src/modules/parties/entities/party-contact.entity.ts:19-24,44-45`). Así que no se fusionan Parties por el teléfono ficticio ni se confunden en el upsert de contactos. El riesgo concreto está en el HMAC de Subscriber: `phoneHash` se calcula para el valor suministrado (`apps/api/src/modules/crm/subscribers/subscribers.service.ts:217,1097-1099`) y la búsqueda exacta filtra por ese hash (`subscribers.service.ts:658-660`). Una búsqueda por `0000000000` puede devolver como coincidencias suscriptores sin teléfono real, hasta el límite de resultados. Es falso positivo y correlación de “sin contacto”, no prueba de identidad compartida.

**Acción para dueño E-3:** representar la ausencia como ausencia y excluir placeholders de búsqueda/dedupe antes de usar teléfono como identidad. E-3 está fuera de este alcance; el placeholder temporal sigue documentado como deuda media en B5.

### B7-04 — Media: fallos de auditoría no detienen ni quedan trazados de forma durable

**Veredicto: GO para contenido sin PII; NO-GO para garantía de registro durable de toda lectura/intento.**

`AuditService.log` captura errores de almacenamiento y retorna tras escribir un warning (`apps/api/src/modules/audit/audit.service.ts:88-102`). Por eso los `await` de `LIST_ACCESS` y `RECORD_ACCESS` ordenan la respuesta respecto a la llamada, pero no aseguran que exista fila si el sink falla. De forma similar, retry de conversión usa `@SkipAudit()` y no llama explícitamente a `AuditService`; si reintentar falla, incrementa `attempts`, pero no persiste el actor. El actor se guarda en `resolved_by` solo al resolver con éxito (`apps/api/src/modules/crm/expedientes/expedientes.controller.ts:297-306`; `expediente.service.ts:1206-1238,2951-2960`).

**Acción para dueño:** evaluar una señal durable para fallos del sink y registrar los intentos administrativos de retry sin PII. Es deuda de auditabilidad, distinta del requisito comprobado de no insertar valores personales en los registros exitosos.

## Evidencia de pruebas revisada

Esta revisión B7 fue de solo lectura; no ejecuté tests ni modifiqué fuentes. Los conteos que siguen se citan de los informes de bloque, no son una corrida propia de auditoría:

| Evidencia reportada | Resultado citado |
| --- | --- |
| B1 migración PostgreSQL real `up/down/up` y abortado por duplicados | 1 suite, 2 tests; informe B1 §Evidencia. |
| B1 CLI backfill PostgreSQL real en dry-run | 1 suite, 1 test; seed `iwana` sin escrituras; informe B1 §Evidencia. |
| B2 test HTTP/auditoría de update PostgreSQL real | 1 suite, 1 test; informe B2 v1.1 §Persistencia de auditoría. |
| B5/B9 integración de identidad con PostgreSQL real | B9 reporta 1 suite, 6 tests, incluido `activatedAt`; informe B9 §Evidencia. |
| Gate API reportado por B9 | 328 suites y 4.192 tests pasados; 4 suites y 15 tests omitidos; Turbo 0 cached. Informe B9 §Evidencia. |

Estos gates respaldan las propiedades cubiertas, pero no prueban el caso de Party `MERGED` señalado en B7-01, que requiere una regresión específica.

## Deuda por severidad

| Severidad | Deuda / condición |
| --- | --- |
| Crítica | Ninguna observada en los controles revisados. |
| Alta | **Bloqueante B7-01:** todas las resoluciones HMAC de Party deben excluir `MERGED` y eliminados. **Gate B7-02:** aplicar migración y backfill por tenant; cerrar candidatos y fallos antes de desplegar B5. |
| Media | **B7-03:** placeholder compartido no apto para identificar/contactar; puede producir falsos positivos en búsqueda exacta por teléfono. **B7-04:** auditoría fail-open y falta de actor en retries fallidos. |
| Baja | No se registran deudas nuevas de severidad baja en esta revisión. |

## Resultado final

B7 cierra la revisión documental y deja veredicto **NO-GO** hasta corregir B7-01 y verificar regresiones. El despliegue tiene además el gate operativo B7-02. No se cambió código, tests ni contratos; el informe es el único artefacto producido por esta sesión.
