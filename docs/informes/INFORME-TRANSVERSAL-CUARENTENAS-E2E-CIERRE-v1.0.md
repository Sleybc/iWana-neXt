# INFORME — Cierre de cuarentenas E2E transversales

**Fecha:** 2026-10-20 · **Versión:** 1.0 · **Estado:** Cerrado · CI de `main` verde
**Spec:** [TRANSVERSAL — Resolución de las cuarentenas E2E](../specs/2026-10-20-transversal-cuarentenas-e2e-spec.md)
**Plan:** [2026-10-20-transversal-cuarentenas-e2e.md](../plans/2026-10-20-transversal-cuarentenas-e2e.md)
**Commit de código:** `52551f020d025a3669215c25967b52b18c1095aa` · [CI de `main` 39515823508](https://github.com/Sleybc/iWana-neXt/actions/runs/39515823508) · todos los jobs en `success`

## Resultado

Se retiraron las dos cuarentenas antes de su vencimiento, se fijó el tope en cero y se rehabilitaron las pruebas de custodia y de agenda manual. La prueba de custodia ahora aplica la spec MOD11 v1.5 §6: no consulta ni muestra custodia antes de iniciar y la consulta solo se hace al abrir el acto de registro de equipo instalado. La fecha manual WFM conserva la selección al elegir el día sin alterar el comportamiento opcional de los demás `DatePicker`.

La aclaración D-CQ-4 limitó el cambio de producto a añadir los tres hints pre-inicio aprobados por RQ-K-02. La CTA única «Iniciar ejecución» y el comportamiento de custodia no cambiaron. No se abrió la auditoría de Inventario.

## Decisiones aplicadas

- **D-CQ-1:** la spec MOD11 v1.5 §6 prevalece sobre el CA-3 histórico del prompt de agosto. Se anotaron ambos artefactos históricos como superados sin reescribirlos.
- **D-CQ-2:** la fecha se corrigió en la causa raíz compartida, `DatePicker`, con un opt-in usado solo por la agenda manual WFM.
- **D-CQ-3:** no se abrió la auditoría de Inventario.
- **D-CQ-4:** se incorporaron únicamente los hints «Inicia la ejecución para registrar el trabajo realizado», «Inicia la ejecución para registrar equipos y materiales» e «Inicia la ejecución para registrar evidencia».

## E2E Portal

V1 ejecutó el suite completo en Chromium con un worker y `retries=0`: dos veces en Windows local y una en el contenedor oficial. Cada corrida encontró 305 pruebas: **287 pasaron, 18 se omitieron por guards `-live`, 0 fallaron y 0 fueron flaky**.

| Ejecución | Duración | Resultado |
| --- | ---: | --- |
| Local 1 | 381,542 ms | 305 total; 287 pasaron, 18 omitidas, 0 fallidas/flaky |
| Local 2 | 375,948 ms | 305 total; 287 pasaron, 18 omitidas, 0 fallidas/flaky |
| `mcr.microsoft.com/playwright:v1.58.2-noble`, Node 24.13.1, pnpm 10.32.1 | 542,846 ms (9m02.846) | 305 total; 287 pasaron, 18 omitidas, 0 fallidas/flaky |

Las omisiones live se limitaron a casos que documentan sus variables requeridas: MOD05 fiscal (8), Privacy fase 1B (4), Privacy live (3), CRM contacto (1), conversión CRM (1) y suscriptores CRM live (1). Las variables se vaciaron solo en el proceso/contenedor y la copia aislada no contenía archivos `.env*`; los casos mockeados sí se ejecutaron.

La prueba de custodia valida cero consultas a `/inventory/custody` antes de iniciar, consulta al abrir el acto correspondiente y contexto de solo lectura. El negativo control volvió a fallar al reintroducir una consulta pre-inicio (esperado 0, recibido 1). El E2E de pre-inicio verifica los tres hints y una sola CTA. La agenda manual WFM pasó sin modificar sus aserciones. `AuthReadyGate` pasó en Chromium.

`node scripts/check-e2e-quarantine.mjs`: **`PASS (0/0 cuarentenas registradas)`**. `e2e/QUARANTINE.md` no conserva filas y `e2e/quarantine-cap.json` fija `max: 0`.

## Tests y cobertura

| Paquete / módulo | Evidencia local sin caché |
| --- | --- |
| `@iwana/portal` | 315 suites; 3205 pasaron, 1 omitida, 0 fallidas (3206 total), `Cached: 0`. La omisión preexistente está en `InventoryClient.spec.tsx:2244` por la limitación React 19/jsdom. |
| `@iwana/ui` | 7 suites; 50 tests pasaron, `Cached: 0`. |
| `VisitRequestRecommendationPanel.tsx` | 91.48% sentencias, 80.50% ramas, 89.23% funciones y 91.03% líneas; umbrales 85/80/85/85 aprobados. |
| `DatePicker.tsx` | 100% sentencias, ramas, funciones y líneas; umbrales 85/80/85/85 aprobados. |

Lint y typecheck de Portal/UI terminaron con exit 0. Portal lint reportó 43 warnings y 0 errores; tres warnings de dependencias de hooks en el panel WFM ya estaban presentes. Auditoría de ubicación documental: 0 bloqueantes y 3 avisos; citas ADR: 0 bloqueantes y 144 avisos heurísticos; sincronización de agentes: 13/13. `git diff --check` pasó; Git señaló la normalización CRLF esperada de la spec MOD11.

## Criterios de aceptación

| Criterio | Resultado |
| --- | --- |
| CA-CQ-01 · Contrato vigente de custodia ratificado | Cumplido en la spec UX de MOD11 v1.5 §6. |
| CA-CQ-02 · Custodia E2E conforme y negativo control rojo | Cumplido; 0 lecturas antes de iniciar, lectura bajo demanda y negativo control fallido al introducir consulta temprana. |
| CA-CQ-03 · Regresión WFM en componente y E2E sin debilitar aserciones | Cumplido; reproducción red/green, cobertura focalizada aprobada y E2E en dos corridas de la spec WFM. |
| CA-CQ-04 · Tope cero y script `PASS (0/0)` | Cumplido. |
| CA-CQ-05 · CI `main` verde con E2E Portal bloqueante | Cumplido en el commit `52551f0`; run `39515823508` completado con los cinco jobs en `success`, incluido «E2E portal». |

**Deuda nueva P0–P3:** ninguna. No se añadieron cuarentenas ni se debilitaron aserciones.
