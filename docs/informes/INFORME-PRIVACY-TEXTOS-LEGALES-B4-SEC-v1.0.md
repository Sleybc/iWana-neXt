# Informe — Privacy, textos legales B4 SEC

**Versión:** 1.1  
**Estado:** Cerrado — re-verificación de D-B4-1 completada  
**Fecha:** 2026-10-29

## Alcance y método

Re-verificación de solo lectura después del cierre de B6, conforme a la spec congelada v1.2: cierre del P1 en los nueve controladores, residual aceptado y continuidad del acceso del perfil «Oficial de protección de datos». No se modificó código, contrato ni archivos de MOD13. Las claves y los tokens de las pruebas son sintéticos; no se usó PII real ni se publicó en un tenant.

El análisis original de C2, C4, autorización/auditoría de PUT /privacy/purposes y el efecto de deshabilitar finalidades queda registrado en la versión 1.0. La conclusión no cambia.

## Hallazgos P0–P3

| Severidad | Resultado | Evidencia |
| --- | --- | --- |
| P0 | Ninguno. | No se encontró una exposición crítica nueva. |
| P1 | Cerrado por B6. | Los nueve controladores montan JwtAuthGuard, RolesGuard y PermissionsGuard, en ese orden. Tokens de plataforma con slug reciben 403 en seis rutas mutantes representativas. |
| P2 | Ninguno nuevo. | El typecheck global del API conserva un error preexistente en el fixture WFM de MOD13, fuera del alcance. |
| P3 | Ninguno nuevo. | — |

## Re-verificación D-B4-1

- **Superficie corregida:** authorizations, evidence, incidents, inventory, legal-texts, marks, purposes, requests y retention montan la secuencia de guards decidida. PrivacyModule importa AuthModule y su prueba de composición compila con los imports reales.
- **Reproducción del P1:** privacy.roles-guard.http.spec.ts usa los guards reales, TenantMiddleware real y tokens RS256 firmados con claves efímeras. Un token de plataforma acompañado por X-Tenant-Slug recibe 403 en POST /privacy/legal-texts, PUT /privacy/purposes, POST /privacy/requests, POST /privacy/incidents, POST /privacy/authorizations y PATCH /privacy/retention-policies. Las pruebas confirman que el middleware resuelve el slug antes de que RolesGuard rechace la operación.
- **Continuidad de perfiles tenant:** los tokens tenant con rol AUDITOR (perfil DPO) y ADMIN, con privacy.manage efectivo en la prueba HTTP, pasan PUT /privacy/purposes. SUPPORT recibe 403. PermissionsGuard permanece activo después de RolesGuard; el rol no sustituye al permiso.
- **Perfil DPO en el catálogo:** la migración 147 fija base_role_constraint = AUDITOR y asigna privacy.read y privacy.manage a «Oficial de protección de datos». La matriz de permisos V2 permite ambos permisos al rol AUDITOR; la plantilla «Acceso estándar Auditoría» los excluye expresamente. La prueba unitaria de la migración confirma ambas asignaciones y el rollback. No se ejecutó la integración de la migración contra PostgreSQL en esta re-verificación.
- **Residual aceptado:** GET /privacy/legal-texts/current y GET /privacy/purposes siguen sin @Roles y responden 200 a token de plataforma con slug, según D-B4-1. El contenido es el texto publicado y el estado de finalidades, destinado al titular y sin datos personales. Ninguna otra ruta de privacy carece de @Roles.
- **CA-LT-03:** se conserva el caso de usuario tenant sin rol ni permiso de privacidad: current responde 200 y el listado y publicación reciben 403.

## Controles conservados de la revisión v1.0

- **C2:** el texto vigente se consulta por tipo en el contexto tenant; el middleware usa claims verificados para usuarios tenant. La excepción de plataforma se limita a las dos lecturas residuales aceptadas.
- **C4:** ReactMarkdown usa skipHtml, no renderiza imágenes, restringe enlaces a HTTP/HTTPS y establece noopener noreferrer. CA-LT-07 cubre script, img onerror y javascript:.
- **Finalidades y auditoría:** las consultas siguen parametrizadas, TRATAMIENTO_CONTRACTUAL no se puede deshabilitar, la auditoría conserva antes/después sin datos personales y los ajustes no modifican autorizaciones existentes.

## Evidencia de verificación sin caché

Corridas directas; Jest usó --no-cache (Cached: 0) y no se usó Turbo.

| Comando | Conteo real | Resultado |
| --- | --- | --- |
| pnpm --filter @iwana/api exec jest modules/privacy access-permission-catalog.invariant.spec.ts --runInBand --silent --no-cache | 36 suites, 187 pruebas, 0 omitidas | Todo aprobado; incluye la prueba HTTP de guards y PrivacyModule. |
| pnpm exec playwright test --config=e2e/playwright.portal.local.config.ts e2e/tests/portal-privacy.spec.ts e2e/tests/portal-crm-expedientes.spec.ts --grep 'CA-LT-(09|11|12)' | 3 pruebas, 0 omitidas | Todo aprobado. |
| pnpm --filter @iwana/db exec jest --runInBand --no-cache --runTestsByPath src/migrations/tenant/147_seed_privacy_permissions.spec.ts | 1 suite, 2 pruebas, 0 omitidas | Todo aprobado; valida permisos DPO y rollback. |
| ESLint dirigido a los archivos del bloque B6 | Salida 0 | Sin diagnósticos. |
| pnpm --filter @iwana/api typecheck | Salida 1 | Error existente en apps/api/src/modules/wfm/services/wfm-organization-sites.adapter.spec.ts: falta findRouterSummariesByIds en Mocked<OrganizationSiteReadPort>. Fixture ajeno de MOD13; no se tocó. |

## Deuda nueva por severidad

| Severidad | Deuda introducida por B4 |
| --- | --- |
| Alta / P0 | Ninguna. |
| Alta / P1 | Ninguna abierta. El hallazgo de B4 v1.0 queda cerrado por B6. |
| Media / P2 | Ninguna nueva. El fallo de typecheck WFM es preexistente y externo. |
| Baja / P3 | Ninguna. |

## Bloqueos

Ninguno para la re-verificación B4. El único gate global observado en rojo es el typecheck del fixture WFM ajeno a este bloque.
