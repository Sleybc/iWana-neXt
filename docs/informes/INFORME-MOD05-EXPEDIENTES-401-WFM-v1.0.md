# Informe — corrección de 401 en expedientes y WFM

**Versión:** 1.0  
**Fecha:** 2026-08-23  
**Modo:** Architect + EM  
**Estado:** Cerrado con evidencia local  
**Alcance:** Portal empresarial, detalle de expedientes y cliente HTTP compartido

## 1. Hallazgo

La navegación del portal podía mostrar respuestas `401` en las consultas de
WFM (`visit-requests`, `work-orders`, `events` y `eligible-assignees`) durante
HMR, recarga o renovación de sesión.

## 2. Causa raíz

`apps/portal/src/lib/api-client.ts` enviaba simultáneamente el token Bearer
mantenido en memoria y la cookie `httpOnly` de sesión. El backend prioriza el
header `Authorization`; si el valor en memoria quedaba vencido o desfasado,
rechazaba la petición antes de usar la cookie válida. El reintento podía
recuperar la sesión, pero el 401 inicial seguía apareciendo como error de
recurso en el navegador.

La causa contradice el transporte canónico de [ADR-081](../adrs/ADR-081-Modelo-de-Sesion-Cookie-HttpOnly.md),
que establece la cookie `httpOnly` como credencial automática del navegador.

## 3. Corrección

- Las peticiones ordinarias del cliente portal ya no adjuntan el Bearer en memoria.
- El reintento posterior a una renovación elimina cualquier `Authorization` heredado.
- Las descargas autenticadas de compras usan la misma sesión por cookie.
- Se actualizó la prueba de refresh para cubrir un token en memoria obsoleto y verificar que no se reutiliza.

No se modificaron guards, roles, aislamiento de tenant ni contratos de los
endpoints WFM.

## 4. Evidencia

- `pnpm.cmd --filter @iwana/portal test -- --runInBand src/lib/api-client.spec.ts`: 10/10 tests en verde.
- `pnpm.cmd --filter @iwana/portal exec jest --runInBand "src/app/dashboard/crm/expedientes/\[id\]/page.spec.tsx"`: 6/6 tests en verde.
- `pnpm.cmd --filter @iwana/portal typecheck`: correcto.
- `pnpm.cmd --filter @iwana/portal lint`: 0 errores; permanecen warnings preexistentes del workspace.
- Verificación manual en `/dashboard/scheduling/agenda`: `visit-requests`, `work-orders`, `events` y `eligible-assignees` respondieron `200/304`, sin errores de consola.

## 5. Impacto y riesgos

- **Tenant:** sin cambio de resolución; la cookie contiene el contexto JWT verificado y se conserva `X-Tenant-Slug` para compatibilidad del cliente.
- **Seguridad:** se elimina la precedencia accidental de una credencial Bearer obsoleta; las mutaciones conservan `X-Requested-With`.
- **Escala:** el cambio está centralizado en el cliente HTTP y evita retries innecesarios para todos los consumidores portal.
- **Regulación:** sin cambio funcional ni de datos; no se incorporan datos personales al artefacto.
