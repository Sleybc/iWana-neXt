# Informe — Privacy, textos legales B6

**Versión:** 1.0  
**Estado:** Cerrado — D-B4-1 aplicado y verificado  
**Fecha:** 2026-10-29

## Alcance

Se añadió `RolesGuard` en los nueve controladores de `privacy`, en el orden `JwtAuthGuard, RolesGuard, PermissionsGuard`. `PrivacyModule` importa `AuthModule` para resolver el guard exportado. No se modificaron `PermissionsGuard`, `RolesGuard`, `TenantMiddleware`, sus decoradores de rol o permiso, ni código de otros módulos. No se tocaron los cambios de MOD13 ni se usaron secretos o PII reales.

## Archivos del bloque

- `apps/api/src/modules/privacy/authorizations/authorizations.controller.ts`
- `apps/api/src/modules/privacy/evidence/privacy-evidence.controller.ts`
- `apps/api/src/modules/privacy/incidents/incidents.controller.ts`
- `apps/api/src/modules/privacy/inventory/inventory.controller.ts`
- `apps/api/src/modules/privacy/legal-texts/legal-texts.controller.ts`
- `apps/api/src/modules/privacy/marks/marks.controller.ts`
- `apps/api/src/modules/privacy/purposes/purposes.controller.ts`
- `apps/api/src/modules/privacy/requests/requests.controller.ts`
- `apps/api/src/modules/privacy/retention/retention.controller.ts`
- `apps/api/src/modules/privacy/privacy.module.ts`
- `apps/api/src/modules/privacy/privacy.module.spec.ts`
- `apps/api/src/modules/privacy/privacy.roles-guard.http.spec.ts`
- `apps/api/src/modules/privacy/authorizations/authorizations.controller.http.spec.ts`
- `apps/api/src/modules/privacy/requests/requests.controller.http.spec.ts`
- `apps/api/src/modules/privacy/inventory/inventory.controller.http.spec.ts`
- `apps/api/src/modules/privacy/purposes/purposes.controller.http.spec.ts`
- `apps/api/src/modules/privacy/privacy.swagger.spec.ts`

## Verificación de D-B4-1

La prueba HTTP nueva firma tokens sintéticos RS256 con una pareja RSA efímera y ejecuta los guards y `TenantMiddleware` reales. Confirma:

- Token de plataforma más `X-Tenant-Slug` recibe 403 en `POST /privacy/legal-texts`, `PUT /privacy/purposes` y mutaciones de `requests`, `incidents`, `authorizations` y `retention`.
- Tenant AUDITOR (perfil DPO) y ADMIN con `privacy.manage` pueden actualizar finalidades.
- Tenant SUPPORT recibe 403.
- `GET /privacy/legal-texts/current` y `GET /privacy/purposes` conservan el residual aceptado con token de plataforma y slug.
- Los nueve controladores publican exactamente el orden de guards acordado; la prueba de composición compila `PrivacyModule` con `AuthModule`.

El comportamiento previo de CA-LT-03 para usuario tenant sin rol/permiso de privacidad sigue cubierto por `legal-texts.controller.http.spec.ts`: `current` responde 200 y listado/publicación responden 403.

## Evidencia de pruebas

Comandos directos, sin Turbo ni caché (`Cached: 0`):

| Comando | Resultado real |
| --- | --- |
| `pnpm --filter @iwana/api exec jest modules/privacy access-permission-catalog.invariant.spec.ts --runInBand --silent --no-cache` | 36 suites aprobadas, 187 pruebas aprobadas, 0 omitidas. |
| `pnpm exec playwright test --config=e2e/playwright.portal.local.config.ts e2e/tests/portal-privacy.spec.ts e2e/tests/portal-crm-expedientes.spec.ts --grep 'CA-LT-(09|11|12)'` | 3 E2E aprobadas, 0 omitidas. |
| Jest focal: `privacy.roles-guard.http.spec.ts` y `privacy.module.spec.ts`, `--runInBand --no-cache` | 2 suites aprobadas, 13 pruebas aprobadas. Incluidas en el conteo completo de API. |
| ESLint dirigido a los archivos del bloque | Salida 0, sin diagnósticos. |

`pnpm --filter @iwana/api typecheck` permanece rojo por un error preexistente fuera del bloque: `apps/api/src/modules/wfm/services/wfm-organization-sites.adapter.spec.ts:7` no incluye `findRouterSummariesByIds` en su fixture `Mocked<OrganizationSiteReadPort>`. Es el fixture ajeno de MOD13; no se modificó.

## Criterios cubiertos

- D-B4-1: guard RBAC aplicado a los nueve controladores y validado por HTTP con token firmado.
- CA-LT-03: se conserva el acceso autenticado tenant a `current` y el rechazo para listado/publicación sin acceso de privacidad.
- Residual de D-B4-1: las dos lecturas sin `@Roles` siguen respondiendo 200 para plataforma con slug.

## Deuda nueva por severidad

| Severidad | Deuda introducida por B6 |
| --- | --- |
| Alta / P0 | Ninguna. |
| Alta / P1 | Ninguna. D-B4-1 queda corregido en las rutas con `@Roles`. |
| Media / P2 | Ninguna nueva. El typecheck rojo de MOD13 es preexistente y externo a este bloque. |
| Baja / P3 | Ninguna. |

