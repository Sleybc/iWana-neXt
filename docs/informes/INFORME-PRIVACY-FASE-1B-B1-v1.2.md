# INFORME — `privacy` Fase 1b · B1 · Correcciones de la Ola 2-bis

**Fecha:** 2026-10-16  
**Agente:** AI-SR-FULL (`sr-backend`)  
**Versión:** 1.2  
**Encargo:** C2, C4 (API y shared) y C6 de [PROMPT-PRIVACY-FASE-1B-v1.3.md](../prompts/PROMPT-PRIVACY-FASE-1B-v1.3.md).  
**Plan:** [plan de orquestación v1.3](../plans/2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md).  
**Estado:** C2, C4 y C6 implementados; pruebas focalizadas verdes. El gate completo de API/Turbo está fallido por dos suites CRM cuya fixture no proporciona `DataSource`; no se declara la fase verde.

## Alcance y trazabilidad

Se leyeron `AGENTS.md`, `.github/copilot-instructions.md`, el plan v1.3, los prompts de Fase 1b v1.0–v1.3, el launcher v1.4 y las skills `nestjs-expert`, `backend-security-coder`, `postgresql` y `test-driven-development`. La ruta del informe estaba libre antes de crearlo. No se usaron datos personales reales ni claves reales y no se hizo commit.

Los cambios se limitan a `apps/api/src/modules/privacy/**`, `packages/shared/src/schemas/privacy/**` y el spec de integración de la migración 150 dentro de `packages/database/src/migrations/tenant/`. Las pruebas de 149 y 151 ya consultaban `information_schema` filtrando por `current_schema()`; no requerían cambios de catálogo.

## C2 — auditoría dentro de la transacción

`resolveSuppression` registra la supresión mediante `AuditService.logWithin(entry, manager)`, usando el mismo manager que anonimiza, actualiza `erased_at`, agrega eventos y cierra marcas. El error se propaga y hace rollback. Se corrigió el comentario del método para precisar que también un fallo de auditoría revierte la operación.

La integración PostgreSQL provoca el rechazo de `logWithin` después de que un participante sintético escribe una fila. Comprueba que la solicitud siga `EN_TRAMITE`, que `erased_at` sea nulo y que la fila del participante no persista.

## C4 — límite de candidatos

Los esquemas shared de `resolve` y de vista previa limitan las listas a 500 IDs e incorporan `TOO_MANY_CANDIDATES`. API/OpenAPI refleja el mismo límite y el blocker.

Si la vista previa recalcula más de 500 candidatos, devuelve `eligible: false`, agrega el blocker, deja `candidateExpedienteIds` vacío y conserva los conteos reales. Si `resolve` recalcula más de 500, responde 409 `PRIVACY_ERASURE_TOO_MANY_CANDIDATES` antes de llamar a `anonymize`. El esquema shared verifica que una vista previa elegible de 500 candidatos produce un cuerpo válido para `resolve`, y rechaza 501.

## C6 — aislamiento del catálogo de PostgreSQL

El spec de la migración 150 filtra `pg_proc` mediante `pronamespace = to_regnamespace(current_schema())`. Para reproducir dos schemas tenant con una función homónima, el spec crea un segundo schema efímero con esa función y confirma que la consulta acotada encuentra una sola función en el schema migrado. La consulta de comprobación de ambas funciones limita explícitamente `pronamespace` a esos dos schemas.

## Evidencia focalizada sin caché

| Comando / validación | Resultado |
|---|---:|
| `pnpm --filter @iwana/shared exec jest src/schemas/privacy/erasure.spec.ts --runInBand --no-cache` | 1 suite, 5 tests aprobados |
| `pnpm --filter @iwana/api exec jest src/modules/privacy/requests/requests.service.coverage.spec.ts --runInBand --no-cache` | 1 suite, 40 tests aprobados |
| `pnpm --filter @iwana/api exec jest src/modules/privacy/privacy.swagger.spec.ts --runInBand --no-cache` | 1 suite, 5 tests aprobados |
| API PostgreSQL: `requests.service.postgres.integration.spec.ts` con `--testNamePattern="revierte toda la supresión"` | PostgreSQL real alcanzable en `dbiw`; 1 test seleccionado y aprobado; 15 tests del archivo no seleccionados |
| `pnpm --filter @iwana/db exec jest --config jest.integration.config.js src/migrations/tenant/149_privacy_erasure_record.integration.spec.ts src/migrations/tenant/150_titular_anonymization_marker.integration.spec.ts src/migrations/tenant/151_seed_blocked_data_permission.integration.spec.ts --runInBand --no-cache` | 3 suites, 3 tests aprobados en PostgreSQL real `dbiw` |
| `git diff --check` en las áreas asignadas | Sin errores |

Se ejecutó `pnpm --filter @iwana/shared build` antes de la integración API porque su configuración resolvía los tipos publicados de `@iwana/shared/dist`; la primera ejecución detectó tipos compilados desactualizados. Tras reconstruir shared, el test de integración C2 pasó.

## Evidencia agregada de la raíz

La ejecución agregada informada por la raíz fue:

```text
pnpm exec turbo run test --force --continue
Tasks: 9/10 exitosas
Cached: 0/10
```

La tarea API falló. En la ejecución independiente de Jest API: **381 suites aprobadas, 2 fallidas y 4 omitidas; 5.149 tests aprobados, 69 fallidos y 15 omitidos**. Las suites fallidas son `expedientes.controller.fase2.http.spec.ts` y `expedientes.swagger.spec.ts`; la evidencia agregada atribuye la falla al fixture sin `DataSource`. V2′ también documenta el fixture incompleto de `expedientes.controller.fase2.http.spec.ts` como P2 de evidencia (`INFORME-PRIVACY-FASE-1B-V2-SEC-v1.1.md`). Esta falla de suite no se cuenta como verificación verde de B1.

| Paquete | Conteo comunicado por la raíz |
|---|---:|
| `@iwana/api` | 381 suites aprobadas, 2 fallidas, 4 omitidas; 5.149 tests aprobados, 69 fallidos, 15 omitidos |
| `@iwana/shared` | 19 suites; 174 tests aprobados |
| `@iwana/db` | 67 suites; 397 tests aprobados |
| `@iwana/worker` | 20 suites; 169 tests aprobados |
| `@iwana/portal` | 303 suites; 3.043 tests aprobados, 1 omitido |
| `@iwana/ui` | 5 suites; 34 tests aprobados |

El arranque real de API respondió **HTTP 200** a `GET /api/v1/health`. No se recibieron resultados agregados de typecheck, lint ni build; quedan sin declarar. La verificación focalizada de B1 no reemplaza esos gates.

## Estado de gates y deuda

| Gate | Estado | Evidencia |
|---|---|---|
| C2, C4 y C6 | **Implementados; pruebas focalizadas verdes** | Evidencia focalizada arriba; C2 y C6 ejercitados contra `dbiw` |
| Tests de API | **Falla** | 2 suites CRM fallidas; 69 tests fallidos según Jest API standalone |
| Turbo sin caché | **Falla** | 9/10 tareas; la tarea API falló; 0/10 cache hits |
| API `/health` | **Cumple** | HTTP 200 en arranque real |
| Typecheck, lint y build agregados | **Sin evidencia** | No se recibieron conteos; no se declaran aprobados |

**Deuda P2:** reparar el fixture HTTP de expedientes para inyectar `DataSource` y los mocks de auditoría requeridos, y volver a ejecutar las dos suites y el gate API/Turbo. Se registra con referencia al hallazgo P2 de V2′; este informe no corrige archivos CRM fuera de la propiedad B1.

No se declaran todos los gates verdes ni se infiere que los fallos agregados fueron cubiertos por las pruebas focalizadas.
