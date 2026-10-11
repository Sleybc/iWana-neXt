# Informe MOD11 — Consola de registro de material F1/F2

**Fecha:** 2026-10-11  
**Resultado:** GO F1 y GO F2  
**Commit/PR:** no creados.

## F1 — `RadioCardGroup`

Se implementó y exportó `RadioCardGroup` en `@iwana/ui` conforme al contrato v1.0. Usa radios nativos en `fieldset`, tarjetas con altura mínima de 44 px, foco visible con `has-[:focus-visible]`, indicador de selección y estilos oscuros limitados a `dark-surface-*`. Se migraron `QuoteShippingFields`, `PlanCatalogFormPeek` y `ExhaustedAttemptsDecisionDialog` sin cambiar su comportamiento de negocio.

## F2 — captura compacta de materiales

- El modo de captura se deriva de `trackingMode` del artículo compatible: los equipos serializados aparecen en tarjetas seleccionables y los demás artículos en filas de cantidad. La tarjeta presenta serial, referencia, SKU y estado; la búsqueda aparece cuando hay más de ocho equipos.
- Las filas de consumibles suman saldos por artículo y descuentan reservas. Los controles −/+ usan `Button` e `Input` existentes; cada fila con cantidad positiva genera un registro independiente, mientras una cantidad cero no se envía. Los resultados parciales dejan el error y la cantidad de la fila fallida visibles para reintentarla de manera aislada.
- El destino fijo se presenta como contexto de lectura. Cuando el requisito no fija destino, se permite elegirlo; la acción del comando se deriva del destino. El texto de confirmación conserva la frase aprobada «instalado en el sitio del cliente».
- El adaptador registra filas de forma secuencial. Lee la versión vigente antes de cada POST, refresca y reintenta una sola vez ante `412`, y reutiliza la misma clave de idempotencia. `registerItemUsage` conserva la posición de `tenantSlug` y añade `idempotencyKey` como quinto argumento; el cliente reutiliza la clave recibida en `Idempotency-Key`.
- El historial y el reverso conservan sus vistas y comportamiento. La asociación del historial sigue usando la clave exacta del requisito.

## Cobertura de §16.6 y condiciones técnicas

La cobertura de `ExecutionOrderMaterialAction.spec.tsx`, `ExecutionOrderMaterialConsole.spec.tsx`, `ExecutionOrderMomentContainer.spec.tsx` y `use-execution-order-console.spec.ts` comprueba:

1. Selección desde la custodia filtrada, un activo serializado por registro y cantidad uno.
2. Serial, referencia, SKU, estado y umbral de búsqueda por serial/MAC.
3. Ausencia de entrada manual de serial y de selectores para artículo, acción, custodia o destino fijados.
4. Registro independiente por fila, exclusión de cantidades cero y conservación de resultados parciales.
5. Derivación de acción para los cinco destinos admitidos.
6. Copy y comportamiento de carga, vacío, error recuperable, envío, éxito, fallo y reintento.
7. Apertura de un requisito opcional sin cambiar su estado ni habilitar el cierre.
8. Historial separado de la disponibilidad y asociación por clave exacta del requisito.

Los tests del adaptador verifican el orden serial y la versión vigente por POST, el refresco tras `412`, la reutilización de la clave durante el único reintento y que un segundo `412` no genere un tercer POST. Los tests de captura verifican que cada fila mantiene su clave al reintentar.

## Gates

| Gate | Resultado |
| --- | --- |
| `pnpm --filter @iwana/ui exec jest --no-cache --runInBand` | 5 suites, 34 tests aprobados |
| Jest sin caché de los tres consumidores y `src/lib/api-client.spec.ts` | 4 suites, 26 tests aprobados |
| `pnpm --filter @iwana/portal exec jest --no-cache --runInBand src/components/operations/` | 44 suites, 780 tests aprobados; supera el umbral de 779 |
| `pnpm typecheck` | 8 tareas exitosas |
| `audit-ui.mjs` sobre `ExecutionOrderMaterialAction.tsx`, `RadioCardGroup.tsx` y los tres consumidores migrados | Sin hallazgos |
| `git diff --check` | Aprobado; Git mostró avisos de normalización CRLF/LF en dos archivos de scheduling y la spec UX preexistente, sin errores de whitespace |

Jest mostró avisos de `ts-jest` (`allowJs`) y deprecación de `punycode`; no afectaron los resultados.

## Archivos principales

- `packages/ui/src/components/RadioCardGroup.tsx` y `packages/ui/src/index.ts`
- `apps/portal/src/components/inventory/QuoteShippingFields.tsx`
- `apps/portal/src/components/commercial/catalog/PlanCatalogFormPeek.tsx`
- `apps/portal/src/components/scheduling/ExhaustedAttemptsDecisionDialog.tsx`
- `apps/portal/src/components/operations/ExecutionOrderMaterialAction.tsx`
- `apps/portal/src/components/operations/use-execution-order-custody.ts`
- `apps/portal/src/components/operations/use-execution-order-console-adapter.ts`
- `apps/portal/src/lib/api-client.ts`

Se conservaron los cambios preexistentes del paso documental y de la ola 1. No se creó commit ni PR.
