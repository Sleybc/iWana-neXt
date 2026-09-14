# INFORME — MOD11: el ETag de la OT identifica la representación

**Versión:** 1.0 — **Fecha:** 2026-09-14
**Ejecutor:** AI-SR-FULL (`sr-backend`) · **Orquestador:** AI-EM-ARCH
**Encargo:** `docs/prompts/PROMPT-MOD11-CONSOLA-OT-ETAG-REPRESENTACION-v1.0.md` (completo, pasos 1-9)
**Veredicto:** **GO** (los cuatro criterios §8 en verde; ver §5)

---

## 1. Deuda cerrada

El ETag era `"<version>"` —el contador de concurrencia optimista— y no una
identidad de la representación. Tras ampliar el contrato a v1.1, los navegadores
revalidaban con `If-None-Match`, recibían **304 Not Modified** y servían el
cuerpo viejo (responsable sin nombre, checklist sin estado por requisito),
mientras el E2E de QA —con caché deshabilitada— sí veía los campos nuevos.
Cualquier ampliación futura del contrato habría sido invisible para todo cliente
con la representación cacheada. Defecto de producción, hoy cerrado:

- El ETag es `"<contrato>-<versión>"` (p. ej. `"1.1-7"`): subir el contrato
  invalida toda caché existente aunque ninguna OT cambie de versión.
- `If-Match` sigue siendo el número de versión; el portal envía
  `String(currentVersion)` y no se toca.
- `assertVersion` endurecido: un `If-Match` no entero limpio es 400
  `VALIDATION_ERROR`, nunca un `VERSION_CONFLICT` engañoso por el truncado
  silencioso de `Number.parseInt('1.1-7', 10) → 1`.

## 2. Archivos tocados (superficie exclusiva respetada)

| Archivo | Cambio |
| --- | --- |
| `apps/api/src/modules/tasks/interceptors/execution-order-response-headers.interceptor.ts` | `EXECUTION_ORDER_CONTRACT_VERSION = '1.1'` (constante localizable y declarada) + `buildExecutionOrderETag()` + predicado `isExecutionOrderRepresentation()`; la OT emite `"1.1-<versión>"` |
| `apps/api/src/modules/tasks/services/execution-orders.service.ts` (`assertVersion`, ~L2674) | Validación de entero completo `/^\d+$/` tras retirar `W/` y comillas; formato inválido ⇒ `BadRequestException` `VALIDATION_ERROR` (400); conflicto real ⇒ `ConflictException` `VERSION_CONFLICT` (409), intacto |
| `apps/api/src/modules/tasks/tests/execution-order-etag-representation.spec.ts` | **Nuevo.** 18 casos: 6 (paso 5) + 2 (paso 6) + 10 (paso 7) |
| `e2e/tests/api/execution-orders-operational.spec.ts:282` | **Reescritura INTENCIONAL** (paso 8): `expectMutationHeaders` afirma la regla nueva (`"1.1-<versión>"`); ver §4 |
| `docs/informes/INFORME-MOD11-CONSOLA-OT-ETAG-v1.0.md` | Este informe |

No se tocó: `packages/shared/` (contrato v1.1 cerrado),
`buildExecutionOrderCommandHeaders` (`apps/portal/src/lib/api-client.ts`),
`ExecutionOrderAccessGuard`, `assertActorAccess`, `computeAllowedActions`,
`@Roles`/`@Permissions`. Sin migraciones, sin endpoints nuevos (OpenAPI intacta).

## 3. Paso 4 — revisión de otros emisores de ETag por esta vía

`ExecutionOrderTemplatesController` comparte el interceptor y sus vistas de
versión tienen `version` numérica, por lo que hoy también emiten ETag. Decisión:
las plantillas pertenecen a **otro dominio de representación** y conservan el
ETag heredado (`"<versión>"`); etiquetarlas con el contrato de la OT sería
identificarlas mal (un cambio del contrato de plantillas no las invalidaría y un
cambio del contrato de OT las invalidaría sin necesidad). El predicado
`isExecutionOrderRepresentation()` distingue por forma —detalle (`number`) o
entidad de comando (`executionOrderNumber`) con `version` numérica— y queda
fijado con test propio. Ningún consumidor vivo del formato anterior impide el
cambio: el portal nunca envía el ETag (solo `String(version)`) y el único otro
consumidor del formato era el E2E :282, reescrito aquí. **No hubo `[BLOQUEO]`.**

## 4. Cambio E2E declarado INTENCIONAL (paso 8)

`e2e/tests/api/execution-orders-operational.spec.ts:282` asumía
`etag === '"<version>"'`. Reescrito para afirmar la regla nueva —
el ETag identifica la representación (`"1.1-<versión>"`)— en `expectMutationHeaders`.
Verificado: los 6 call-sites con `expectedVersion` (1b-start, 5-assign, 7d-close,
concurrencia, evidencias) reciben todos representaciones de OT (entidad con
`executionOrderNumber`), por lo que el formato nuevo aplica en cada uno; los
call-sites sin versión (field-work/activity, evidencias) solo verifican
correlación y no cambian. La ejecución del E2E vivo queda en sr-qa
(requiere entorno con API+BD).

## 5. Veredicto GO por criterio (§8 literal)

| Criterio GO | Evidencia |
| --- | --- |
| (a) Misma `version` + distinta versión de contrato ⇒ ETags distintos | `buildExecutionOrderETag(7,'1.1') !== buildExecutionOrderETag(7,'1.2')` + interceptor emite `"1.1-4"`/`"1.1-5"` (spec paso 5, 6/6 verde) |
| (b) `If-Match` numérico funciona; conflicto real ⇒ `VERSION_CONFLICT` | `close` con `'2'`/v2 ⇒ v3; `'3'`/v5 ⇒ `ConflictException` + `code: VERSION_CONFLICT` (spec paso 6, 2/2 verde) |
| (c) `If-Match` mal formado ⇒ error de formato, no conflicto | `'"1.1-7"'`, `'W/"1.1-7"'`, `'1.1-7'`, `'abc'`, `'2.5'`, `'2x'`, `' 2'`, `'2 '`, `'--3'` ⇒ `BadRequestException` + `code: VALIDATION_ERROR`, nunca `ConflictException`; `'"2"'` (cita HTTP válida) sigue aceptado (spec paso 7, 10/10 verde) |
| (d) Suite tasks en verde, sin regresión sobre 564 | **27 suites / 582 tests en verde** (564 base + 18 nuevos): `pnpm --filter @iwana/api exec jest src/modules/tasks --ci --runInBand`, sin turbo, sin `--passWithNoTests`. `tsc --noEmit` limpio; `eslint` limpio en los tres archivos tocados |

NO-GO evitado: `assertVersion` quedó **más estricto** (`/^\d+$/`), no más
tolerante; ningún test se relajó para pasar.

## 6. Marcadores §6.3

- `[BLOQUEO]`: ninguno (DoR §3 leída y verificada antes de tocar el
  interceptor; sin consumidores vivos incompatibles).
- `[CONSULTA]`: ninguna (diagnóstico y decisión §2 venían cerrados).
- `[DESEMPATE]`: ninguno.
- Punto 7 (CRM/MOD05): fuera de alcance, no evaluado.

## 7. Deuda y seguimiento

- Deuda cerrada: ETag-representación + trampa `parseInt` en `assertVersion`.
- Deuda residual (no crítica, declarada): si el contrato de la OT se versiona
  (p. ej. v1.2), actualizar `EXECUTION_ORDER_CONTRACT_VERSION` al mismo tiempo —
  el comentario de la constante lo exige; un olvido dejaría cachés
  stale del mismo modo que este incidente. Candidata a test de convergencia
  contrato↔constante en la fase que versione el contrato.
- Seguimiento: sr-qa ejecuta el E2E operativo con :282 reescrito en entorno vivo.
