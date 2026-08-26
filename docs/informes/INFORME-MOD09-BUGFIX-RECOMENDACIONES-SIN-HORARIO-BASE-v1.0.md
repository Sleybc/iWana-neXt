# INFORME - MOD09 Bugfix: Recomendaciones sin horario base

**Version:** v1.0  
**Estado:** Cerrado  
**Fecha:** 2026-08-22

## Problema

En `/dashboard/scheduling/pending-visits`, el despacho de una solicitud de
instalacion no mostraba ninguna franja al ejecutar `Calcular recomendaciones`.
La respuesta del backend era una lista vacia y el portal mantenia el estado
generico `Sin recomendaciones todavia`.

## Causa raiz

El tenant tenia solicitudes `READY_TO_SCHEDULE`, una persona tecnica activa y
operativa, y ninguna ocupacion o disponibilidad bloqueada. Sin embargo,
`organization_company_business_hours` no tenia filas.

Para instalaciones, `ScheduleRecommendationsService` resuelve la ventana
operativa por cada fecha del horizonte. La ausencia total de horario produce
`MISSING_CONFIGURATION`; todas las franjas se descartaban y el servicio devolvia
`[]` sin explicar la causa.

La estrategia aprobada en
`docs/specs/2026-05-15-mod09-wfm-operating-hours-design.md` establece una semilla
tecnica de compatibilidad de lunes a domingo, de `07:00` a `18:00`. La migracion
original creo las tablas, pero esa semilla no quedo implementada. El backfill
posterior solo copiaba horarios desde una sede primaria, condicion que el tenant
afectado tampoco cumplia.

## Correccion

1. La migracion tenant `117` siembra los siete dias `07:00-18:00` unicamente
   cuando el tenant no tiene filas de horario base ni evidencia de una
   configuracion explicitamente vacia en auditoria.
2. La migracion no modifica configuraciones completas ni parciales existentes.
3. Los IDs de la semilla son deterministas para que `down()` retire solo el
   conjunto intacto creado por esta reparacion. Si alguna fila fue modificada,
   el rollback aborta sin dejar una semana parcial.
4. El recomendador ahora lanza un error de negocio explicito cuando todas las
   fechas evaluadas carecen de horario configurado.
5. Festivos, cierres de empresa y cierres por sede siguen representando una
   busqueda valida sin franjas y no se confunden con configuracion faltante.

## Evidencia local

- La migracion `RepairOrganizationCompanyBusinessHoursSeed1170000000000` quedo
  registrada en `tenant_iwana.typeorm_migrations`.
- `organization_company_business_hours` contiene siete filas abiertas de
  `07:00:00` a `18:00:00`.
- Existe una persona `TECHNICIAN` activa y marcada como recurso operativo.
- No existen disponibilidades futuras bloqueadas ni eventos futuros que ocupen
  el horizonte evaluado.

## Validacion

- `schedule-recommendations.service.spec.ts`: 6 pruebas en verde.
- Contrato HTTP de visit requests + recomendador: 44 pruebas en verde.
- Migracion `117` + orden del runner: 8 pruebas en verde.
- Integracion PostgreSQL real de la migracion `117`: 3 pruebas en verde para
  idempotencia, configuracion explicitamente vacia y rollback atomico.
- Validacion funcional en el portal local: `Calcular recomendaciones` obtuvo
  respuesta HTTP `201` y presento ocho franjas seleccionables.
- Typecheck de `@iwana/api` y `@iwana/db`: sin errores.
- Lint de `@iwana/api` y `@iwana/db`: sin errores; permanecen warnings
  preexistentes fuera de esta correccion.
