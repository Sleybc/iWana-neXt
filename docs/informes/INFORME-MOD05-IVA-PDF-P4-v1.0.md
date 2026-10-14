# INFORME MOD05 — D-PDF P4: corrección OpenAPI

**Versión:** 1.0 · **Fecha:** 2026-10-14  
**Bloque:** P4 · `sr-backend`  
**Veredicto:** **GO**

## Resultado

Se corrigió únicamente la documentación OpenAPI de `POST /crm/contracts/:id/stratum-evidence` en `apps/api/src/modules/crm/contracts/contracts.controller.ts`:

- El campo `file` documenta «PDF, JPEG, PNG o WEBP; máximo 10 MiB».
- Se documentó `STRATUM_EVIDENCE_TYPE_NOT_ALLOWED` como respuesta 422. Se conservó el 422 preexistente para el punto de servicio que no admite soporte; la descripción nueva también refleja ambos motivos en la respuesta OpenAPI compartida para el código HTTP 422.
- La búsqueda no encontró pruebas que fijaran el texto anterior, así que no hizo falta modificar specs.

No cambiaron el comportamiento del endpoint, contratos compartidos ni migraciones. No se aplicaron migraciones ni se alteró `dbiw`. La ruta de este informe estaba libre antes de escribirlo.

## Verificación

| Comando                                                                          | Resultado                                                                                                 |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @iwana/api typecheck`                                             | Exit 0 (`tsc --noEmit`)                                                                                   |
| `pnpm exec turbo run test --filter=@iwana/api --force`                           | Exit 0; 339 suites aprobadas, 4 omitidas; 4.797 tests aprobados, 15 omitidos; `Cached: 0 cached, 4 total` |
| `git diff --check -- apps/api/src/modules/crm/contracts/contracts.controller.ts` | Exit 0                                                                                                    |

## Deuda nueva

Ninguna. P4 cierra el hallazgo de OpenAPI identificado en el informe de seguridad D-PDF.
