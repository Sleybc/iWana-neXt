# SPEC — E2E operativo R4.1 en shards con servicios desechables propios

**Versión:** 1.0
**Estado:** Aprobado. El CTO elige la opción A (2 shards) el 2026-11-25; `e2e/tests/api/` en CI queda sin decidir y fuera de esta spec
**Fecha:** 2026-11-25
**Emitido por:** AI-PLAT-OPS · **Ejecuta:** `plat-ops`, con `sr-qa` para el reparto de specs
**Relacionado:** [ADR-107](../adrs/ADR-107-Publicacion-por-Lotes-y-G6.5-Asincrono.md) · [spec de jobs paralelos](2026-11-09-plat-ops-ci-jobs-paralelos.md) §5 (dejó este trabajo fuera) · [runbook E2E R4.1](../runbooks/RUNBOOK-E2E-R41-OPERATIONS-v1.0.md)

---

## 1. Problema, con datos

Corrida 45667228690 (`0e827d8c`, `success`). El job dura **21:46**:

| Tramo                                                                                                      | Duración |
| ---------------------------------------------------------------------------------------------------------- | -------- |
| Pasos previos (checkout, install, navegador)                                                               | ~0:48    |
| Aprovisionamiento hasta `E2E_SETUP=OK`: servicios, migraciones, imagen del worker, API, tenants y fixtures | 3:05     |
| Playwright (`E2E_PLAYWRIGHT_DURATION_MS=1052447`), 401 pruebas con 1 worker. Incluye el build del portal   | 17:32    |
| Limpieza y cierre                                                                                          | ~0:20    |

En las seis corridas con marcadores leídas, Playwright tardó entre 14:09 y 18:10 (848,8 s en 45649332320 y 1089,6 s en 45654827882), siempre con 397 aprobadas y 4 omitidas. Es un 28 % de diferencia entre corridas de SHA distintos, no aislada por runner.

**Hallazgo: el job repite casi toda la suite «E2E portal».** Las dos ejecutan `pnpm test:e2e:portal` sobre los mismos 401 casos. En 45667228690, «E2E portal» aprobó 348 (600 s de prueba, 11:00 con arranque) y omitió 53, los que piden API real. R4.1 aprobó 397. El job exclusivo aporta **49 pruebas**: 397 − 348. Su coste no consta por spec, porque el provisionador borra el reporte; solo se publica el de MOD13 (50–58 s). Restando los dos jobs de una misma corrida sale 340–574 s, **estimación** con ruido entre runners.

La repetición no es gratuita ni equivalente: en R4.1 las llamadas sin interceptar llegan a una API real; en «E2E portal» fallan por conexión rechazada. En 45673015844 «E2E portal» dejó 1 fallo y R4.1 aprobó las 397.

Además, `e2e/tests/api/` (52 pruebas declaradas) **no corre en CI**, aunque un comentario de `ci.yml` dice que sí. Esta spec no lo cambia; hay que corregir el comentario o abrir encargo a `sr-qa`.

## 2. Viabilidad

Nada impide el sharding. Cada shard es un runner distinto: los nombres de contenedor, los puertos y el proyecto Compose fijos (`iwana-e2e-r41`) no chocan entre sí. Hay tres cambios necesarios en el provisionador:

1. **`E2E_MOD13_SPEC_FOUND`:** hoy devuelve 1 si el spec de MOD13 no está. Pasa a exigirse solo en el shard que lo tiene asignado, y el agregador exige que esté en exactamente uno.
2. **Filtro de archivos:** `runPlaywright` debe recibir la lista del shard.
3. **Resultado por prueba:** hoy solo hay totales. Hace falta un resumen saneado con identificador, estado y motivo de omisión.

## 3. Opciones

Estimaciones sobre 45667228690: 254 s fijos por job (todo lo que no es Playwright), ~60 s de build del portal (medido en «E2E portal») y ~990 s de pruebas repartibles.

| Opción                            | Job más largo (estimado) | Runner total | Coste en cobertura                                                  |
| --------------------------------- | ------------------------ | ------------ | ------------------------------------------------------------------- |
| A. 2 shards equilibrados          | ~13:30                   | ~27 min      | Ninguno                                                             |
| A'. 3 shards equilibrados         | ~10:45                   | ~32 min      | Ninguno                                                             |
| B. Solo specs con API real, 1 job | ~11–15 min               | ~11–15 min   | Los 348 casos con red simulada dejan de correr junto a una API real |
| C. B más 2 shards                 | ~8–10 min                | ~17–19 min   | Igual que B                                                         |

**Recomendación: A con 2 shards.** Baja la ruta crítica sin perder pruebas. B ahorra más por menos, pero retira una ejecución de 348 pruebas: es decisión del CTO con dictamen de `sr-qa`, no una optimización. No se aplica por omisión. 3 shards solo si la medición de A no baja de 16 min, meta de la spec de jobs paralelos.

## 4. Diseño (opción A)

- **Matriz `shard: [1, 2]`, `fail-fast: false`**, con `docs_only` como hoy. Cada shard repite el aprovisionamiento completo: PostgreSQL, Redis, MinIO, Typesense, worker, API, tenants y cuenta de plataforma propios. Nada se comparte, tampoco secretos; cada shard genera los suyos.
- **Reparto por manifiesto** (`e2e/r41-shards.json`, archivo → shard), no con `--shard` nativo. Playwright 1.58 reparte por cantidad contigua de pruebas cuando `fullyParallel` es falso, y las 53 que piden API real caen casi todas en la segunda mitad (solo 10 quedan en la primera). Una spec nueva sin asignar, o asignada dos veces, deja el job en rojo.
- **1 worker y `--retries=0`** en cada shard, como hoy.
- **Job agregador** `e2e-operativo-gate`: `needs: [changes, <shards>]`, `if: ${{ !cancelled() && needs.changes.outputs.docs_only != 'true' }}`. Descarga los resúmenes y decide. Si un shard falla, se cancela o no deja resumen, falla. Hereda el nombre visible «E2E operativo R4.1» para quien lo busque.

### 4.1 Dependencias y datos compartidos

| Dato                                                 | Situación                                                                                                                                                                                                                                                                                                  | Regla                                                                                                      |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Tenant de privacidad (`E2E_PRIVACY_1B_TENANT_SLUG`)  | Lo usan seis specs: privacidad 1b, privacidad, deuda fiscal, ficha UISP, equipos y suscriptores UX. La ficha y los suscriptores crean su propio suscriptor. **Equipos lo busca y solo lo crea si no lo halla** (`findOrCreateSubscriber`): hereda datos de specs previas. No se verificó en los otros tres | **Las seis van juntas en un shard, en el mismo orden relativo.** Se separan solo tras probar cada una sola |
| Tenant de MOD13                                      | Solo `portal-network-provisioning-live`                                                                                                                                                                                                                                                                    | Cualquiera                                                                                                 |
| Tenants propios (facturación, CRM, importación UISP) | Cada spec crea el suyo con `platformAccessToken`                                                                                                                                                                                                                                                           | Cualquiera                                                                                                 |
| Specs en modo serie                                  | Un archivo no se divide                                                                                                                                                                                                                                                                                    | El manifiesto asigna archivos, nunca casos                                                                 |
| Dependencia de orden general                         | No demostrada: la suite siempre corrió con un worker y en orden fijo                                                                                                                                                                                                                                       | Se valida en §6, criterio 5                                                                                |

**Cuenta de plataforma.** TOTP de un solo uso y freno de 10 intentos por cuenta e IP cada 15 min con contador en Redis. Cada shard tiene su cuenta, su secreto y su Redis, así que no compiten por código ni por cupo, y cada uno hace menos ingresos. Queda el coste ya existente: el provisionador y el proceso de pruebas no comparten el último paso usado; un código repetido da 401, gasta un intento y se reintenta. **Prohibido** compartir la cuenta o el secreto entre shards.

### 4.2 Guardas

Hoy el gate exige `passed ≥ 30`, sin fallidas, sin flaky, sin did-not-run, sin cuarentena y con motivo en cada omisión. **No exige 397 ni 4.** Al repartir, un mínimo de 30 por shard no probaría nada. Se refuerza así, y ninguna regla se rebaja:

1. En cada shard: salida 0, fallidas 0, flaky 0, did-not-run 0, cuarentena 0, limpieza OK, `passed ≥ 1`.
2. En el agregador, sobre la unión: igual conjunto que `playwright test --list` completo (sin faltantes, repetidos ni sobrantes), `passed ≥` línea base (397 hoy) y omitidas = lista declarada por prueba y motivo (4 hoy). Las cifras viven en un archivo versionado y subirlas o bajarlas exige motivo.
3. `REQUIRED_OPERATIONAL_E2E_PASSED = 30` se conserva, aplicado a la suma.
4. La validación de marcadores (`--validate-playwright-markers`) cubre los casos nuevos: shard ausente, caso duplicado, caso faltante, omisión no declarada.

De las 4 omisiones, tres se explican por lectura del código (cierre de venta y su fase 2 sin `E2E_MOD13_SITE_ID`/`E2E_TENANT_SLUG`, y deuda fiscal sin filas anteriores a la migración 153); la cuarta es probablemente el detalle de servicio de la ficha UISP. Sin confirmar en el log: hay que enumerarlas al implementar.

### 4.3 Artefactos y límites de tiempo

- Cada shard sube `e2e-r41-summary-<n>` (texto y JSON saneados: archivo, título, estado y motivo; nunca errores, trazas, tokens ni reporte crudo). `E2E_API_LOG` sigue sin publicarse. `sec-eng` revisa el formato del JSON.
- Con `actions/upload-artifact@v4` los nombres son únicos; el agregador publica `e2e-r41-summary` con el consolidado.
- `timeout-minutes`: 25 por shard y 5 el agregador, provisionales. Se recalibran con `ceil(1,5 × máximo)` de al menos 5 corridas.

## 5. Riesgos

| Riesgo                                                                                     | Mitigación                                                                                      |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Dependencia oculta de orden que hoy compensa una spec previa                               | Criterio 5; reparto estático, así un fallo es reproducible                                      |
| Doble exposición a fallos de infraestructura (descargas, Docker, API)                      | `fail-fast: false`; relanzar solo el shard caído con `--failed`; el agregador se relanza con él |
| Más jobs simultáneos. Con jobs paralelos y shards se pasa de 6 a 11 jobs, más el agregador | Dentro del límite de concurrencia del plan, **por confirmar**; medir la espera en cola          |
| Deriva del manifiesto: shards desiguales                                                   | El agregador publica la duración por archivo; se reequilibra si el desvío supera el 20 %        |
| Falso verde por agregador omitido                                                          | Con `needs` en rojo, `if` explícito y fallo por artefacto ausente (§4)                          |

`.github/workflows/ci.yml` y `scripts/e2e-provision-operational.mjs` los toca esta spec. No cambia `apps/*` ni `packages/*`.

## 6. Criterios de aceptación

1. Corrida de `main` verde con la línea base: 397 aprobadas o más, las 4 omisiones declaradas, did-not-run 0 y flaky 0, sobre la unión.
2. Unión = `--list`, sin repetidos. Una prueba negativa local por cada fallo de §4.2.4.
3. Job más largo ≤ 16 min en al menos 5 corridas de `main`; desvío entre shards ≤ 20 %.
4. Un shard cancelado o sin resumen deja el agregador en rojo; un push solo de documentación los omite todos.
5. Antes de publicar, cada shard corre solo contra un entorno recién creado, dos veces, sin fallos.
6. `pnpm test:tooling` en verde (`scripts/dev.test.mjs` lee `ci.yml`).
7. Vuelta atrás: un commit que restaura el job único. No hay migraciones ni datos.

## 7. Precondiciones y decisiones

- Precondiciones: CI de `main` en verde, spec de jobs paralelos ya publicada y medida, y ningún cambio ajeno en `ci.yml` ni en el provisionador. Es una ola de CI: G6.5 síncrono (ADR-107 D3).
- **Decisión del CTO (2026-11-25):** opción A. **Pendiente:** si `e2e/tests/api/` debe correr en CI.
- Previo a implementar: una corrida con la duración por archivo en el resumen saneado, porque hoy no existe el dato y el manifiesto debe equilibrarse con él.

## 8. Fuera de alcance

Reducir los 185 s de aprovisionamiento (la imagen del worker es la mayor parte visible), cambiar pruebas, subir `workers` y la caché remota.
