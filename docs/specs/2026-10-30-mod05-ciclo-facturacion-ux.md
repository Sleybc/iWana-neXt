# MOD05 Fase 09 — Ciclo de facturación y fecha de corte · UX

**Versión:** 1.1 · **Fecha:** 2026-10-30 (v1.1: 2026-11-01) · **Responsable:** AI-PROD-UX  
**Estado:** UX congelada para F1 y Q1; v1.1 alinea la entrada de «Activar» con el [addendum U](2026-10-31-mod05-ficha-suscriptor-addendum-u.md)  
**PRD:** [Fase 09 v1.1](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-09-v1.1.md) · **ADR:** [ADR-102](../adrs/ADR-102-Ciclo-Facturacion-y-Fecha-de-Corte-por-Servicio.md) · **Plan:** [2026-10-30-mod05-ciclo-facturacion](../plans/2026-10-30-mod05-ciclo-facturacion.md)

## Objetivo y alcance

Ayudar al operador a asignar el ciclo al activar o editar un servicio y revisar los servicios con fecha de corte programada. El ciclo pertenece al contrato. Esta fase no registra pagos ni suspende servicios automáticamente; una suspensión siempre pasa por la acción manual vigente.

La UX conserva sin cambios los nombres y formas de PRD §7. Reutiliza `Dialog`, `Select`, `FormField` y `DatePicker` de `@iwana/ui`, junto con `PortalPanel`, `PortalAlert`, `PortalEmptyState`, `PortalSkeletonBlock`, la tabla operativa y `SubscriberLifecycleDialog` existentes. No requiere primitive ni token nuevo.

La agenda conserva el `PageHeader` y el panel con sombra dual existentes; el chrome del portal mantiene su indicador lima activo y el foco visible de sus controles. La acción principal sigue el botón azul de las pantallas operativas.

## 1. Activar servicio

**Entrada:** botón «Activar» del pie de `ContractCard` (servicio en borrador) o acción del detalle. «Activar» no aparece en el menú de acciones de la tarjeta (addendum U, U-ficha). Abre el diálogo «Activar servicio» en vez de llamar directamente a `activate`.

**Contenido y recorrido:**

1. Título «Activar servicio» y una frase breve: «Elige el ciclo de facturación para continuar».
2. Campo «Ciclo de facturación», con las opciones activas del catálogo como «Día 1» y «Día 15». Si `billingCycleDay` ya está asignado al contrato, aparece preseleccionado; si no, no se elige una opción por defecto.
3. Con un ciclo elegido, mostrar «Próximo corte: {fecha}» y recalcularlo al cambiar la selección. La fecha es el `nextCutoffDate` que trae el catálogo para el ciclo elegido; la calcula el servidor en la zona del tenant (enmienda E1, PRD v1.1 RF-CF-20). Se presenta como fecha en español, sin convertir el día calendario por UTC ni usar la zona del navegador.
4. Sin selección, mostrar «Elige un ciclo para calcular la fecha de corte». La confirmación «Activar servicio» permanece deshabilitada hasta tener una selección válida. «Cancelar» cierra el diálogo sin cambios.
5. Al confirmar, enviar `{ billingCycleDay }`. En éxito, cerrar y actualizar la ficha. Mientras guarda, bloquear doble envío y mostrar el estado de carga del botón.

**Errores recuperables:**

- `BILLING_CYCLE_REQUIRED`: mantener el diálogo abierto, marcar el selector y mostrar «Elige un ciclo de facturación para continuar».
- `BILLING_CYCLE_INVALID`: mantener el diálogo abierto, limpiar la selección que dejó de estar disponible y mostrar junto al selector «Este ciclo ya no está disponible. Elige otro»; volver a cargar el catálogo.
- Catálogo no disponible: mantener la confirmación deshabilitada y ofrecer «No pudimos cargar los ciclos de facturación» con «Reintentar».
- Otro error de activación: conservar la selección y mostrar `PortalAlert` con un mensaje claro y opción para volver a intentar.

El diálogo usa la primitive y semántica accesible de `SubscriberLifecycleDialog`: título y descripción asociados, foco inicial y contenido, Escape/cierre, retorno del foco, selector etiquetado y foco visible. No se añade confirmación masiva ni se cambia la activación de otros estados.

## 2. Selector al crear, editar o convertir

- **Crear (`CreateContractDialog`):** reemplazar el campo de texto libre por «Ciclo de facturación», opcional, con «Sin asignar», «Día 1» y «Día 15». Crear un borrador no obliga a escoger; activar sí.
- **Editar (`ContractDetailDrawer`):** usar el mismo selector, inicialmente con el `billingCycleDay` actual o «Sin asignar». Guardar un cambio conserva el ciclo vigente del servicio y su auditoría, según el contrato.
- **Dato anterior del contrato:** cuando `billingCycle` tenga valor, mostrarlo solo como información de solo lectura bajo «Dato anterior de facturación», acompañado por «Este dato no asigna un ciclo». No convertirlo ni usarlo como selección implícita. En la tarjeta se prioriza el ciclo vigente; el dato anterior queda en el detalle para evitar ruido.
- **Convertir expediente (`ConvertExpedienteToContractDialog`):** mantener visible el valor original como «Dato anterior del expediente». Solo si coincide exactamente con la representación decimal de un `cycleDay` activo, sin espacios ni formato adicional (por ejemplo, `1` o `15`), preseleccionar ese día y explicar «Revisa el ciclo sugerido antes de crear el borrador». Si no coincide exactamente, dejar el selector sin asignar y pedir elección manual. La confirmación del borrador crea un contrato en estado «Borrador»; no activa el servicio.

## 3. Ciclo y próximo corte en la ficha

- **`ContractCard`:** en servicios activos, mostrar «Ciclo: día {n}» y «Próximo corte: {fecha}» como **dos datos separados** (par etiqueta-valor cada uno, no una sola frase); mientras carga el catálogo, un `PortalSkeletonBlock` en lugar del dato. Si el contrato activo no tiene `billingCycleDay`, mostrar «Sin ciclo de facturación» de forma textual, no solo por color. El dato anterior no sustituye estos campos.
- **`ContractDetailDrawer`:** en «Facturación», separar método de pago, ciclo vigente y próximo corte. Si no hay ciclo, mostrar «Sin ciclo de facturación» y mantener disponible la edición que permita asignarlo. Si existe `billingCycle` anterior, presentarlo como dato de solo lectura con la explicación anterior.
- Mostrar la fecha `YYYY-MM-DD` que entrega el servidor como día calendario, sin convertirla por zona horaria. El próximo corte es informativo; no afirmar que hay deuda, falta de pago o suspensión automática.

## 4. Agenda de corte dentro de Suscriptores

**Ubicación:** nueva vista `/dashboard/crm/subscribers/agenda-corte`, bajo el layout y permiso de Suscriptores existente. En la cabecera de la lista de `SubscribersListClient`, añadir el enlace secundario «Agenda de corte». No se crea una entrada propia en el menú; la agenda mantiene un enlace «Volver a suscriptores».

**Vista:**

- Encabezado «Agenda de corte», fecha seleccionable con `DatePicker` existente y valor de fecha `YYYY-MM-DD` en la URL. La fecha inicial la devuelve el API usando el día local del tenant. Al cambiarla, reiniciar la página y consultar esa fecha; al volver atrás/restaurar la URL, conservar fecha y página.
- Mostrar arriba el aviso «{n} servicios activos sin ciclo de facturación». Es un contador, no una lista. Para asignarles ciclo, el operador vuelve al listado de Suscriptores, abre la ficha y edita el servicio que muestre «Sin ciclo de facturación». Esta corrección es manual; la respuesta congelada no permite filtrar ese contador a contratos individuales.
- Agrupar los elementos recibidos por «Ciclo: día 1», «Ciclo: día 15» u otro ciclo activo devuelto. Cada fila/tarjeta usa solo la información permitida por `CutoffAgendaItem`: suscriptor, plan y fecha de corte; incluye «Abrir ficha» y una única acción operativa «Suspender» para ese `contractId`.
- «Suspender» continúa el flujo manual existente (`SubscriberLifecycleDialog`) para el único servicio de esa fila. Se conserva la revisión y confirmación del operador y el motivo «Mora en el pago»; no hay suspensión automática ni acción masiva. La acción respeta los accesos ya exigidos por la suspensión manual.
- La leyenda visible de RF-CF-18, sin abreviar: «El sistema todavía no registra pagos: esta es la lista de servicios con corte programado».
- La paginación consume `meta` de la respuesta y reutiliza los primitives de tabla/pager existentes. No cargar una lista sin límite ni sumar conteos duplicados.

**Estados:**

- **Carga:** skeleton con forma de encabezados y filas de agenda; conservar el filtro de fecha.
- **Sin resultados para esa fecha:** «No hay servicios con corte programado para esta fecha». Mantener el selector visible para cambiar de día.
- **Error:** `PortalAlert` «No pudimos cargar la agenda» con «Reintentar»; no presentar un error como lista vacía.
- **Sin permisos:** aplica el bloqueo de página existente para `CRM_SUBSCRIBERS_READ`.
- **Contador sin ciclo:** puede coexistir con agenda vacía; mostrar el contador y el estado vacío de la fecha de forma independiente.

En desktop, conservar el patrón `PortalPanel` → filtros/contador → tabla operativa. En móvil, apilar los elementos en tarjetas de lectura y mantener la acción accesible sin hover ni desplazamiento horizontal de página. Aplicar nombres de grupo semánticos, encabezados asociados, foco visible y targets de al menos 44 px.

## 5. Vocabulario visible

| Usar                                     | Evitar en la interfaz                                        |
| ---------------------------------------- | ------------------------------------------------------------ |
| Ciclo de facturación; día de facturación | `billingCycle`, ciclo mensual/quincenal como texto libre     |
| Fecha de corte; próximo corte            | `cutoff`, `billing`, fecha UTC                               |
| Servicio activo; servicio sin ciclo      | Enum de estado sin traducir                                  |
| Dato anterior de facturación             | Presentar el texto heredado como ciclo vigente               |
| Servicios con corte programado           | Clientes morosos, servicios que no pagaron, corte automático |

## 6. Componentes afectados

- `apps/portal/src/components/crm/subscribers/ServiciosTab.tsx` — abrir activación y refrescar la ficha.
- `apps/portal/src/components/crm/subscribers/ContractCard.tsx` — acción y resumen de ciclo/fecha.
- `apps/portal/src/components/crm/subscribers/ContractDetailDrawer.tsx` — edición y detalle de ciclo/fecha/dato anterior.
- `apps/portal/src/components/crm/subscribers/CreateContractDialog.tsx` — selector opcional.
- `apps/portal/src/components/crm/subscribers/ConvertExpedienteToContractDialog.tsx` — dato original y sugerencia numérica.
- `apps/portal/src/components/crm/subscribers/SubscribersListClient.tsx` — enlace a la agenda.
- Nueva página y vista de agenda bajo `apps/portal/src/app/dashboard/crm/subscribers/` y `apps/portal/src/components/crm/subscribers/`.
- `apps/portal/src/components/crm/subscribers/SubscriberLifecycleDialog.tsx` — reutilización desde el servicio de la agenda; no crear otra interacción de suspensión.

## 7. Criterios de aceptación de experiencia

1. Activar desde el pie de la tarjeta o desde el detalle abre «Activar servicio»; no se ejecuta hasta confirmar.
2. El selector solo ofrece el catálogo activo. Preselecciona `billingCycleDay` existente; sin valor, la confirmación está deshabilitada.
3. Elegir un ciclo actualiza «Próximo corte» con el `nextCutoffDate` del catálogo, calculado en el servidor; al confirmar se envía exactamente el valor seleccionado.
4. Los errores 422 requeridos/inválidos conservan el diálogo abierto y se asocian al selector con un siguiente paso claro.
5. Crear y editar usan el selector de días, no un campo libre. La conversión solo sugiere un valor ante coincidencia numérica exacta y nunca activa el servicio.
6. El servicio activo muestra ciclo y próximo corte como dos datos, o el texto «Sin ciclo de facturación» si no tiene valor.
7. La agenda está dentro de Suscriptores; recuerda la fecha seleccionada, agrupa por ciclo, muestra la leyenda literal y el contador de activos sin ciclo.
8. Desde una fila, la suspensión identifica un solo servicio y abre la confirmación manual existente. No se presenta pago conocido ni se suspende en automático.
9. Carga, sin resultados, error y contador sin ciclo se distinguen; teclado, lector de pantalla, móvil y foco visible permiten completar la tarea.

Los criterios 1–6 complementan CA-CF-10/11; el flujo de agenda permite cubrir CA-CF-12 cuando se implemente F1/Q1.

## Historial

| Versión | Fecha | Cambio |
| --- | --- | --- |
| 1.0 | 2026-10-30 | UX congelada para F1 y Q1 |
| 1.1 | 2026-11-01 | «Activar» sale del menú y queda en el pie de la tarjeta (addendum U); ciclo y próximo corte se muestran como dos datos con estado de carga. Origen: auditoría K3 de la consolidación del clúster (prod-ux H2c y H3) |
