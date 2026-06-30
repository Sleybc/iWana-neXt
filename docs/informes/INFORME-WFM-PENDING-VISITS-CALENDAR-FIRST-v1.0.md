# INFORME: Ejecucion del workspace calendar-first para pending visits

**Version:** 1.0  
**Estado:** Implementado con verificacion parcial E2E  
**Fecha:** 2026-06-09  
**Modulo:** WFM Scheduling (Portal)  
**Ruta:** /dashboard/scheduling/pending-visits  
**Autor:** AI-SR-FULL  
**Spec ejecutada:** docs/specs/SPEC-WFM-PENDING-VISITS-CALENDAR-FIRST-v1.0.md

---

## 1. Objetivo ejecutado

Se implemento la evolucion de `pending-visits` hacia un workspace calendar-first con:

1. bandeja compacta de solicitudes a la izquierda
2. matriz semanal persistente al centro
3. inspector de despacho a la derecha en desktop y drawer en anchos menores

La confirmacion final se mantuvo en `VisitRequestRecommendationPanel` + `ScheduleVisitRequestConfirmDialog`, sin crear un flujo paralelo.

## 2. Cambios implementados

### 2.1 Orquestacion del workspace

`PendingVisitRequestsView` ahora:

1. mantiene el estado compartido de seleccion entre bandeja, matriz y panel
2. soporta draft manual/recomendado desde la matriz
3. conserva la matriz visible aunque se cierre el panel de despacho
4. unifica la confirmacion final para recomendacion y agenda manual

### 2.2 Matriz semanal operativa

`WeeklyTechnicianMatrix` ahora:

1. permite seleccionar tecnico y dia por celda
2. expone franjas sugeridas por celda mediante popover
3. permite definir hora manual desde la propia celda
4. muestra seleccion, riesgo y foco visible sin depender solo del color
5. suaviza bordes, radios y divisiones para alinearse con el lenguaje visual iWana

### 2.3 Inspector de despacho sincronizado

`VisitRequestRecommendationPanel` ahora:

1. acepta seleccion proveniente de la matriz
2. resume tecnico, dia, estado operativo y tipo de seleccion
3. precarga el formulario manual cuando la matriz inicia la agenda
4. abre confirmacion para una agenda manual validada, en lugar de despachar de inmediato

### 2.4 Confirmacion final

`ScheduleVisitRequestConfirmDialog` ahora:

1. confirma tanto franja sugerida como agenda manual
2. muestra advertencias operativas heredadas de la celda
3. diferencia visualmente origen sugerido vs hora libre

### 2.5 Cobertura de pruebas

Se actualizaron pruebas unitarias y E2E del flujo para reflejar:

1. labels actuales del producto
2. confirmacion manual calendar-first
3. persistencia de la matriz al cerrar el panel
4. nomenclatura actual de `Centro de agendamiento`, `Agenda`, `Resumen` y `Agendar tarea`

## 3. Verificacion ejecutada

### 3.1 Unitarias

Verificado OK:

1. `pnpm --dir apps/portal test -- PendingVisitRequestsView.spec.tsx VisitRequestRecommendationPanel.spec.tsx`
2. Resultado: `19/19` pruebas pasando

### 3.2 Typecheck

Verificado OK:

1. `pnpm --dir apps/portal typecheck`

### 3.3 E2E

Estado:

1. la suite `e2e/tests/portal-wfm-scheduling.spec.ts` fue actualizada al layout actual
2. se logro ejecutar una corrida previa con servidor local escalado
3. la re-ejecucion final quedo bloqueada por limite operativo del entorno de permisos, no por fallo adicional del codigo

## 4. Riesgos residuales

1. `PendingVisitRequestsView` concentra mas responsabilidad de orquestacion y debera vigilarse en futuras iteraciones
2. la validacion E2E final completa debe reintentarse en un entorno con permisos disponibles para binding del dev server

## 5. Recomendacion inmediata

Ejecutar nuevamente:

1. `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-wfm-scheduling.spec.ts`

Esto permitira cerrar la evidencia final del flujo browser-level con el layout y los selectores ya sincronizados.
