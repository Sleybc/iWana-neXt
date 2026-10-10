# Informe de seguridad — MOD11 ↔ MOD12: reverso de consumo · G1 S1

- **Versión:** 1.0
- **Fecha:** 2026-10-10
- **Dictamen:** **GO condicionado a los controles de implementación indicados abajo.**
- **Alcance:** revisión de riesgo S1, solo lectura. No se revisan ni reabren las decisiones de producto P1–P4.

## Resumen

`SUPERVISE` más la comprobación server-side de alcance por sede son controles de autorización adecuados para la acción propuesta, siempre que el endpoint nuevo revalide el alcance dentro de la transacción y falle cerrado. Para un reverso posterior al cierre, la autorización debe acompañarse de un rastro append-only propio del reverso y del movimiento contrario; no hace falta introducir un segundo aprobador, que cambiaría P1.

El filtro `safeTextField` es defensa en profundidad, no una garantía completa de que el motivo no tenga PII. El contrato propuesto mantiene el motivo en MOD11 y lo excluye del evento de reverso: esa minimización debe conservarse en la implementación. Las garantías de cola existentes tampoco se extienden automáticamente: el tipo nuevo tiene que agregarse a los contratos, validadores y listas explícitas del relay y de ambos procesadores.

## S1.1 — Autorización y rastro para una corrección posterior al cierre

La ruta de anulación vigente limita la operación a roles de supervisión y al permiso `OPERATIONS_EXECUTION_ORDERS_SUPERVISE` ([execution-orders.controller.ts](../../apps/api/src/modules/tasks/execution-orders.controller.ts):485-503). El servicio vuelve a validar el alcance contra la sede de la OT y la identidad del actor dentro de la transacción; si falta la sede, el port de acceso o el permiso de alcance, falla cerrado ([execution-orders.service.ts](../../apps/api/src/modules/tasks/services/execution-orders.service.ts):1987-1990, 3452-3472). Es un patrón adecuado para autorizar el reverso.

Eso no sustituye la auditoría. La anulación existente persiste una transición con actor y motivo y termina el comando con idempotencia, asiento de auditoría y evento durable (execution-orders.service.ts:1991-1998, 2018-2039; execution-order-reliability.service.ts:3810-3854). Un reverso de una OT terminal no debe falsificar una transición de estado ni reescribir el cierre. Debe quedar trazado por el registro append-only de R3: `item_usage_id`, `reversal_request_id`, motivo, solicitante, instante, estado/decisión y movimiento contrario, ligado al movimiento original; además, la operación debe generar su asiento de auditoría durable con actor y correlación. El `reversalRequestId` debe ser idempotente y único por tenant.

**Conclusión:** alcance de sede y `SUPERVISE` bastan para autorizar si el reverso registra esa evidencia durable. No recomiendo doble control; P1 queda intacta.

## S1.2 — Motivo, filtro PII y transporte

`safeTextField` recorta, limita la longitud y aplica `noColombianPII` ([execution-orders.dto.ts](../../apps/api/src/modules/tasks/dto/execution-orders.dto.ts):15-56); el schema actual de anulación exige motivo no vacío, máximo 2.000 caracteres y objeto estricto (execution-orders.dto.ts:214-227). Sin embargo, el propio código llama a estos patrones «defensa en profundidad» y aclara que no reemplazan la política de no incluir PII (líneas 15-23); los patrones enumerados detectan algunos formatos de cédula y teléfono, no toda PII posible (líneas 24-35).

En el diseño de reverso, `reason` está en el registro de MOD11, mientras que el payload de `InventoryConsumptionReversalRequestedV1` enumera IDs y actor y no incluye el motivo (spec de reverso: líneas 43 y 67-85). Esa es la opción de menor exposición. Hay un precedente distinto que no se debe copiar inadvertidamente: la anulación actual incluye `reason` en el evento y `finishCommand` lo incorpora al payload del outbox (execution-orders.service.ts:2037-2039, 3848-3853). El log local de anulación no imprime el texto del motivo (línea 2040).

**Conclusión:** mantener `safeTextField` como filtro de patrones conocidos, pero no presentarlo como detección exhaustiva. Mantener el texto exclusivamente en el registro de MOD11; excluirlo de evento, payload de cola, logs y DLQ. La interfaz debería pedir un motivo operativo sin nombres, teléfonos, correos ni identificadores personales.

**[CONSULTA] a AI-EM-ARCH:** el código confirma que `safeTextField` no cubre todas las formas de PII. Acordar si el filtro de patrones conocidos más la minimización anterior satisface la finalidad de auditoría, o si se requiere otra detección/guía antes de aprobar el campo libre. Evidencia: `apps/api/src/modules/tasks/dto/execution-orders.dto.ts:15-35`.

## S1.3 — Procedencia, validación, retención y Redis

Las garantías actuales son específicas de tipo y no se heredan por nombre o pertenencia al mismo módulo:

- La unión de `OperationalEventTypeV1` no contiene un evento de reverso todavía (execution-orders.ts:449-463). El relay clasifica tipos de inventario con una lista cerrada; esa lista determina que los jobs de origen tengan `removeOnFail` de 24 horas (execution-order-relay.service.ts:55-60, 286-294).
- El processor del worker solo coteja actualmente `InventoryConsumptionRequestedV2` contra su fila del outbox antes de firmar; tanto el `switch` como el validador y el cotejo son específicos de V2 (execution-order-events.processor.ts:289-291, 403-407, 460-520). El esquema firmado también contiene exactamente el envelope V2 (execution-orders.ts:611-656). El API verifica HMAC-SHA256 en tiempo constante y valida el schema después de verificar la firma (inventory-execution-request.processor.ts:280-309, 169-176).
- La limpieza programada en API y worker acota los jobs fallidos de las colas de origen a 24 horas mientras alguno de esos procesos esté activo; se ejecuta periódicamente y no inspecciona el contenido del job (inventory-execution-request.processor.ts:152-160, 467-483; execution-order-relay.processor.ts:51-67). Para que el tipo nuevo tenga además la clasificación, el diagnóstico y el tratamiento seguro de inventario, hay que incorporarlo explícitamente a las listas cerradas —incluida la lista de tipos de inventario de `execution-order-events.processor.ts:35-45`— y definir su schema estricto y canonicalización para el HMAC/cotejo.
- En código, API y worker requieren configurar `REDIS_PASSWORD` y la pasan a la conexión BullMQ (app.config.ts:160-167; app.module.ts:166-175; worker.config.ts:5-14; worker.module.ts:178-187). Esto acredita el control de configuración, no el estado de una instancia productiva, que queda fuera de este alcance. ADR-074 se considera decisión aprobada según la spec hermana.

**Condición:** extender en conjunto el contrato, Zod, cotejo del outbox antes de firmar, firma del envelope completo junto con tenant, resolución de tenant desde `public.tenants`, manejo de respuesta idempotente, clasificación como inventario en retención/DLQ/logs y Redis autenticado. La DLQ debe seguir usando diagnóstico reducido (IDs operativos, tipo de error, intentos e instante), nunca el payload ni el motivo. Si se omite la clasificación del relay, el tipo no reconocido recibe `removeOnFail` de 30 días (execution-order-relay.service.ts:55-60, 291-294). La limpieza programada de la cola compartida recorre todos los jobs fallidos, pero captura sus propios fallos y solo emite un warning (execution-order-relay.processor.ts:51-72); por eso no reemplaza la retención de 24 horas configurada por tipo y podría dejar el job más tiempo si esa limpieza falla.

**Conclusión:** el patrón es viable, pero la garantía es condicional a extender todos los puntos enumerados. Hoy no existe código de reverso que permita afirmar que ya heredó estas garantías.

## S1.4 — Abuso y reversos en cadena

R3 limita una línea de consumo a una solicitud de reverso por `item_usage_id` y fija idempotencia por `(tenant_id, reversal_request_id)` (spec de reverso: línea 43). La dirección definida para un serial es de sitio del cliente a custodia móvil del técnico; el reverso no elimina el serial del inventario. R7 ya contempla rechazar si el activo cambió de ubicación o la custodia está inactiva (spec: líneas 46-47, 78-81).

Una cadena posterior requeriría una nueva línea de consumo. El flujo actual de consumo exige `EXECUTE`, validación de OT mutable y que la custodia corresponda al técnico asignado; el actor debe coincidir con ese técnico (execution-orders.controller.ts:427-449; execution-orders.service.ts:1579-1608, 3583-3608). Por ello, `SUPERVISE` por sí solo no habilita crear esa nueva línea. Cada paso autorizado queda como movimiento y solicitud distintos.

**Condiciones antiabuso:** el endpoint no debe aceptar un `originalStockMovementId` arbitrario del cliente; debe derivarlo de la línea persistida de MOD11. MOD12 debe aplicar atómicamente la validación del estado/ubicación actual respecto del movimiento original, la custodia activa, el cierre del comodato que corresponda y la creación del movimiento contrario con referencia al original. Si el mundo cambió, debe guardar el rechazo tipado y no reintentar como error de negocio. Con esas condiciones y las unicidades de R3, no veo necesaria una cuota dura adicional. Es razonable emitir una métrica/alerta ante frecuencia anómala de reversos por supervisor o sede, sin bloquear la corrección legítima.

**Conclusión:** R3, las comprobaciones de R7 y la custodia por actor/sede limitan el abuso; el riesgo residual está en validar la referencia y el estado actual de forma atómica en MOD12.

## Condiciones para conservar el GO

1. El endpoint nuevo aplica roles/permisos, alcance por sede revalidado dentro de la transacción, y mantiene inmutable el estado/cierre/evidencia de una OT terminal.
2. La solicitud y el resultado tienen evidencia append-only correlacionable: actor, instante, motivo, IDs de línea y movimiento original/contrario, estado, decisión y recibo; request idempotency y auditoría durable obligatorios.
3. El motivo queda en MOD11 y no se copia a eventos, jobs, logs o DLQ. La limitación real de `safeTextField` queda documentada/aceptada con la consulta de privacidad anterior.
4. El tipo de reverso extiende cada allowlist, schema estricto, cotejo con outbox, HMAC, tratamiento de tenant, respuesta idempotente, DLQ minimizada y retención de 24 horas; Redis conserva autenticación configurada.
5. MOD12 valida y revierte con base en la línea y movimiento originales, estado actual del activo y custodia, todo atómico; rechazo de negocio es terminal y tipado.

## Material revisado

- `AGENTS.md` completo.
- `.agents/skills/security-auditor/SKILL.md` y `.agents/skills/backend-security-coder/SKILL.md` completos.
- `docs/specs/2026-10-09-mod11-mod12-reverso-consumo-ot-design.md` completo.
- `docs/specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md`, con foco en D4, D5, D8, D10, D11 y §10.
- `docs/prompts/PROMPT-MOD11-MOD12-REVERSO-G1-v1.0.md`, sección S1.
- Código de rutas/servicios MOD11, validación del motivo, relay y consumers API/worker, contrato de eventos y configuración Redis citados arriba.

No se ejecutaron pruebas ni se consultó producción/Redis de producción.
