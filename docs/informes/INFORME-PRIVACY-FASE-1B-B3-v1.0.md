# INFORME — PRIVACY FASE 1B · B3

**Estado:** Bloqueado antes de implementación por conflicto de propiedad.
**Rama y base medida:** `main`, `aeedeffc0ff47a73c58285fab733d8b3d40d7b14`.
**Propiedad B3 verificada sin diferencias antes de medir:** `apps/api/src/modules/crm/subscribers/**`, `apps/api/src/modules/crm/expedientes/**` y `packages/shared/src/schemas/subscriber.schema.ts`.

## Línea base de cobertura

La línea base de `crm/subscribers` en `main`, medida antes de cualquier edición de B3, es:

| Métrica | Base |
| --- | ---: |
| Statements | 93,81 % (1123/1197) |
| Branches | 83,20 % (560/673) |
| Functions | 91,47 % (118/129) |
| Lines | 94,34 % (1051/1114) |

Comando ejecutado desde `apps/api`, sin caché, sin `--passWithNoTests` y con cobertura limitada al código productivo del directorio:

```powershell
$testPaths = Get-ChildItem src/modules/crm/subscribers -Recurse -File -Filter *.spec.ts |
  Where-Object { $_.Name -notmatch '\.postgres\.integration\.spec\.ts$' } |
  ForEach-Object { Resolve-Path -Relative $_.FullName }
pnpm exec jest --no-cache --runInBand --coverage `
  --coverageDirectory=../../coverage/privacy-b3-baseline-source `
  --collectCoverageFrom='modules/crm/subscribers/**/*.ts' `
  --coveragePathIgnorePatterns='\.spec\.ts$' `
  --coverageThreshold='{}' --coverageReporters=text-summary `
  --runTestsByPath @testPaths
```

Resultado real: **14 suites aprobadas, 285 tests aprobados, 0 snapshots**. La configuración de Jest tiene un umbral preexistente sobre `serialized-asset-useful-life.util.ts`, fuera de este alcance; el comando lo sustituyó por umbral vacío únicamente para poder obtener la medición aislada de `crm/subscribers`. No se modificó configuración del repo. Las integraciones PostgreSQL están excluidas por la configuración Jest por defecto.

## [BLOQUEO]

**De:** AI-SR-FULL/B3 → AI-EM-ARCH  
**Fase/módulo:** Privacy Fase 1B / proyecciones CRM  
**Qué falta:** El §2.11 exige impedir la edición de contactos de titulares bloqueados, pero esa ruta está en `apps/api/src/modules/crm/contacts/**`, fuera de la propiedad asignada a B3 en §4. Se requiere asignación explícita de esa ruta o un responsable con propiedad sobre ella.  
**Impacto:** R10 no puede declararse completo. Por instrucción de AI-EM-ARCH se detuvo la implementación después de medir la línea base. No se modificaron archivos productivos ni se ejecutaron pruebas de implementación.

## Deuda nueva por severidad

| Severidad | Nueva deuda |
| --- | --- |
| P0 | Ninguna |
| P1 | Bloqueo de alcance pendiente: R10 requiere una ruta fuera de la propiedad B3. |
| P2 | Ninguna |
| P3 | Ninguna |

**Cobertura final:** no aplica; no hubo cambios de implementación.  
**Conteo de pruebas de implementación:** 0 suites, 0 tests.
