# PROMPT DE EJECUCIÓN — MOD11 Consola de OT · Ola 2b · B0: seam y expediente por momento

**Versión:** 1.0
**Fecha:** 2026-10-05
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-FE-PLATFORM** (`fe-platform`)
**Estado:** despachable. G2 y G3 están cerrados. El hotfix de evidencia (`f1348c64`) ya está en `main`.

## Vínculos de trazabilidad

- Plan: `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.2
- **Corte que ejecuta:** `docs/informes/INFORME-MOD11-CONSOLA-OT-OLA2-G3-FE-PLATFORM-v1.0.md` §3 (seam de propietario único) y §8 (regresión)
- **Contratos congelados:**
  - UX: `docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md` v1.1. Son de lectura obligatoria **§3.2, §4, §4.1 y §9**.
  - Componente: `docs/specs/2026-10-05-mod11-consola-ot-requisito-contrato-componente.md` v1.0 §2, §3.1, §3.2, §4 y §5.
  - API: `packages/shared/src/contracts/operations/execution-orders.ts` v1.4 · `execution-orders-completion.ts` v1

## 1. Objetivo

B0 es el **único** bloque que reescribe la estructura de la consola. Deja el drawer convertido en un expediente por requisito y por momento, y deja **puntos de extensión estables** para que R2, R3, R4 y E4-portal trabajen después en paralelo sin tocar sus archivos.

## 2. Alcance exacto

1. **Extraer** `RequirementChecklist` y `RequirementActionSheet` según el contrato de componente, y un contenedor por momento, `ExecutionOrderMomentContainer`. `ExecutionOrderDrawer.tsx` queda como shell de composición.
2. **Montaje por momento (UX §4).** Matriz de 4 momentos × 3 lentes. En pre-inicio no se monta nada de captura (CA-10). En bloqueada, la OT aparece sin motivo y en lectura (adenda A1). En terminal, todo en lectura.
3. **Checklist como índice (UX §3.2).** Cruce de la clave del snapshot con `completion.requirements[]` y estados «Cumplido», «Pendiente», «Sin registrar» y «Estado no disponible». La acción de cada requisito nace del requisito, y solo si `allowedActions` la autoriza.
4. **La acción `ACTIVITY` completa es de B0**, porque ningún otro bloque la tiene: la variante `activity` del sheet, con `activityType` preseleccionado y su historial bajo el requisito. Esto resuelve la observación 4, «Trabajo realizado».
5. **Puntos de extensión para R2 y R3.** Las variantes `evidence` y `consumption` del sheet se montan con un **adaptador provisional** que envuelve los formularios actuales, conservando su comportamiento, incluido el sondeo de análisis del hotfix. R2 y R3 sustituyen ese adaptador con archivos propios **sin editar el shell**. Documenta el contrato de props de cada slot en el informe.
6. **Fachada del hook.** `use-execution-order-console.ts` delega en adaptadores, para que R4 posea `use-execution-order-refresh.ts` sin tocar la fachada. **B0 no cambia la política de refetch**: eso es de R4.
7. **Consolidación de copy** (dictamen G3 §7, spec base §10.5):
   - `requirementKindLabel` frente a `REQUIREMENT_KIND_LABELS`;
   - `syncStateCopy` frente a `syncCopy`.
8. **Regresión** (dictamen G3 §8):
   - **Se mantienen en verde y no se debilitan:** `ExecutionOrderConsolaOtOla1Regression.spec.tsx`, `ExecutionOrderDrawerCommitment.spec.tsx`, `ExecutionOrderExperience.spec.tsx`, y las pruebas de payloads, gate de cierre, offline y no-persistencia en storage.
   - **Se reubican, no se borran:** las pruebas de los 6 bloques, junto a su nuevo dueño.

**Fuera de alcance** (cada punto tiene dueño):

- la firma y el selector de evidencia por requisito: R2;
- la custodia bajo demanda: R3;
- el refetch selectivo: R4;
- «Por programar» en tabla y resumen: E4-portal;
- todo backend.

## 3. Restricciones

- No se inventan tokens ni componentes base: se usan las primitives del contrato §4. **No se usa `SectionAccordion`.**
- Un solo overlay, `OperationalSidePeek`. El sheet va inline, sin `Dialog` ni trampa de foco propia (contrato §3.2).
- Ninguna prop recibe usuario, rol ni responsable para decidir permisos.
- Ningún comportamiento funcional existente se pierde en el tránsito. Si un formulario no cabe en el adaptador sin reescribirlo, emite `[CONSULTA]` antes de reescribirlo.

## 4. Skills

| Tipo | Skills |
| --- | --- |
| **Obligatorias** | `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `core-components`, `wcag-audit-patterns`, `testing-patterns` |
| **De apoyo** | `tailwind-patterns`, para la densidad compacta; `iwana-identity-ui-review`, para el gate visual |
| **Descartadas** | `ui-ux-pro-max`, porque la UX está congelada; `system-vocabulary-review`, porque el copy está cerrado en UX §5; `playwright-skill`, porque el E2E es de R5 |

## 5. Gates y stop/go

**Gates:**

- `pnpm --filter portal typecheck`;
- jest de `operations/` con `Cached: 0`. **Sin bajar de 372**, salvo las reubicaciones, contadas en el informe;
- `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los archivos tocados;
- evidencia en navegador sobre una OT en pre-inicio y otra en progreso.

**GO:**

- CA-10 se cumple;
- el checklist funciona como índice con sus cuatro estados;
- la acción `ACTIVITY` está completa;
- los slots de evidencia y consumo funcionan como antes;
- las suites que deben quedar intactas están en verde;
- el informe declara qué archivos son de R2, R3, R4 y E4-portal.

**NO-GO:**

- se pierde funcionalidad existente;
- R2, R3 o R4 tendrían que editar el shell o la fachada para hacer su trabajo.

**Entrega:** el informe `docs/informes/INFORME-MOD11-CONSOLA-OT-OLA2B-B0-FE-PLATFORM-v1.0.md`.
