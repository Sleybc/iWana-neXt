# MOD13 — Red y Aprovisionamiento · Especificación UX

**Versión:** 1.1 · **Fecha:** 2026-10-22 · **Estado:** En revisión
**Contrato:** [HLD-MOD13 Fase 01 v1.1](../hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md)
**Fuentes:** [PRD-MOD13 v1.1](../prds/PRD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md) · [plan de fase](../plans/2026-10-22-mod13-aprovisionamiento.md) · [prompt v1.1](../prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md)

## 1. Alcance y resolución del bloqueo v1.0

Esta especificación define los estados y el contenido de las superficies de catálogo, aprovisionamiento, bandeja, OT, ficha del suscriptor y cierre de OT. Es un contrato funcional para F1/F2; no afirma que las pantallas estén implementadas.

La versión 1.0 se detuvo porque el contrato no permitía mostrar la identidad de quien certificó ni definir los DTO. El HLD v1.1 lo resuelve: `ServiceProvisioningDto.certifiedBy` usa `ActorRefDto` con `name`, y §4.4 fija los DTO, los cuerpos y las proyecciones. Se retira el bloqueo anterior. Esta spec no añade campos al HLD.

## 2. Personas, permisos y principios de experiencia

| Persona                                 | Acceso y tarea                                                                                                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aprovisionamiento / Monitoreo operativo | Mantiene routers y redes; reserva, certifica, libera y regulariza servicios según sus permisos. Trabaja desde la bandeja y las OT.                                                                        |
| Administrador de la organización        | Gestiona el catálogo y el ajuste de cierre; también puede certificar y regularizar conforme a la matriz del HLD.                                                                                          |
| Técnico de campo                        | En una OT asignada consulta solo `TechnicianProvisioningViewDto`: estado, IP, si está certificado y fecha de actualización. No ve la bandeja ni la ficha técnica de otros suscriptores y nunca certifica. |

Vocabulario de estados y métodos: `RESERVED` → «Reservado»; `CERTIFIED` → «Certificado»; `ACTIVE` → «Activo»; `FAILED` → «Sin aprovisionar»; `RELEASED` → «Liberado». `SIMPLE_QUEUE_STATIC_IP` → «Cola simple con IP fija»; `PCQ_ADDRESS_LIST` → «PCQ con lista de direcciones». `REGULARIZED` → «Regularizado».

- Mostrar cada vista y acción según el permiso del HLD. No sustituir la autorización del servidor por ocultar controles; un 403 debe producir el estado «Sin acceso» descrito en cada flujo.
- Usar los componentes y tokens reales del portal al implementar. Mantener una interfaz sobria y operativa: el color comunica estado, avance o acción; el lima no expresa urgencia. No crear primitivas visuales nuevas en F1/F2 sin revisión del sistema de diseño.
- El vocabulario visible sigue el PRD §8. No presentar enums, nombres de permisos, códigos de error, términos internos ni nombres de colas.
- Los estados y errores se comunican con texto e icono además del color. Formularios con etiquetas persistentes, ayuda y error asociado al campo; foco visible, navegación por teclado y controles interactivos con área operable mínima de 44 × 44 px.
- No mostrar al técnico campos de `ProvisioningOrderContextDto`; su proyección es independiente y se limita exactamente a los cinco campos de `TechnicianProvisioningViewDto`.

## 3. Catálogo de routers

**Tarea:** localizar y mantener el router que recibirá una reserva. Ruta prevista: `app/dashboard/network/routers/`. La lectura requiere `network.catalog.read`; crear, editar, activar o desactivar requiere `network.catalog.manage`.

### Listado

Usar tabla paginada con búsqueda `q` y filtro de estado. La fila puede presentar los campos de `RouterDto`: nombre, dirección de administración, interfaz LAN, métodos de control traducidos, sede, nodo comercial, estado y cantidad de redes. Los datos de sede y nodo se muestran si tienen referencia; no inferir sus nombres desde el UUID.

| Estado     | Presentación y acción                                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cargando   | Skeleton con forma de tabla y nombre accesible «Cargando routers».                                                                                                          |
| Vacío      | «Todavía no hay routers registrados.» Con permiso de gestión, ofrecer «Registrar router»; de lo contrario, explicar que la lista aparecerá cuando se configure el catálogo. |
| Error      | «No pudimos cargar los routers. Reintenta.» Mantener los filtros y ofrecer reintentar.                                                                                      |
| Sin acceso | «No tienes acceso al catálogo de routers.» No mostrar datos ni acciones.                                                                                                    |

### Alta, edición y estado

El drawer tiene campos etiquetados para nombre, dirección de administración (IP o nombre de host), interfaz LAN, métodos admitidos, sede y nodo comercial opcionales, y notas. Las dos últimas referencias se guardan como `organizationSiteId` y `commercialNodeId`; usar los catálogos existentes de sede y nodo sin mostrar UUID como etiqueta. Esta spec no añade un origen de datos ni campos de respuesta. Respetar límites del HLD: nombre 1–120, dirección 1–255, interfaz hasta 64, notas hasta 1000; debe seleccionarse al menos un método y no repetirlos. Al editar, enviar `version`; no presentar una edición silenciosa si el registro cambió.

Al guardar correctamente, cerrar el drawer, actualizar la fila y anunciar «Router guardado». Para conflicto de versión, conservar lo escrito y pedir recargar antes de volver a guardar. Activar o desactivar actualiza el estado visible; no insinuar que desactivar libera direcciones IP activas.

## 4. Catálogo de redes IPv4

**Tarea:** elegir una red válida y revisar su ocupación. Ruta prevista: `app/dashboard/network/ipv4-networks/`. Requiere `network.catalog.read`; las acciones de alta, edición y estado requieren `network.catalog.manage`.

### Listado y ocupación

Filtrar por router y estado, usar paginación numerada y presentar: nombre de red, router, CIDR, gateway, rango asignable, método por defecto, estado y ocupación. Construir la barra solo desde `occupancy.total`, `reserved`, `active` y `free`; acompañarla con esos valores y un texto accesible, por ejemplo «12 de 240 direcciones ocupadas; 228 libres». Una dirección está ocupada si está reservada o activa. No usar el color como única señal.

| Estado     | Presentación y acción                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cargando   | Skeleton de tabla; anunciar «Cargando redes IPv4».                                                                                                        |
| Vacío      | «No hay redes para este filtro.» Permitir limpiar filtros. Si no hay ninguna red registrada y la persona tiene `catalog.manage`, ofrecer «Registrar red». |
| Error      | «No pudimos cargar las redes IPv4. Reintenta.» Conservar el router y estado seleccionados.                                                                |
| Sin acceso | «No tienes acceso al catálogo de redes IPv4.»                                                                                                             |

El formulario de alta solicita router, nombre, CIDR, gateway, inicio y fin asignables, exclusiones y método por defecto. La edición permite cambiar nombre, rango, exclusiones y método, pero no CIDR ni gateway. Respetar prefijos /16–/30 y límites de exclusiones del HLD. Asociar errores de validación al campo correspondiente y conservar los valores válidos.

## 5. Bandeja de aprovisionamiento

**Tarea:** localizar OT en ejecución, servicios sin aprovisionar e instalaciones ejecutadas cerradas sin aprovisionar. Ruta prevista: `app/dashboard/network/provisioning/`. Requiere `network.provisioning.read`.

La bandeja usa las tres colas que define `ProvisioningInboxQueue`; la pestaña activa es el filtro `queue` del endpoint. La paginación usa `page` y `limit` de `ListResponse`. El contrato no define búsqueda textual u otros filtros remotos para este endpoint, así que no se promete un control de búsqueda adicional.

| Pestaña visible           | Cola del contrato      | Acción propia                                                                                                     |
| ------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| En ejecución              | `IN_EXECUTION`         | Abrir la OT para revisar o iniciar una reserva según permisos.                                                    |
| Sin aprovisionar          | `FAILED`               | Abrir la OT y revisar el servicio fallido.                                                                        |
| Cerradas sin aprovisionar | `CLOSED_UNPROVISIONED` | Ofrecer «Regularizar» solo con `network.provisioning.regularize`; la acción abre el formulario de regularización. |

Las filas usan únicamente datos de `ProvisioningInboxRowDto`: número y estado de OT, nombre visible del suscriptor proveniente de `customer_display_label`, técnico asignado, estado del servicio, IP, fecha de actualización y, cuando corresponda, fecha de cierre. Para «Sin aprovisionar», traducir `CLOSED_WITHOUT_CERTIFICATION` como «Cerrada sin certificar». Un técnico no accede a la bandeja.

| Estado     | Presentación y acción                                                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cargando   | Skeleton de filas y pestañas operables por teclado; anunciar la carga de la pestaña seleccionada.                                                                                        |
| Vacío      | Mensaje contextual: «No hay instalaciones en ejecución pendientes», «No hay servicios sin aprovisionar» o «No hay instalaciones cerradas pendientes». Conservar la pestaña seleccionada. |
| Error      | «No pudimos cargar esta lista. Reintenta.» No vaciar ni cambiar de pestaña por un fallo transitorio.                                                                                     |
| Sin acceso | «No tienes acceso a la bandeja de aprovisionamiento.» No mostrar filas ni datos parciales.                                                                                               |

Las pestañas anuncian nombre y selección; no codifican el estado solo con color. La paginación conserva la cola activa y el usuario puede volver a una página anterior con la navegación del portal.

## 6. Panel de aprovisionamiento en la OT

### Vista de Aprovisionamiento

Quien tiene `network.provisioning.read` recibe `ProvisioningOrderContextDto`. Presentar el número y estado de la OT, persona técnica asignada, etiqueta del suscriptor, plan y velocidades disponibles, contrato elegido, equipo instalado y evidencias PHOTO/DOCUMENT de esa OT. Mostrar `suggestedQueueName` solo como dato de instrucción y sin exponer identificadores técnicos innecesarios.

Con `network.provisioning.execute`, el flujo de reserva permite seleccionar router, red, IP automática o IP manual y método/parámetros soportados; el contrato puede ser opcional según el HLD. Si no hay equipo instalado asociado a la OT, indicar que la instrucción se generará sin esos datos y que debe revisarse antes de aplicarla. Tras reservar, mostrar la instrucción manual del router en un bloque legible y copiable; anunciar el resultado sin asumir que el router fue configurado automáticamente.

La certificación requiere permiso `network.provisioning.certify`, servicio reservado, OT en ejecución, técnico asignado distinto de quien certifica y una evidencia elegible. Mostrar el selector entre evidencias de la OT. Si `canCertify` es falso, no mostrar la acción de certificar y explicar el requisito que falta cuando pueda determinarse por los datos visibles. La liberación de una reserva requiere `network.provisioning.execute`; liberar un servicio certificado requiere además `network.provisioning.certify` y motivo.

| Estado                | Presentación y acción                                                                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cargando              | Skeleton del resumen de OT y panel; impedir acciones hasta recibir el contexto.                                                                                                                           |
| Sin aprovisionamiento | Con `provisioning: null`, indicar «Esta orden todavía no tiene un servicio técnico reservado». Ofrecer «Reservar dirección IP» solo si la persona tiene permiso y la OT cumple las condiciones del flujo. |
| Error                 | «No pudimos cargar el aprovisionamiento de esta orden. Reintenta.» En un error de guardado, conservar la selección y permitir revisar el motivo.                                                          |
| Sin acceso            | Para una persona sin permiso de lectura, «No tienes acceso al aprovisionamiento de esta orden». Para un técnico no asignado a la OT, no revelar datos de la orden.                                        |

### Regularización desde «Cerradas sin aprovisionar»

La acción aparece solo con `network.provisioning.regularize`. El formulario recoge OT, router, red, IP manual opcional, método y parámetros, contrato opcional y motivo (10–500 caracteres, sin espacios sobrantes). Explicar que la OT debe ser una instalación cerrada como ejecutada, tener técnico asignado y que la persona que regulariza debe ser distinta del técnico asignado. Al guardar, mostrar el resultado como activo y la instrucción manual que devuelve la respuesta; no afirmar que la configuración del router se aplicó automáticamente. Si faltan condiciones, mantener el formulario y presentar el mensaje específico de la sección 9.

### Vista de técnico asignado

El técnico asignado consulta solo `TechnicianProvisioningViewDto`, construido desde cero por el servidor. Mostrar estado del servicio, IP, indicador textual «Certificado» / «Pendiente» y fecha de actualización. Con `status: null` e `ip: null`, explicar que aún no hay reserva. No presentar catálogo, plan, contrato, datos del equipo instalado, evidencia, instrucción, bandeja, botón de certificación ni datos de otro suscriptor.

Si está cargando, mostrar un bloque de estado simple. Si no existe aprovisionamiento, mostrar el estado vacío descrito. Ante error, permitir reintentar sin filtrar respuesta técnica. Si el servidor deniega la OT porque la persona no está asignada, mostrar «No tienes acceso a esta orden» sin confirmar otros datos.

## 7. Sección «Servicio técnico» de la ficha del suscriptor

La sección vive en «Servicios» y solo se monta para quien tenga `network.provisioning.read`. Presenta los servicios del más reciente al más antiguo usando `ServiceProvisioningDto`: IP, router, red, método traducido, equipo instalado (número de serie y dirección MAC si existen), estado visible, persona que certificó y fecha, y activación comercial. Para un servicio regularizado muestra «Regularizado», `regularizedBy.name`, fecha y motivo. Si el nombre del actor es `null`, usar «Nombre no disponible»; nunca mostrar el UUID como sustituto.

Si la activación comercial está pendiente, mostrar «Activación comercial pendiente» y el detalle contractual: «Falta teléfono o correo de contacto» (`CONTACT_REQUIRED`), «Faltan datos fiscales» (`FISCAL_INCOMPLETE`) o «No hay un expediente asociado» (`NO_EXPEDIENTE`). No convertir estos estados en un error del servicio de red.

Si no hay servicios, indicar «Este suscriptor todavía no tiene servicios técnicos registrados». En carga, usar skeleton; ante error, «No pudimos cargar los servicios técnicos. Reintenta». Sin permiso, la sección no se monta según HLD §9; en acceso directo denegado, usar «No tienes acceso a esta información». No incluir documento ni teléfono del suscriptor en esta sección ni en mensajes de error.

## 8. Requisito al cerrar una OT

En el cierre de una OT de instalación, mostrar el requisito «Aprovisionamiento certificado» y su estado. Si está pendiente y `enforceProvisioningOnInstallClose` está encendido, mantener visible el faltante y ofrecer volver al panel para revisar el aprovisionamiento. El cierre `NOT_EXECUTED` no exige certificación.

Si el API responde `CLOSURE_GATE_INCOMPLETE`, mostrar «No puedes cerrar esta instalación todavía. Falta completar el aprovisionamiento certificado.» y un enlace/botón «Revisar aprovisionamiento». Conservar el formulario de cierre y anunciar el error; no representar el intento fallido como cierre exitoso.

## 9. Mensajes de error

Mostrar el mensaje de producto, nunca la clave del código, SQL, excepción ni contenido técnico del evento. En errores de campo, asociar el mensaje al campo y mover el foco al resumen o primer campo inválido según el patrón accesible existente. Para conflictos de versión, conservar la entrada y pedir actualizar antes de reintentar.

| Código del HLD                       | Mensaje visible y siguiente paso                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `NETWORK_POOL_EXHAUSTED`             | «Esta red no tiene direcciones libres. Elige otra red o revisa su rango y exclusiones.»                                 |
| `IP_OUTSIDE_RANGE`                   | «La dirección está fuera del rango asignable. Ingresa una dirección dentro del rango de la red.»                        |
| `IP_IS_GATEWAY`                      | «La dirección corresponde a la puerta de enlace y no se puede asignar. Elige otra.»                                     |
| `IP_EXCLUDED`                        | «La dirección está excluida de esta red. Elige otra.»                                                                   |
| `IP_IN_USE`                          | «La dirección ya está en uso. Actualiza la disponibilidad o elige otra.»                                                |
| `NETWORK_OVERLAP`                    | «El rango se superpone con otra red registrada. Revisa el CIDR antes de guardar.»                                       |
| `NETWORK_NOT_IN_ROUTER`              | «La red seleccionada no pertenece a este router. Elige una red asociada al router.»                                     |
| `CONTROL_METHOD_NOT_SUPPORTED`       | «Este router no admite el método seleccionado. Elige uno de los métodos disponibles.»                                   |
| `CONTRACT_NOT_OF_SUBSCRIBER`         | «El contrato no corresponde a este suscriptor. Revisa la selección.»                                                    |
| `PROVISIONING_ORDER_NOT_ELIGIBLE`    | «Esta orden no cumple las condiciones para esta acción. Revisa su estado y tipo.»                                       |
| `PROVISIONING_TECHNICIAN_REQUIRED`   | «Asigna un técnico a la orden antes de reservar, certificar o regularizar. Actualiza la orden y vuelve a intentarlo.»   |
| `PROVISIONING_CERTIFIER_IS_EXECUTOR` | «La persona que certifica debe ser distinta del técnico asignado. Solicita la certificación a otra persona autorizada.» |
| `PROVISIONING_EVIDENCE_REQUIRED`     | «Selecciona una foto o un documento adjunto a esta orden para certificar el servicio.»                                  |
| `PROVISIONING_STATE_INVALID`         | «El servicio cambió y esta acción ya no está disponible. Actualiza la información y revisa su estado.»                  |
| `PROVISIONING_ALREADY_ACTIVE`        | «Esta orden ya tiene un servicio activo. Revisa el servicio registrado antes de continuar.»                             |
| `VERSION_CONFLICT`                   | «El registro cambió mientras lo editabas. Actualiza la información y vuelve a aplicar tus cambios.»                     |

Los códigos de `NETWORK_INBOX_ERROR_CODES` se almacenan como códigos técnicos de procesamiento y no son campos de `ProvisioningInboxRowDto`; no se presentan como errores de fila. El detalle técnico sigue las reglas del HLD §6.3 y R14.

## 10. Responsive y accesibilidad

| Ancho de referencia | Comportamiento esperado                                                                                                                                                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 375 px              | Priorizar una tarea por vista. Formularios en una columna; tablas dentro de su propio contenedor o presentadas con el patrón móvil existente. Mantener filtros, acciones primarias y estados visibles, sin scroll horizontal de toda la página. Pestañas operables y alcanzables. |
| 768 px              | Formularios en una o dos columnas cuando haya espacio; tabla en su contenedor, con columnas secundarias accesibles sin perder la acción principal ni el estado.                                                                                                                   |
| 1280 px             | Tabla operativa completa con paginación, filtros y acciones a la vista; panel OT con resumen y acciones ordenados por prioridad.                                                                                                                                                  |

En los tres anchos, en tema claro y oscuro:

- cumplir contraste WCAG AA, foco visible y operación por teclado;
- usar nombres accesibles para botones, campos, pestañas, paginación y barra de ocupación;
- mantener mensajes de carga, vacío, error y éxito disponibles para tecnologías de asistencia;
- no depender solo del color para estado, ocupación, permiso o selección;
- conservar el orden de lectura y el foco al cambiar de pestaña, abrir/cerrar drawers o recibir errores;
- respetar movimiento reducido y evitar animaciones que no aporten a la acción.

La spec define criterios de aceptación; la conformidad efectiva de las pantallas debe comprobarse en F1/F2 sobre la UI implementada, con teclado y revisión de contraste además de herramientas automáticas.

## 11. Trazabilidad de aceptación

| Criterio               | Evidencia de UX requerida                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-NET-12              | Las acciones de catálogo solo aparecen con `network.catalog.manage`; el endpoint denegado se refleja en el estado sin acceso.                              |
| CA-NET-13              | La bandeja ofrece las tres pestañas del HLD como filtros de cola y paginación numerada; cada pestaña presenta sus estados vacíos y columnas contractuales. |
| CA-NET-14              | Panel de OT, bandeja y ficha mantienen identidad iWana, estados completos y criterios WCAG AA en 375, 768 y 1280 px, en claro y oscuro.                    |
| RF-NET-14              | La ficha muestra el nombre legible de quien certificó y cuándo; la identidad no se deriva del UUID.                                                        |
| R6 ter                 | Si falta técnico asignado, el mensaje guía a completar la asignación y no habilita reservar, certificar o regularizar.                                     |
| Proyección del técnico | La vista de técnico contiene únicamente los cinco campos de `TechnicianProvisioningViewDto`.                                                               |
