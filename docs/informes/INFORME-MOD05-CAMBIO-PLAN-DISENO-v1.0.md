# Informe — diseño del cambio de plan del contrato

Fecha: 2026-10-30. Estado: diseño aprobado por el usuario; implementación y verificación en curso.

## Solicitud

Permitir cambiar el plan desde Contrato de servicio > Editar y mejorar el formulario UI/UX. El usuario confirmó aplicación inmediata en servicios activos y conservación de las facturas emitidas.

## Revisión experta

- sr-backend: el PATCH actual no admite planId y protege el snapshot después de activar. Propone acción dedicada con planId y expectedUpdatedAt, catálogo mediante puerto, bloqueo de fila, IVA actualizado y auditoría en la misma transacción.
- prod-ux: selector con búsqueda, comparación actual/nuevo, confirmación deliberada, errores visibles y bloqueo de cambio de plan si existen otros campos pendientes.
- ds-owner: primitives actuales suficientes; mejorar asociaciones label/input, encabezados semánticos y superficies anidadas. Auditoría mecánica del drawer actual: 0 hallazgos; los problemas manuales de semántica/composición no son detectados por ese script.

## Propuesta revisable

Spec: `docs/specs/2026-10-30-mod05-cambio-plan-contrato-ux.md`. DRAFT y ACTIVE usan una acción dedicada para evitar guardados parciales. Cambio comercial inmediato sin generación automática de facturas, prorrateos ni reconfiguración de red. SUSPENDED y estados finales quedan restringidos en esta propuesta.

Se leyeron brainstorming, core-components, nextjs-app-router-patterns, system-vocabulary-review, frontend-dev-guidelines e iwana-identity-ui-review; especialistas complementaron con backend y dirección visual. El usuario aprobó expresamente la propuesta y ordenó implementar. Se abrió el plan `docs/plans/2026-10-30-mod05-cambio-plan-contrato.md`, con ownership separado de backend/shared y Portal, más revisión QA. Sin commits ni reversión de cambios previos del árbol compartido.
