# Informe V3 — Consola de reverso de consumo MOD11 ↔ MOD12

- **Versión:** 1.0
- **Fecha:** 2026-10-10
- **Rol:** `fe-platform`
- **Dictamen:** **GO** — implementación de consola y gates locales aprobados.
- **Base del árbol de trabajo:** `main` en `7552c505`; cambios compartidos sin commit.

## Alcance

Se implementó V3 en la consola del portal, siguiendo la spec de reverso v1.1 (R3, R7, R8 y RA), el contrato v1.7 y el copy ratificado en `INFORME-MOD11-MOD12-REVERSO-U2-PROD-UX-v1.0.md`. Este bloque no modificó módulos backend ni `packages/shared`.

## Cambios

- El historial ofrece **Revertir consumo** únicamente cuando `allowedActions` contiene `REVERSE_ITEM_USAGE`, el movimiento está confirmado y no hay un reverso pendiente o confirmado. Tras un rechazo, la solicitud vuelve a estar disponible si el permiso sigue vigente.
- Se agregó un diálogo con motivo obligatorio, límite de 2.000 caracteres, ayuda “No incluyas datos personales”, validación accesible y envío con `If-Match` e `Idempotency-Key`. El diálogo enfoca el motivo y devuelve el foco al disparador al cerrarse.
- La consola muestra los estados pendiente, aplicado y rechazado; presenta en lenguaje de producto los cuatro motivos tipados aprobados por U2; marca la corrección posterior al cierre y comunica cuando el requisito vuelve a quedar pendiente.
- El adaptador envía el comando y actualiza el detalle y el historial de consumos.
- Se añadió la etiqueta de inventario `EXECUTION_ORDER_REVERSAL`, requerida por el nuevo origen de movimiento presente en el contrato compartido de la implementación.

Archivos principales: `apps/portal/src/components/operations/ExecutionOrderMaterialAction.tsx`, su spec, `use-execution-order-console-adapter.ts` y `apps/portal/src/lib/api-client.ts` con sus specs.

## Gates

| Gate | Resultado |
|---|---|
| `pnpm --filter @iwana/portal typecheck` | PASS |
| `pnpm --filter @iwana/portal exec jest src/components/operations --runInBand --no-cache` | PASS — 44/44 suites, 779/779 tests; supera el umbral de 767 y ejecutado sin caché |
| Spec focal `ExecutionOrderMaterialAction.spec.tsx` con `--no-cache` | PASS — 51/51 tests |
| `pnpm --filter @iwana/portal exec jest src/lib/api-client.spec.ts --runInBand --no-cache` | PASS — 18/18 tests |
| `audit-ui.mjs` sobre los componentes V3 | PASS — sin hallazgos |

## Limitaciones

- No se hizo una pasada manual en navegador ni una sesión con lector de pantalla; foco, etiquetas y anuncios accesibles se validaron con tests y `audit-ui.mjs`.
- Jest mostró avisos existentes de `ts-jest` por `jest.global-setup.js`, deprecación de `punycode` y algunos avisos React `act(...)` en specs de la consola; no fallaron los gates.
- No se creó commit, según el encargo.
