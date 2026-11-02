# Cambio de plan y edición del contrato de servicio

Fecha: 2026-10-30. Estado: aprobada por el usuario el 2026-10-30 para implementar.

## Objetivo y decisión confirmada

Desde Contrato de servicio se debe poder elegir otro plan y revisar nombre, velocidades y precio antes de aplicarlo. El usuario confirmó que, para servicios activos, el cambio debe aplicarse inmediatamente y mantener intactas las facturas emitidas.

Esta petición amplía E5, diferido en la spec de suscriptores del 2026-10-18. No se elimina la protección del PATCH genérico para contratos activados: el cambio comercial activo requiere acción dedicada.

## Alternativas y recomendación

1. Secciones abiertas y selector de plan al principio (recomendada): selección, comparación y errores visibles sin navegación adicional.
2. Acordeones: menos longitud inicial, pero ocultan contexto y requieren abrir automáticamente secciones inválidas.
3. Asistente en pasos: útil para cambios con programación o aprovisionamiento; añade fricción al cambio inmediato solicitado.

## Diseño propuesto

### Plan y edición

- Plan contratado ocupa la primera sección; nombre completo, tecnología, bajada, subida y precio mensual.
- Editar contrato ofrece Cambiar plan, tanto en borradores como en activos. El diálogo muestra SearchablePicker con el plan actual precargado. Buscar planes activos mediante el picker existente, sin cargar el catálogo entero.
- Resolver el detalle del plan antes de aceptar la selección. Mientras carga, mostrar skeleton y deshabilitar Guardar.
- Si la consulta falla, conservar el plan anterior y ofrecer Reintentar junto al selector.
- La selección pendiente muestra Plan actual → Plan seleccionado y sus velocidades/precios. Elegir no persiste; Cancelar conserva el contrato.
- Confirmar cambio de plan actualiza ID y snapshot juntos; el servidor construye el snapshot desde el catálogo. Se usa la misma acción dedicada en borradores y activos para evitar dos reglas de persistencia diferentes.

### Servicio activo

- En Editar contrato, la sección ofrece Cambiar plan como acción comercial dedicada.
- Abrir un diálogo con plan actual, selector y comparación del nuevo plan. Se confirma con Confirmar cambio de plan.
- Texto de confirmación: «El nuevo plan se aplicará inmediatamente. Las facturas ya emitidas conservarán sus valores».
- No ejecutar el cambio de plan junto a otros campos pendientes: desde una edición con cambios, primero guardar o cancelar esos cambios, sin guardados parciales silenciosos.
- La acción actualiza plan, snapshot e IVA de forma atómica, registra antes/después y devuelve el contrato actualizado para refrescar tarjeta y detalle.
- No emite facturas, notas ni cargos de prorrateo automáticamente. No cambia saldos ni documentos emitidos. No promete reconfiguración automática de equipos de red.
- Estados elegibles: DRAFT y ACTIVE por acción dedicada. SUSPENDED, TERMINATED y ARCHIVED conservan el plan y explican la restricción; ampliar estos estados requiere decisión comercial específica.

### Formulario y accesibilidad

- Secciones abiertas, sin cajas grises con sombra anidadas: Plan contratado; Servicio e instalación; Facturación; Punto de servicio e IVA; Datos fiscales.
- Títulos h3 en sentence case; etiquetas asociadas a cada input mediante id/htmlFor.
- Reutilizar Input, Select, Button, SearchablePicker, PortalAlert, PortalSkeletonBlock y tokens publicados. Sin primitives ni colores nuevos.
- Selector, nombre del plan, dirección y errores a ancho completo. Una columna en móvil; pares de campos cortos en escritorio.
- Precio con cifras tabulares; bajada y subida identificadas con texto accesible.
- Pie fijo con Cancelar/Guardar cambios, estado Guardando y error visible. En éxito anunciar Cambios guardados y refrescar los datos locales.
- Validación junto al campo y foco al primer inválido. Cancelar nunca muta el servidor.

## Contrato técnico propuesto

- Endpoint propuesto: POST /crm/contracts/:id/plan-change, body estricto {planId, expectedUpdatedAt, expectedMonthlyPrice}, respuesta {data: Contract}. DRAFT y ACTIVE usan la misma acción. El PATCH general conserva sus restricciones.
- Resolver y validar plan activo mediante CommercialCatalogReadPort y construir snapshot en servidor. Precio vigente del segmento del contrato/suscriptor; rechazar si no existe tarifa.
- Validación Zod, autorización existente de mutaciones, contexto tenant y transacción con bloqueo del contrato. expectedUpdatedAt rechaza ediciones obsoletas; elegir el mismo plan no duplica historial.
- Recalcular IVA según el nuevo concepto del plan y el punto de servicio existente; ante datos incompletos rechazar sin cambiar el plan.
- La comparación usa la tarifa vigente del segmento efectivo del contrato/suscriptor. expectedMonthlyPrice es solo una precondición: el servidor compara con su precio capturado y responde PLAN_PRICE_CHANGED sin mutar si cambió; nunca persiste un precio del navegador. La interfaz recarga el precio y requiere nueva confirmación.
- Registrar auditoría dentro de la misma transacción mediante AuditService.logWithin: plan anterior/nuevo, precios/snapshot, IVA y momento de aplicación emitido por servidor, sin PII. Si falla, revertir el cambio completo. Preservar las facturas existentes y el historial registrado.
- Revisar los otros escritores del contrato para evitar que un save con datos obsoletos sobrescriba el cambio; probar concurrencia.
- No se necesita migración para almacenar el plan actual: columnas ya existentes. El diseño del contrato final se publicará en shared y OpenAPI antes de consumidores frontend.

## Verificación prevista

- Backend: DRAFT y ACTIVE admitidos por sus caminos; plan inexistente/inactivo, estado no permitido, IVA inválido y concurrencia; rollback ante error; snapshots de servidor; aislamiento tenant; auditoría.
- Frontend: precarga actual, búsqueda, detalle resuelto, comparación, cancelación, errores/reintento, guardado bloqueado al cargar, actualización de tarjeta/drawer y ausencia de guardado parcial.
- Regresión del formulario, accesibilidad de labels/foco, lint, typecheck y audit-ui sin hallazgos.

## Revisión experta

- prod-ux: selector existente al inicio, comparación y guardado deliberado; sin reglas de facturación inventadas.
- ds-owner: composición aprobada con primitives actuales; corregir labels, títulos y superficies anidadas.
- sr-backend: PATCH actual no admite planId; snapshot inmutable después de activar; acción dedicada obligatoria para ACTIVE.

El usuario aprobó la composición y el alcance comercial descrito, incluidos estados y ausencia de cargos/prorrateo automático.
