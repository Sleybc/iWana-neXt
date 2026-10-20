# PROMPT — TRANSVERSAL · Resolución de las cuarentenas E2E (custodia pre-inicio y fecha de la agenda manual)

**Versión:** 1.0 · **Fecha:** 2026-10-20 · **Emisor:** AI-EM-ARCH · **Estado:** Contrato congelado; G0 aprobado por el CTO el 2026-10-20 (D-CQ-1 A (prevalece la spec MOD11 v1.5 §6), D-CQ-2 arreglar en la capa de la causa y D-CQ-3 no abrir la auditoría de Inventario; [spec](../specs/2026-10-20-transversal-cuarentenas-e2e-spec.md) §6)
**Plan:** [2026-10-20-transversal-cuarentenas-e2e.md](../plans/2026-10-20-transversal-cuarentenas-e2e.md)
**Base:** `main` en `e39d9bd3`. Se trabaja en `main`, sin ramas. **Ningún agente commitea**: lo hace AI-EM-ARCH en G7.
**Plazo:** antes del 2026-11-19.

## 0. Reglas comunes

1. Lee `AGENTS.md`, la spec completa, el plan y tu § antes de actuar.
2. Lee los `SKILL.md` de tu fila en el plan §3 como documentación, no como tool.
3. Solo editas los archivos de tu fila en §2. Si necesitas otro, emite `[BLOQUEO]` y para.
4. No se arregla una prueba relajándola: sin ampliar timeouts ni debilitar aserciones.
5. No edites `e2e/QUARANTINE.md`, `e2e/quarantine-cap.json` ni los documentos de agosto: son del orquestador.
6. Evidencia: comando exacto y conteo real, sin caché.

## 1. Hechos de partida

H1-H10 de la spec §1.

## 2. Propiedad de archivos

| Bloque | Edita | Crea |
| --- | --- | --- |
| K1 | — | ratificación en `docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md` como adenda de una línea en el encabezado, o `[BLOQUEO]` razonado |
| K2 | `e2e/tests/portal-field-flow-ticket-ot-inventory.spec.ts` (el test cuarentenado y los mocks que use) | — |
| W1 | `apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.tsx` y su spec; si la causa está ahí, `packages/ui/src/components/DatePicker.tsx` y su spec | prueba de componente de regresión |
| W2 | `e2e/tests/portal-wfm-scheduling.spec.ts` (solo quitar el `test.fixme`; sin cambiar aserciones) | — |

---

## K1 — Ratificación del contrato de custodia · `prod-ux`

Contrasta la spec MOD11 v1.5 §6 (L77, L130, L134, L199, L211) con el CA-3 de `PROMPT-MOD12-MOD11-CUSTODIA-EJECUTOR-BLOQUE-OT-v1.0` (L111). Confirma por escrito, como adenda breve del encabezado de la spec MOD11, que el contrato vigente es el de §6 y que supera ese CA-3. Si encuentras un motivo de producto para mantener el CA-3, emite `[BLOQUEO]` con el argumento: no lo resuelvas tú.
**Cierras cuando:** la adenda está escrita (RQ-K-01).

## K2 — E2E de custodia al contrato vigente · `sr-qa` (tras K1)

RQ-K-02 y RQ-K-05. Reescribe el test cuarentenado: en pre-inicio no aparece «En custodia del ejecutor», **no hay petición a `/inventory/custody`** (afírmalo sobre la red interceptada), siguen los hints por bloque y la única CTA «Iniciar ejecución». Agrega o reutiliza el caso en ejecución donde abrir «Registrar equipo instalado» consulta la custodia y la muestra como contexto de solo lectura. Quita el `test.fixme`.
**Cierras cuando:** la spec pasa en dos corridas, y anexas el rojo que produce reintroducir temporalmente la consulta pre-inicio (sin commitearlo).

## W1 — Fecha de la agenda manual · `fe-platform`

RQ-W-01 a RQ-W-03.
1. Prueba de componente en rojo: en `VisitRequestRecommendationPanel`, elegir un día en el `DatePicker` «Fecha» de la agenda manual deja el disparador en «Seleccionar fecha» o el valor no llega a la validación.
2. Causa raíz con evidencia: qué escritura de `manualDate` (efectos de H8, conversiones `toLocalDateValue` / `toDateFromLocalDateValue`) o qué comportamiento de `DatePicker` pierde la fecha.
3. Arreglo mínimo en esa capa (D-CQ-2). Si tocas `@iwana/ui`, corre las pruebas de todos los consumidores de `DatePicker` del portal y agrega una prueba de regresión en el componente.
**Cierras cuando:** la prueba pasa, typecheck verde y reportas la causa raíz en dos o tres frases.

## W2 — E2E de agenda manual · `sr-qa` (tras W1)

RQ-W-04: quita el `test.fixme` de «admin agenda manualmente sin pasar por recomendaciones» sin cambiar ninguna aserción.
**Cierras cuando:** `portal-wfm-scheduling.spec.ts` pasa completo en dos corridas seguidas.

---

## V1 — `sr-qa`
RQ-Z-02: `pnpm test:e2e:portal` dos veces en local y una en el contenedor oficial de Playwright, con 0 fallos y 0 cuarentenas, y `node scripts/check-e2e-quarantine.mjs` en `PASS (0/0)`. Revisa que K2 no haya debilitado aserciones. Veredicto GO/NO-GO.

## V2 — `ds-owner` (solo si W1 cambió `packages/ui`)
El `DatePicker` conserva su contrato y sus estados; ninguna variante ni token nuevo.

## V3 — `gate-verifier`
Gates Before Merge en local, sin caché, sobre `@iwana/portal` (y `@iwana/ui` si cambió). El CI de `main` se verifica en G7, después del push.

## 3. Formato de reporte

Entregables con ruta; comando y conteo real; requerimientos y CA cubiertos por identificador; `[BLOQUEO]` si los hay; deuda nueva por severidad P0-P3.
