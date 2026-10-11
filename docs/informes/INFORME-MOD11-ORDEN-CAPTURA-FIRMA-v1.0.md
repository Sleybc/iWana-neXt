# INFORME-MOD11-ORDEN-CAPTURA-FIRMA-v1.0

**Versión:** 1.0  
**Estado:** Implementado  
**Fecha:** 2026-10-11

## Cambio

El índice de requisitos ahora presenta al final toda evidencia cuyo tipo sea `SIGNATURE`. La partición es estable: todos los demás requisitos conservan el orden recibido del snapshot. No se cambia la plantilla guardada, las claves, los permisos, los estados ni el gate de cierre.

La regla se basa en `kind === 'EVIDENCE'` y `evidenceType === 'SIGNATURE'`, sin acoplar la presentación a una clave de requisito concreta.

## Verificación

- La expectativa existente del índice se actualizó para reflejar la firma al final y conservar las etiquetas del snapshot.
- `audit-ui.mjs` sobre `ExecutionOrderRequirementIndex.tsx`: sin hallazgos.
- No ejecuté suites de pruebas, por no haber sido solicitadas.
