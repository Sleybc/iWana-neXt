# Contrato API y eventos para OT de instalacion

**Version:** 1.0  
**Estado:** Congelación arquitectónica G4 — implementación contract-first en curso  
**Fecha:** 2026-07-27  
**Owner de implementacion:** AI-SR-FULL  
**Review requerido:** AI-SEC-ENG, AI-SR-QA, AI-DATA-ENG si cambia persistencia  
**ADR:** `docs/adrs/ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md` (Aprobado)
**Media:** `docs/adrs/ADR-034-Bounded-Context-Media-Assets.md`; `docs/adrs/ADR-035-Storage-MinIO-StoragePort.md` (Aprobados)

---

## 1. Alcance

Especificar el contrato conductual que debe publicar MOD11. Los paths actuales bajo `/api/v1/tasks/execution-orders` se mantienen durante la fase de compatibilidad; cualquier ruptura exige versionado y OpenAPI actualizado.

Este documento autoriza implementación contract-first bajo ADR-068 aprobado por el CTO el 2026-07-27; los gates G3–G6 siguen siendo obligatorios.

## 2. Recursos de lectura

| Operacion | Resultado |
| --- | --- |
| Consultar OT | Cabecera, plantilla/version, estado/version, alcance, asignacion, progreso, sincronizacion y acciones permitidas |
| Consultar bitacora | Actividades, cambios de estado y excepciones paginados |
| Consultar consumos | Items y movimientos confirmados/pendientes/rechazados |
| Consultar evidencias | Metadata autorizada y URL temporal; nunca secreto de almacenamiento |
| Consultar plantilla aplicada | Snapshot inmutable de requisitos de cierre |

La respuesta contiene `version` para control optimista y `allowedActions` calculadas por politica. `allowedActions` es ayuda de UI, no reemplazo de autorizacion en cada comando.

### 2.1 Superficie HTTP objetivo

Base: `/api/v1/tasks/execution-orders`.

| Metodo y path | Request | Exito |
| --- | --- | --- |
| `GET /:id` | — | `200 ExecutionOrderDetail` + `ETag` |
| `GET /:id/activities?page&limit` | `page>=1`, `limit` default 25/max 100 | `200 Page<ExecutionOrderActivity>` |
| `GET /:id/item-usage?page&limit` | misma paginacion | `200 Page<ExecutionOrderItemUsage>` |
| `GET /:id/evidences?page&limit` | misma paginacion | `200 Page<ExecutionOrderEvidence>` |
| `POST /:id/evidence-assets` | multipart autorizado para la OT | `202 EvidenceAssetReceipt` |
| `GET /:id/evidence-assets/:mediaAssetId` | — | `200 EvidenceAssetReceipt` |
| `GET /:id/evidences/:evidenceId/content` | — | `302` a URL firmada corta o stream autorizado |
| `POST /:id/assign` | `AssignExecutionOrderCommand` | `200 ExecutionOrderDetail` |
| `POST /:id/start` | `StartExecutionOrderCommand` | `200 ExecutionOrderDetail` |
| `POST /:id/activities` | `RegisterActivityCommand` | `201 ExecutionOrderActivity` |
| `POST /:id/item-usage` | `RegisterItemUsageCommand` | `202 InventoryRequestReceipt` |
| `POST /:id/evidences` | `RegisterEvidenceCommand` | `201 ExecutionOrderEvidence` |
| `POST /:id/block` | `BlockExecutionOrderCommand` | `200 ExecutionOrderDetail` |
| `POST /:id/unblock` | `UnblockExecutionOrderCommand` | `200 ExecutionOrderDetail` |
| `POST /:id/close` | `CloseExecutionOrderCommand` | `200 ExecutionOrderDetail` |
| `POST /:id/follow-ups` | `CreateFollowUpCommand` | `201 FollowUpReceipt` |

Compatibilidad: `POST /:id/field-work` puede delegar temporalmente a `/activities`; se marca deprecado en OpenAPI y se retira con telemetria.

Administracion de plantillas:

| Metodo y path | Semantica |
| --- | --- |
| `GET /api/v1/tasks/execution-order-templates?page&limit` | listar |
| `POST /api/v1/tasks/execution-order-templates` | crear borrador |
| `POST /api/v1/tasks/execution-order-templates/:templateId/versions` | crear nueva version dentro de la plantilla identificada por `templateId` |
| `POST /api/v1/tasks/execution-order-template-versions/:versionId/publish` | publicar la version identificada por `versionId` |
| `POST /api/v1/tasks/execution-order-template-versions/:versionId/retire` | retirar la version identificada por `versionId` para nuevas OT |

### 2.2 Contratos tipados a publicar en `@iwana/shared`

| Tipo | Campos obligatorios |
| --- | --- |
| `ExecutionOrderDetail` | `id`, `number`, `version`, `status`, `result?`, `workType`, `template { id, key, version, label }`, `schedule { eventId, window, plannedResource? }`, `assignee?`, `site`, `completion`, `syncState`, `inventoryReconciliation`, `allowedActions`, timestamps |
| `AssignExecutionOrderCommand` | `assigneeType`, `assigneeId`, `reason?` |
| `StartExecutionOrderCommand` | `startedAt?`, `note?` |
| `RegisterActivityCommand` | `activityType`, `description`, `occurredAt?`, `measurements?` acotadas por plantilla |
| `RegisterItemUsageCommand` | `itemId`, `quantity`, `technicianCustodyId`, `serialNumber?`, `action`, `finalDisposition` |
| `RegisterEvidenceCommand` | `mediaAssetId`, `evidenceType`, `requirementKey`, `capturedAt?` como dato declarado por cliente |
| `BlockExecutionOrderCommand` | `reasonCode`, `note?` |
| `UnblockExecutionOrderCommand` | `resolutionCode`, `note?` |
| `CloseExecutionOrderCommand` | `result`, `reasonCode?`, `summary`, `customerAcceptance?`, `followUp?` |
| `ExecutionOrderError` | `code`, `message`, `correlationId`, `missingRequirements?` |
| `Page<T>` | `data`, `meta` compatible con `packages/shared/src/dto/pagination.dto.ts` |

`allowedActions` solo admite: `ASSIGN`, `REASSIGN`, `START`, `REGISTER_ACTIVITY`, `REGISTER_ITEM_USAGE`, `REGISTER_EVIDENCE`, `BLOCK`, `UNBLOCK`, `CLOSE`, `CREATE_FOLLOW_UP`, `OPEN`. AI-SR-FULL debe congelar tipos discriminados y enums exactos en G3; esta tabla no sustituye el archivo real.

`ExecutionOrderTemplateVersion` publica: `id`, `templateId`, `key`, `version`, `label`, `workType`, `status`, `effectiveFrom?`, `requirements[]`, `reasonCatalogs`, `publishedAt?`, `retiredAt?`. Cada `requirement` es una unión discriminada de campos/actividad/medicion/evidencia/material/conformidad permitidos; no acepta componentes, scripts ni expresiones arbitrarias.

El mismo contrato compartido debe publicar `OperationalEventEnvelopeV1` y una unión discriminada por `eventType` con el payload exacto de `VisitScheduledV1`, `VisitWindowChangedV1`, `VisitResourceChangedV1`, `VisitCancelledV1`, `ExecutionOrderStartedV1`, `ExecutionOrderBlockedV1`, `InventoryConsumptionRequestedV1`, `ExecutionOrderClosedV1`, `ExecutionOrderFollowUpRequiredV1`, `InventoryMovementConfirmedV1` e `InventoryMovementRejectedV1`. No basta con tipar requests y responses HTTP.

Artefactos obligatorios de congelación:

- tipos: `packages/shared/src/contracts/operations/execution-orders.ts`, exportados desde `packages/shared/src/index.ts`;
- OpenAPI máquina-legible: `apps/api/openapi/tasks-execution-orders.v1.json`;
- verificación: `apps/api/src/modules/tasks/tasks.swagger.spec.ts` debe registrar `ExecutionOrdersController` y comparar el contrato relevante.

### 2.3 Concurrencia e idempotencia

- Se adopta un único mecanismo: `If-Match` con el `ETag`/version recibido; no se duplica `expectedVersion` en el body.
- Todo `POST` operativo exige `Idempotency-Key`.
- El cliente puede enviar `X-Correlation-Id` con formato UUID; si falta o es inválido, el servidor genera uno. Siempre se devuelve en header y body de error, pero nunca concede autoridad.
- Respuesta a version obsoleta: `409 VERSION_CONFLICT`.
- Respuesta a clave reutilizada con payload distinto: `409 IDEMPOTENCY_CONFLICT`.
- `POST item-usage` devuelve `202` mientras MOD12 procesa; la confirmacion/rechazo se consulta en el detalle o por la lista de consumos.
- El servidor genera un `intentId` UUID estable al aceptar por primera vez una clave. Para la saga MOD11–MOD12, ese `intentId` viaja como `inventoryRequestId` en todos los eventos, settlements y re-drives.
- Dentro de una única transacción tenant se crean o bloquean el registro idempotente y su fingerprint, se aplica la mutación, se anexan outbox y audit-intent, y se persiste un recibo minimizado (`intentId`, estado, `resourceRef`, versión y código de resultado), nunca un body potencialmente sensible. Si cualquiera falla, todo se revierte.
- Clave y payload se comparan mediante HMAC-SHA-256 versionado (`keyId`) con secreto server-side separado; no se almacena payload, hash simple reversible por diccionario ni PII.
- El registro activo y su recibo se conservan al menos 90 días desde el resultado; en sagas, hasta 90 días después del estado terminal, lo que ocurra más tarde. Al expirar se reduce a un tombstone no-PII con key/payload HMAC, `intentId`, operación y fecha, conservado mientras viva la OT y durante la retención de auditoría aprobada. Así, el replay histórico responde `409 IDEMPOTENCY_EXPIRED` sin reejecutar a ciegas.

## 3. Comandos

| Comando | Precondicion | Resultado |
| --- | --- | --- |
| Asignar/reasignar | permiso de supervision, actor elegible, OT no terminal | Nueva version y evento de asignacion |
| Iniciar | ejecutor asignado y permiso de ejecución | `IN_PROGRESS` |
| Registrar actividad | OT en progreso/bloqueada y tipo permitido por plantilla | Entrada append-only |
| Registrar consumo | custodia y disponibilidad validadas por MOD12 | Movimiento pendiente/confirmado |
| Agregar evidencia | asset disponible, ligado al mismo tenant+OT, no reutilizado, tipo/tamaño permitido y requisito aplicable | Metadata con hash de servidor |
| Bloquear/desbloquear | causa tipada y permiso | Estado/excepcion auditable |
| Cerrar | gate completo, version vigente y resultado valido | Estado terminal |
| Crear seguimiento | OT terminal o bloqueada segun politica | Nueva necesidad/OT vinculada |

Cada comando sensible exige:

- `Idempotency-Key` estable por intención;
- hash canonico de operacion, tenant, actor y payload asociado a la clave;
- version esperada exclusivamente mediante `If-Match`;
- actor y tenant obtenidos del contexto autenticado;
- `correlationId`;
- validacion Zod/DTO en boundary;
- respuesta consistente a duplicado.

Replay con la misma clave y el mismo hash devuelve el resultado original. La misma clave con intención o payload diferente responde `409`; nunca reutiliza un movimiento previo.

El audit trail sigue la misma atomicidad: cada CUD sensible inserta un `audit-intent` append-only y minimizado dentro de la transacción de dominio. Si no puede persistirse, la mutación falla. Su entrega al owner transversal de auditoría puede ser asíncrona; un fallo de entrega conserva el intent durable, activa retry/DLQ y no permite borrarlo ni editarlo. Los eventos de auditoría contienen referencias, actor, tenant, operación, resultado y timestamps de servidor, no bodies ni textos libres completos.

## 4. Errores

| Codigo | Semantica |
| --- | --- |
| `400` | payload o regla de plantilla invalida |
| `401` | sesion ausente/invalida |
| `403` | permiso, asignacion o alcance insuficiente |
| `404` | recurso no visible en el tenant |
| `409` | version, transición, idempotencia o inventario en conflicto |
| `422` | gate de cierre incompleto, con lista de requisitos |
| `503` | dependencia operativa temporalmente no disponible; comando reintentable |

Política uniforme antienumeración:

- `404` cuando la OT, plantilla, evidencia o asset no existe, pertenece a otro tenant o queda fuera del ABAC del actor; la respuesta es indistinguible.
- `403` solo cuando el actor puede ver el recurso por `read` y ABAC, pero carece del permiso requerido para la acción solicitada.
- `401` solo para sesión ausente o inválida.

El body de error se congela como tipo compartido con `code`, `message`, `correlationId` y, solo para `422`, `missingRequirements[]`. No incluye stack, IDs internos innecesarios ni datos de otro recurso.

## 5. Politica de autorizacion

1. Resolver tenant desde sesión aprobada; nunca desde un UUID del cliente.
2. Verificar permiso de capacidad.
3. Verificar alcance organizacional/territorial si aplica.
4. Para ejecutar, verificar responsable usuario/cuadrilla y vigencia de asignacion.
5. Para supervisar, permitir coordinación pero negar escritura de actividades/evidencias salvo que el actor también sea ejecutor asignado.
6. Revalidar en cada comando; `allowedActions` no es confianza.
7. Para cuadrillas, verificar membresia vigente, asignacion activa y revocacion entre lectura y comando.

Permisos canónicos:

- `operations.execution_orders.read`
- `operations.execution_orders.execute`
- `operations.execution_orders.supervise`
- `operations.execution_order_templates.read`
- `operations.execution_order_templates.manage`
- `operations.execution_events.redrive`

| Endpoint/operacion | Permiso exacto | ABAC adicional |
| --- | --- | --- |
| GET OT/actividades/consumos/evidencias/contenido media | `operations.execution_orders.read` | actor asignado, miembro vigente de cuadrilla o alcance de supervisión |
| POST assign/reassign | `operations.execution_orders.supervise` | sitio/territorio autorizado; estado elegible |
| POST start/activity/item-usage/evidence/evidence-assets/block/unblock/close | `operations.execution_orders.execute` | actor asignado o miembro vigente de cuadrilla |
| POST follow-ups | `operations.execution_orders.supervise` | alcance de supervisión sobre la OT origen |
| GET/listar plantillas | `operations.execution_order_templates.read` | mismo tenant |
| POST crear/versionar/publicar/retirar plantillas | `operations.execution_order_templates.manage` | mismo tenant y política administrativa |
| Re-drive de DLQ de eventos OT | `operations.execution_events.redrive` | mismo tenant, evento permitido, causa y ticket operativo; siempre auditado |

Los permisos no se heredan implícitamente: los perfiles que ejecutan o supervisan reciben también `operations.execution_orders.read` de forma explícita. De igual manera, `manage` no reemplaza `templates.read`; el catálogo asigna ambos cuando el perfil necesita consultar y administrar.

La autorización resource-aware carga la OT dentro del schema tenant y evalúa assignment/site después de RBAC/permisos. Un guard no infiere sitio a partir de `:id`.

## 6. Plantillas

El API administrativo permite listar, crear borrador, publicar nueva version y retirar una plantilla. No se edita una version publicada. La OT guarda un snapshot o referencia inmutable suficiente para reconstruir el gate aplicado.

Validaciones minimas:

- clave y version unicas por tenant;
- esquema de campos admitido y acotado;
- tipos de evidencia permitidos;
- requisitos de cierre deterministas;
- fechas de vigencia coherentes;
- auditoria de publicación/retiro.

## 7. Eventos y outbox

El envelope minimo es:

| Campo | Regla |
| --- | --- |
| `eventId` | UUID unico |
| `eventType` | nombre versionado |
| `tenantId` | obligatorio, validado por consumidor |
| `aggregateId` | OT canonica |
| `aggregateVersion` | monotona |
| `occurredAt` | UTC |
| `correlationId` | atraviesa solicitud, job y auditoria |
| `payload` | datos minimos; sin PII innecesaria |

En G3, AI-SR-FULL debe materializar el envelope y cada payload `V1` como tipos discriminados en `@iwana/shared`; G4 congela esos tipos junto con OpenAPI. Un payload no tipado o un `Record<string, unknown>` no satisface el contrato.

Cada consumidor registra `(tenantId, consumer, eventId)` como procesado. Un evento con version antigua no revierte una proyeccion más nueva. La reconciliacion compara OT canonica, proyecciones y movimientos pendientes.

## 8. Integridad de inventario

- MOD11 no acepta custodio arbitrario enviado por el cliente.
- MOD12 resuelve custodias elegibles y valida item, serial, cantidad, unidad, disponibilidad y destino.
- La custodia debe tener el tipo permitido y su `responsibleRefId` debe coincidir con el tecnico o cuadrilla asignada.
- Un serial no puede consumirse dos veces.
- Un reintento con la misma clave devuelve el resultado original.
- Un cierre ejecutado con consumo requerido puede quedar `inventoryReconciliation=PENDING`, nunca “confirmado” sin movimiento.
- Rechazos generan excepción y acción operativa; no reescriben silenciosamente la bitacora.
- No se admite fallback que fabrique `stockMovementId` sin movimiento confirmado.
- Si MOD12 confirma y MOD11 falla antes de registrar el uso, el evento queda reconciliable; el reintento no crea un segundo movimiento.

## 9. Evidencia y firma

- Media/Assets, definido por ADR-034 y ADR-035, es owner del binario y `StoragePort`; MOD11 es owner de la relación probatoria con la OT. G1 debe reconciliar la metadata de aprobación contradictoria de ambos ADR.
- El cliente no entrega URLs arbitrarias como evidencia. `POST /:id/evidence-assets` registra el upload con `usage=operations.execution_order_evidence`, tenant resuelto por sesión y una vinculación server-owned a OT+actor.
- Media valida MIME real por magic bytes, tamaño y allowlist, calcula `checksumSha256` en servidor y mantiene el objeto privado. Internamente el asset queda `QUARANTINED`; el recibo público representa ese mismo estado como `PENDING_ANALYSIS`. Solo `AVAILABLE` puede registrarse o servirse. `REJECTED` nunca se enlaza.
- `POST /:id/evidences` solo acepta `mediaAssetId` del mismo tenant y OT, `AVAILABLE`, vigente y no ligado a otra evidencia. Reutilizar asset, evidencia o URL temporal responde con error uniforme sin revelar el recurso.
- La evidencia guarda `receivedAt` y `verifiedAt` de servidor. `capturedAt`, si existe, es una declaración del dispositivo y no sustituye por sí sola el timestamp probatorio.
- La descarga reautoriza OT+evidencia en cada petición y entrega stream o URL firmada de máximo 15 minutos; nunca expone `objectKey`, bucket ni credenciales.
- `GET /:id/evidence-assets/:mediaAssetId` consulta el `EvidenceAssetReceipt` (`PENDING_ANALYSIS`, `AVAILABLE`, `REJECTED`, `EXPIRED`) sin exponer storage. El POST devuelve `202` y esta consulta finaliza el ciclo de análisis.
- Media/Assets persiste el estado de análisis en su metadata pública y opera el job asíncrono. MOD11 persiste en el schema tenant el upload-intent y el vínculo OT–asset, sin FK cross-schema; ambos se correlacionan por `intentId`.
- El object key se deriva del `mediaAssetId`, por lo que reintentar la escritura es idempotente. Un reconciliador Media compara metadata↔objeto: completa metadata faltante cuando es seguro, marca `REJECTED` si falta el objeto y nunca fabrica disponibilidad.
- Un asset sin vínculo/claim vigente queda huérfano; un job Media aplica TTL aprobado, soft delete auditado y borrado físico posterior. La compensación/reconciliación cubre fallos entre MinIO, metadata Media y vínculo MOD11.
- firma: artefacto, consentimiento y contexto; no un string libre;
- borrado/retencion según política que debe validar Legal/Regulatorio.

[ESCALACION A LEGAL/REGULATORIO] Validar suficiencia probatoria, retencion y tratamiento de datos personales antes de declarar la firma como aceptación legal.

## 10. Compatibilidad

- La `WorkOrder` ligera queda como proyeccion temporal y no se expone como OT ejecutable.
- `wfm.work_orders.execute` puede mapear temporalmente al nuevo permiso; cada uso debe ser medible.
- La retirada requiere cero consumidores conocidos, reconciliacion verde y plan de rollback.

## 11. PII, DTOs y retencion

La entidad no se devuelve en crudo. Los DTOs de salida se minimizan por necesidad operativa:

- coordinacion: numero OT, estado/progreso, sitio funcional, ventana, responsable y alertas;
- ejecutor asignado: agrega direccion e instrucciones estrictamente necesarias;
- soporte autorizado: referencias tecnicas bajo permiso explícito.

`customerDisplayLabel`, `serviceAddress`, `description`, `closeNotes`, `workInstructions`, contactos y textos libres:

- no aparecen en logs, eventos, idempotency records ni audit payloads completos;
- se redactan o referencian en auditoria;
- se protegen en reposo según politica vigente; si falta una decisión aprobada, se escala antes de persistir una nueva copia;
- tienen retencion y eliminación sujetas a Ley 1581/politica oficial validada;
- nunca se exponen a un actor sin necesidad y alcance.

Las pruebas rechazan mass assignment de `tenantId`, actor, estado, asignacion, version, metadata de evidencia y propiedades desconocidas.

## 12. Pipeline de seguridad y transporte

El recorrido verificable es:

`rate limiter → TLS → JWT → tenant JWT → RBAC → ABAC → validacion → auditoria CUD`

- rate limit por actor/tenant para lectura sensible, evidencia, inventario y cierre; excederlo responde `429`;
- TLS en el ingress efectivo, redireccion HTTP→HTTPS o evidencia de terminacion externa aprobada;
- JWT/tenant no se derivan de campos del payload;
- auditoria se ejecuta despues de autorizacion y sanea PII.
- cada CUD debe dejar `audit-intent` durable en la misma transacción; si falla su inserción, la operación completa falla;
- no se habilitan borradores offline en esta fase: offline es solo estado informativo/read-only; no se persisten localmente evidencias, firmas, direcciones, instrucciones ni textos libres.

AI-PLAT-OPS aporta evidencia TLS en G5/G7; AI-SEC-ENG verifica el contrato en G3 y la implementacion en G6.

## 13. Criterios de aceptación del contrato

- CA-API-01: acceso por UUID sin permiso/asignacion no filtra datos.
- CA-API-02: comandos duplicados no duplican actividades, evidencia ni inventario.
- CA-API-03: cierre concurrente produce un unico resultado terminal.
- CA-API-04: una OT terminal rechaza toda mutacion salvo crear seguimiento.
- CA-API-05: outbox y cambio de OT se confirman atomically dentro del schema tenant.
- CA-API-06: consumidores son idempotentes y tenant-aware.
- CA-API-07: OpenAPI documenta permisos, errores, idempotencia y version.
- CA-API-08: logs y auditoria contienen referencias, no payloads sensibles.
- CA-API-09: conciliador detecta y reporta divergencias.
- CA-API-10: migraciones public/tenant son versionadas, reversibles y compatibles con pgBouncer.
- CA-API-11: misma idempotency key con payload distinto produce `409`.
- CA-API-12: DTOs y auditoria minimizan/redactan PII y textos libres.
- CA-API-13: mass assignment de campos server-owned se rechaza.
- CA-API-14: cuadrilla/custodia validan tipo, responsable, membresia y vigencia.
- CA-API-15: fallo parcial MOD12→MOD11 queda reconciliable sin movimiento duplicado.
- CA-API-16: rate limit produce `429` y el ingress aporta evidencia TLS.
- CA-API-17: cuerpos 403/404/409/422 son tipados y no enumeran recursos.
- CA-API-18: idempotencia, mutación, outbox y audit-intent se confirman o revierten juntos y comparten `intentId`.
- CA-API-19: auditoría durable sobrevive fallo de entrega y llega a retry/DLQ sin perder trazabilidad.
- CA-API-20: una evidencia ajena, reutilizada, en cuarentena o con MIME real inválido nunca se vincula ni se sirve.
- CA-API-21: la matriz endpoint×permiso×ABAC y la política 401/403/404 se aplican sin excepciones.
