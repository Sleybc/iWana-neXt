# Informe T-FIX — fechas temporales en operations/

**Bloque:** T-FIX · fe-platform  
**Fecha:** 2026-10-06  
**Resultado:** GO

## Cambio

En `apps/portal/src/components/operations/use-execution-order-console.spec.ts`, sustituí los `expiresAt` fijos de `2026-10-06T12:00:00.000Z` por un helper que genera un vencimiento una hora posterior a `Date.now()`. Así las pruebas de evidencia válida, rechazada, vencida y de análisis prolongado conservan su intención después de esa fecha y también bajo un reloj desplazado.

## Revisión del alcance temporal

La búsqueda cubrió `Date.now()`, `new Date()`, `Date.parse()`, `isValidFutureEvidenceExpiry`, `isProlongedPendingInventoryConsumption`, `expiresAt`, `useFakeTimers` y `setSystemTime` en todos los `*.spec.ts` y `*.spec.tsx` de `apps/portal/src/components/operations/`.

- `use-execution-order-console.spec.ts`: cambiado; las fechas fijas vencían el 6 de octubre y el resultado dependía del reloj real.
- `use-execution-order-evidence.spec.ts`: conserva las fechas fijas porque cada prueba activa `jest.useFakeTimers({ now: NOW })`; el caso de expiración avanza ese reloj explícitamente con `setSystemTime`.
- `TasksTable.spec.tsx`: conserva su fecha fija porque congela el reloj con Jest y deriva los vencimientos del mismo instante.
- `execution-order-requirements.spec.ts` y `use-execution-order-custody.spec.ts`: pasan `now` explícitamente a las funciones bajo prueba; no consultan el reloj para decidir el resultado.
- `ExecutionOrderMaterialAction.spec.tsx`: los fixtures de antigüedad se calculan relativos a `Date.now()` y al umbral compartido.
- Las fechas literales de filtros, ventanas de OT, orden cronológico y recibos en los demás specs son datos de formato/contrato. `use-execution-order-console.refresh.spec.ts` usa `2099-01-01` para un recibo futuro, que sigue siendo futuro con el offset solicitado. Se dejaron intactas.

## Verificación

Corrida normal, sin caché:

```powershell
pnpm --filter @iwana/portal test --runInBand --no-cache --testPathPattern=components/operations
```

Resultado: **44 suites aprobadas, 767 pruebas aprobadas**.

Segunda corrida, sin caché, con `Date` desplazado 30 días dentro de Jest y sin cambiar el reloj de Windows:

```powershell
pnpm --filter @iwana/portal test --runInBand --no-cache --config=jest.clock-30-days.config.js --testPathPattern=components/operations
```

La configuración temporal `apps/portal/jest.clock-30-days.config.js` extendió `apps/portal/jest.config.js` y cargó `apps/portal/src/clock-offset-30-days.setup.js`. El setup sustituyó `Date` por una subclase que desplaza 30 días tanto `Date.now()` como `new Date()` sin cambiar los temporizadores reales. Esos dos archivos temporales se eliminaron al terminar.

Resultado con el offset: **44 suites aprobadas, 767 pruebas aprobadas**. No se reprodujeron fallos por vencimiento en la segunda corrida. Las pruebas que usan relojes falsos mantienen su reloj de caso intencional y derivan sus fixtures del mismo instante.

En ambas corridas Jest emitió advertencias ya presentes de `act(...)` y ts-jest; no afectaron los resultados.

## Archivos

- Modificado: `apps/portal/src/components/operations/use-execution-order-console.spec.ts`.
- Añadido: este informe.

Sin cambios de producto ni commit.
