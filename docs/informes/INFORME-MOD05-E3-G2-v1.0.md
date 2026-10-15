# INFORME MOD05-E3-G2 v1.0

**Estado:** PASS técnico de G2  
**Fecha:** 2026-10-15  
**Alcance:** interfaz del expediente para fallos de conversión, reintento y respuesta 422 R8.

## Resultado

La ficha del expediente presenta mensajes en español asociados a los códigos de fallo de conversión, sin exponer códigos, nombres de eventos, identificadores ni otros datos internos. El reintento llama a `POST /crm/expedientes/:id/retry-conversion`, se ofrece únicamente cuando el permiso efectivo `crm.expedientes.manage` está disponible y vuelve a cargar el bootstrap al terminar. La transición que responde 422 con `EXPEDIENTE_DATA_AUTHORIZATION_REQUIRED` muestra el texto requerido por G2.

El contrato se verificó contra los cambios de G1: el bootstrap incluye `conversionFailure` con `eventName`, `errorCode`, `attempts` y `lastFailedAt`; la ruta de reintento está publicada y su guard de permisos usa `CRM_EXPEDIENTES_MANAGE`.

## Cambios

- `apps/portal/src/components/crm/expedientes/ExpedienteConversionBanner.tsx`: copia por código, mensaje genérico de respaldo y CTA de reintento con estados ocupado/deshabilitado.
- `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`: proyección del fallo desde el bootstrap, manejo de R8, gating por permiso y recarga tras reintento.
- `apps/portal/src/lib/api-client.ts`: tipo de fallo de conversión y llamada tipada a la ruta de reintento.
- Tests propios en `ExpedienteConversionBanner.spec.tsx`, `page.spec.tsx` y `api-client.spec.ts` cubren los textos, la llamada y recarga, y la ausencia de acción sin permiso.

## Evidencia de verificación

Los comandos se ejecutaron desde la raíz del monorepo, con Turbo forzado y sin resultados de caché.

| Verificación                                                                                                                                                                                                                                  | Resultado real                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @iwana/portal exec jest --runInBand --runTestsByPath src/components/crm/expedientes/ExpedienteConversionBanner.spec.tsx 'src/app/dashboard/crm/expedientes/[id]/page.spec.tsx' src/lib/api-client.spec.ts`                     | PASS: 3 suites, 53 tests                                                                                    |
| `pnpm exec turbo run test --filter=@iwana/portal --force` (revalidado tras cerrar G1)                                                                                                                                                         | PASS: 299 suites; 3,014 tests pasaron, 1 omitido (3,015 total), 0 snapshots; 2 tareas exitosas, 0 cache hit |
| `pnpm exec turbo run typecheck --filter=@iwana/portal --force`                                                                                                                                                                                | PASS: 3 tareas exitosas, 0 cache hit                                                                        |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/crm/expedientes/ExpedienteConversionBanner.tsx 'apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx' apps/portal/src/lib/api-client.ts` | PASS: sin hallazgos en las rutas analizadas                                                                 |
| `pnpm exec prettier --check` sobre los seis archivos fuente y test de G2                                                                                                                                                                      | PASS: todos usan el formato esperado                                                                        |
| `git diff --check`                                                                                                                                                                                                                            | PASS: sin errores de whitespace                                                                             |

## Contrato de autorización verificado

Tras el cierre de G1, se verificó que el controller permite `ADMIN`, `SALES`, `SUPPORT` y `SYSTEM_ADMIN`, y conserva `@Permissions(CRM_EXPEDIENTES_MANAGE)`. La prueba HTTP de G1 verifica SALES y SUPPORT permitidos con ese permiso y que `CRM_SUBSCRIBERS_MANAGE` no basta. El gating del portal por permiso efectivo coincide con el contrato final.

## Límite de validación

El gate de portal y las pruebas unitarias quedaron verdes. La integración E2E completa contra portal y API reales corresponde a G3 y no se declara como ejecutada por este informe.

No se realizó commit.
