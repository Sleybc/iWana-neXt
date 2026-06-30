# INFORME: Ejecucion del refinamiento visual de Despacho de la solicitud

**Version:** 1.0  
**Estado:** Ejecutado  
**Fecha:** 2026-06-04  
**Modulo:** WFM Scheduling (Portal)  
**Spec fuente:** docs/specs/SPEC-WFM-PENDING-VISITS-DESPACHO-VISUAL-v1.0.md

## 1. Resumen ejecutivo

Se ejecuto el refinamiento visual del bloque "Despacho de la solicitud" en la ruta `/dashboard/scheduling/pending-visits`.

Resultado principal:

1. Menor densidad visual.
2. Menor repeticion de contenedores.
3. Mejor lectura operativa de recomendaciones.
4. Flujo funcional intacto.

## 2. Cambios implementados

1. Cabecera de solicitud aplanada a una sola superficie.
2. Eliminacion de subtarjetas internas para direccion, territorio y nota operativa.
3. Compactacion de items de recomendacion.
4. Reemplazo de "Score" por "Puntuación" en texto inline.
5. Etiquetas de recomendacion simplificadas a texto compacto.
6. Ajuste de espaciado entre bloques principales e internos.
7. Ajuste visual del bloque colapsable de contexto y ventana comprometida.
8. Implementacion del despacho como panel lateral tipo drawer con fondo atenuado y cierre explicito.

## 3. Archivos intervenidos

1. apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.tsx
2. apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx
3. docs/specs/SPEC-WFM-PENDING-VISITS-DESPACHO-VISUAL-v1.0.md

## 4. Validacion ejecutada

1. `pnpm --filter @iwana/portal test -- PendingVisitRequestsView.spec.tsx`
   - Resultado: 9 passed, 0 failed.
2. `pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-wfm-scheduling.spec.ts`
   - Resultado: 9 passed, 0 failed.

## 5. Riesgos residuales

1. Cambios de estructura visual pueden requerir ajustes adicionales en pruebas futuras si se agregan asserts por clases CSS.
2. Se recomienda mantener selectores de prueba por rol y texto semantico para estabilidad.

## 6. Decision de salida

1. Ejecucion aprobada para continuidad.
2. No se identifican bloqueantes abiertos.
3. No hay cambios de alcance pendientes para esta fase.
