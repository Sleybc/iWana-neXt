# ADR-097 — Puertos de lectura para avisos de terminación en MOD05

**Versión:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-10-19  
**Aprobado por:** CTO, 2026-10-19 — ampliación de alcance confirmada durante el lanzamiento de MOD05 E4  
**Modo activo:** Architect + EM  
**Autor:** AI-EM-ARCH  
**Relacionado:** [PRD-MOD05 Fase 05 v1.2](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-05-v1.2.md), [HLD-MOD05 Fase 05 v1.1](../hlds/HLD-MOD05-FASE-05-v1.1.md), [ADR-029](ADR-029-Bounded-Context-Taxation-Catalogo-Unificado.md)

## Contexto

RF-LC-11 requiere que la vista previa de terminación avise si existen equipos en comodato y órdenes de retiro abiertas. MOD05 no tiene puertos para consultar esos datos. Leer `asset_loan_assignments` o `execution_orders` desde CRM cruzaría los límites de MOD12 y MOD11.

## Decisión

1. MOD12 publica un puerto de lectura que devuelve los IDs de contratos seleccionados con asignaciones de comodato abiertas (`removed_at IS NULL`). El adaptador consulta exclusivamente con el contexto del tenant actual.
2. MOD11 publica un puerto de lectura que responde si el suscriptor tiene órdenes de retiro (`workType = RETIREMENT`) abiertas. Abierta significa estado `CREATED`, `ASSIGNED`, `EN_ROUTE`, `IN_PROGRESS` o `BLOCKED`, y `is_annulled = false`. El puerto también usa el contexto del tenant actual.
3. MOD05 consume ambos puertos por inyección de dependencias. La vista previa consulta estos avisos para `TERMINATE`; no escribe ni ejecuta retiro de equipos ni cancela órdenes.
4. El aviso de equipo identifica los `contractIds` relacionados. La OT solo se relaciona con `subscriberId`, así que el aviso de órdenes es general y devuelve `contractIds: []`.
5. Si alguna lectura falla, la vista previa falla y comunica el error; nunca presenta una lista vacía como si las fuentes se hubieran consultado correctamente.

Los puertos entregan proyecciones mínimas (IDs o booleano); no exponen repositorios, entidades, `EntityManager` ni tablas del proveedor. El adaptador MOD11 se expone por `ExecutionOrderSchedulingModule`, un módulo estrecho que no importa `TasksModule`, `AssuranceModule` ni CRM; así la integración no forma un ciclo de Nest.

## Consecuencias

- La dependencia va de MOD05 hacia los puertos de MOD12 y MOD11. No se introduce dependencia inversa ni acceso directo a tablas.
- Las consultas corren en el schema resuelto por `TenantContext` y no aceptan un tenant/schema arbitrario del solicitante.
- Los avisos informan de trabajo pendiente; no automatizan baja física, retiro ni cierre de órdenes.
- Agregar otros módulos de negocio a la vista previa requiere su propio puerto de lectura y su dueño debe implementar el adaptador.

## Alternativas descartadas

- Consultar tablas de MOD12/MOD11 desde CRM: viola Modulith y acopla CRM a entidades ajenas.
- Mostrar `warnings: []` hasta que exista la lectura: presenta como verificado un dato que no se consultó.
- Ejecutar acciones de retiro o cierre desde la vista previa: excede el alcance de esta fase y las decisiones D-E4-4.

## Referencias

- [PRD-MOD05 CRM Suscriptores Fase 05 v1.2](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-05-v1.2.md), RF-LC-11 y §9.3.
- [HLD-MOD05 Fase 05 v1.1](../hlds/HLD-MOD05-FASE-05-v1.1.md).
