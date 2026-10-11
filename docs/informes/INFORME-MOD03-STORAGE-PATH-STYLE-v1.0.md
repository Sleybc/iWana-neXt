# INFORME-MOD03-STORAGE-PATH-STYLE-v1.0

**Versión:** 1.0  
**Estado:** Corregido  
**Fecha:** 2026-10-11

## Causa

La configuración Joi convierte `S3_FORCE_PATH_STYLE` en booleano. `MediaModule` y el worker lo leían como texto y comparaban con `'true'`; por tanto, el valor booleano `true` se convertía en `false`. El SDK de S3 intentaba acceder al bucket mediante `iwana-media.localhost`, que no resuelve en el entorno local (`ENOTFOUND`). La API envolvía ese error como «Error al almacenar el archivo de evidencia».

## Corrección

API y worker ahora aceptan el valor como booleano validado o como texto del entorno, normalizando este último antes de configurar MinIO. Se conserva el modo path-style requerido por el MinIO local.

## Verificación

- Con las credenciales locales configuradas, `HeadBucket` con path-style confirmó que el bucket está accesible.
- La misma consulta con virtual-host style reprodujo `ENOTFOUND iwana-media.localhost`.
- `pnpm --filter @iwana/api build` y `pnpm --filter @iwana/worker build` finalizaron correctamente.
- No se ejecutaron suites de pruebas. El reinicio de los procesos locales para cargar el build fue rechazado por la política automática; API y worker deben recargarse para que la corrección quede activa en la sesión actual.
