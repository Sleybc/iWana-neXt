# INFORME — MOD05 deuda de código · B0

**Fecha:** 2026-10-17  
**Estado:** **[BLOQUEO] S1 pendiente**  
**Plan:** [2026-10-17-mod05-deuda-codigo.md](../plans/2026-10-17-mod05-deuda-codigo.md)  
**Encargo:** [PROMPT-MOD05-DEUDA-CODIGO-v1.0.md](../prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.0.md) §2.1 y §4 B0

## Entrega preparada

- Se escribieron las migraciones tenant 153–156; la 154 está incluida conforme a D-M04 = A.
- Se registraron las cuatro migraciones al final de `TENANT_MIGRATIONS`.
- Cada migración tiene spec unitaria. La integración recorre dos schemas tenant provisionados con la cadena real y contiene casos `up/down/re-up`, traducción fiscal, constraint `NOT VALID`, datos expandidos y preflight de huérfanos de expediente.
- Las reversiones que descartan responsabilidades RUT, vínculos nuevos de representante o ciphertext/HMAC exigen `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`. La migración 156 reporta hasta 50 pares de ids y aborta antes del DDL si hay huérfanos.

## Evidencia ejecutada

| Verificación | Resultado |
| --- | --- |
| `pnpm --filter @iwana/db test --runInBand --no-cache` | **73 suites, 414 tests aprobados; 0 fallos.** |
| Specs 153–156 + `migration-order.spec.ts` | **5 suites, 16 tests aprobados.** |
| `tsc --noEmit -p packages/database/tsconfig.typecheck.json` | Exit 0. |
| `pnpm --filter @iwana/db lint` | Exit 0; 0 errores y 5 advertencias ya presentes en CLI y migración 089, fuera de los archivos B0. |
| Prettier `--check` sobre archivos B0 | Exit 0. |
| Integración 153–156 contra `iwana_it_g7_ci` | **No ejecutada.** El probe confirmó destino `127.0.0.1:5433/iwana_it_g7_ci`, pero la conexión fue rechazada (`ECONNREFUSED`); Jest omitió los 8 casos de esta integración. El daemon Docker tampoco está activo. No se migró ni se consultó `dbiw`. |
| `pnpm exec turbo run test --force --continue --concurrency=1 --env-mode=loose -- --no-cache` | Exit 1. DB pasó con 73 suites/414 tests; Shared 19/174, UI 5/34, Portal 303/3043 (1 omitido) y Web 36/229 pasaron. API reportó 61 suites y 788 tests fallidos; Worker 10 suites y 18 tests fallidos. El resultado incluye cambios concurrentes en API/Worker que no pertenecen a B0 y que se preservaron. |

La primera corrida Turbo falló al escribir la caché Jest en el directorio temporal aislado de Windows (`EPERM`). La corrida final usó Jest sin caché y concurrencia 1; aun así, quedaron los fallos de API/Worker indicados arriba.

## Bloqueo de sincronización

La integración requerida no produjo evidencia porque `iwana_it_g7_ci` no está disponible localmente. Por ese motivo **no se anuncia S1** y no se inician B1, B2 ni B3, que dependen de esta sincronización. Para continuar, hay que levantar Postgres y repetir `@iwana/db test:integration` con `DB_NAME=iwana_it_g7_ci`; entonces se podrá confirmar `up/down/re-up` sobre los dos schemas reales y emitir S1.

## Ruta y estado del workspace

Al iniciar estaban libres las rutas de migraciones 153–156 y la ruta de este informe. Los cuatro nombres fueron comprobados antes de escribir. No se creó commit.

Durante la ejecución aparecieron cambios adicionales en `apps/api`, `apps/worker` y otros archivos de `packages/database`, ausentes del estado inicial. Se dejaron intactos y no se atribuyen al bloque B0.
