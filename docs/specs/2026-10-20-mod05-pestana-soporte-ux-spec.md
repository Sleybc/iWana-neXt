# MOD05 — Pestaña Soporte del suscriptor · Spec UX

**Versión:** 1.0 · **Fecha:** 2026-10-20
**Estado:** Congelada para implementación (S3)
**Emisor:** AI-PROD-UX
**Alcance:** ficha del suscriptor y selector de suscriptor del formulario de tickets de Assurance.

## Autoridad y decisiones

- PRD aprobado [PRD-MOD05-CRM-SUBSCRIBERS-FASE-07-v1.0](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-07-v1.0.md), en particular §5.4, §5.5, §8 y decisiones D-E6-1 a D-E6-6.
- Orquestación [2026-10-20-mod05-pestana-soporte](../plans/2026-10-20-mod05-pestana-soporte.md) y encargo [PROMPT-MOD05-PESTANA-SOPORTE-v1.0](../prompts/PROMPT-MOD05-PESTANA-SOPORTE-v1.0.md).
- Orden y semántica de navegación de la [spec UX de suscriptores](2026-10-18-mod05-suscriptores-ux-rediseno-spec.md) §2.2 y §3, QW2.
- Dirección visual: [Firma iWana](2026-07-12-firma-iwana-diseno-visual-design.md), más las recetas reales del portal en `apps/portal/src/components/shared/portal-ui.tsx` y `@iwana/ui`.

Esta spec concreta la experiencia aprobada; no amplía los datos ni las acciones del PRD. El portal compone Tickets y Visitas con el permiso de lectura de cada módulo. Las visitas originadas en tickets se consultan desde el ticket; esta pestaña no lista órdenes de trabajo. El buscador utiliza el selector y la consulta de suscriptores ya existentes en MOD05.

## 1. Objetivo y estructura

La persona que atiende al cliente revisa tickets y visitas desde la ficha, abre cada detalle en contexto y puede crear un ticket vinculado sin volver a buscar el suscriptor.

Orden de las pestañas de la ficha: **Vista general · Servicios · Soporte · Datos · Tributario · Cumplimiento**. «Soporte» queda inmediatamente después de «Servicios» y antes de «Datos». Conserva QW2: `?tab=soporte`, recarga persistente, `router.replace` sin scroll, tablist con nombre accesible y navegación por flechas izquierda/derecha, `Home` y `End`. El tab y su panel mantienen las relaciones `aria-controls` / `aria-labelledby` y el foco visible del patrón existente.

Si el perfil tiene `privacyRestricted`, no se muestra «Soporte» ni se solicitan tickets o visitas, conforme a RF-SO-14. La composición de la pestaña no agrega facturación, diagnóstico de red ni órdenes de trabajo.

Dentro del panel, Tickets precede a Visitas tanto en el orden del documento como en lectura con tecnología asistiva. En escritorio se presentan dos paneles de contenido en columnas; en móvil se apilan en ese mismo orden, sin scroll horizontal. Cada panel conserva su propio encabezado, estado, contenido y recuperación. No se envuelve la navegación de pestañas y todo el contenido en una card adicional.

## 2. Sección Tickets — RF-SO-09

### Contenido y orden

Cada fila muestra, en este orden de lectura:

1. Número visible del ticket (nunca UUID interno).
2. Asunto.
3. Estado con texto y badge semántico.
4. Prioridad con texto y badge semántico.
5. Vencimiento de atención; la fecha y hora se presentan en formato local `es-CO`. Si no hay fecha, mostrar **«Sin vencimiento registrado»** sin inventar una.

Primero se muestran los tickets abiertos, ordenados por el vencimiento de atención más próximo. Después, los tickets cerrados recientes, del más reciente al más antiguo. Se oculta el rótulo de un grupo si no tiene filas. Estado y prioridad usan las etiquetas y variantes humanas de Assurance (`assurance-labels.ts`); no se exponen valores enum ni se comunica el estado solo con color. El lima no representa prioridad ni urgencia.

### Apertura del detalle

La fila completa es una acción operable por puntero y teclado y abre el `AssuranceTicketDrawer` existente. Su nombre accesible identifica el destino, por ejemplo: **«Abrir ticket {número}: {asunto}»**. No se agrega otro botón interactivo dentro de la misma fila. El drawer conserva su implementación y acciones actuales; este bloque no lo modifica.

## 3. Sección Visitas — RF-SO-10

Cada visita muestra:

1. Tipo de trabajo con etiqueta de producto, no enum.
2. Origen: «Expediente» o «Contrato» cuando está disponible; si no, **«Sin expediente o contrato vinculado»**.
3. Fecha y hora en formato local `es-CO`; para una visita pendiente de agendar sin fecha, mostrar **«Pendiente de fecha»**.
4. Estado con texto y badge semántico; nunca depender solo del color.

Primero aparecen las visitas pendientes de agendar y las visitas programadas futuras; después, las visitas pasadas. No se agrega a esta sección una visita originada en un ticket del suscriptor: se accede a ella desde el ticket para evitar duplicados (RF-SO-06).

Al activar una fila se abre un panel lateral de solo lectura con el título **«Detalle de la visita»** y los mismos campos, más el enlace **«Abrir en Agendamiento»**. El enlace navega al registro en el módulo de Agendamiento; volver conserva la ficha en `?tab=soporte`. El panel tiene un control **«Cerrar»**, recibe foco al abrir, permite cerrarse con `Escape` y devuelve el foco a la fila que lo abrió. No ofrece edición ni acciones sobre órdenes de trabajo.

## 4. Permisos y estados independientes — RF-SO-11 y RF-SO-13

La autorización se evalúa por sección antes de llamar al módulo dueño. La ausencia de permiso no se representa como una lista vacía ni dispara una petición.

| Sección / estado | Interfaz y texto definitivo | Comportamiento |
| --- | --- | --- |
| Tickets sin `ASSURANCE_TICKETS_READ` | Aviso: **«No tienes acceso a los tickets»** | No consulta Assurance; Visitas sigue funcionando si tiene permiso. |
| Visitas sin `WFM_SCHEDULE_READ` | Aviso: **«No tienes acceso a las visitas»** | No consulta WFM; Tickets sigue funcionando si tiene permiso. |
| Carga de Tickets | Skeleton con forma de filas y texto accesible **«Cargando tickets…»** | Se muestra si la carga tarda más de ~300 ms; limita `aria-busy` a este panel. |
| Carga de Visitas | Skeleton con forma de filas y texto accesible **«Cargando visitas…»** | Se muestra si la carga tarda más de ~300 ms; limita `aria-busy` a este panel. |
| Vacío de Tickets | **«Este suscriptor no tiene tickets»** | Estado vacío solo cuando la consulta termina correctamente sin resultados. |
| Vacío de Visitas | **«Este suscriptor no tiene visitas»** | Estado vacío solo cuando la consulta termina correctamente sin resultados. |
| Error de Tickets | Título **«No fue posible cargar los tickets»**; acción **«Reintentar»** | El reintento repite solo la consulta de Tickets. No se muestra el error técnico ni se pierde el contenido ya disponible de Visitas. |
| Error de Visitas | Título **«No fue posible cargar las visitas»**; acción **«Reintentar»** | El reintento repite solo la consulta de Visitas. No se muestra el error técnico ni se pierde el contenido ya disponible de Tickets. |

Las dos consultas autorizadas se inician en paralelo. Una respuesta vacía, lenta o fallida no bloquea, reemplaza ni reinicia la otra sección. Usar los primitives actuales `PortalPanel`, `PortalSkeletonBlock`, `PortalEmptyState` y `PortalAlert`; no usar spinner como carga del panel.

La acción **«Crear ticket»** se muestra únicamente con `ASSURANCE_TICKETS_MANAGE`. Ese permiso no habilita por sí solo la consulta de la lista. Si una configuración concede gestión sin lectura, se conserva el aviso de lectura y la acción de creación; al terminar, no se solicita la lista. En ese caso el éxito se anuncia como **«Ticket creado»**.

## 5. Crear ticket desde la ficha — RF-SO-12

«Crear ticket» abre en un diálogo del portal el formulario de Assurance, sin abandonar la ficha. El formulario inicia con el tipo de solicitante «Suscriptor» y la identidad de la ficha ya seleccionada y fijada: el control se presenta como dato de solo lectura, sin pedir buscar ni confirmar otra vez. El `requesterRefId` enviado es el id del suscriptor de la ficha.

Al enviar, el botón conserva el texto **«Crear ticket»** y usa el estado de carga de `Button` (deshabilitado y `aria-busy`). La acción secundaria se llama **«Cancelar»**. Al crear correctamente, se cierra el diálogo, se actualiza únicamente Tickets si hay permiso de lectura y se anuncia en región accesible: **«Ticket creado y vinculado al suscriptor»**. Si falla, el diálogo y los campos se conservan; mostrar **«No fue posible crear el ticket. Revisa la información e inténtalo de nuevo»** sin volcar mensajes técnicos o datos personales.

La ficha no añade una segunda búsqueda, un paso de confirmación del suscriptor ni una acción para cambiar el suscriptor fijado. El formulario mantiene sus campos actuales de tipo, prioridad, origen, asunto, objeto afectado, descripción y asignación, sujetos a los permisos y validaciones existentes de Assurance.

## 6. Buscador del formulario de tickets — RF-SO-15

Cuando `requesterType = SUBSCRIBER` y el formulario no recibe un suscriptor fijado desde la ficha, sustituir **«Referencia del solicitante»** de texto libre por el selector accesible `SearchablePicker` existente y la consulta `subscribersApi.list` ya usada por MOD05. No crear una segunda API o un selector visual paralelo.

| Estado del selector | Texto definitivo |
| --- | --- |
| Etiqueta | **«Suscriptor»** |
| Placeholder | **«Nombre, razón social o NIT»** |
| Ayuda inicial | **«Busca y selecciona el suscriptor al que quedará vinculado este ticket»** |
| Umbral | **«Escribe al menos 2 caracteres»** |
| Búsqueda en curso (anuncio accesible) | **«Buscando…»** |
| Sin coincidencias | **«No hay suscriptores que coincidan»** |
| Error de búsqueda | **«No fue posible cargar suscriptores»** y acción **«Reintentar»** |
| Validación al enviar sin selección | **«Selecciona un suscriptor»** junto al campo |

Conservar el umbral, debounce, semántica de teclado, `listbox`/`option`, anuncio del número de resultados y target mínimo de 44 × 44 px que ya resuelve `SearchablePicker`. El foco permanece en el campo al seleccionar; limpiar la selección deja el campo listo para buscar de nuevo. La selección se presenta con el formato de opción vigente de MOD05; no se muestra un UUID.

La consulta no se incorpora a la URL, al historial de navegación ni a logs. Si la persona cambia `requesterType` a otro tipo, desaparece el selector y los demás tipos conservan el campo de referencia y comportamiento actual. Al cambiar de tipo se limpia la selección de suscriptor para no enviar una referencia incompatible. El formulario no solicita información adicional si el selector ya fijó el suscriptor.

## 7. Accesibilidad, identidad y vocabulario

- La navegación por pestañas conserva el contrato QW2 de foco itinerante, selección y panel etiquetado. Las secciones usan encabezados semánticos; resultados, carga, éxito y error se anuncian sin mover el foco inesperadamente.
- Tickets y visitas se pueden abrir con teclado y sin depender de hover. Foco visible en acciones y filas; targets de interacción de al menos 44 × 44 px. El detalle de visita devuelve el foco al origen al cerrar.
- Los badges incluyen siempre una etiqueta textual. Usar variantes semánticas existentes para estado y prioridad; advertencia y urgencia usan tonos `warning`/`error`, no lima. Texto de acento sobre fondo claro solo con `iwana-secondary-700` o más oscuro. No se proponen tokens nuevos.
- Mantener la firma iWana con función: estado en badge tonal y número/fecha como dato técnico de lectura estable; superficies sobrias y densidad operativa, sin decoración orgánica en los listados. Usar primitives reales del portal y `@iwana/ui`.
- Copy en español, sentence case y orientado a la tarea. No mostrar claves de permiso, nombres internos de módulos, enums, errores crudos ni datos personales en URL, logs o textos de error.
- En móvil, paneles apilados, fechas y origen legibles sin desplazamiento horizontal; controles no dependen de puntero preciso.

## 8. Trazabilidad de aceptación

| Requisito / criterio | Sección de esta spec |
| --- | --- |
| RF-SO-08, CA-SO-06 | §1 |
| RF-SO-09, apertura de `AssuranceTicketDrawer` | §2 |
| RF-SO-10, RF-SO-06, detalle de visita | §3 |
| RF-SO-11, RF-SO-13, CA-SO-03, RNF-SO-04 | §4 |
| RF-SO-12, CA-SO-04 | §5 |
| RF-SO-15, CA-SO-05 | §6 |
| RF-SO-14 | §1 |
| WCAG 2.2 AA, identidad y vocabulario | §7 |

RF-SO-01 a RF-SO-07 y CA-SO-01, CA-SO-02, CA-SO-07 a CA-SO-09 se verifican en los contratos, índices, filtros e integraciones de backend definidos por el PRD; no se redefinen aquí.

## 9. Handoff P0

Esta spec entrega S3 a F1 y F2. F1 implementa composición, estados, permisos y acciones descritos aquí, consume `AssuranceTicketDrawer` sin modificarlo y conserva independientes las secciones. F2 aplica §6 al formulario de Assurance. Cualquier divergencia posterior requiere proponer versión nueva y avisar al orquestador; no se cambia esta spec silenciosamente.
