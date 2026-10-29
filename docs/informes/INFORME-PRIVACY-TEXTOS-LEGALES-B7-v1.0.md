# Informe — Privacy · Textos legales · B7

**Fecha:** 2026-10-29  
**Agente:** `sr-backend`  
**Estado:** GO

## Cambio

- `apps/api/src/modules/privacy/privacy.module.ts`: retirado `AuthModule` de los imports de `PrivacyModule`.
- `apps/api/src/modules/privacy/privacy.module.spec.ts`: eliminada la dependencia de prueba en `otplib`/`AuthModule` y añadida una prueba HTTP de composición sin `AuthModule`. La petición a `PUT /privacy/purposes` recibe 403 y `PurposesService.update` no se ejecuta. Los guards declarados por el controlador se resuelven en el contexto de Nest.
- Los `@UseGuards` de los nueve controladores de Privacy permanecen intactos.

## Verificación

| Verificación | Resultado |
| --- | --- |
| Suite completa `@iwana/api`, sin caché: `pnpm --filter @iwana/api test -- --coverage --no-cache` | Código 0; 439 suites detectadas: 435 pasaron, 4 omitidas, 0 fallidas. 5.841 pruebas pasaron, 15 omitidas, 0 fallidas. |
| Cobertura global reportada por Jest | Statements 60,66%; branches 53,24%; functions 57,02%; lines 67,61%. Los umbrales configurados por Jest pasaron. |
| Prueba HTTP `privacy.roles-guard.http.spec.ts` | Suite incluida en la corrida enfocada sin caché; el control de roles permanece activo. |
| Pruebas enfocadas de composición, guards y subscribers | Código 0; 3 suites y 16 pruebas pasaron. `subscribers.module.spec.ts` ya no falla al cargar `otplib` desde Privacy. |
| `pnpm --filter @iwana/api typecheck` | Código 0. |
| `pnpm --filter @iwana/api lint` | Código 0; 7 warnings preexistentes en archivos ajenos al diff, 0 errores. |

## Deuda nueva por severidad

| Severidad | Nueva deuda |
| --- | ---: |
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 0 |

Los siete warnings de lint observados pertenecen a archivos sin cambios en este bloque y no se clasifican como deuda introducida por B7.
