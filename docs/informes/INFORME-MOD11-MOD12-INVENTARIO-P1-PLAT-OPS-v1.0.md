# Informe P1 — Secreto de firma de colas internas

**Versión:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-10-06  
**Bloque:** P1 · `plat-ops`

## Cambios

- Añadida `INTERNAL_QUEUE_SIGNING_KEY` a `.env.example` y `.env.production.example` con marcadores no operativos e instrucción de generar 32 bytes aleatorios en base64 mediante `openssl rand -base64 32`.
- Añadida la entrada opcional `INTERNAL_QUEUE_SIGNING_KEY_PREVIOUS` para la ventana de doble aceptación.
- Inyectadas ambas variables en `api-prod` y `worker-prod` en `docker-compose.prod.yml`. Compose exige la clave activa y deja previous vacía si no hay rotación.
- La validación de configuración del API falla en producción si falta la clave activa, no es base64 canónico o decodifica a menos de 32 bytes. El bootstrap del worker aplica el mismo control antes de inicializar NestJS; valida también previous si está configurada.
- Documentado el procedimiento de rotación y el drenaje de jobs en vuelo en `docs/runbooks/RUNBOOK-INTERNAL-QUEUE-SIGNING-KEY-ROTATION-v1.0.md`.

## Frontera y coordinación

Para el fail-closed de arranque se modificaron únicamente `apps/api/src/app.config.ts` y `apps/worker/src/main.ts` fuera de los archivos de infraestructura y documentación. El dueño de I1 confirmó que `main.ts` queda excluido de sus cambios; no se tocaron processors ni módulos de tasks.

I1 debe firmar solo con `INTERNAL_QUEUE_SIGNING_KEY`. I2 debe verificar con la activa y `INTERNAL_QUEUE_SIGNING_KEY_PREVIOUS` durante la ventana. La rotación del runbook actualiza primero el API consumidor y luego el worker emisor.

## Verificación

- `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile production --env-file .env.production.example config --quiet`: **OK**.
- Compose con `INTERNAL_QUEUE_SIGNING_KEY` vacía: **rechaza** la configuración por el requisito de la clave activa.
- Typecheck API y worker: **no verdes** por un error concurrente en `packages/shared/src/contracts/operations/execution-orders.ts:610`; el typecheck del worker también señala el handler nuevo incompleto en `apps/worker/src/processors/execution-order-events.processor.ts:197`. Ninguno señala los archivos de bootstrap de P1. I1 debe volver a ejecutar sus gates cuando cierre esos errores.
- El bloque P1 no define gates de Jest ni Postgres; no se ejecutaron.

## Resultado

P1 queda implementado para el arranque de API y worker en producción y para la configuración del Compose productivo. La aceptación criptográfica activa/previous queda en manos de I2, y la firma con la clave activa queda en I1, según las fronteras del encargo.
