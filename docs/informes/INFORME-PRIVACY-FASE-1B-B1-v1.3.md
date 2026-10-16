# Informe B1 — Privacy Fase 1b · v1.3

**Fecha:** 2026-10-16  
**Estado:** H13 implementado; pruebas de API y Turbo en verde. **[BLOQUEO]** para health de API contra `dbiw` migrada hasta 151: precondición de base pendiente.  
**Plan/prompt:** plan de Fase 1b v1.4; delta [PROMPT-PRIVACY-FASE-1B-v1.4.md](../prompts/PROMPT-PRIVACY-FASE-1B-v1.4.md).  
**Informe previo:** [B1 v1.2](INFORME-PRIVACY-FASE-1B-B1-v1.2.md), evidencia de C2/C4/C6.

## H13 — `counts` de la vista previa

OpenAPI ahora deriva el enum de categorías del mismo `erasureCategorySchema` usado por el contrato shared. El objeto `counts` documenta únicamente esas claves; cada valor es entero no negativo, las claves son opcionales y no se admiten claves adicionales. El test Swagger verifica la igualdad de claves y las restricciones de valores y objeto. No se modificó el contrato shared.

Archivos del cambio: `apps/api/src/modules/privacy/privacy-openapi.schemas.ts` y `apps/api/src/modules/privacy/privacy.swagger.spec.ts`.

## Evidencia de pruebas

Todas las corridas siguientes son del árbol final combinado con B3, sin caché:

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @iwana/api exec jest src/modules/privacy/privacy.swagger.spec.ts --runInBand --no-cache` | 1 suite, 5 tests aprobados; 0 fallos |
| `pnpm --filter @iwana/api exec eslint src/modules/privacy/privacy-openapi.schemas.ts src/modules/privacy/privacy.swagger.spec.ts` | Exit 0 |
| `pnpm --filter @iwana/api exec jest --runInBand --no-cache` | 389 suites: 385 aprobadas, 4 omitidas, 0 fallidas; 5.244 tests: 5.229 aprobados, 15 omitidos, 0 fallidos |
| `pnpm exec turbo run test --force --continue` | Resumen Turbo: 10/10 tareas exitosas, 0/10 cacheadas, sin tareas fallidas |

Conteos emitidos por las tareas de test de Turbo:

| Paquete | Suites | Tests |
| --- | ---: | ---: |
| `@iwana/api` | 385 aprobadas, 4 omitidas | 5.229 aprobados, 15 omitidos |
| `@iwana/shared` | 19 | 174 aprobados |
| `@iwana/db` | 67 | 397 aprobados |
| `@iwana/portal` | 303 | 3.043 aprobados, 1 omitido |
| `@iwana/worker` | 20 | 169 aprobados |
| `@iwana/web` | 36 | 229 aprobados |
| `@iwana/ui` | 5 | 34 aprobados |

Una primera corrida de API anterior al ajuste final de fixtures de B3 terminó con dos suites rojas. B3 completó H12 y el fixture del subrecurso; la corrida final completa descrita arriba pasó con cero fallos.

## [BLOQUEO] Health contra `dbiw`

El informe [V1 QA v1.2](INFORME-PRIVACY-FASE-1B-V1-QA-v1.2.md) registra una consulta de solo lectura sobre la conexión configurada para `dbiw`: las migraciones tenant 149, 150 y 151 no están aplicadas en los 21 schemas tenant (`readyForV1=false`). Por instrucción, no ejecuté migraciones ni inicié API/E2E contra una base que no satisface la precondición. Por tanto, no hay resultado de `/health` atribuible a `dbiw` migrada hasta 151; el gate de entorno queda pendiente del CTO.

La ruta de este informe estaba libre antes de escribirlo. No incluí PII, identificadores de titulares, ciphertext, HMAC, credenciales ni claves reales. No hice commits.
