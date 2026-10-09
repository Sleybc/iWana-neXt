# Informe S2 — Auditoría de seguridad MOD11 ↔ MOD12

**Versión:** 1.1 (adenda dinámica)  
**Fecha:** 2026-10-06  
**Agente:** sec-eng  
**Dictamen:** **NO GO — tres bloqueos estáticos en I1; CA-11 pasa en la DLQ dedicada; consulta pendiente sobre failed source jobs**  
**Modo:** auditoría estática de solo lectura, conforme a la spec v1.1 y al alcance S2.

## Alcance y método

Se revisaron el worker (emisión y reencolado firmado, rescan y DLQ), el API (processor de solicitudes, ledger y recibos), el esquema Zod compartido y la configuración de las claves. Se contrastó con D8, D9, D11, D12 y CA-08 de la spec v1.1, con el registro de auditoría §5 del plan y con el encargo S2.

No se ejecutaron pruebas ni servicios y no se modificó código. La inspección del job fallido real de CA-11 quedó pendiente: I4 informó que la creación de su base aislada falló con SQLSTATE 42501; por tanto no levantó API/worker ni generó un job DLQ que pudiera inspeccionarse. No se usaron servicios compartidos. La evaluación de CA-11 que sigue es estática, no evidencia de ejecución.

## Hallazgos bloqueantes

### [BLOQUEO] I1 — el worker firma solicitudes inventadas en la cola de eventos

**Severidad:** P1 — permite eludir la procedencia/autorización que D8 y D9 delegan en MOD11.

El processor comprueba igualdad entre tenant externo e interno y resuelve el tenant desde public.tenants, pero no verifica que el evento recibido corresponda a una fila auténtica del outbox de MOD11. Después enruta InventoryConsumptionRequestedV2 al firmante. Este valida el envelope con Zod, crea un HMAC válido y encola el resultado en inventory-execution-requests. Referencias: apps/worker/src/processors/execution-order-events.processor.ts:175-199, :310-317 y :367-389.

El relay legítimo sí obtiene sus eventos del outbox, en apps/worker/src/services/execution-order-relay.service.ts:196-230. Sin embargo, el processor no verifica ese origen. D8 identifica Redis sin autenticación como una amenaza; alguien con escritura en operations-execution-events puede inyectar un V2 que pase el esquema y hacer que el worker lo firme. MOD12 trata luego actorUserId como atribución autenticada por MOD11. El ledger comprueba artículo, serial y saldo de custodia, pero no vuelve a comprobar que la OT y el actor estén autorizados por MOD11: apps/api/src/modules/inventory/services/stock-ledger.service.ts:721-795, :873-929.

**Acción requerida:** antes de firmar, comprobar el evento y su payload contra el outbox persistido del tenant, incluyendo identidad, tipo y contenido; o cerrar la entrada a la cola de origen con controles de acceso que cubran este mismo threat model. La firma de salida, por sí sola, no autentica al productor de la cola de origen. La explotación no se reprodujo dinámicamente en S2.

### [BLOQUEO] I1 — el hook de fallo copia campos no validados a logs y DLQ

**Severidad:** P1 — riesgo de exponer PII o permitir log injection a través de datos no confiables.

ExecutionOrderEventsProcessor.onFailed clasifica por eventType, luego toma tenantId, eventId, executionOrderId e inventoryRequestId directamente del job y los escribe en logs y DLQ, sin validarlos como identificadores: apps/worker/src/processors/execution-order-events.processor.ts:107-144. Un V2 con tenant existente y eventType de inventario, pero con campos identificadores malformados, puede fallar la validación Zod y aun así llegar a este hook con sus valores originales.

**Acción requerida:** validar y normalizar cada identificador antes de escribirlo. Si alguno no pasa, omitirlo y registrar solo un código de error allowlisted, intentos y fecha. El hook equivalente del API ya usa safeUuid y omite los valores inválidos: apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts:438-458.

La posible exposición se deriva del flujo de error estático; no se comprobó un valor PII real ni se generó un job malformado durante esta auditoría.

### [BLOQUEO] I1 — el relay registra mensajes crudos de excepciones

**Severidad:** P2 — incumplimiento directo de D11 y riesgo de incluir detalles internos o datos sensibles en logs.

ExecutionOrderRelayService registra error.message o String(error) para fallos de enqueue, marcado y escaneo: apps/worker/src/services/execution-order-relay.service.ts:269-274, :291-297 y :305-308. D11 prohíbe el mensaje crudo de la excepción en los logs del flujo de inventario.

**Acción requerida:** sustituir el texto crudo por un tipo de error allowlisted y conservar únicamente el contexto operativo aprobado por D11. No se verificó que las excepciones actuales contengan PII; la infracción es el registro incondicional del mensaje crudo.

## Controles que pasan en revisión estática

| Control | Evidencia y dictamen |
|---|---|
| Firma HMAC y rotación | El API calcula la firma con la clave actual y la anterior, compara ambas con timingSafeEqual y valida claves base64 canónicas de al menos 32 bytes: apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts:241-282. El emisor firma con la clave actual y comprueba su longitud/canonicalidad: apps/worker/src/processors/execution-order-events.processor.ts:367-389. API exige una clave válida en producción (apps/api/src/app.config.ts:207-234) y worker falla el arranque con una clave ausente o inválida (apps/worker/src/main.ts:6-29). El control criptográfico en la cola de destino pasa; el bloqueo 1 describe el bypass por la cola de origen. |
| Orden de validación del consumidor API | process() verifica HMAC, aplica SignedInventoryExecutionRequestSchema y solo después resuelve el tenant o accede al ledger: apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts:141-153. El esquema estricto compartido valida forma y consistencia tenant externo/interno: packages/shared/src/contracts/operations/execution-orders.ts:573-645. |
| Fuente de tenant y estado | El tenant, slug, schema y estado se leen con consulta parametrizada a public.tenants; se valida el nombre del esquema, y estados distintos de ACTIVE se difieren con reintento: apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts:150-158, :284-301. |
| Aislamiento de contexto y schema | El processor establece TenantContext.run con los datos de public.tenants. Las operaciones de recibos y custodia usan runInTenantSchema; el ledger toma su contexto de TenantContext y vuelve a aislar el trabajo en schema: apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts:157-158, :292-331; apps/api/src/modules/inventory/services/stock-ledger.service.ts:721-735. La implementación concuerda estáticamente; CA-08(d) no se probó de forma concurrente en S2. |
| Actor D9 | El processor entrega al ledger únicamente { sub: payload.actorUserId }, no crea rol, permisos ni JwtPayload completo: apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts:201-207. |
| Custodia móvil | El processor resuelve la ubicación activa MOBILE_TECHNICIAN por responsibleRefId. El ledger vuelve a comprobar ID de ubicación, responsable, tipo y estado bajo bloqueo pesimista antes de validar stock y moverlo: apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts:315-331; apps/api/src/modules/inventory/services/stock-ledger.service.ts:931-952. |
| DLQ del API | El API usa solo campos de diagnóstico permitidos, filtra identificadores por UUID y usa errorType allowlisted; no registra payload ni mensaje crudo: apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts:428-472. La DLQ worker normaliza los UUID y el tipo de error antes de persistir el diagnóstico: apps/worker/src/processors/execution-order-dlq.processor.ts:28-62, :190-260. |

## CA-08 — revisión estática

- **(a) Tenant inexistente:** el resolver consulta public.tenants; si falta o el esquema no es válido, el processor descarta con UnrecoverableError antes del ledger.
- **(b) Tenant externo distinto del interno:** el esquema compartido rechaza la inconsistencia después de verificar firma y antes de resolver tenant.
- **(c) Tenant cambiado con firma inválida:** HMAC cubre tenantId y envelope; la API verifica la firma antes de Zod y antes de consultar o mutar el tenant. El caso directo sobre la cola de destino está protegido; el hallazgo de signing oracle cubre la cola de origen.
- **(d) A/B en paralelo:** el código usa TenantContext.run y runInTenantSchema por operación. S2 no ejecutó la prueba concurrente; queda para I4.
- **(e) Tenant no ACTIVE:** el processor difiere con error reintentable y el job tiene backoff y ocho intentos; no lo registra como rechazo de negocio.

Este dictamen estático no sustituye la verificación integrada solicitada a I4.

## CA-11 y condición de cierre

CA-11 exige inspeccionar un job fallido real. No hay job ni evidencia Redis que revisar: I4 no pudo crear su base aislada por SQLSTATE 42501 y no inició servicios. **CA-11 permanece no verificado**, no aprobado por inspección estática.

**Dictamen final:** S2 **NO GO** hasta resolver los tres bloqueos de I1. CA-11 sigue pendiente de evidencia real de I4. Sin commit.

---

## Adenda S2 v1.1 — evidencia dinámica CA-11

**Esta adenda supersede la limitación de evidencia CA-11 indicada en v1.0.** Se inspeccionaron en solo lectura los jobs sintéticos creados por I4 en Redis DB 15 y los logs API/worker de esa ejecución. No cambié el estado de la cola ni de los jobs. La cola diagnóstica estaba pausada por I4 para preservar la evidencia; BullMQ mostró esos registros en estado waiting debido a la pausa. Los jobs fuente asociados constaban en estado failed.

### [CONSULTA] de frontera D11 — los failed source jobs conservan el envelope y detalles de error

La correlación interna por eventId, sin mostrar esos valores, encontró dos jobs fuente fallidos en inventory-execution-requests. Sus claves de datos incluyen tenantId, signature y envelope; el payload interno conserva actorUserId y subscriberId. Los objetos del job también contienen failedReason y stacktrace. En el caso técnico CA-06, failedReason conserva el texto de la excepción PostgreSQL; el caso de validación conserva un mensaje genérico.

I4 estableció removeOnFail=false en los jobs sintéticos para mantenerlos disponibles durante la revisión. La ruta del emisor de producción configura removeOnFail con DLQ_RETENTION_SECONDS (30 días): apps/worker/src/processors/execution-order-events.processor.ts:367-390. El override false corresponde al harness de I4 y no se atribuye a producción.

La cola diagnóstica operations-execution-dlq sí contiene únicamente los campos permitidos: attemptsMade, errorType, eventId, executionOrderId, failedAt, inventoryRequestId y tenantId. No incluye payload, envelope, actorUserId, subscriberId ni errorMessage. La spec prohíbe payload y mensaje crudo en la DLQ, pero no define expresamente si el failed set de la cola fuente debe cumplir la misma regla. En producción esos jobs fallidos se retienen hasta 30 días, con el envelope y failedReason. Si D11 pretende incluir ese estado de BullMQ, se requiere remover o sanear el job fuente al aceptar la entrada diagnóstica. Dejo el límite como **[CONSULTA]**, no como incumplimiento probado de la DLQ dedicada.

### Evidencia dinámica de logs

- En api2.stderr.log, los eventos correlacionados de inventario registran solo los identificadores permitidos, intentos, fecha y error_type: UnrecoverableError para el caso de validación y QueryFailedError para el fallo técnico. No aparece el mensaje crudo de esas excepciones ni el payload, actorUserId o subscriberId.
- En worker.stdout.log, la línea de inventario observada contiene un código de anomalía y metadatos permitidos; no aparece el mensaje crudo ni el payload. worker.stderr.log no contiene líneas de inventario pertinentes.
- api.stderr.log, del primer arranque, sí contiene una traza QueryFailedError con un detalle de permisos sobre platform_users. I4 confirmó que ese proceso falló antes de los grants y antes de procesar los casos CA-06/CA-08; no es la excepción del job de inventario y no contiene datos de negocio del consumo según esta inspección. Se registra como error crudo de arranque no correlacionado, no como fallo dinámico de CA-11.

### Resultado CA-11 y dictamen actualizado

**CA-11 pasa para los jobs diagnósticos reales de la DLQ dedicada:** los registros de UnrecoverableError (1 intento) y QueryFailedError (2 intentos) tienen el esquema saneado de siete campos y sus logs correlacionados no exponen payload, PII ni mensaje crudo. La inspección adicional deja la consulta de frontera D11 descrita arriba para los failed source jobs; el harness los retuvo con removeOnFail=false, mientras que producción configura 30 días.

El dictamen S2 se mantiene **NO GO** por los tres bloqueos estáticos de I1. No se añade un cuarto bloqueo por el failed source set porque el texto de D11 no define expresamente si ese estado de BullMQ es parte de la DLQ; queda como [CONSULTA] para resolución de arquitectura. No se modificó código ni se hizo commit.
