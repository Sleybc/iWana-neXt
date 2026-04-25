# Plan Operativo por Rol - MOD05 CRM Subscribers Fase 02

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-04-17  
**Modo activo:** Mixto

## Objetivo

Separar la ejecucion de Fase 02 por responsabilidades de implementacion, validacion y cierre para reducir ambiguedad entre AI-SR-FULL, QA/Testing y revision final EM/Architect.

## AI-SR-FULL

1. Implementar `subscribersApi` y tipos del modulo en `apps/portal/src/lib/api-client.ts`.
2. Implementar `subscriber-ui.ts` y helpers de presentacion.
3. Sustituir el landing stub por listado funcional en `/dashboard/crm/subscribers`.
4. Implementar rutas `new` y `[id]`.
5. Implementar formulario discriminado, banner IVA, tabs y dialogo de transicion.
6. Actualizar `CrmOverviewClient` para exponer el acceso a suscriptores.
7. Mantener tenant-awareness, sin PII en logs y sin recalculo client-side de IVA.

## QA / Testing

1. Ejecutar typecheck y lint del portal.
2. Validar manualmente listado, filtros, busqueda, paginacion y redirect historico.
3. Validar alta NATURAL y JURIDICA.
4. Validar edicion sobre detalle 360.
5. Validar transiciones permitidas y obligatoriedad de razon cuando aplique.
6. Confirmar que los stubs de contacts, contracts y habeas data no rompen navegacion.

## Revision final EM / Architect

1. Confirmar alineacion con PRD, HLD y prompt ajustado.
2. Confirmar que no se introdujeron patrones nuevos fuera del portal.
3. Confirmar evidencia documental en informe vivo.
4. Clasificar hallazgos residuales como deuda baja, media o alta si aparecen.
5. Emitir decision de salida: listo para revision, requiere ajustes o bloqueado.