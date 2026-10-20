# TRANSVERSAL — Resolución de las cuarentenas E2E (custodia pre-inicio y fecha de la agenda manual) · Spec

**Fecha:** 2026-10-20 · **Versión:** 1.0 · **Estado:** Aprobado — G0 del CTO, 2026-10-20: D-CQ-1 A (prevalece la spec MOD11 v1.5 §6), D-CQ-2 arreglar en la capa de la causa y D-CQ-3 no abrir la auditoría de Inventario
**Emisor:** AI-EM-ARCH
**Plan:** [2026-10-20-transversal-cuarentenas-e2e.md](../plans/2026-10-20-transversal-cuarentenas-e2e.md)
**Origen:**
- [cierre de salud de pruebas](../informes/INFORME-TRANSVERSAL-SALUD-PRUEBAS-CIERRE-v1.0.md) y [triaje](../informes/INFORME-TRANSVERSAL-SALUD-PRUEBAS-TRIAJE-v1.0.md);
- `e2e/QUARANTINE.md`: `INVENTORY-PRESTART-CUSTODY-HIDDEN` y `WFM-MANUAL-DATE-NOT-SELECTED`, ambas con **vencimiento el 2026-11-19**.

**Plazo duro:** `scripts/check-e2e-quarantine.mjs` falla con filas vencidas. Si las dos cuarentenas siguen abiertas, **el CI de `main` se pone en rojo el 2026-11-20**.

---

## 1. Hechos verificados (2026-10-20, `main` en `e39d9bd3`)

### 1.1 Custodia pre-inicio: es un conflicto de contratos, no una regresión de Inventario

| # | Hecho | Fuente |
| --- | --- | --- |
| H1 | El bloque «En custodia del ejecutor» lo renderiza la **consola de OT de MOD11** (`apps/portal/src/components/operations/`), no el módulo de Inventario. Solo lee datos de custodia de MOD12 (`GET /inventory/custody`) | `execution-order-console-types.ts:52`; `use-execution-order-console-adapter.ts:99-104` |
| H2 | El CA-3 que exige mostrar la custodia «en estados no terminales (incluido pre-inicio)» viene del prompt `PROMPT-MOD12-MOD11-CUSTODIA-EJECUTOR-BLOQUE-OT-v1.0`, del **2026-08-31** | ese prompt, L111; su informe homónimo |
| H3 | La [spec UX de la consola de OT de MOD11](2026-10-05-mod11-consola-ot-requisito-ux.md) (v1.5, línea base aprobada) lo reemplaza de forma explícita: en pre-inicio «no se monta captura ni se consulta custodia fuera del acto de consumo»; la custodia «solo se consulta cuando una persona con `REGISTER_ITEM_USAGE` abre "Registrar equipo instalado"» | spec MOD11 §6 (L77, L130, L134, L199) y su tabla de cumplimiento (L211: «Custodia solo aparece dentro del acto de consumo») |
| H4 | El código implementa la spec v1.5 desde `646472c9` (2026-10-11): el comentario del tipo dice «solo se muestra dentro del acto de consumo (UX §6)» | `646472c9`; `execution-order-console-types.ts:52` |
| H5 | El E2E cuarentenado afirma el contrato **anterior** (H2). En el triaje, V1 restauró esas aserciones creyendo que había una regresión; el triaje no contrastó la spec v1.5 | `portal-field-flow-ticket-ot-inventory.spec.ts:1156-1200`; triaje L226 |

**Conclusión:** el producto cumple el contrato vigente. Lo que está mal es la prueba, y el CA-3 sigue escrito en un documento que nadie marcó como superado.

### 1.2 Fecha de la agenda manual: regresión reproducible de WFM

| # | Hecho | Fuente |
| --- | --- | --- |
| H6 | En «Visitas pendientes» → «Prefiero agendar manualmente», al elegir el día en el calendario el popover se cierra, pero el disparador conserva «Seleccionar fecha» y «Revisar agenda manual» no valida. Se reprodujo dos veces | triaje L222; `portal-wfm-scheduling.spec.ts:1580-1624` |
| H7 | El campo es el `DatePicker` de `@iwana/ui`, controlado por `manualDate` (`value={toDateFromLocalDateValue(manualDate)}`, `onChange → setManualDate(toLocalDateValue(date))`) | `VisitRequestRecommendationPanel.tsx:1128-1137` |
| H8 | Dos efectos reasignan `manualDate`: el que reacciona a `selectedVisitRequest?.id` y `workType`, y el que aplica `manualSelectionDraft`. Cualquiera de los dos podría pisar la selección | ídem, L380-425 |
| H9 | El mismo helper del E2E (`selectDateFromPicker`) se usa con otros `DatePicker` del mismo panel («Desde (fecha)») que pasan. Esto apunta al panel antes que al componente compartido, pero **no está confirmado** | `portal-wfm-scheduling.spec.ts:113-160` |
| H10 | `DatePicker.tsx` no cambia desde el 2026-08-18; el panel cambió por última vez en `f9f42b33` (2026-09-09) | `git log` |

## 2. Objetivo

Las dos cuarentenas cerradas y el tope de cuarentena en **0** antes del 2026-11-19, sin relajar ninguna aserción y con cada contrato en un solo documento vigente.

## 3. Requerimientos

### 3.1 Custodia pre-inicio (sujeto a D-CQ-1)

| ID | Requerimiento |
| --- | --- |
| RQ-K-01 | `prod-ux` ratifica por escrito que la spec MOD11 v1.5 §6 prevalece sobre el CA-3 del prompt MOD12-MOD11 de agosto, o explica por qué no |
| RQ-K-02 | El E2E se reescribe al contrato vigente: **pre-inicio** sin bloque de custodia ni consulta a `/inventory/custody`, con los hints por bloque y la única CTA «Iniciar ejecución»; **en ejecución**, al abrir «Registrar equipo instalado» se consulta la custodia y aparece como contexto de solo lectura. La prueba debe fallar si el drawer vuelve a consultar la custodia antes de iniciar |
| RQ-K-03 | Se retira `INVENTORY-PRESTART-CUSTODY-HIDDEN` de `e2e/QUARANTINE.md` y el `test.fixme` |
| RQ-K-04 | El prompt y el informe MOD12-MOD11 de custodia se anotan con un aviso de «CA-3 superado por la spec MOD11 v1.5 §6», sin reescribir su contenido histórico. El triaje y el cierre de salud de pruebas registran la reclasificación (prueba desactualizada, no regresión) |
| RQ-K-05 | Sin cambios de producto en `apps/portal/src/components/operations/` |

### 3.2 Fecha de la agenda manual

| ID | Requerimiento |
| --- | --- |
| RQ-W-01 | Primero una prueba de componente que reproduce H6 en `VisitRequestRecommendationPanel` (elegir día → el disparador muestra la fecha y el valor llega a la validación). Debe fallar antes del arreglo |
| RQ-W-02 | Causa raíz identificada con evidencia (qué escritura de `manualDate` o qué conversión pierde la fecha) antes de cambiar código |
| RQ-W-03 | Arreglo mínimo en la capa donde está la causa (D-CQ-2). Si es `@iwana/ui`, cada consumidor de `DatePicker` del portal conserva sus pruebas en verde y se agrega una prueba de regresión en el componente |
| RQ-W-04 | El E2E «admin agenda manualmente sin pasar por recomendaciones» pasa sin cambiar sus aserciones; se retira `WFM-MANUAL-DATE-NOT-SELECTED` y su `test.fixme` |

### 3.3 Cierre de la cuarentena

| ID | Requerimiento |
| --- | --- |
| RQ-Z-01 | `e2e/quarantine-cap.json` pasa a `0` y `check-e2e-quarantine.mjs` da `PASS (0/0)` |
| RQ-Z-02 | La suite E2E del portal da 0 fallos y 0 cuarentenas en dos corridas locales y una en el contenedor oficial de Playwright |

## 4. Criterios de aceptación

| CA | Criterio |
| --- | --- |
| CA-CQ-01 | Ratificación escrita de `prod-ux` sobre el contrato de custodia (RQ-K-01) |
| CA-CQ-02 | El E2E de custodia pasa con el contrato vigente y falla si se reintroduce la consulta pre-inicio (rojo anexado, sin commitearlo) |
| CA-CQ-03 | La prueba de componente de WFM falla antes del arreglo y pasa después; el E2E de agenda manual pasa sin editar sus aserciones |
| CA-CQ-04 | Tope de cuarentena en 0 y script en `PASS (0/0)` |
| CA-CQ-05 | CI de `main` en verde, con el job «E2E portal» bloqueante, sobre el commit final y **antes del 2026-11-19** |

## 5. Fuera de alcance

- La auditoría pendiente de Inventario (incluido H22). La custodia pre-inicio no es de Inventario (H1), así que esta fase no abre su turno (D-CQ-3).
- Cualquier rediseño de la consola de OT o del panel de agendamiento.

## 6. Decisiones del CTO (G0) — aprobadas el 2026-10-20

**✅ Las tres decisiones se aprobaron con la recomendación de AI-EM-ARCH.** §3 y §4 quedan como contrato congelado.

| # | Decisión | Opciones | Recomendación de AI-EM-ARCH | Motivo |
| --- | --- | --- | --- | --- |
| D-CQ-1 | Contrato vigente de la custodia en pre-inicio | **A:** la spec MOD11 v1.5 §6 (no se muestra ni se consulta antes de iniciar). **B:** el CA-3 del prompt MOD12-MOD11 de agosto (mostrarla en solo lectura también antes de iniciar), lo que obliga a cambiar el producto | **A** | Es el documento más reciente, está aprobado y es específico de esa pantalla. El código ya lo cumple. B reintroduce una consulta a inventario en cada apertura de OT que la spec retiró a propósito |
| D-CQ-2 | Dónde arreglar la fecha si la causa está en `DatePicker` | Arreglar `@iwana/ui` con pruebas de todos sus consumidores vs. un parche local en el panel | **En la capa de la causa** | Un parche local dejaría el defecto en los demás formularios con fecha |
| D-CQ-3 | ¿Abrir ahora la auditoría de Inventario? | No (esta fase no la necesita) vs. sí | **No** | La cuarentena que parecía de Inventario es de MOD11 y no requiere cambios de producto; la auditoría de Inventario conserva su turno y su alcance (H22) |
