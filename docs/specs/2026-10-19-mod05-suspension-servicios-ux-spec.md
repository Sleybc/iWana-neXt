# MOD05 — Diálogo de ciclo de vida de servicios

**Fecha:** 2026-10-19 · **Versión:** 1.0 · **Estado:** Congelada para S2  
**Emisor:** AI-PROD-UX  
**PRD:** [PRD-MOD05-CRM-SUBSCRIBERS-FASE-05-v1.2.md](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-05-v1.2.md), aprobado el 2026-10-19  
**Plan:** [2026-10-19-mod05-ciclo-vida-suspension.md](../plans/2026-10-19-mod05-ciclo-vida-suspension.md)  
**Prompt:** [PROMPT-MOD05-CICLO-VIDA-v1.2.md](../prompts/PROMPT-MOD05-CICLO-VIDA-v1.2.md) §P0  
**Dirección visual:** [Firma iWana](2026-07-12-firma-iwana-diseno-visual-design.md) · **Ficha:** [Subscriber 360](2026-09-04-mod05-subscriber-360-ux-spec.md) · **Diseño vigente:** [rediseño de suscriptores](2026-10-18-mod05-suscriptores-ux-rediseno-spec.md)

> Esta spec congela comportamiento y copy del portal para RF-LC-25 a RF-LC-29. Se apoya en los contratos aprobados del PRD; no agrega campos, estados ni patrones visuales. Los cambios posteriores se versionan y notifican por AI-EM-ARCH.

## 1. Objetivo, alcance y patrones

La persona operadora suspende o reactiva uno, varios o todos los servicios de un suscriptor, revisa el efecto y registra un motivo de catálogo en dos pasos. Terminar un servicio usa el mismo diálogo desde una tarjeta de servicio, con el servicio elegido explícitamente. El contrato manda; el estado del suscriptor se presenta como derivado y no se ofrece una transición manual entre «Activo» y «Suspendido».

Se reutilizan Dialog, DialogTitle, DialogDescription, DialogClose y Button de @iwana/ui, más PortalAlert y PortalSkeletonBlock de portal-ui.tsx. La ficha conserva la estructura aprobada de Subscriber 360. No se copian estilos de TailAdmin ni se crea una primitive.

**Fuera de alcance:** corte de red, retiro de equipos, cierre de órdenes, cascada de cancelación, cambio de plan, tokens y API de componentes.

## 2. Acciones de ficha y de servicio

La acción primaria queda en el encabezado existente de la ficha, junto al estado y menú de desbordamiento.

| Estado | Acción | Comportamiento |
| --- | --- | --- |
| ACTIVE | **Suspender servicios** | Acción primaria: abre con servicios ACTIVE elegibles. Si no hay ninguno, se deshabilita con «No hay servicios activos para suspender.» El menú de desbordamiento ofrece «Cancelar suscriptor» según la regla de contratos vigentes descrita abajo. |
| SUSPENDED | **Reactivar servicios** | Acción primaria: abre con servicios SUSPENDED elegibles. Si no hay ninguno, se deshabilita con «No hay servicios suspendidos para reactivar.» El menú de desbordamiento ofrece «Cancelar suscriptor» según la regla de contratos vigentes descrita abajo. |
| LEAD | **Cambiar estado** | Acción primaria: solo permite pasar a «Prospecto». «Cancelar suscriptor» permanece en el menú de desbordamiento y sigue la regla de contratos vigentes descrita abajo. |
| PROSPECT | Sin acción primaria de ciclo de vida | «Cancelar suscriptor» está en el menú de desbordamiento y sigue la regla de contratos vigentes descrita abajo. |
| CANCELLED | Sin acción de ciclo de vida | No permite crear ni reactivar servicios. |

Para cualquier estado distinto de CANCELLED, el menú de desbordamiento contiene **«Cancelar suscriptor»**. La acción se habilita solo cuando `hasLiveContracts=false`; al elegirla se conserva el flujo explícito de confirmación de cancelación y no se terminan servicios en cascada. Si `hasLiveContracts=true`, la opción queda deshabilitada y muestra «Termina primero todos los servicios vigentes para cancelar al suscriptor.» La ficha consume `hasLiveContracts`, publicado por B1 en `SubscriberListItem` y extendido por B1 al detalle; no infiere esta condición desde el estado del suscriptor. Estas reglas no sustituyen la acción primaria de ACTIVE, SUSPENDED o LEAD.

En cada tarjeta de servicio, Suspender, Reactivar y Terminar abren el mismo diálogo individual; el servicio queda fijado y no se puede cambiar desde ahí. Siempre hay dos pasos. En modo individual se omite la selección, pero motivo y nota se mantienen y la vista previa sigue siendo obligatoria. Otras acciones, como archivar, conservan su flujo actual.

## 3. Paso 1 de 2 · Servicios y motivo

**Título:** «Suspender servicios», «Reactivar servicios» o «Terminar servicio».  
**Descripción:**

- Suspensión: «Elige los servicios que quieres suspender y el motivo.»
- Reactivación: «Elige los servicios que quieres reactivar y el motivo.»
- Terminación individual: «Revisa el servicio que quieres terminar y el motivo.»

En modo masivo, «Servicios a incluir» muestra solo servicios elegibles, todos seleccionados por defecto. Cada opción muestra el nombre legible existente del servicio o plan y el estado; no muestra UUID ni enums. Con más de un servicio se permite seleccionar o quitar opciones. Con uno solo, se omite el control y se muestra «Se incluirá 1 servicio» con el nombre legible.

| Campo | Regla y texto |
| --- | --- |
| Motivo | Obligatorio. Label «Motivo *», placeholder «Selecciona un motivo». Se muestran etiquetas de producto, nunca códigos. |
| Nota | Opcional, máximo 500 caracteres. Label «Nota (opcional)», placeholder «Agrega un detalle para el historial.», contador «{n}/500 caracteres». |
| Sin selección | «Selecciona al menos un servicio para continuar.» Vista previa deshabilitada. |
| Sin motivo | «Selecciona un motivo.» Vista previa deshabilitada. |
| Nota excedida | Limitar el control a 500 caracteres; si se valida al enviar: «La nota no puede superar 500 caracteres.» |

**Motivos visibles por acto:**

| Acto | Código interno | Etiqueta visible |
| --- | --- | --- |
| Suspender | MORA | Mora en el pago |
| Suspender | SOLICITUD_TITULAR | Solicitud del titular |
| Suspender | USO_INDEBIDO | Uso indebido del servicio |
| Suspender | ORDEN_AUTORIDAD | Orden de autoridad |
| Suspender | FALLA_TECNICA_PROLONGADA | Falla técnica prolongada |
| Reactivar | PAGO_REGISTRADO | Pago registrado |
| Reactivar | FIN_SUSPENSION_SOLICITADA | Fin de la suspensión solicitada |
| Reactivar | CORRECCION_OPERATIVA | Corrección operativa |
| Reactivar | LEVANTAMIENTO_ORDEN | Levantamiento de orden |
| Terminar | SOLICITUD_TITULAR | Solicitud del titular |
| Terminar | MORA_PROLONGADA | Mora prolongada |
| Terminar | TRASLADO_SIN_COBERTURA | Traslado sin cobertura |
| Terminar | USO_INDEBIDO | Uso indebido del servicio |
| Terminar | DUPLICADO | Servicio duplicado |

DESCARTE_EXPEDIENTE es exclusivo del sistema según RF-LC-13 y no aparece para una persona. El orden del catálogo es el de la tabla; sigue provisional hasta validación jurídica y comercial.

**Acciones:** secundaria «Cancelar»; primaria «Ver vista previa». Al volver del segundo paso se conservan selección, motivo y nota.

## 4. Paso 2 de 2 · Vista previa

**Título:** «Revisa el cambio». Se presenta el conteo efectivo y la transición por servicio: «Se suspenderán {n} servicios», «Se reactivarán {n} servicios», «Se terminará 1 servicio» o «Se terminarán {n} servicios». Nombres existentes, nunca identificadores opacos.

El estado resultante se toma de la respuesta de RF-LC-11:

- Si cambia a ACTIVE: «El suscriptor quedará Activo.»
- Si cambia a SUSPENDED: «El suscriptor quedará Suspendido.»
- Si no cambia: «El estado del suscriptor no cambia.»

Si la respuesta incluye avisos, usar severidad semántica y estos textos:

- Equipo en comodato: «Este servicio tiene equipos en comodato. La terminación no los retira automáticamente.»
- Orden de retiro abierta: «Hay órdenes de retiro abiertas. Debes gestionarlas por separado.»

Si la terminación deja cero contratos vigentes, la vista previa muestra «Sin servicios vigentes» y «El suscriptor no tendrá servicios activos ni suspendidos. Su estado no cambiará automáticamente.»

**Acciones:** secundaria «Volver»; primaria «Suspender 1 servicio» o «Suspender {n} servicios», «Reactivar 1 servicio» o «Reactivar {n} servicios», «Terminar servicio» o «Terminar {n} servicios», según acto y cantidad. Cambiar selección, motivo o nota invalida la vista previa; se vuelve al paso 1 y se calcula otra antes de confirmar.

## 5. Estados y copy definitivos

| Estado | Presentación y texto | Acción |
| --- | --- | --- |
| Carga inicial de servicios | Si la ficha sigue cargando por más de ~300 ms, skeleton con forma de tarjetas, región ocupada y texto «Cargando servicios…». No abrir una lista incompleta. | Ninguna hasta terminar la carga. |
| Paso 1 listo | Título, descripción y campos de §3. | «Ver vista previa» con al menos un servicio y motivo. |
| Calculando vista previa | Se conserva la entrada; botón con loading y aria-busy; skeleton de resumen/lista y texto «Calculando la vista previa…». | No confirmar ni iniciar otra solicitud. |
| Vista previa lista | Resumen, servicios afectados, estado resultante y avisos aplicables. | «Volver» o confirmación específica. |
| Vista previa sin cambios | PortalAlert informativa: «No hay cambios para aplicar.» / «Revisa los servicios seleccionados y vuelve a intentarlo.» | Primaria «Volver a editar»; no confirmar un lote vacío. |
| Error de vista previa | PortalAlert de error: título «No pudimos cargar la vista previa»; descripción con mensaje de API o, si no existe, «Intenta de nuevo antes de confirmar.» | Primaria «Reintentar vista previa»; secundaria «Cancelar». |
| Aplicando cambio | Botón primario con estado de carga, aria-busy y texto según acto: «Suspendiendo…», «Reactivando…» o «Terminando…». Bloquear envío duplicado y deshabilitar «Cancelar» y el control de cierre. El diálogo permanece abierto hasta recibir respuesta. | Ninguna hasta la respuesta; se ignoran solicitudes de cierre mientras la operación está pendiente. |
| Error al aplicar | PortalAlert de error: «No pudimos completar el cambio»; descripción con mensaje de API o, si no existe, «Revisa los servicios e inténtalo de nuevo.» El diálogo permanece abierto y conserva entradas y vista previa. | Primaria «Reintentar»; secundaria «Volver»; después de la respuesta vuelve a estar permitido cancelar o cerrar. |
| Éxito al suspender | Cerrar diálogo, actualizar ficha y anunciar PortalAlert de éxito: título «Servicios suspendidos»; descripción «Se suspendió 1 servicio.» o «Se suspendieron {n} servicios.». | Sin confirmación adicional. |
| Éxito al reactivar | Cerrar diálogo, actualizar ficha y anunciar PortalAlert de éxito: título «Servicios reactivados»; descripción «Se reactivó 1 servicio.» o «Se reactivaron {n} servicios.». | Sin confirmación adicional. |
| Éxito al terminar | Cerrar diálogo, actualizar ficha y anunciar PortalAlert de éxito: título «Servicio terminado» o «Servicios terminados»; descripción «Se terminó 1 servicio.» o «Se terminaron {n} servicios.». | Sin confirmación adicional. |

{n} es el conteo de la vista previa confirmada. Las operaciones son todo o nada; no se muestra éxito parcial.

## 6. 409 conocidos

El mensaje indicado es el copy final en español para la superficie donde se origina el error. No se muestra el código técnico ni identificadores del payload. Para otros errores se muestra ApiError.message; si falta, se usa el fallback de §5.

| Código | Origen | Mensaje | Siguiente acción |
| --- | --- | --- | --- |
| SUBSCRIBER_CANCELLED (RF-LC-16) | Crear o activar servicio | «No puedes crear ni activar servicios para un suscriptor cancelado.» | «Cerrar». No ofrecer reactivar al suscriptor ni crear el servicio. |
| SUBSCRIBER_SUSPENDED_FOR_DELINQUENCY (RF-LC-17) | Activar servicio nuevo | «No puedes activar este servicio porque el suscriptor está suspendido por mora. Puedes guardarlo como borrador.» | «Guardar como borrador», si el formulario de origen lo permite; RF-LC-17 admite crear borrador. |
| SUBSCRIBER_HAS_LIVE_CONTRACTS (RF-LC-18) | Cancelar suscriptor con servicios vigentes | «No puedes cancelar al suscriptor mientras tenga servicios vigentes. Termínalos primero.» | «Ir a servicios» abre la tab Servicios. No mostrar los UUID devueltos. |
| SUBSCRIBER_STATUS_DERIVED (RF-LC-06) | Intento heredado de cambiar ACTIVE ↔ SUSPENDED | «El estado del suscriptor se actualiza con sus servicios. Usa “Suspender servicios” o “Reactivar servicios” en la ficha.» | «Ir a servicios»; la acción primaria depende del estado y de servicios elegibles. |

Los tres primeros son los 409 de PRD §5.4. El último se incluye porque RF-LC-06 también exige un 409. El texto respeta el sentido del mensaje de API requerido por RF-LC-26.

## 7. Información en la ficha

### Sin servicios vigentes

En la ficha, dentro de la tab **Servicios**, mostrar PortalAlert informativa si no hay contratos ACTIVE ni SUSPENDED, aunque existan borradores o servicios terminados:

- Título: **«Sin servicios vigentes»**
- Descripción: **«Este suscriptor no tiene servicios activos ni suspendidos.»**

No es un vacío de filtro ni una falta de permiso. Si no hay contratos registrados, el aviso reemplaza el título genérico «Sin servicios contratados»; un estado independiente de oportunidad con interés comercial puede permanecer junto al aviso.

### Motivo y fecha de suspensión

En cada tarjeta de servicio SUSPENDED mostrar «Suspendido el {fecha}» y «Motivo: {etiqueta del catálogo}». La fecha usa formato local es-CO, no timestamp técnico. Si un registro histórico carece de fecha o motivo, mostrar «—» para ese dato; no inferirlo. El badge «Suspendido» acompaña el texto y el color nunca es la única señal.

## 8. Accesibilidad y responsive

- Usar Dialog existente de @iwana/ui con DialogTitle y DialogDescription. La primitive proporciona role=dialog, aria-modal, captura de foco, Escape y retorno del foco al disparador; no crear overlay propio. Durante «Aplicando cambio», usar el modo controlado y rechazar las solicitudes de cierre (`onOpenChange(false)`) hasta recibir respuesta; así se ignoran Escape y clic en el velo, y se deshabilitan cancelar y el control de cierre. La primitive conserva esos cierres en el comportamiento normal; esta excepción rige solo mientras la operación está pendiente.
- El foco entra al primer control al abrir. Al cambiar de paso, anunciar «Paso 1 de 2 · Servicios y motivo» / «Paso 2 de 2 · Vista previa» y mover el foco al título activo. Tab y Shift+Tab permanecen dentro.
- Antes de aplicar, Escape, clic en el velo, «Cancelar» y «Cerrar» son salidas permitidas. Durante la aplicación se bloquean todos esos cierres hasta la respuesta. Si falla, el diálogo sigue abierto con el error, los datos ingresados y la vista previa; el operador puede reintentar o salir cuando la solicitud ya terminó. Solo una respuesta exitosa cierra automáticamente el diálogo y actualiza la ficha. Los avisos de error se anuncian al aparecer; el éxito se anuncia tras volver a la ficha.
- Labels asociados; motivo obligatorio con indicador visible y aria-required; errores enlazados por aria-describedby. El grupo de selección se llama «Servicios a incluir» y cada opción comunica nombre y estado en texto.
- Checkboxes, botones, cierre y opciones interactivas tienen targets de 44×44 px y foco visible. Acciones disponibles fuera de hover.
- Contraste WCAG 2.2 AA con tokens reales en claro y oscuro. Los estados usan texto, semántica y color; lima no indica alerta.
- En móvil, diálogo dentro de los márgenes existentes; cuerpo/lista con scroll vertical, sin scroll horizontal, y botones operables con teclado y tacto.
- Respetar prefers-reduced-motion; transiciones no bloquean interacción.

## 9. Criterios de aceptación

| ID | Criterio verificable | RF |
| --- | --- | --- |
| CA-UX-LC-P0-01 | ACTIVE muestra «Suspender servicios»; SUSPENDED muestra «Reactivar servicios»; no se ofrece «Cambiar estado» para ACTIVE ↔ SUSPENDED. | RF-LC-25, RF-LC-28 |
| CA-UX-LC-P0-02 | «Cambiar estado» conserva solo LEAD → PROSPECT; cancelar es explícito y no termina servicios en cascada. | RF-LC-25, RF-LC-28 |
| CA-UX-LC-P0-03 | La acción masiva usa dos pasos, inicia con servicios elegibles seleccionados y exige vista previa. | RF-LC-26 |
| CA-UX-LC-P0-04 | Con un solo servicio o acción desde tarjeta se omite selección; motivo sigue obligatorio y hay vista previa. | RF-LC-26, RF-LC-27 |
| CA-UX-LC-P0-05 | Motivos por acto tienen etiqueta en español, no código; nota es opcional y limita a 500 caracteres. | RF-LC-26, RF-LC-27 |
| CA-UX-LC-P0-06 | Carga, vista previa, error, 409, resultado vacío y éxito usan los textos y acciones especificados. | RF-LC-26 |
| CA-UX-LC-P0-07 | Cada 409 de §5.4 se muestra en su contexto; no se expone código ni UUID. | RF-LC-16, RF-LC-17, RF-LC-18 |
| CA-UX-LC-P0-08 | Tarjeta SUSPENDED presenta motivo y fecha es-CO, con guion para un valor heredado ausente. | RF-LC-29 |
| CA-UX-LC-P0-09 | Sin contratos vivos, Servicios muestra «Sin servicios vigentes», incluso si quedan borradores o servicios terminados. | RF-LC-03, RF-LC-29 |
| CA-UX-LC-P0-10 | Diálogo operable por teclado; foco atrapado/devuelto; nombres, contraste AA y targets de 44×44 px. | RF-LC-26 |
| CA-UX-LC-P0-11 | Para todo estado no cancelado, «Cancelar suscriptor» está en el menú; se habilita con `hasLiveContracts=false` y, con `true`, se deshabilita con explicación. La acción primaria por estado se conserva. | RF-LC-03, RF-LC-18, RF-LC-25 |
| CA-UX-LC-P0-12 | Mientras se aplica un cambio, Escape, velo, cancelar y cerrar no descartan el diálogo; un error conserva datos y vista previa, y solo el éxito lo cierra automáticamente. | RF-LC-26 |

## 10. Límites congelados y trazabilidad

La vista previa presenta la respuesta del servidor; el cliente no predice contratos afectados ni estado resultante. El selector y la tarjeta usan solo los servicios y nombres ya disponibles en la ficha. La cancelación no termina servicios; la suspensión y reactivación solo actúan sobre lo seleccionado. La nota se limita al campo del PRD y nunca se escribe en logs, alertas ni telemetría.

El aviso «Sin servicios vigentes» se congela en la ficha. El posible indicador equivalente en el listado se deja a la consolidación del orquestador con B1/B3, sin ampliar este contrato UI.

- RF-LC-25: §2, CA-UX-LC-P0-01/02/11.
- RF-LC-26: §3–§6, CA-UX-LC-P0-03/06/07.
- RF-LC-27: §2–§3, CA-UX-LC-P0-04/05.
- RF-LC-28: §2/§6, CA-UX-LC-P0-01/02.
- RF-LC-03: §2/§7, CA-UX-LC-P0-09/11.
- RF-LC-18: §2/§6, CA-UX-LC-P0-07/11.
- RF-LC-29: §7, CA-UX-LC-P0-08/09.
