# PROMPT DE EJECUCIÓN — MOD11 · Hotfix: la consola no tolera OT sin ventana

**Versión:** 1.0
**Fecha:** 2026-10-05
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-FE-PLATFORM** (`fe-platform`)
**Tipo:** corrección de defecto vivo, fuera de la secuencia de la Ola 2. No espera ni a G2 ni a E3.

## Vínculos de trazabilidad

- Plan: `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.2 (§Registro de bloqueos — Ola 2)
- Origen del defecto: la Ola 2 de E2 (`INFORME-MOD11-ORIGEN-OT-E2-v1.0.md`, 2026-09-15) hizo `schedule.window` nulable en el contrato `packages/shared/src/contracts/operations/execution-orders.ts` **v1.3**. El portal no se adaptó: el informe de E2 lo dejó como «trabajo de E4».
- Contrato de componente: `docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md` v1.1 (Aprobado). Su convención para celdas sin valor es `'—'`.

## 1. Defecto

Desde E2, una OT despachada sin cita tiene `schedule.window = null`. Dos sitios del portal lo desreferencian sin comprobarlo:

- `apps/portal/src/components/operations/ExecutionOrdersTable.tsx:203-205`, en `formatExecutionOrderWindow`. Lanza un `TypeError` al pintar la fila, así que **cae la bandeja completa** del actor que la ve, normalmente supervisión.
- `apps/portal/src/components/operations/ExecutionOrderSummary.tsx:194-196` y `:259-260`: el resumen del detalle cae al abrir esa OT.

## 2. Alcance exacto

- Las dos celdas toleran `window` nulo y pintan `'—'`, la convención del contrato v1.1. **No** pintan «Por programar»: esa presentación espera el veredicto de R1 y se implementa en la Ola 2b.
- Si el tipo del api-client del portal es anterior a la v1.3, se corrige donde estas dos lecturas lo exijan. Cualquier otro deref que el `typecheck` señale **se lista en el informe y no se arregla**: pertenece a la Ola 2b.
- Tests: un caso con `window: null` en la tabla y otro en el resumen.

**Fuera de alcance:** el orden de la bandeja, el copy de E4, la reestructuración de la consola y cualquier cambio en backend o en contratos.

## 3. Skills

| Tipo | Skills |
| --- | --- |
| **Obligatorias** | `frontend-dev-guidelines`, `testing-patterns` |
| **De apoyo** | `typescript-expert`, solo si el tipo del api-client exige un ajuste |
| **Descartadas** | `ui-ux-pro-max` e `iwana-identity-ui-review`, porque no hay presentación nueva; `playwright-skill`, porque un test unitario cubre el defecto |

**Gates:**

- `pnpm --filter portal typecheck`;
- jest del portal sobre `operations/` con conteo real (`Cached: 0`);
- `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los dos archivos tocados.

## 4. Stop/go

**GO** si la bandeja y el detalle se renderizan con `window: null`, los dos tests nuevos están en verde con conteo real y la suite de `operations/` no retrocede.

**NO-GO** si el cambio introduce copy nuevo o toca la estructura de la consola.

**Entrega:** el informe `docs/informes/INFORME-MOD11-CONSOLA-OT-HOTFIX-VENTANA-NULA-v1.0.md`.
