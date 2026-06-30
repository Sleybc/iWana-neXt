# INFORME: Acto operativo de Visitas pendientes

**Version:** 1.0  
**Estado:** Ejecutado  
**Fecha:** 2026-06-04  
**Modulo:** WFM Scheduling (Portal)  
**Responsable principal:** Sr. Dev Fullstack

## 1. Resumen ejecutivo

Se ejecutó el rediseño del acto operativo de la ruta `/dashboard/scheduling/pending-visits` para que el panel derecho funcione como una superficie de trabajo propia, con scroll interno en desktop, jerarquía más clara y continuidad entre resumen, contexto, recomendación y confirmación.

Resultado alcanzado: el flujo sigue inline en la misma ruta, pero la experiencia ya no depende de un scroll global largo para completar el despacho.

## 2. Entregables implementados

- `apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.tsx`
  - Panel derecho convertido en superficie sticky con `overflow-y-auto` propio en desktop.
  - Conserva el flujo de despacho con estructura visual más controlada.
- `apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx`
  - Grid principal ajustado para que la columna operativa se ancle correctamente.
- `docs/specs/SPEC-WFM-PENDING-VISITS-ACTO-OPERATIVO-v1.0.md`
  - Estado actualizado a `Ejecutado`.
  - Se agregó la decisión de layout implementada.

## 3. Evidencia funcional

- Flujo probado: selección de solicitud, revisión de contexto, cálculo de recomendaciones y confirmación de agenda.
- Datos de prueba usados: solicitudes CRM y solicitudes manuales ya presentes en la suite de scheduling.
- Resultado observado: el acto operativo se mantiene inline y el panel derecho se comporta como una unidad de trabajo propia.

## 4. Evidencia de calidad

- Unit tests:
  - `apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx` en verde.
- Integration tests:
  - No aplican en esta fase.
- E2E tests:
  - `e2e/tests/portal-wfm-scheduling.spec.ts` en verde.
- Cobertura:
  - No se modificó el contrato de cobertura del proyecto.
- Hallazgos abiertos:
  - Ninguno bloqueante.

## 5. Cambios documentales

- PRD actualizado: no aplica.
- HLD actualizado: no aplica.
- ADR nuevo o referenciado: no aplica.
- Otros documentos afectados:
  - `docs/specs/SPEC-WFM-PENDING-VISITS-ACTO-OPERATIVO-v1.0.md`

## 6. Riesgos y bloqueos

- Riesgo 1: el panel derecho puede seguir creciendo si se agregan más pasos sin control de densidad.
  - Mitigación: mantener scroll propio y revisar colapsables antes de sumar contenido.
- Riesgo 2: la jerarquía visual puede degradarse si se agregan más bloques interactivos.
  - Mitigación: reservar un solo CTA primario por bloque.
- Bloqueo técnico: ninguno.

## 7. Decision de salida

- Puede pasar a siguiente fase: Si
- Requiere correcciones previas: No
- Aprobadores pendientes: Ninguno
