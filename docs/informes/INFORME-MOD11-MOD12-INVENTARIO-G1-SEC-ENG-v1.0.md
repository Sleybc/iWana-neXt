# Dictamen de seguridad — MOD11 ↔ MOD12, Ola G1

**Versión:** 1.0
**Estado:** En revisión
**Fecha:** 2026-10-06
**Revisor:** sec-eng
**Spec revisada:** `docs/specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md` v1.0

## Dictamen

**GO condicionado; D8 no queda aprobado tal como está redactado.** La autorización previa de MOD11 es una base aceptable para que el consumidor de MOD12 ejecute el ledger sin guards HTTP, siempre que la cola transporte una solicitud íntegra y de origen confiable y que `actorUserId` sea solo atribución de auditoría. La verificación del tenant contra `public.tenants` y el `SET LOCAL search_path` son controles necesarios, pero por sí solos no autentican que el job corresponda a una solicitud de ese tenant. Antes de G4 deben resolverse las consultas D8 indicadas abajo y cerrarse la exposición de identificadores en DLQ/diagnósticos.

Dictamen documental de solo lectura. No modifiqué la spec ni el código y no ejecuté pruebas.

## 1. D8, tenant y CA-08

### Evidencia favorable

El patrón existente del worker resuelve `schema_name` consultando `public.tenants` por un `tenantId` parametrizado, verifica el nombre con `isValidSchemaName` y fija `SET LOCAL search_path` dentro de una transacción. También compara el tenant exterior del job con `envelope.tenantId` antes de procesar. Este patrón evita que el `schemaName` viaje como selector de schema. Véase `apps/worker/src/processors/execution-order-events.processor.ts:97-119`.

El relay enumera tenants desde `public.tenants`, abre el schema del registro y reenvía los eventos del outbox con el tenant leído de esa fila (`apps/worker/src/services/execution-order-relay.service.ts:130-140, 190-205, 241-263`). Para el consumidor nuevo, la opción segura es aceptar solamente un `tenantId`, volver a resolverlo en `public.tenants`, construir el contexto de `TenantContext` con los valores canónicos de esa fila y nunca aceptar un schema del job ni del payload. `TenantContext` no se propaga automáticamente a BullMQ (`packages/database/src/tenant-context.ts:8-18`).

### Riesgo y consulta

**[CONSULTA a AI-EM-ARCH — D8/CA-08]** ¿Cuál es la garantía de integridad/origen del “sobre interno” que impide que otro productor de Redis cree un job con el tenant de otra organización? La consulta de `public.tenants` prueba que el tenant existe y entrega su schema; no prueba que esa solicitud concreta se originó en su outbox.

La cola no es actualmente una frontera autenticada por sí sola: tanto API como worker hacen opcional la contraseña (`REDIS_PASSWORD || undefined`, `apps/api/src/app.module.ts:166-175`, `apps/worker/src/worker.module.ts:174-185`). Además, ADR-074 figura **Propuesto**, y documenta que Redis carece de `--requirepass` y que la red interna es la mitigación actual (`docs/adrs/ADR-074-Autenticacion-de-Redis.md:4, 20-31`). Un `jobId` determinista deduplica trabajos; no acredita quién los publicó. Si un productor con acceso a Redis puede escribir en la cola, puede cambiar a la vez `job.tenantId` y `envelope.tenantId` por otro tenant válido. Así, la comprobación de igualdad existente no descarta ese cambio coordinado.

**Condición para cerrar:** definir un control verificable de procedencia del job antes de aceptar una mutación —por ejemplo, productores/credenciales/red con acceso acotado más una comprobación del evento fuente, o una prueba de integridad autenticada del sobre—. El consumidor debe rechazar tenant inexistente, mismatch entre tenant externo e interno y schema ajeno; debe derivar el schema solo del registro público. No debe confiar en que un UUID válido o `jobId` determinista equivalen a autorización.

CA-08 debe cubrir en pruebas de integración negativas: tenant inexistente; mismatch entre campos de tenant; una solicitud originada en A manipulada para seleccionar B sin movimiento alguno en B; y procesamiento aislado de A y B sin contaminación de `TenantContext`/`search_path`. El criterio actual solo explicita el tenant inexistente y la prohibición de mover stock ajeno (`docs/specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md:115`); la prueba de tenant válido cambiado debe quedar explícita. Defínase también si un evento autorizado antes de suspender un tenant debe terminar de procesarse: el middleware HTTP rechaza tenants no operables, mientras el consumidor actual de eventos excluye eliminación pero no exige `ACTIVE` (`apps/api/src/modules/tenant/tenant.middleware.ts:60-87, 253-263`; `apps/worker/src/processors/execution-order-events.processor.ts:105-119`).

El job es un boundary runtime. La interfaz TypeScript V2 no valida un `job.data` inyectado o corrupto. El consumidor debe validar en runtime el tipo de evento y su payload (UUID, cantidad positiva, enums, longitudes y consistencia serial/cantidad) antes del ledger. El validador actual del envelope operativo comprueba únicamente agregado, tenant no vacío y versión (`apps/worker/src/processors/execution-order-events.processor.ts:627-635`); no cubre el nuevo contrato.

## 2. Autorización fuera de HTTP y custodia

La herencia de autorización es **aceptable con condiciones** para solicitudes emitidas por la transacción autorizada de MOD11:

- `POST :id/item-usage` exige roles y `OPERATIONS_EXECUTION_ORDERS_EXECUTE` (`apps/api/src/modules/tasks/execution-orders.controller.ts:427-441`).
- `registerItemUsage` vuelve a leer la OT con `tenantId`, comprueba estado mutable/de ejecución, valida la custodia y persiste `actorUserId` junto al consumo antes de publicar el evento (`apps/api/src/modules/tasks/services/execution-orders.service.ts:1568-1626`).
- Para técnico individual, `assertCustodyAssignment` exige que la custodia coincida con el técnico asignado y que `actor.sub` sea ese técnico (`apps/api/src/modules/tasks/services/execution-orders.service.ts:3560-3592`). Esto permite explicar la autorización sin repetir guards HTTP en el job.
- El ledger registra `actor.sub` como actor de movimiento y de lifecycle (`apps/api/src/modules/inventory/services/stock-ledger.service.ts:692-803`). En ese método no se reevalúan permisos de MOD11; por ello `actorUserId` debe conservarse únicamente como atribución y no como rol/permisos que autoricen el movimiento.

**[CONSULTA a AI-EM-ARCH — ubicación y semántica del actor]** D8 dice que el actor viene del sobre, pero la especificación V2 coloca `actorUserId` dentro de `InventoryConsumptionRequestedV2`, mientras que el `OperationalEventEnvelopeV1` actual declara `tenantId` como metadato exterior y los datos de dominio bajo `payload`; no tiene una propiedad exterior de actor (`docs/specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md:65, 84-90`; `packages/shared/src/contracts/operations/execution-orders.ts:459-475, 572-590`). Aclárese si se moverá el actor a metadatos internos confiables o si “fuera del payload” significa “no controlado por HTTP y respaldado por el outbox”. El consumidor no debe construir un `JwtPayload` con rol privilegiado a partir de un job; debe pasar solo la identidad de auditoría permitida por el ledger.

El alcance de la spec excluye CREW. Debe mantenerse fail-closed para solicitudes con custodia de cuadrilla hasta que exista verificación de membresía y vigencia: el helper actual contiene un camino que solo registra advertencia cuando hay cuadrilla sin técnico (`apps/api/src/modules/tasks/services/execution-orders.service.ts:3580-3592`), y ADR-068 exige validar tipo, responsable, membresía y vigencia (`docs/adrs/ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md:145-150`).

## 3. `subscriberId` en Redis y ADR-067

El uso de `subscriberId` es funcionalmente justificable **solo** para `INSTALLED_AT_CUSTOMER`: el ledger lo usa para resolver/crear el sitio del cliente y abrir el comodato (`apps/api/src/modules/inventory/services/stock-ledger.service.ts:704-759, 1385-1414`). Para las demás disposiciones debe omitirse o ser nulo.

**[CONSULTA a AI-EM-ARCH — finalidad y retención]** ADR-067 aprobado exige finalidad por campo, parte de proyección mínima y prohíbe PII en logs y mensajes de error (`docs/adrs/ADR-067-Proyeccion-PII-Listados-Operativos.md:37-56`). Su permiso específico se refiere al listado operativo de suscriptores; no declara una autorización general para retener identificadores en colas. Un UUID de suscriptor es opaco, pero es enlazable con una persona en el tenant; no lo trataría como dato anónimo ni como “no PII” por el mero hecho de no incluir nombre/documento.

Para G4, dejar escrita la finalidad de transporte (resolver el destino de instalación/comodato), incluirlo únicamente cuando haga falta, y definir controles de acceso y retención de los jobs/DLQ. No copiar el identificador a logs, error text ni diagnósticos. La frase de la spec “identificador opaco, no PII de contenido” (`docs/specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md:126`) no resuelve por sí sola la clasificación ni el ciclo de vida del dato.

## 4. DLQ y logs

**No puedo confirmar que la DLQ y los logs actuales estén libres de PII.** La ruta de fallo de eventos registra `error.message`, copia el `envelope` entero y `errorMessage` al job DLQ, y configura retención sin borrado en finalización/fallo (`apps/worker/src/processors/execution-order-events.processor.ts:65-92`). El procesador de DLQ vuelve a registrar el mensaje y lo conserva en `last_error` (`apps/worker/src/processors/execution-order-dlq.processor.ts:47-52, 76-110`).

Al incorporar V2, ese envelope transportaría `subscriberId` y `actorUserId`; además, una excepción cruda puede contener valores aportados por el evento. La copia integral y el diagnóstico no permiten sostener “cero PII”, especialmente con permanencia indefinida en BullMQ. ADR-067 §8 y `AGENTS.md` prohíben PII en logs y errores; ADR-068 §7 pide payload mínimo sin PII.

**Condición de cierre:** la DLQ de consumo debe guardar diagnóstico allowlisted (código/tipo, contador, fecha e IDs de correlación mínimos), no mensajes de excepción crudos ni payload completo. La recuperación debe consultar una solicitud fuente durable por identificador, en vez de volcar datos personales al diagnóstico. Aplicar límite de retención y acceso a trabajos fallidos; sanitizar errores antes de logs y persistencia. Hasta entonces no debe afirmarse que la DLQ “no contiene PII”.

## Consultas para AI-EM-ARCH

1. **D8/CA-08:** especificar la garantía de procedencia del job, además de resolver `tenantId` contra `public.tenants`; resolver el riesgo actual de Redis opcionalmente autenticado.
2. **Actor:** resolver la contradicción entre “actor desde sobre, no payload” y `actorUserId` dentro del payload V2; precisar que no es fuente de autorización.
3. **ADR-067:** ratificar el tratamiento del `subscriberId` seudónimo en Redis, su finalidad limitada y retención.

## Referencias de código y decisión

- `docs/specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md` — D8, contrato V2, CA-08 e impacto de privacidad.
- `docs/adrs/ADR-067-Proyeccion-PII-Listados-Operativos.md` — finalidad/minimización, alcance del listado y límite de logs/errores.
- `docs/adrs/ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md` — outbox tenant-aware, resolución de schema y requisitos de autorización/auditoría.
- `docs/adrs/ADR-074-Autenticacion-de-Redis.md` — propuesto; estado actual de autenticación Redis.
- `apps/api/src/modules/tenant/tenant.middleware.ts`; `packages/database/src/tenant-context.ts` — contexto de tenant HTTP y límite de AsyncLocalStorage.
- `apps/worker/src/processors/execution-order-events.processor.ts`; `apps/worker/src/processors/execution-order-dlq.processor.ts`; `apps/worker/src/services/execution-order-relay.service.ts` — procedencia actual, tenancy y manejo de errores/DLQ.
- `apps/api/src/modules/tasks/execution-orders.controller.ts`; `apps/api/src/modules/tasks/services/execution-orders.service.ts` — autorización de registro y verificación de custodia.
- `apps/api/src/modules/inventory/services/stock-ledger.service.ts`; `apps/api/src/app.module.ts`; `apps/worker/src/worker.module.ts` — efecto del ledger y conexión BullMQ/Redis.
- `packages/shared/src/contracts/operations/execution-orders.ts` — forma externa del envelope operativo vigente.
