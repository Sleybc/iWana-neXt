# INFORME MOD05 E-3 · H1 backend

| Campo       | Valor                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------- |
| Fecha       | 2026-10-15                                                                                        |
| Responsable | AI-SR-FULL                                                                                        |
| Resultado   | **PASS**                                                                                          |
| Alcance     | Techo de autorización del retry, auditoría explícita sin PII y actualización del test B5 bajo R8. |

## Cambios

- `POST :id/retry-conversion` vuelve al techo de `fb3d41ee`: `@Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)` y `@Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)`. `SALES` y `SUPPORT` quedan fuera de la ruta de escritura.
- `retryConversionEvent` registra `CONVERSION_RETRY` sobre `Expediente`, con actor y valores `eventName`, `resolved` y `errorCode`. La auditoría no incluye datos del titular ni el payload del evento. La columna tenant `audit_logs.action` es `VARCHAR`; no se alteraron contratos compartidos ni DDL.
- El test B5 ahora mantiene el consentimiento válido para R8 y siembra dos fallos transitorios sintéticos: la conversión queda pendiente, el primer retry continúa pendiente y el siguiente retry resuelve el registro y crea un único suscriptor. El test verifica en PostgreSQL las filas `CONVERSION_RETRY`, su actor y sus tres valores; también verifica que no contengan los datos sintéticos del titular.

## Verificación

Pruebas HTTP y unitarias dirigidas:

```text
pnpm --filter @iwana/api exec jest src/modules/crm/expedientes/expedientes.controller.fase2.http.spec.ts src/modules/crm/expedientes/tests/expediente.service.spec.ts --runInBand --no-cache
2 suites aprobadas; 93 tests aprobados.
```

El test HTTP demuestra que SALES y SUPPORT con `CRM_SUBSCRIBERS_MANAGE` reciben 403 y no invocan el servicio; ADMIN con ese permiso recibe 201 e invoca el servicio con su actor.

Integración contra PostgreSQL migrado, con `E2E_TENANT_SLUG=srqa-mod05-e3-3dbb1e8f72a8`:

```powershell
$env:IWANA_DB_INTEGRATION_AVAILABLE='true'
$env:DB_HOST='127.0.0.1'
$env:DB_PORT='5433'
$env:DB_NAME='dbiw'
$env:E2E_TENANT_SLUG='srqa-mod05-e3-3dbb1e8f72a8'
pnpm --filter @iwana/api test:integration
```

Resultado: exit 0; **19 suites aprobadas, 2 omitidas**; **83 tests aprobados, 14 omitidos**. B5 aprobó sus 16 tests, incluida la transición pendiente → resuelto y la lectura real de las auditorías sin PII.

Suite completa API sin caché:

```text
pnpm exec turbo run test --filter=@iwana/api --force
exit 0; 376 suites aprobadas, 4 omitidas; 5.000 tests aprobados, 15 omitidos; 4/4 tareas; Cached: 0 cached.
```

`pnpm exec prettier --check` para los cinco archivos H1 y `git diff --check` terminaron con exit 0. La ruta `docs/informes/INFORME-MOD05-E3-H1-v1.0.md` estaba libre antes de crear este informe. No se hizo commit.
