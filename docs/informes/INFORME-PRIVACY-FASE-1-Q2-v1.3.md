# Informe — Privacy · Fase 1 · Q2Δ4

**Versión:** 1.3  
**Fecha:** 2026-10-14  
**Estado:** A24 implementado y verificado.  
**Base:** Q2 v1.2; el contrato de autorizaciones distingue el medio del titular de la superficie de captura.

## Resultado

- `createDataAuthorizationSchema.channel` usa `z.nativeEnum(ConsentChannel)`. El endpoint `POST /privacy/authorizations` rechaza medios fuera del enum en el boundary Zod; el schema de respuesta conserva `channel: string` para representar importaciones históricas.
- `IPrivacyAuthorizationWritePort` usa una unión discriminada: `GRANT` y `REVOCATION` requieren `ConsentChannel`; solo `LEGACY_IMPORT` acepta un canal histórico. El adaptador vuelve a validar los canales no heredados antes de acceder al repositorio.
- El schema OpenAPI de `POST /privacy/authorizations` publica los cinco valores de `ConsentChannel`.
- Se sustituyeron canales de superficie en los fixtures ordinarios por medios válidos. `CRM_CONVERSION` se conserva únicamente en los casos que comprueban el rechazo fuera de `LEGACY_IMPORT` y la preservación histórica dentro de ese tipo.

## Verificación

| Comprobación                                                                       | Resultado                                                                                                                                                                             |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec turbo run test --filter=@iwana/api --filter=@iwana/shared --force`      | Exit 0. API: **355 suites / 4.862 tests aprobados**, 4 suites y 15 tests omitidos. Shared: **18 suites / 168 tests aprobados**. Turbo: **5 tareas exitosas, 0 cacheadas**.            |
| `pnpm exec turbo run typecheck --filter=@iwana/api --filter=@iwana/shared --force` | Exit 0. **4 tareas exitosas, 0 cacheadas**.                                                                                                                                           |
| Pruebas focalizadas API, incluido HTTP y OpenAPI de Privacy                        | **4 suites / 12 tests aprobados**. Un canal ajeno a `ConsentChannel` responde 400 y no invoca el servicio.                                                                            |
| Prueba focalizada shared                                                           | **1 suite / 7 tests aprobados**. Acepta un medio válido y rechaza `CRM_CONVERSION` en una autorización nueva.                                                                         |
| Integración `PrivacyAuthorizationAdapter` en PostgreSQL                            | En `127.0.0.1:5433/dbiw`, con schema efímero: **1 suite / 1 test aprobado**. Comprueba que un `LEGACY_IMPORT` conserva el canal histórico y que `sourceRef` sigue siendo idempotente. |
| ESLint y Prettier focalizados                                                      | Pasa sin diagnósticos; Prettier sin cambios pendientes.                                                                                                                               |

## Rutas y concurrencia

Se verificó libre esta ruta antes de crear el informe. PostgreSQL permaneció accesible en `127.0.0.1:5433`. Se preservó el trabajo sin commitear de las demás sesiones; no se hicieron commits ni se ejecutó la Fase 04 de suscriptores.

## Deuda nueva por severidad

No se identificó deuda nueva P0, P1, P2 o P3 dentro de Q2Δ4.

## Trazabilidad

- `docs/adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md`, adenda A24.
- `docs/plans/2026-10-14-privacy-habeas-data-fase-1.md` v1.3.
- `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md`, §1 A24 y §2 Q2Δ4.
- `packages/shared/src/schemas/privacy/authorizations.ts`.
- `apps/api/src/modules/privacy/authorizations/` y `apps/api/src/modules/privacy/ports/privacy-authorization-write.port.ts`.
