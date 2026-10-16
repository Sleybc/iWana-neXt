# Informe V4 — Privacy Fase 1b · Gates v1.2

**Fecha:** 2026-10-16  
**Agente:** `gate-verifier`  
**Estado:** pruebas, integraciones PostgreSQL y cobertura pasan; **NO-GO del gate completo** por el wrapper de Turbo que no termina tras el build y por la precondición de `dbiw` pendiente para el E2E real.  
**Plan/delta:** [plan Fase 1b](../plans/2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md), [delta v1.4](../prompts/PROMPT-PRIVACY-FASE-1B-v1.4.md).

## Resultado de los gates

### Tests sin caché

Comando ejecutado: `pnpm exec turbo run test --force --continue`.

**Resultado:** exit 0; 10/10 tareas exitosas, 0/10 cacheadas, ninguna tarea fallida.

| Paquete         |                    Suites |                        Tests |
| --------------- | ------------------------: | ---------------------------: |
| `@iwana/api`    | 385 aprobadas, 4 omitidas | 5.229 aprobados, 15 omitidos |
| `@iwana/shared` |              19 aprobadas |                174 aprobados |
| `@iwana/db`     |              67 aprobadas |                397 aprobados |
| `@iwana/portal` |             303 aprobadas |   3.043 aprobados, 1 omitido |
| `@iwana/worker` |              20 aprobadas |                169 aprobados |
| `@iwana/web`    |              36 aprobadas |                229 aprobados |
| `@iwana/ui`     |               5 aprobadas |                 34 aprobados |

La ejecución directa `pnpm --filter @iwana/api exec jest --runInBand --no-cache` también terminó sin fallos: 385 suites aprobadas, 4 omitidas; 5.229 tests aprobados, 15 omitidos.

### Typecheck, lint y build

Comando ejecutado: `pnpm exec turbo run typecheck lint build --force --continue`.

Turbo informó 23/23 tareas exitosas y 0/23 cacheadas. Lint no reportó errores; sí warnings: API 7, DB 5, worker 1 y web 10.

**[P2] H14 — proceso envolvente de build sin cierre limpio.** La repetición aislada `CI=true pnpm exec turbo run build --force --continue --no-daemon` informó 7/7 tareas exitosas y 0/7 cacheadas. Web y portal completaron compilación, TypeScript y generación de páginas. Después del resumen, el comando permaneció abierto sin salida; la inspección de procesos encontró el runner `turbo.exe` bajo su CLI, sin una tarea de build de paquete activa. Se interrumpió el wrapper con Ctrl+C; el proceso terminó con exit 1. No hubo una tarea de paquete identificable como colgada o fallida: todas habían reportado éxito. Por tanto, los resultados de tarea son verdes, pero el comando de build no tiene terminación limpia reproducible y el gate agregado queda NO-GO.

### Cobertura de `privacy/**`

Se ejecutó la suite completa API sin caché con `--coverage`, excluyendo `*.spec.ts` del conjunto de archivos medidos y manteniendo el archivo requerido por el umbral de cobertura preexistente de inventario. Resultado del comando: exit 0; 385 suites y 5.229 tests aprobados, con 4 suites y 15 tests omitidos, 0 fallidos.

El agregado de los 47 archivos fuente de privacidad, calculado desde el resumen JSON generado por Jest, es:

| Métrica    | Cubiertos / total | Cobertura | Umbral |
| ---------- | ----------------: | --------: | -----: |
| Statements |     1.282 / 1.355 |   94,61 % | ≥ 80 % |
| Branches   |         345 / 417 |   82,73 % | ≥ 80 % |

Artefacto local de evidencia: `apps/api/src/coverage/privacy-fase-1b-v14/coverage-summary.json`.

### Integraciones PostgreSQL de las migraciones 149–151

Comando ejecutado contra `DB_PORT=5433`, `DB_NAME=dbiw`, sin publicar credenciales:

```powershell
$env:DB_PORT='5433'
$env:DB_NAME='dbiw'
$env:IWANA_DB_INTEGRATION_AVAILABLE='true'
pnpm --filter @iwana/db exec jest --config jest.integration.config.js --runInBand --no-cache --runTestsByPath src/migrations/tenant/149_privacy_erasure_record.integration.spec.ts src/migrations/tenant/150_titular_anonymization_marker.integration.spec.ts src/migrations/tenant/151_seed_blocked_data_permission.integration.spec.ts
```

**Resultado:** 3 suites, 3 tests aprobados, 0 fallidos; PostgreSQL disponible en `127.0.0.1:5433/dbiw`. Las pruebas usan schemas tenant sintéticos/transitorios.

Estas integraciones no aplican las migraciones al tenant configurado de `dbiw`. La consulta de solo lectura de V1 encontró 149, 150 y 151 ausentes en los 21 schemas tenant. V1 no arrancó la API ni Playwright, conforme a la precondición del encargo. En consecuencia, no se afirma un resultado de `/health` ni E2E contra la base migrada requerida; G6 permanece abierto hasta que el CTO habilite esa precondición y V1 complete su ejecución.

## Veredicto

- **Tests monorepo y API:** GO, sin caché y sin fallos.
- **Cobertura de privacidad:** GO, statements y branches por encima del 80 %.
- **Integraciones PostgreSQL 149–151:** GO en los schemas aislados de prueba.
- **Build:** NO-GO de cierre de comando por el wrapper Turbo que permanece abierto tras informar 7/7 tareas exitosas; [P2] H14.
- **G6 de fase:** NO-GO por el E2E real bloqueado ante las migraciones ausentes en el tenant configurado.

La ruta del informe estaba libre antes de escribirlo. No se modificó código ni tests, no se registró PII o claves, y no se hizo commit.
