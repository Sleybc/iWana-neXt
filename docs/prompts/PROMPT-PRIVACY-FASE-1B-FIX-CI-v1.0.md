# PROMPT — `privacy` Fase 1b · Corrección del CI de `main` (P0)

**Versión:** 1.0 · **Fecha:** 2026-10-16 · **Emisor:** AI-EM-ARCH · **Agente:** `sr-backend` (dueño de B1 y B2) · **Base:** `main` en `252a9669` más el árbol de E-A y F+G sin commitear
**Evidencia:** CI [`38944406821`](https://github.com/Sleybc/iWana-neXt/actions/runs/38944406821), jobs «Lint + Typecheck + Build + Unit tests» y «E2E operativo R4.1»

## Fallos

| # | Severidad | Fallo | Causa |
| --- | --- | --- | --- |
| F1 | **P0** | La API no arranca: `UnknownExportException … exported IPersonalDataErasurePort` en `PrivacyModule` | Al retirar el adaptador `Unavailable` (S3), `privacy.module.ts` siguió exportando el token, que ya no provee. El token llega por el re-export de `CrmPrivacyAdaptersModule`, y Nest no permite exportar un provider ajeno |
| F2 | P1 | `users.module.spec.ts:56`: los exports de `UsersModule` incluyen `UsersPrivacyModule` | B2 agregó ese export; el spec fija los exports para impedir que se cruce el boundary |
| F3 | P1 | `crm/tests/adr065-ola7-sin-cota.spec.ts`: `manager.find is not a function` en `contracts.service.ts:432` | B3 agregó una lectura de `Subscriber` en `projectContractsForRead`, y el doble del manager de ese spec no tiene `find` |

## Encargo

1. **F1:** quitar `IPersonalDataErasurePort` de `exports` en `privacy.module.ts`. El re-export de `CrmPrivacyAdaptersModule` ya lo entrega. Agregar un test que **compile el `AppModule` real** (`Test.createTestingModule({ imports: [AppModule] }).compile()`, con la infraestructura que exija el entorno de tests) o, si eso no es viable, un test que compile `PrivacyModule` con sus imports reales. Ese test debe fallar con el código de hoy.
2. **F2:** si `CrmPrivacyAdaptersModule` importa `UsersPrivacyModule` directamente, quitar el export de `UsersModule` y dejar el spec intacto. Solo si el export es necesario, justificarlo en el informe y actualizar el spec.
3. **F3:** completar el doble del manager en el spec con `find`, sin debilitar la aserción de `page/limit`. No cambiar `contracts.service.ts`, salvo que sea un defecto real.

## Evidencia obligatoria (lección del 2026-10-16)

- La suite unitaria **completa** de `@iwana/api`, sin caché (`pnpm --filter @iwana/api exec jest --no-cache`), con el conteo real; no solo las carpetas tocadas.
- Typecheck de `@iwana/api`.
- **Arranque real** de la API (`pnpm --filter @iwana/api build` y luego arrancar contra la base de desarrollo) hasta que `/health` responda 200. Reportar la línea del log de arranque, sin secretos.

## Reglas

- No modificar contratos; si falta algo, `[BLOQUEO]` y parar.
- Ninguna PII ni clave real en el repo, los informes o los logs. No commitear.
- Informe: `docs/informes/INFORME-PRIVACY-FASE-1B-FIX-CI-v1.0.md`, con la ruta verificada como libre.
