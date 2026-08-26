# Informe: corrección de arrastre de pendientes en agenda

**Versión:** 1.0  
**Estado:** Ejecutado  
**Fecha:** 2026-08-22  
**Módulo:** MOD09 Programación / WFM (Portal)  
**Ruta:** `/dashboard/scheduling/agenda`

## 1. Hallazgo

Las franjas anteriores al momento actual se renderizaban como botones HTML5 `disabled`. Al arrastrar una solicitud pendiente sobre ellas, el navegador mostraba el cursor nativo de operación no permitida y el evento `drop` nunca llegaba a la validación del borrador.

## 2. Corrección

1. Los slots conservan la señal visual de franja pasada y exponen `aria-disabled="true"`.
2. La ausencia de handlers sigue deshabilitando el slot por completo.
3. Cuando existe el flujo de arrastre, las franjas pasadas aceptan el evento `drop` y dejan que `validateDailyDraft` marque el borrador como `in-the-past`.
4. La confirmación permanece deshabilitada para impedir agendamientos inválidos.

No hubo cambios de API, persistencia ni reglas de autorización.

## 3. Archivos

- `apps/portal/src/components/scheduling/ScheduleCalendar.tsx`
- `apps/portal/src/components/scheduling/ScheduleCalendar.spec.tsx`

## 4. Validación

- 4 suites Jest de scheduling: **41 pruebas aprobadas**.
- `pnpm --filter @iwana/portal typecheck`: **aprobado**.
- Auditoría UI mecánica sobre los archivos tocados: **sin hallazgos**.
- E2E `admin arrastra pendiente a la grilla, ajusta borrador y confirma agenda`: **aprobado**.
- Reproducción manual: drop en una franja pasada crea borrador inválido y mantiene deshabilitado «Confirmar agenda».

## 5. Riesgo residual

La agenda sigue impidiendo confirmar fechas u horas pasadas. El cambio solo reemplaza el rechazo silencioso del navegador por feedback del borrador y conserva la validación de negocio.
