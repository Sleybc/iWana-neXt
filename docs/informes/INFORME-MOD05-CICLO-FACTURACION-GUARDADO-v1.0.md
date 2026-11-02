# Informe — guardado del ciclo desde el contrato de servicio

Fecha: 2026-10-30.

La corrección anterior de estado no comprobaba el bloqueo del guardado. Se reprodujo con una prueba que el editor enviaba campos fiscales vacíos y otros campos sin modificar al cambiar únicamente el ciclo. El backend considera la presencia de esos campos una modificación fiscal o del punto de servicio, con sus validaciones correspondientes. El error general se mostraba al principio del área desplazable, fuera de la vista junto al botón de guardar.

El PATCH ahora contiene únicamente campos modificados. La validación local del estrato se aplica al modificar el punto de servicio. Los rechazos del guardado se anuncian con PortalAlert en el pie fijo, junto a las acciones. Se conserva la sincronización del contrato actualizado de la corrección anterior.

Evidencia sin caché:

- La prueba inicial de PATCH exclusivo del ciclo falló y mostró los campos ajenos recibidos por el mock de API.
- `pnpm --filter @iwana/portal exec jest src/components/crm/subscribers/billing-cycle-fase09.portal.spec.tsx src/components/crm/subscribers/mod05-iva-punto-servicio-ui.spec.tsx --runInBand --no-cache`: 2 suites, 31 tests aprobados.
- Tras añadir casos de borrador y rechazo visible, `pnpm --filter @iwana/portal exec jest src/components/crm/subscribers/billing-cycle-fase09.portal.spec.tsx --runInBand --no-cache`: 1 suite, 5 tests aprobados.
- Typecheck de Portal y ESLint de los dos archivos tocados: exit 0. Auditoría UI del drawer: 0 hallazgos.

No se realizó una mutación sobre el contrato real mostrado en la captura. Las pruebas emplean contratos sintéticos y API simulada; no acreditan la respuesta concreta que estaba devolviendo esa sesión de navegador.

## Nombre del plan contratado

La conversión desde oportunidad guarda `planSnapshotJson` con ID y origen, sin nombre. El drawer mostraba entonces el ID. Ahora conserva el nombre histórico del snapshot (`name` o `planName`) si existe; cuando falta, consulta el catálogo por el `planId` del contrato. Muestra estados de carga y plan no disponible si la consulta falla. No sustituye precios ni velocidades históricas por datos actuales del catálogo.

Verificación: la suite focal sin caché terminó con 1 suite y 7 tests aprobados, incluidos resolución del nombre sin snapshot y prioridad del nombre histórico. Typecheck, ESLint y auditoría UI terminaron con exit 0 (0 hallazgos UI).

## Velocidad y precio del plan

A petición del usuario, la resolución de catálogo también completa las velocidades de bajada/subida y el precio mensual ausentes en el snapshot, incluso cuando este ya contiene nombre. Cada valor guardado en el contrato conserva prioridad. Cuando se usa el precio del catálogo se identifica como «Precio actual del plan»; no se presenta como precio histórico contratado. Un precio nulo muestra «Precio no disponible», nunca cero pesos. Esto amplía el alcance de la corrección anterior del nombre.

Verificación final: Jest focal con `--runInBand --no-cache`, 1 suite y 9 tests aprobados; incluye snapshot completo, snapshot incompleto y precio nulo. Typecheck y ESLint exit 0; auditoría UI 0 hallazgos.

## Plan en la tarjeta del servicio

La tarjeta ahora muestra nombre, velocidades de bajada/subida y precio mensual. Se extrajo `useContractPlan` para compartir con el drawer la prioridad de valores del contrato y la consulta por `planId` cuando faltan datos. Incluye carga, datos no disponibles y la aclaración «Precio actual del plan» cuando el precio procede del catálogo. No modifica el contrato almacenado.

Pruebas focales de tarjeta y drawer: 2 suites, 26 tests aprobados sin caché. Se cubren datos de catálogo, prioridad del snapshot y tarifa ausente. Typecheck y ESLint exit 0; auditoría UI de ambos componentes: 0 hallazgos.
