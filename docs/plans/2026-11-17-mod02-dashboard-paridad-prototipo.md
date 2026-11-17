# Ajustes del inicio del portal al prototipo

Base de comparación: [prototipo Pulso y atención](../prototipo/prototipo_dashboard_inicio.html), [dirección visual](../specs/2026-11-16-portal-dashboard-pulso-y-atencion-direccion.md) y [HLD vigente](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v3.0.md). La ruta es la del portal empresarial.

- [x] B0/B2: añadir la fecha civil de la empresa en `DashboardClient.tsx` y alinear el selector de series con la cabecera de `DashboardTrend.tsx` en escritorio. Conservar el diseño adaptable y los controles de serie accesibles.
- [x] B4: sustituir Atención de campo de Administradora por Hoy en agenda. Componer hasta cuatro filas con el listado diario de Programación y el total de cortes ya leído por la cola. Mantener permisos, estados independientes por fuente y enlaces filtrados al día.
- [x] B4: presentar la actividad de Administradora con el rótulo del prototipo y hasta cuatro entradas.
- [x] Verificar el contrato por rol y los estados de agenda con Jest. Comprobar Tendencia y el primer viewport con Playwright. Registrar resultados en el [informe de Fase 2](../informes/INFORME-MOD02-DASHBOARD-PULSO-ATENCION-FASE-02-v1.0.md#7-ajuste-al-prototipo-del-inicio).

El HLD mantiene el encabezado sin controles globales y deja fuera disponibilidad de Red, plazos de privacidad y nombres de técnicos en la carga. El inicio mantiene Aprovisionamiento y usa datos reales. El total de cortes no trae una hora ni representa un único ciclo. El historial conserva las restricciones de acceso de la vista de inicio.

La línea base en `b04c8f7e` fue de 218 pruebas en 10 suites de Jest del dashboard, sin omitidas, con `pnpm --filter @iwana/portal exec jest src/components/dashboard --runInBand`.
