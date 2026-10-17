# INFORME — MOD05 · B0 migración 157 · v1.2

**Fecha:** 2026-10-17  
**Estado:** S1′ confirmado  
**Base:** `09af7f60` más los cambios de trabajo existentes, conservados sin commitear.

## Resultado

Se añadió `157_subscriber_fiscal_completeness`: `vat_responsibility` admite `NULL`; se retira el CHECK heredado de la migración 154 y se instala `ck_subscribers_fiscal_complete_when_active NOT VALID`. La migración tiene `down()` con preflight de filas incompatibles antes de restaurar el CHECK y `NOT NULL` anteriores.

La migración quedó registrada en `runner.ts` y `revert.ts`. La 153 y la 154 no se editaron. El spec verifica que una conversión jurídica incompleta queda en `PROSPECT`, que el paso a `ACTIVE` sin datos fiscales falla por el CHECK, y que down/up funciona en dos schemas distintos.

## Evidencia

| Verificación | Resultado |
| --- | --- |
| Spec unitario de 157 + orden de migraciones | 2 suites; 9/9 tests pasaron |
| Integración específica de 157 en dos schemas | 1 suite; 10/10 tests ejecutados, 0 fallos |
| Suite unitaria completa de `@iwana/db`, Jest `--no-cache` | 74 suites; 417 tests pasaron, 0 fallos |
| Suite completa de integración de `@iwana/db`, `iwana_it_g7_ci` | 35 suites; 125 tests ejecutados, 0 fallos |
| PostgreSQL | conexión a `127.0.0.1:5433` confirmada; la integración terminó correctamente |

La instalación gestionada de pnpm intentó descargar Node 24.13.1 y no pudo resolver `nodejs.org` (`ENOTFOUND`). No se cambió la configuración. Las suites se ejecutaron con el Node 24.13.1 ya instalado en el equipo. El acceso al socket de Docker desde el sandbox devolvió `permission denied`; no fue necesario usar Docker porque PostgreSQL respondió en el puerto indicado.

El informe no incluye PII ni credenciales. No se accedió a `dbiw` y no se creó ningún commit. La ruta de este informe estaba libre antes de escribirlo.
