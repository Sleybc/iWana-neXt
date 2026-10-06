# RUNBOOK — Rotación de la clave de firma de colas internas

**Versión:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-10-06

## Alcance

`INTERNAL_QUEUE_SIGNING_KEY` protege con HMAC-SHA256 los jobs internos de inventario definidos en la spec MOD11↔MOD12 v1.1, D8. La clave se provisiona desde el gestor de secretos del entorno y nunca se guarda en Git, en una imagen Docker ni en un informe.

En producción se requieren al menos 32 bytes aleatorios, codificados en base64. Para generar una clave nueva:

```sh
openssl rand -base64 32
```

Guarda el resultado directamente en el gestor de secretos. No copies la salida a una plantilla versionada, un ticket o un log.

## Variables

| Variable | Uso |
| --- | --- |
| `INTERNAL_QUEUE_SIGNING_KEY` | Clave activa. El emisor firma solo con esta clave. Obligatoria en API y worker de producción. |
| `INTERNAL_QUEUE_SIGNING_KEY_PREVIOUS` | Segunda clave aceptada por el verificador durante la rotación. Vacía fuera de la ventana. |

El API debe verificar la firma contra la clave activa y, mientras no esté vacía, contra `INTERNAL_QUEUE_SIGNING_KEY_PREVIOUS`. El worker firma con la clave activa. La aceptación de la clave anterior es temporal y no autoriza a emitir firmas con ella.

## Rotación sin perder jobs en vuelo

1. Confirma que la clave actual `K1` está disponible en el gestor de secretos y que el API y el worker tienen una versión compatible con doble aceptación. Mantén `INTERNAL_QUEUE_SIGNING_KEY=K1` y deja `INTERNAL_QUEUE_SIGNING_KEY_PREVIOUS` vacío.
2. Genera `K2`. Actualiza primero el API consumidor con `INTERNAL_QUEUE_SIGNING_KEY=K2` y `INTERNAL_QUEUE_SIGNING_KEY_PREVIOUS=K1`. Reinicia o reemplaza todas las réplicas del API y confirma que están sanas. Mientras tanto, los workers siguen firmando con `K1`, que el API acepta como clave anterior.
3. Actualiza el worker emisor con `INTERNAL_QUEUE_SIGNING_KEY=K2` y `INTERNAL_QUEUE_SIGNING_KEY_PREVIOUS=K1`. Durante el despliegue, los workers antiguos siguen firmando con `K1` y los nuevos con `K2`; el API acepta ambas. El worker emisor usa solo `K2`.
4. Mantén `K1` como previous hasta que no queden jobs, reintentos ni mensajes diferidos firmados con `K1`. Considera los jobs activos y pendientes en Redis y las solicitudes que aún puedan llegar desde el outbox; los jobs completados se eliminan y los fallidos se retienen según D11. Si no puedes demostrar que la cola dejó de contener firmas de `K1`, conserva la clave anterior o detén y drena el flujo antes de retirarla.
5. Cuando el drenaje esté confirmado, elimina `INTERNAL_QUEUE_SIGNING_KEY_PREVIOUS` de los secretos de API y worker y reinicia ambos. Verifica que siguen sanos y que el flujo de nuevas solicitudes continúa con `K2`. Después, revoca `K1` en el gestor de secretos.

No retires `K1` mientras haya jobs en vuelo: un consumidor que no la acepte rechazará esas solicitudes, y los reintentos no pueden reconstruir la firma original. La DLQ no contiene el payload ni la firma; reemitir desde una DLQ sanitizada requiere crear una solicitud nueva por el flujo de aplicación, no recuperar el job firmado.

## Reversión

Si el API deja de aceptar jobs con `K2`, restablece `K1` como clave activa y conserva `K2` como previous mientras existan jobs firmados con ella. Despliega primero el API verificador y luego el worker emisor con ese mismo par. No borres ninguna de las dos claves hasta que la cola y el outbox hayan drenado los jobs firmados con la clave que se retirará.
