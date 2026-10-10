# Informe S3 — Reauditoría de la DLQ genérica (§8.5)

- **Versión:** 1.1
- **Fecha:** 2026-10-10
- **Agente:** `sec-eng`
- **SHA auditado:** `72d367a3bea79a0f9f3e3932ef6f983f740ec803`
- **Modo:** auditoría estática focalizada; solo lectura.
- **Commit de este informe:** no realizado.

## Relación con la v1.0

Este informe sustituye exclusivamente el dictamen del apartado **§2, deuda §8.5: DLQ genérica** de [la v1.0](INFORME-PLAT-REDIS-AUTH-ADR074-S3-SEC-ENG-v1.0.md). El dictamen P2 sobre autenticación Redis del §1 de la v1.0 no se reabrió ni se modifica aquí.

## Dictamen

| Alcance                             | Veredicto |
| ----------------------------------- | --------- |
| Cierre de deuda §8.5 — DLQ genérica | **GO**    |

La revisión estática del SHA indicado confirma que la DLQ genérica limita la retención de diagnósticos, sanea los jobs heredados y purga los terminales antes de registrar los workers. También confirma que los errores al adquirir la conexión SQL quedan dentro del manejo que evita retener texto crudo en BullMQ.

## Evidencia

1. **Retención de la ruta genérica:** el productor fija `removeOnComplete: true` y `removeOnFail: { age: DLQ_RETENTION_SECONDS }` al encolar el diagnóstico. El valor de retención es 30 días. [Productor genérico](../../apps/worker/src/processors/execution-order-events.processor.ts#L257-L261)

2. **Limpieza periódica:** el processor programa limpieza repetible cada hora, elimina fallidos con más de 30 días y retiene la configuración acotada del propio job de limpieza. [Registro y ejecución de limpieza](../../apps/worker/src/processors/execution-order-dlq.processor.ts#L252-L263) [Limpieza de fallidos](../../apps/worker/src/processors/execution-order-dlq.processor.ts#L348-L355)

3. **Saneamiento y purga heredada:** durante `onModuleInit`, el barrido lee claves de la cola, normaliza el `envelope` heredado a un diagnóstico permitido y actualiza `data`, `opts` y el marcador de purga en una operación `HSET`. Los jobs ya saneados también reciben la retención actualizada. Los jobs en estado terminal se eliminan por clave; el marcador global se escribe al finalizar el barrido. [Normalización heredada](../../apps/worker/src/processors/execution-order-dlq.processor.ts#L160-L180) [Barrido y actualización atómica](../../apps/worker/src/processors/execution-order-dlq.processor.ts#L240-L250) [Purga Redis](../../apps/worker/src/processors/execution-order-dlq.processor.ts#L267-L345)

4. **Orden de arranque y reanudación:** el test comprueba que el registro de workers ocurre después del saneamiento y la purga; otros casos cubren purga idempotente de terminales y reanudación tras una interrupción. [Pruebas de arranque y purga](../../apps/worker/src/processors/execution-order-dlq.processor.spec.ts#L164-L270)

5. **Fallo al adquirir conexión SQL:** `pool.connect()` está dentro del `try`; el `catch` registra un tipo de error permitido y relanza un mensaje fijo. Así BullMQ no almacena el mensaje crudo de un rechazo de `pool.connect()` como `failedReason`. [Manejo de persistencia](../../apps/worker/src/processors/execution-order-dlq.processor.ts#L376-L457) [Prueba de rechazo de conexión](../../apps/worker/src/processors/execution-order-dlq.processor.spec.ts#L392-L421)

## Gates de la revisión

- CI del SHA auditado: [run 37935796855](https://github.com/Sleybc/iWana-neXt/actions/runs/37935796855), conclusión **success**. Incluye el job principal de lint/typecheck/build/unit tests y el E2E operativo R4.1.
- La reauditoría fue estática; no ejecuté pruebas ni comandos Redis como parte de esta revisión.
- No se accedió a Redis de producción. En namespaces sin el marcador v2, el primer arranque del worker actualizado ejecutará el barrido antes de registrar workers; esta revisión no observa la ejecución operativa de ese barrido en producción.

## Conclusión

La deuda §8.5 de la DLQ genérica queda **cerrada por revisión de seguridad: GO** para `72d367a3bea79a0f9f3e3932ef6f983f740ec803`. Este dictamen no se extiende a otros apartados de S3 ni modifica el resultado P2 de la v1.0.
