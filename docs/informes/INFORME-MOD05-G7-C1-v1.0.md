# Informe MOD05 G7-C1 — cobertura de expedientes

**Fecha:** 2026-10-15  
**Resultado C1:** GO

## Alcance

Se agregaron pruebas de comportamiento en specs de `crm/expedientes`: cálculo y proyección de completitud, recomendaciones del pipeline, nombres de presentación, actualización de secciones, documentos de soporte, consentimiento y ramas del controller. No se modificó producción para este bloque ni se hizo commit.

La ruta de este informe se verificó libre antes de escribirlo.

## Cobertura comparable con D1

La línea base es `fb3d41ee2f99e8d5c53b725149b8e021230e2af2`, con el mismo alcance comparable de D1 en `INFORME-MOD05-E3-E4-GATES-v1.3.md`. Se excluye únicamente el spec de integración PostgreSQL nuevo, que Jest no ejecuta en esta corrida unitaria.

| Métrica    |         D1 comparable |      G7-C1 comparable |    Cambio |
| ---------- | --------------------: | --------------------: | --------: |
| Statements | 1.858/2.256 = 82,36 % | 2.049/2.256 = 90,82 % |  +8,46 pp |
| Branches   |     536/905 = 59,23 % | 737/905 = **81,44 %** | +22,21 pp |
| Functions  |     246/316 = 77,85 % |     269/316 = 85,13 % |  +7,28 pp |
| Lines      | 1.783/2.113 = 84,38 % | 1.930/2.113 = 91,34 % |  +6,96 pp |

Las tres métricas distintas de branches superan la línea base D1. El objetivo C1 de branches ≥80 % queda satisfecho.

## Cobertura fresca del módulo

Corrida Jest sin caché, en serie, sobre las specs de `crm/expedientes`:

```powershell
$coverageDir = '<directorio temporal nuevo>'
pnpm --filter @iwana/api exec jest --runInBand --no-cache --coverage --coverageDirectory=$coverageDir --coverageReporters=text-summary --coverageReporters=json --collectCoverageFrom='modules/crm/expedientes/**/*.ts' --coverageThreshold='{"global":{"statements":0,"branches":0,"functions":0,"lines":0}}' --testPathPattern=src/modules/crm/expedientes --testPathIgnorePatterns='g1-conversion-failure\.postgres\.integration\.spec\.ts'
```

Resultado: exit 0; 15 suites aprobadas, 240 tests aprobados. El collector bruto produjo:

| Métrica    |          Conteo bruto |
| ---------- | --------------------: |
| Statements | 2.049/2.365 = 86,63 % |
| Branches   |     737/919 = 80,19 % |
| Functions  |     269/341 = 78,88 % |
| Lines      | 1.930/2.219 = 86,97 % |

El spec de integración omitido aporta 0/109 statements, 0/14 branches, 0/25 functions y 0/106 lines al collector bruto; por eso la tabla comparable resta exactamente esos denominadores y no excluye archivos productivos. El `coverage-final.json` está en `%TEMP%\mod05-g7-c1-module-2d9b70937b4b4b42a33446da9e9fd5b5`.

## Gate de tests API

Comando conjunto ejecutado después de estabilizar C1 y K1:

```powershell
pnpm exec turbo run test --filter=@iwana/api --force
```

Resultado: exit 0; 380 suites aprobadas, 4 omitidas; 5.078 tests aprobados, 15 omitidos; `Cached: 0 cached, 4 total`.

## Cierre

C1 queda en GO: branches comparables en 81,44 % y las otras tres métricas mejoran frente a D1. Este bloque solo editó specs de `apps/api/src/modules/crm/expedientes/**` y este informe. No se hizo commit.
