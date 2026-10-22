# INFORME-MOD13 — Aprovisionamiento · Ola 3

**Versión:** 1.0  
**Estado:** B2 implementado y verificado; F1 implementado con validación contra API real pendiente  
**Fecha:** 2026-10-22  
**Emisor:** sr-backend / fe-platform / prod-ux (Codex)  
**Fuentes:** [HLD-MOD13 v1.1](../hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md) · [plan de ejecución](../plans/2026-10-22-mod13-aprovisionamiento.md) · [prompt de fase](../prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md) · [spec UX](../specs/2026-10-22-mod13-aprovisionamiento-ux.md) · [informe B1b](INFORME-MOD13-APROVISIONAMIENTO-B1B-v1.0.md)

## Resultado

B2 añade los puertos de lectura tipados entre MOD11, MOD05, MOD12 y MOD13; los comandos de reservar, certificar y liberar; las proyecciones diferenciadas de contexto y técnico; y el gate de cierre de instalaciones. La migración reversible 163 publica `INSTALACION_ESTANDAR` v3 con el requisito `PROVISIONING` y conserva los snapshots existentes.

F1 añade los catálogos de routers y redes IPv4 al portal, con filtros, paginación, formularios, permisos y ocho operaciones de `networkApi`. P0-ter completa la spec UX de ajustes de red, interruptor y sus estados. No se implementaron B3 ni F2.

No se aplicó la migración 163 a tenants existentes ni se modificaron tenants `ACTIVE`. Las pruebas PostgreSQL usaron schemas de integración efímeros y limpiaron sus fixtures. No se hizo commit.

## Evidencia

| Alcance | Resultado medido |
| --- | --- |
| Suite existente `tasks` | **37 suites, 746 tests aprobados**, 0 fallos, 0 snapshots. Cache absoluto bajo `apps/api/.jest-cache-mod13-b2-verified`, fuera de `src/`. |
| B2: servicio, HTTP y gate de cierre | **3 suites, 10 tests aprobados**. Incluye R6 ter, R6 bis, proyección HTTP de cinco campos y ajustes ON/OFF/`NOT_EXECUTED`. |
| B2: rollback de auditoría, PostgreSQL real (`127.0.0.1:5433/dbiw`) | **1 suite, 3 tests aprobados**: rollback de `reserve`, `certify` y `release`. Fixture temporal eliminado. |
| Migración 163, pruebas unitarias | **1 suite, 2 tests aprobados**. |
| Migración 163, PostgreSQL real (`dbiw`) | **1 suite, 1 test aprobado**: publicación idempotente, protección de órdenes que referencian v3 y rollback. Schema y tenant sintéticos eliminados. |
| API typecheck | Pasó (`tsc --noEmit -p apps/api/tsconfig.typecheck.json`). |
| API lint | Pasó con 0 errores y 7 advertencias en archivos sin cambios de esta ola. |
| Database typecheck y lint dirigido | Pasaron. |
| Portal lint y typecheck | Pasaron. El lint completo reportó 43 advertencias preexistentes; el lint dirigido final de F1 no reportó advertencias. |
| Portal build | `next build --webpack`: pasó, con TypeScript y **43 rutas** generadas. El build predeterminado Turbopack panica al procesar `leaflet.css`; se validó el fallback Webpack. |
| Formato y whitespace | `git diff --check` pasó. El documento UX no se formateó con Prettier. |
| F1 contra API real | **0 suites / 0 tests ejecutados**: `127.0.0.1:3000` no respondía y no estaban configurados `E2E_TENANT_ADMIN_EMAIL` ni `E2E_TENANT_ADMIN_PASSWORD`. No se sembraron datos para suplirlos. |

La validación contra el API real sigue pendiente para cerrar G4. La prueba HTTP de B2 sí pasó contra un servidor Nest de prueba, pero no reemplaza la validación integrada del portal contra el API vivo.

## Ejecución y entorno

El intento de ejecutar `pnpm` quiso descargar Node 24.13.1 y no pudo por la conectividad restringida. Para no alterar dependencias se invocaron los binarios ya instalados directamente: Jest, TypeScript y ESLint con Node 24.18.0; el build del portal se ejecutó con el runtime local 24.19.0. Los caches de Jest quedaron fuera de `src/`.
