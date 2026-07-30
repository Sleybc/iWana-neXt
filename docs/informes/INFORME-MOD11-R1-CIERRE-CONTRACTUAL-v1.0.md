# Informe R1 — cierre contractual de operaciones

**Versión:** 1.0
**Fecha:** 2026-07-30
**Agente:** AI-SR-FULL
**Estado:** Implementado; pendiente resolver fallos preexistentes del harness HTTP autenticado

## Alcance

- Publicar `template` como nullable en el contrato compartido, DTO de respuesta y OpenAPI v1.
- Mantener consumidores tipados sin redefinir la nulabilidad localmente.
- Emitir labels de producto en español para faltantes del gate de cierre.
- Mantener `requirementId` únicamente en la evaluación interna.
- Verificar que `progress` siga siendo porcentaje entero de 0 a 100 y que `completed`/`total` sigan siendo contadores.

## Cambios entregados

- `ExecutionOrderDetail.template` acepta `null` en `@iwana/shared`.
- El controlador publica una respuesta DTO explícita y normaliza `template: null` cuando falta cualquier parte de la referencia.
- OpenAPI declara `template.nullable` y `missingRequirements` como labels de producto, sin claves técnicas.
- `ACTIVITY` y `MATERIAL` ya no interpolan `activityType` ni `itemCategory`; usan `req.label` y fallback seguro en español.
- El error público `CLOSURE_GATE_INCOMPLETE` publica solo `string[]` de labels.
- El snapshot de requisitos se valida antes de consumirlo y se eliminaron casts de sus consumidores.

## Evidencia

| Verificación | Resultado |
| --- | --- |
| Tests focalizados API (4 suites) | 93 passed |
| Tests shared (2 suites) | 6 passed |
| `@iwana/api` typecheck | OK |
| `@iwana/api` lint | OK |
| `@iwana/shared` lint/typecheck | OK |
| `@iwana/portal` typecheck | OK |
| `@iwana/portal` lint | OK; 39 warnings preexistentes de hooks |

## Fallo separado no atribuible al cambio

La suite completa de API terminó con **223 suites passed, 2 failed, 4 skipped; 2665 tests passed, 53 failed, 15 skipped**. Los fallos se concentran en:

- `apps/api/src/modules/tasks/tests/execution-orders.controller.http.spec.ts`
- `apps/api/src/modules/tasks/tests/tasks.controller.http.spec.ts`

Ambas fallan antes de ejercer la lógica modificada, con respuestas `401 Unauthorized` para fixtures autenticados. La implementación contractual se verificó mediante tests directos del controlador, servicio, evaluador y Swagger. No se modificaron guards ni el harness de autenticación.
