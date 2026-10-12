# Informe MOD05 Subscribers — Remediación B12 v1.0

**Fecha:** 2026-10-12  
**Responsable:** `sr-qa`  
**Alcance:** pruebas observables de ramas de rechazo y fallos cerrados en `crm/subscribers` y `parties`, más regresiones PostgreSQL B5.  
**Resultado B12:** **GO**. La corrida completa sin caché supera 80 % en statements y branches en ambos módulos. El veredicto no sustituye la re-verificación independiente de gate-verifier y sec-eng.

## Pruebas añadidas o ampliadas

| Archivo de test | Comportamiento ejercido |
| --- | --- |
| `apps/api/src/modules/parties/party-pii.util.spec.ts` | Cifrado/descifrado con llave activa y anterior; rechazo cerrado de ciphertext malformado y entradas largas; normalización y HMAC documental; rechazo de documento inválido; normalización de email/teléfono y contacto vacío; almacenamiento sin valor en claro. |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-status-transition.service.spec.ts` | Expediente inexistente o no elegible; rechazo por `activatedAt`; idempotencia de prospecto; transición inválida; actualización atómica y auditoría sin PII; competencia de restauración con compare-and-set; estados desconocidos; transiciones exitosas y ramas del logger. |
| `apps/api/src/modules/crm/subscribers/tests/subscribers.service.spec.ts` | Creación sin documento; DV de NIT inválido; razón de override corta; búsqueda idempotente por expediente; conflictos no relacionados; filtros; actualización audit-safe y secciones inválidas; vistas 360 con/sin expediente; campos opcionales vacíos; rechazos previos a persistencia; activación/reactivación/cancelación por estado. |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-tax-profile.service.spec.ts` | Perfil/asignación inexistente; tasas nulas y asignación no confirmada; actualización existente y creación de asignaciones; fallback de catálogo/tasa; sugerencias IVA y saltos para catálogo, producto o asignación no elegibles. |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-pipeline-listeners.spec.ts` | No emitir cuando la activación no devuelve resultado y salida temprana cuando no existe prospecto para cancelar. |
| `apps/api/src/modules/crm/subscribers/b5-identity-conversion.postgres.integration.spec.ts` | Contra PostgreSQL real: mismo HMAC con Party canónico ACTIVE y alias MERGED enlaza al canónico; Party soft-deleted no se reutiliza y se crea destino ACTIVE no eliminado. Incluye el caso existente de rechazo por `activatedAt`. |

No se cambió código productivo ni se editaron los adapters de `parties`. Los tests de servicio comprobaban errores, estados, escrituras y el contenido observable de auditoría; no se añadieron tests vacíos ni exclusiones del denominador.

## Evidencia de ejecución

| Verificación | Comando | Resultado real |
| --- | --- | --- |
| Integración B5 | `IWANA_DB_INTEGRATION_AVAILABLE=true`, `E2E_TENANT_SLUG=iwana`; `pnpm --filter @iwana/api test:integration -- --runInBand --runTestsByPath src/modules/crm/subscribers/b5-identity-conversion.postgres.integration.spec.ts` | PostgreSQL real: **1 suite, 8 tests aprobados**, exit 0. |
| Jest API completo y cobertura | `pnpm --filter @iwana/api exec jest --no-cache --runInBand --coverage --coveragePathIgnorePatterns='\.spec\.[tj]s$'` | Exit 0; salida literal: `Test Suites: 4 skipped, 329 passed, 329 of 333 total`; `Tests: 15 skipped, 4242 passed, 4257 total`; `Snapshots: 0 total`; `Time: 211.466 s`. Sin cache hit. `supplier-profile.http.integration.spec.ts` pasó. |

## Cobertura agregada

La cobertura final se calculó desde `apps/api/coverage/coverage-final.json`, sumando contadores de archivos TypeScript productivos dentro de cada carpeta. Los specs quedaron fuera del denominador mediante el filtro del comando.

| Módulo | B8 publicado: statements / branches | B12 final: statements | B12 final: branches | Umbral |
| --- | ---: | ---: | ---: | --- |
| `crm/subscribers` | 78,28 % / 62,19 % | **97,44 % (1104/1133)** | **89,24 % (514/576)** | Cumple |
| `parties` | 96,51 % / 40,00 % | **94,24 % (524/556)** | **88,00 % (132/150)** | Cumple |

La disminución de statements de `parties` frente al porcentaje publicado por B8 coincide con la incorporación de código de B11 al árbol actual; la suite que mide el estado completo del árbol pasó. La métrica de gate es el estado final y cumple en ambas carpetas.

## Cobertura antes/después por archivo

La columna **Antes** se recalculó desde el snapshot conservado en `apps/api/src/coverage/mod05-b8/coverage-final.json`; **Después** usa la corrida B12 completa indicada arriba. Cada celda indica `statements / branches` en porcentaje. `—` indica que el archivo todavía no existía en el snapshot. Los valores por archivo son el comparativo del snapshot guardado; su agregado no coincide con los porcentajes resumidos en el informe B8, por lo que se conserva esa discrepancia como deuda de evidencia y no se mezclan los denominadores.

| Archivo productivo | Antes (stmts / branches) | Después (stmts / branches) | Branches aún sin cubrir (líneas) |
| --- | ---: | ---: | --- |
| `crm/subscribers/dto/create-subscriber.dto.ts` | 100,0 / 100,0 | 100,0 / 100,0 | — |
| `crm/subscribers/dto/save-tax-assignments.dto.ts` | 100,0 / 100,0 | 100,0 / 100,0 | — |
| `crm/subscribers/dto/subscriber-response.dto.ts` | 0,0 / 100,0 | 0,0 / 100,0 | — |
| `crm/subscribers/dto/transition-subscriber-status.dto.ts` | 100,0 / 100,0 | 100,0 / 100,0 | — |
| `crm/subscribers/dto/update-subscriber.dto.ts` | 100,0 / 100,0 | 100,0 / 100,0 | — |
| `crm/subscribers/dto/upsert-tax-assignment.dto.ts` | 100,0 / 100,0 | 100,0 / 100,0 | — |
| `crm/subscribers/entities/subscriber-tax-assignment.entity.ts` | 90,5 / 100,0 | 90,5 / 100,0 | — |
| `crm/subscribers/entities/subscriber-tax-profile.entity.ts` | 89,5 / 100,0 | 89,5 / 100,0 | — |
| `crm/subscribers/entities/subscriber.entity.ts` | 100,0 / 100,0 | 100,0 / 100,0 | — |
| `crm/subscribers/events/subscriber-activated.event.ts` | 100,0 / 100,0 | 100,0 / 100,0 | — |
| `crm/subscribers/events/subscriber-converted.event.ts` | 100,0 / 100,0 | 100,0 / 100,0 | — |
| `crm/subscribers/events/subscriber-created.event.ts` | 0,0 / 100,0 | 0,0 / 100,0 | — |
| `crm/subscribers/listeners/subscriber-activation.listener.ts` | 94,4 / 0,0 | 100,0 / 100,0 | — |
| `crm/subscribers/listeners/subscriber-cancellation.listener.ts` | 92,9 / 0,0 | 100,0 / 100,0 | — |
| `crm/subscribers/subscriber-creation.service.ts` | 96,8 / 82,9 | 96,8 / 82,9 | 103, 107, 114, 127, 128, 138–140, 142, 212 |
| `crm/subscribers/subscriber-projection.ts` | — | 100,0 / 100,0 | — |
| `crm/subscribers/subscriber-status-transition.service.ts` | 67,1 / 50,0 | **98,6 / 93,3** | 94, 142 |
| `crm/subscribers/subscriber-tax-profile.service.ts` | 68,8 / 47,7 | **99,4 / 91,9** | 144, 161, 163, 174, 327, 431, 446 |
| `crm/subscribers/subscriber-tax.controller.ts` | 100,0 / 100,0 | 100,0 / 100,0 | — |
| `crm/subscribers/subscribers.controller.ts` | 95,4 / 85,1 | 95,4 / 85,1 | 104, 315, 497–500, 566 |
| `crm/subscribers/subscribers.module.ts` | 100,0 / 100,0 | 100,0 / 100,0 | — |
| `crm/subscribers/subscribers.service.ts` | 70,3 / 54,7 | **98,4 / 89,3** | 192, 200, 237–238, 249–250, 276, 282–283, 287, 293–294, 495, 508, 510–511, 513, 517–518, 981, 1017, 1117–1118, 1123 |
| `crm/subscribers/vat-treatment.service.ts` | 97,7 / 96,7 | 97,7 / 96,7 | 67 |
| `parties/adapters/party-read.adapter.ts` | 90,8 / 81,8 | 92,0 / 82,6 | 97, 134, 178, 195 |
| `parties/adapters/party-write.adapter.ts` | 100,0 / 93,9 | 100,0 / 94,1 | 73, 165 |
| `parties/dto/assign-role.dto.ts` | 100,0 / 100,0 | 100,0 / 100,0 | — |
| `parties/dto/create-party.dto.ts` | 100,0 / 100,0 | 100,0 / 100,0 | — |
| `parties/dto/index.ts` | 0,0 / 100,0 | 0,0 / 100,0 | — |
| `parties/dto/list-parties.dto.ts` | 100,0 / 100,0 | 100,0 / 100,0 | — |
| `parties/dto/update-party.dto.ts` | 100,0 / 100,0 | 100,0 / 100,0 | — |
| `parties/dto/upsert-contact.dto.ts` | 100,0 / 100,0 | 100,0 / 100,0 | — |
| `parties/entities/index.ts` | 0,0 / 100,0 | 0,0 / 100,0 | — |
| `parties/entities/party-contact.entity.ts` | 90,0 / 100,0 | 90,0 / 100,0 | — |
| `parties/entities/party-role.entity.ts` | 84,2 / 100,0 | 84,2 / 100,0 | — |
| `parties/entities/party.entity.ts` | 86,1 / 100,0 | 86,1 / 100,0 | — |
| `parties/parties.controller.ts` | 100,0 / 100,0 | 100,0 / 100,0 | — |
| `parties/parties.module.ts` | 100,0 / 100,0 | 100,0 / 100,0 | — |
| `parties/party-pii.util.ts` | 87,0 / 40,0 | **100,0 / 100,0** | — |
| `parties/ports/party-read.port.ts` | 100,0 / 100,0 | 100,0 / 100,0 | — |
| `parties/ports/party-write.port.ts` | 100,0 / 100,0 | 100,0 / 100,0 | — |
| `parties/services/party-contact.service.ts` | 100,0 / 88,9 | 100,0 / 88,9 | 80 |
| `parties/services/party-role.service.ts` | 100,0 / 81,8 | 100,0 / 81,8 | 31–32 |
| `parties/services/party.service.ts` | 92,6 / 86,8 | 92,6 / 86,8 | 98, 125, 188, 190, 240, 249, 252 |

Las filas con `0,0 / 100,0` son módulos de tipos/exports sin statements ejecutables instrumentados; no representan ramas fallidas. Las líneas de ramas pendientes son ubicaciones de Istanbul en el código medido, no exclusiones del cálculo.

## Deuda por severidad

| Severidad | Deuda nueva de B12 |
| --- | --- |
| Crítica | Ninguna. |
| Alta | Ninguna. B12 no encontró una rama que requiriera modificar producción para poder probarla. |
| Media | Quedan ramas individuales no ejecutadas en los archivos listados en la última columna de la tabla. El agregado de ambos módulos sí cumple el umbral de B12. La siguiente ampliación debe priorizar ramas observables de `subscriber-creation.service.ts`, `subscribers.service.ts` y adapters/service de `parties` si el gate posterior exige un umbral por archivo. |
| Baja | Los agregados recalculados del snapshot `mod05-b8` no coinciden con los porcentajes publicados en B8. Para tendencias históricas, conservar una sola exportación `coverage-final.json` junto a cada reporte y calcular sus agregados con el mismo filtro. |

## Cierre

B12 queda cerrado por sus criterios: B5 pasó contra PostgreSQL real con los dos casos de identidad nuevos; la corrida completa Jest API pasó sin caché con conteo real; `crm/subscribers` y `parties` superaron 80 % en statements y branches. No se cambió código productivo. Gate-verifier y sec-eng continúan con sus re-verificaciones independientes.
