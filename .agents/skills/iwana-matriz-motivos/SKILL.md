---
name: iwana-matriz-motivos
description: Arma y ejecuta la matriz motivo de rechazo → test integrado de MOD11↔MOD12 con conteo real contra Postgres y Redis. Usar al redactar, aprobar o cerrar cualquier encargo que cruce consumo de inventario de OT, recibos o colas firmadas, y siempre que se agregue o cambie un motivo de rechazo.
metadata:
  category: testing
  triggers: MOD11, MOD12, motivo de rechazo, rejectionReasonCode, test integrado, inventario de OT, recibo, colas firmadas, G4, GO de bloque
---

# Matriz de motivos MOD11↔MOD12

Norma del CTO (2026-10-08): **un test integrado por cada motivo de rechazo**, desde el
registro en MOD11 hasta el recibo de MOD12 y la proyección `REJECTED` en MOD11, contra
Postgres y Redis reales. Los tests unitarios con dobles no cuentan: en la ola 3 dos
defectos pasaron todos los unitarios (`SUBSCRIBER_REQUIRED` sin recibo y
`listItemUsage()` sin `rejectionReasonCode`) y solo el stack real los detectó.

El hook `rejection-reason-coverage` ya impide que un motivo quede sin ninguna spec
integrada. Este skill va más allá: comprueba que la spec recorra el flujo completo y que
pase con un conteo real.

## Pasos

1. **Catálogo.** Lee `INVENTORY_CONSUMPTION_REJECTION_REASON_CODES` en
   `packages/shared/src/contracts/operations/execution-orders.ts`. Esa lista es la
   fuente; no la reconstruyas de memoria.
2. **Localiza la evidencia.** Por cada código, busca los `*.integration.spec.ts` que lo
   nombran:

   ```bash
   git ls-files '*.integration.spec.ts' | xargs grep -ln '<CODIGO>'
   ```

   Abre el `it()` concreto y anota qué tramos recorre: registro en MOD11 → solicitud en
   la cola → recibo de MOD12 → proyección `REJECTED` con `rejectionReasonCode` en MOD11.
   Que el código aparezca solo en un fixture o en un `expect` aislado no basta.
3. **Stack real arriba.** Postgres y Redis de desarrollo levantados (`pnpm dev` o el
   compose de dev). Si una spec se salta por falta de servicios, eso es un fallo del
   gate, no un verde.
4. **Ejecuta con evidencia.** Sigue `iwana-test-evidence`: primero `--listTests`, luego
   la corrida sin caché de Turbo, y copia literalmente las líneas `Tests:`. Ejemplo para
   la API:

   ```bash
   pnpm --filter @iwana/api exec jest <ruta-de-la-spec> --listTests
   pnpm --filter @iwana/api test:integration -- <ruta-de-la-spec>
   ```

5. **Entrega la matriz.**

   | Motivo | Spec:línea | Tramos cubiertos | Tests (pasados/total) | Fecha |
   | --- | --- | --- | --- | --- |

   Un motivo sin fila completa (los cuatro tramos y la corrida en verde con conteo)
   **bloquea el GO** del bloque. Dilo así en el informe; no lo suavices.

## Límites

- No escribas los tests que falten: repórtalo y deriva a `sr-qa` o `sr-backend`.
- No cambies el catálogo de motivos: es contrato compartido y lo revisa
  `contract-drift-reviewer`.
