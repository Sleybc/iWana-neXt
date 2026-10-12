# Informe MOD05 Subscribers — Remediación B10 v1.0

**Estado:** cerrado  
**Bloque:** B10 · `fe-platform`  
**Fecha:** 2026-10-12

## Entregables

- `apps/portal/src/components/crm/subscribers/SubscribersListClient.tsx`: la columna IVA usa `formatVatTreatmentLabel(subscriber.vatTreatment)` y la ubicación usa `formatSubscriberLocation(subscriber.city, subscriber.department)`. Los valores salen de `SubscriberListItem` en `@iwana/shared`; no se agregaron tipos paralelos ni casts.
- `apps/portal/src/components/crm/subscribers/SubscribersListClient.spec.tsx`: prueba de fila para el tratamiento real `EXCLUDED` y el fallback existente `Sin ubicación` cuando la proyección restringida no entrega `city` ni `department`.

## Evidencia

- Prueba focalizada: `SubscribersListClient.spec.tsx`, **1 suite y 11 tests aprobados**.
- Gate requerido: `pnpm exec turbo run test --filter=@iwana/portal --force`, **exit code 0**.
- Turbo ejecutó 2 tareas, 2 exitosas y 0 desde caché (`Remote caching disabled`; `cache bypass, force executing`).
- Jest: **291 suites aprobadas; 2.927 tests aprobados, 1 omitido (2.928 total)**. La omisión está declarada en `apps/portal/src/components/inventory/InventoryClient.spec.tsx:2244` (`it.skip`); es preexistente y ajena a B10.
- La prueba nueva confirma que `EXCLUDED` se presenta como `Excluido` y, al faltar ambos campos de ubicación restringidos, conserva `Sin ubicación`.

## Deuda nueva por severidad

- **Crítica:** ninguna.
- **Alta:** ninguna.
- **Media:** ninguna.
- **Baja:** ninguna.

La prueba focalizada produjo advertencias de React sobre actualizaciones asíncronas de estado no envueltas en `act`. No causaron fallos; el gate completo quedó verde y no se amplió el alcance para modificar el harness compartido.
