# INFORME-MOD13-CORRECCION-RESERVA-v1.0

**Fecha:** 2026-10-23  
**Bloque:** Ola 13 · B-fix3  
**Estado:** corregido y verificado contra el API y PostgreSQL locales.

## Traza y causa

Se inició `pnpm --filter api dev` con stdout y stderr redirigidos a `%TEMP%\mod13-reserve-api-20261023-135604.log`. La única repetición diagnóstica de `POST /api/v1/network/provisioning/reserve` en la sesión NOC de FX-v1 respondió 500. El excerpt conservado fuera del repositorio y saneado quedó así:

```text
UNHANDLED_ERROR method=POST
path=/api/v1/network/provisioning/reserve class=EntityMetadataNotFoundError sqlstate=none
    at TenantContextMissingFilter.catch (apps/api/src/common/filters/tenant-context-missing.filter.ts:77:76)
```

El filtro registra la clase resumida y una pila creada dentro del propio filtro; no conserva el mensaje ni la pila original de TypeORM. El error ocurrió antes de que PostgreSQL rechazara una consulta. El servicio inserta `ip_assignments` con SQL directo y después llama `manager.findOne(IpAssignment, ...)` durante `reserve`. `NetworkModule` no había registrado `IpAssignment` en `TypeOrmModule.forFeature`, por lo que TypeORM lanzó `EntityMetadataNotFoundError` y la transacción revirtió la inserción y el servicio.

## Corrección

Se añadió `IpAssignment` a `TypeOrmModule.forFeature` en `apps/api/src/modules/network/network.module.ts`. No cambió el contrato compartido, el esquema ni las migraciones.

La prueba `apps/api/src/modules/network/tests/network.wiring.postgres.integration.spec.ts` llama al API de desarrollo con sesiones FX-v1 y Postgres `dbiw`. El proceso ejecuta `AppModule` con `NetworkModule` y sus módulos reales de lectura de tasks, CRM e inventario. No sustituye puertos: tasks, CRM, inventario, actor y router usan sus adaptadores reales; Redis también permaneció disponible como servicio real.

| Comando cableado | Verificación |
| --- | --- |
| Contexto NOC | Respuesta 200 y OT real. |
| Contexto técnico | Respuesta 200 y proyección de exactamente cinco campos. |
| Reserve | Respuesta 201 y servicio `RESERVED` con asignación IP persistida. |
| Certify | Rechazo 422 `PROVISIONING_EVIDENCE_REQUIRED` usando el puerto real de evidencia. |
| Release | Respuesta 200 y reserva liberada mediante la lectura real de la OT. |
| Regularize | Rechazo 422 `PROVISIONING_ORDER_NOT_ELIGIBLE` para la OT abierta, leído por el puerto real de tasks. |

## Revalidación viva y estado de FX-v1

Después de las pruebas se repitió `reserve` contra `127.0.0.1:3000` con sesión NOC. Resultado saneado: `health=200; login=200; reserve=201; contexto=RESERVED`. Una lectura posterior confirmó `health=200`, contexto `200` y aprovisionamiento `RESERVED`. La OT queda reservada para continuar V1-r.

No se accedió ni se escribió en `tenant_iwana`. No se migraron tenants, no se hizo commit y no se imprimieron credenciales ni datos personales.

## Verificación y conteo real

- Cableado real dirigido: **1 suite, 6 tests aprobados, 0 fallidos, 0 omitidos**.
- Integraciones PostgreSQL de `network`: **5 suites; 4 aprobadas y 1 omitida; 29 tests, 24 aprobados y 5 omitidos**. La suite de eventos requiere además `IWANA_REDIS_INTEGRATION_AVAILABLE=true`; el resto corrió con `IWANA_DB_INTEGRATION_AVAILABLE=true` contra PostgreSQL real.
- Unitarias de `network`: **9 suites, 29 tests aprobados, 0 fallidos, 0 omitidos**.
- `pnpm --filter @iwana/api typecheck`: aprobado.
- `pnpm --filter @iwana/api lint`: 0 errores y 7 warnings en archivos ajenos a MOD13 (`main.ts`, auditoría, inventario, tasks y taxation).
- `pnpm --filter @iwana/api build`: aprobado.
- Rutas de caché Jest comprobadas bajo `apps/api`: **0**.

La primera corrida de la nueva suite tuvo 5/6 aprobados: una aserción del test ubicaba `executionOrder` en la raíz, aunque el DTO lo anida bajo ese nombre. Se ajustó la aserción al DTO congelado; la corrida final quedó 6/6. No se añade deuda nueva P0–P3. Se mantiene como limitación de diagnóstico existente que `TenantContextMissingFilter` no registra la pila original de excepciones no HTTP.
