# Informe S3 — Reauditoría de Redis y cierre de deuda DLQ genérica

**Agente:** sec-eng
**Fecha:** 2026-10-09
**Modo:** revisión estática; no se ejecutaron pruebas ni verificaciones funcionales.
**Commit:** no realizado

## Dictamen

| Punto | Veredicto |
|---|---|
| 1. P2 frente al ADR-074 | **GO** |
| 2. Cierre de la deuda §8.5, DLQ genérica | **NO GO** |

## 1. ADR-074: autenticación de Redis — GO

La inspección estática confirma que los consumidores configurados en el código reciben `REDIS_PASSWORD` directamente y que el arranque valida su presencia:

- El servicio Redis del Compose base usa `--requirepass` con interpolación obligatoria `${REDIS_PASSWORD:?...}`; el healthcheck usa la misma credencial (`docker-compose.yml:114-127`). El worker E2E, `api-prod` y `worker-prod` reciben la variable con requisito duro (`docker-compose.e2e.yml:71`, `docker-compose.prod.yml:135,331`). El servicio Redis es compartido por los perfiles; no se encontró un override que quite `--requirepass`.
- La configuración de API rechaza la variable ausente o vacía (`apps/api/src/app.config.ts:163-167`). El worker aplica `validateWorkerConfiguration` al cargar configuración fuera de `NODE_ENV=test`, y esa validación falla ante ausencia o valor en blanco (`apps/worker/src/worker.module.ts:145-150`, `apps/worker/src/worker.config.ts:4-13`).
- Los cuatro caminos de conexión que construyen clientes —BullMQ de API, `RedisModule`, BullMQ de worker y cliente de telemetría del worker— pasan el valor configurado sin fallback (`apps/api/src/app.module.ts:168-176`, `apps/api/src/modules/redis/redis.module.ts:31-40`, `apps/worker/src/worker.module.ts:178-188,230-240`). La búsqueda global de constructores `Redis` no encontró otros clientes de aplicación. El seed E2E también pasa la clave; el provisionador E2E crea su credencial efímera, y el script del usuario Redis de solo lectura falla cerrado si falta (`e2e/scripts/seed-mod11-r5-fixtures.mjs:435-441`, `scripts/e2e-provision-operational.mjs:267`, `scripts/db/dev-redis-readonly-user.mjs:73-76`).
- El preflight local incluye `REDIS_PASSWORD` (`scripts/dev.mjs:40`). Las plantillas versionadas contienen la asignación vacía y explican cómo generar la credencial, sin un valor operativo (`.env.example:140-145`, `.env.production.example:77-80`). La lista de archivos versionados con nombre de entorno contiene solo esas dos plantillas; no hay `.env` local versionado. Las apariciones en tests son valores centinela de prueba, no credenciales de despliegue.

El informe P2 registra la comprobación funcional `NOAUTH` sin contraseña y `PONG` con ella, junto con QA-33, E2E y los gates de tipo y Jest. No repetí esos comandos en esta auditoría estática. No encontré un consumidor con fallback de conexión anónima ni una contraseña Redis operativa versionada.

## 2. Deuda §8.5: DLQ genérica — NO GO

La ruta genérica actual de `ExecutionOrderEventsProcessor.onFailed` mejora el diagnóstico: valida UUID antes de incluir identificadores, limita `errorType` a un catálogo y no copia el sobre ni el mensaje de la excepción (`apps/worker/src/processors/execution-order-events.processor.ts:232-261`). La ruta de inventario configura borrado inmediato al completar y 30 días al fallar (`:214-218`).

Quedan dos bloqueos para cerrar §8.5:

1. **La ruta genérica retiene sus diagnósticos indefinidamente.** Su `add()` configura `removeOnComplete: false` y `removeOnFail: false` (`apps/worker/src/processors/execution-order-events.processor.ts:257-260`). Aunque el formato nuevo contiene solo metadatos permitidos, los identificadores de tenant y agregado permanecen en Redis sin límite, y la cola puede crecer sin límite. Esto no sigue la retención declarada por D11, aplicada a la ruta de inventario. **Corrección propuesta:** aplicar también a la ruta genérica borrado al completar y retención acotada al fallar, coherente con los 30 días ya usados por la ruta de inventario.

2. **La compatibilidad heredada no elimina el sobre ni el mensaje crudo del job almacenado.** `ExecutionOrderDlqProcessor` detecta la forma anterior con `envelope` y `diagnostic`, extrae y normaliza campos permitidos, e ignora `errorMessage` al construir el diagnóstico persistido (`apps/worker/src/processors/execution-order-dlq.processor.ts:11-17,178-197`). Sin embargo, el job en Redis conserva su `data` heredado durante el procesamiento; el processor no lo sustituye ni lo elimina. Como la ruta genérica actual deja los jobs completados y fallidos sin retención (`execution-order-events.processor.ts:257-260`), un registro heredado puede conservar indefinidamente el sobre y `errorMessage`. La envoltura de eventos puede transportar datos de contexto del actor y suscriptor (`packages/shared/src/contracts/operations/execution-orders.ts:511-522`). **Corrección propuesta:** antes de completar una entrada heredada, sustituir su `data` por el diagnóstico normalizado permitido; además, aplicar una limpieza acotada a jobs completados y fallidos heredados que ya existan. Mantener el parser de compatibilidad solo mientras sea necesario y retirar la forma antigua después de migrar o purgar esos registros.

El processor heredado sí evita persistir o registrar `errorMessage` en sus rutas de normalización; eso reduce exposición en SQL y logs, pero no resuelve la copia que permanece en Redis. Por tanto, la deuda no se cierra hasta resolver tanto la retención genérica indefinida como el saneamiento y la retención de jobs heredados.

## Alcance y limitación

La revisión se limitó a lectura estática de ADR-074, informe P2, prompt S3, código, Compose, plantillas y skills requeridas. Los resultados de runtime citados arriba proceden del informe P2 y no son una repetición independiente.
