# INFORME-MOD05-DEUDA-FIX-D-v1.0

**Fecha:** 2026-10-18  
**Gate:** G-2 · cobertura de `packages/shared/src/schemas/subscriber.schema.ts`  
**Base de trabajo:** árbol compartido sobre `e2348a42`, con cambios A/B sin commit.

## Resultado

**GO para G-2.** La suite completa de `@iwana/shared` pasó sin caché: **21 suites, 200 tests, 0 fallos y 0 omitidos**. La cobertura enfocada del schema fue **100% de statements (32/32) y 100% de branches (16/16)**. El typecheck del paquete también terminó con exit 0.

## Tests de contrato

Al inicio de este G-2, el test existente ya cubría alta natural y jurídica, edición por sección, RUT vacío o repetido, DV no numérico, `legalRepresentative` y los valores de `fiscalCompleteness`. En este G-2 se añadió una aserción tipada que comprueba que `SubscriberDetail` expone `fiscalCompleteness` con `complete` y `missing`.

No se modificaron `subscriber.schema.ts` ni contratos. El diff de schema que ya estaba presente en el árbol compartido pertenece a los cambios A/B previos.

## Evidencia de cobertura

| Medición | Statements | Branches | Suites / tests |
| --- | ---: | ---: | ---: |
| Inicio de este G-2, antes de la edición local | 100% (32/32) | 100% (16/16) | 21 / 200 |
| Después de la edición local | 100% (32/32) | 100% (16/16) | 21 / 200 |
| Referencia histórica de V4-v1.1 | 75% (cobertura reportada previamente) | No desglosado | Corrida anterior `test:coverage` |

La medición inicial del árbol actual no coincide con el 75% histórico de V4-v1.1: el informe previo lo tomó de otra corrida antes de esta verificación. Ambas mediciones se conservan diferenciadas.

## Comandos y resultados

Corrida inicial, suite completa sin caché y cobertura del archivo:

```powershell
$covDir = Join-Path $env:TEMP 'iwana-shared-g2-before-20261018'
pnpm --filter @iwana/shared exec jest --runInBand --no-cache --coverage --collectCoverageFrom=schemas/subscriber.schema.ts --coverageReporters=text-summary --coverageReporters=json-summary --coverageDirectory=$covDir
```

Resultado: **21 passed**, **200 passed**, 0 snapshots; cobertura del archivo **100% statements / 100% branches**.

Corrida posterior, suite completa sin caché y cobertura del archivo:

```powershell
$covDir = Join-Path $env:TEMP 'iwana-shared-g2-after-20261018'
pnpm --filter @iwana/shared exec jest --runInBand --no-cache --coverage --collectCoverageFrom=schemas/subscriber.schema.ts --coverageReporters=text-summary --coverageReporters=json-summary --coverageDirectory=$covDir
```

Resultado: **21 passed**, **200 passed**, 0 snapshots; cobertura del archivo **100% statements / 100% branches**.

Typecheck:

```powershell
pnpm --filter @iwana/shared typecheck
```

Resultado: exit 0 (`tsc --noEmit`). No se detectaron defectos del schema que requieran `[BLOQUEO]`.
