# Protección de datos personales — UX spec · Fase 1

**Versión:** 1.2  
**Fecha:** 2026-10-14  
**Estado:** Ratificada por AI-EM-ARCH el 2026-10-14, con la precisión de §17  
**Responsable de experiencia:** AI-PROD-UX  
**Contrato funcional:** ADR-094 + C-PRIV-API v1.2 (adenda A10–A21 sobre v1.1 y v1.0)  
**Destino de implementación:** AI-FE-PLATFORM, después de ratificación  
**Destino de verificación:** AI-SR-QA

## 1. Propósito y fuentes

Esta spec define la experiencia para recibir y atender solicitudes de las personas, probar autorizaciones, mostrar marcas y administrar los textos legales, los incidentes y el inventario declarativo. La tarea principal es que el equipo de privacidad pueda registrar una solicitud, reconocer el plazo y ejecutar el siguiente paso sin volver a capturar información que la pantalla ya conoce.

Fuentes: [AGENTS.md](../../AGENTS.md), [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md), [plan de Fase 1 v1.2](../plans/2026-10-14-privacy-habeas-data-fase-1.md), [prompt v1.2](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.2.md), [prompt v1.1](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.1.md), [prompt v1.0](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.0.md), [ficha 360°](2026-09-04-mod05-subscriber-360-ux-spec.md), [dirección visual Firma iWana](2026-07-12-firma-iwana-diseno-visual-design.md), el [manual de identidad](../identity/Manual_Implementacion_Identidad_Iwana.md), el [perfil AI-PROD-UX](../roles/Perfil_IA_Product_Designer_UX_v1.md), el [protocolo multiagente](../roles/Protocolo_Colaboracion_Multiagente_v1.md) y los prototipos de expediente y sus secciones en `docs/prototipo/`.

No hay PRD ni HLD propios de `privacy`. Según la excepción del plan v1.2, ADR-094 y el prompt vigente son las fuentes funcional y técnica de esta fase. AI-EM-ARCH mantiene pendiente emitir `HLD-PRIVACY-v1.0` antes de G7.

Esta entrega congela la experiencia para revisión. La ratificación corresponde a AI-EM-ARCH; cualquier cambio posterior de flujo se versiona y se notifica a FE-PLATFORM y SR-QA.

## 2. Principios de experiencia

- La bandeja abre con filtros y solicitudes; no agrega tarjetas de conteos que el contrato no entrega.
- La acción frecuente **Radicar solicitud** está visible en la bandeja y disponible en la command palette. Desde una ficha 360° o un expediente, el contexto de la persona se conserva; no se vuelve a pedir su asociación.
- El detalle de una fila abre en side peek. Cerrar el panel devuelve a la misma página y conserva filtros.
- Los filtros de bandeja viven en la URL y se restauran al recargar o volver atrás.
- Se muestran primero el estado, el vencimiento y el siguiente paso. Los antecedentes, la respuesta y los eventos quedan en el detalle.
- Cada finalidad tiene una decisión de autorización independiente. Ninguna casilla inicia seleccionada.
- Las marcas aparecen junto a los datos de la persona, no solo en una sección administrativa.
- No se muestran enums, nombres internos de permisos, UUID ni identificadores opacos como texto de producto.

## 3. Navegación y permisos visibles

La superficie de trabajo se divide en **Solicitudes** y **Administración de privacidad**. La administración contiene Textos legales, Incidentes e Inventario de bases. El acceso visible depende de los permisos contractuales `privacy.read` y `privacy.manage`; en pantalla se expresan como tareas, nunca como claves de permiso.

La command palette ofrece las acciones frecuentes **Radicar solicitud**, **Abrir solicitudes**, **Administrar textos legales**, **Registrar incidente** y **Consultar inventario de bases**. Cada opción respeta el acceso de la cuenta. No se añade búsqueda de solicitudes: el contrato de la bandeja solo expone filtros por estado, tipo y vencimiento.

En la ficha 360° no se crea una pestaña nueva. Los paneles de autorizaciones y solicitudes viven dentro de la pestaña existente **Cumplimiento** (`?tab=cumplimiento`), junto a la actividad de cumplimiento ya definida por su spec.

## 4. Bandeja de solicitudes

### 4.1 Estructura

1. Título **Solicitudes de datos personales** y acción primaria **Radicar solicitud**.
2. Barra persistente con filtros por **Tipo**, **Estado** y **Vencimiento**. Los dos primeros usan `kind` y `status`; vencimiento usa `dueWithinDays`. El filtro por plazo puede limitarse a **En los próximos 2 días hábiles**, enviando `dueWithinDays=2`; no se inventa un filtro de texto ni uno de persona.
3. Tabla paginada según ADR-065, con estas columnas derivadas únicamente de `RequestSummary`: tipo y derecho; finalidad (si existe); estado; fecha de recibo; fecha límite. El modo de paginación lo declara el servidor. Página, tamaño y filtros se guardan en la URL; al cambiar un filtro se vuelve a la primera página.
4. Cada fila abre el side peek. No se muestra identidad, contacto, evidencia, `partyId` ni UUID en la tabla.

### 4.2 Semáforo de vencimiento

El semáforo toma `isOverdue` y `dueAt` de `RequestSummary`; para expresar días calcula la distancia entre fechas civiles con C-CAL-1 en `America/Bogota`. No usa días calendario ni recalcula o modifica el plazo guardado por el servidor.

| Condición                            | Texto visible                                                                  | Tratamiento semántico                    |
| ------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------- |
| `isOverdue=true`                     | **Vencida**                                                                    | Error; texto e icono además del color    |
| Vence hoy o dentro de 2 días hábiles | **Vence hoy** / **Vence en N días hábiles**                                    | Atención; texto e icono además del color |
| Más de 2 días hábiles                | **En plazo**                                                                   | Estado neutro                            |
| Solicitud cerrada                    | Se muestra el estado de cierre; el plazo no se presenta como una tarea abierta | Estado de solo lectura                   |

Lima no representa urgencia ni vencimiento. La interfaz muestra `extendedUntil` como fecha extendida cuando exista; el texto no sustituye a `dueAt` ni oculta la fecha original.

### 4.3 Side peek de detalle

El panel muestra tipo, derecho, finalidad si corresponde, estado, fechas, respuesta y cronología de eventos. Las transiciones disponibles dependen del estado y no hay opción de reabrir una solicitud.

Los campos de identidad A1 —nombre, tipo y número de documento, contacto, método y constancia de verificación— solo se muestran a una cuenta con `privacy.manage`. Nunca aparecen en la bandeja, la ficha 360° ni los listados de suscriptores o expedientes. La cronología no presenta el `actor_id` opaco como nombre.

Cuando existe `requester_evidence_media_id`, el detalle indica **Evidencia adjunta** y ofrece **Ver evidencia** solo a una cuenta con `privacy.manage`. Al activarla se solicita la URL firmada bajo demanda; dura como máximo 300 segundos, se usa solo para abrir la evidencia y la aplicación no conserva el enlace en el estado guardado de la vista ni en listados. La respuesta usa `Cache-Control: no-store` y la consulta queda auditada sin PII. Si no hay archivo asociado, la acción no aparece.

Si la identidad sigue pendiente y la solicitud está **Recibida** o **Necesita información**, el detalle ofrece **Verificar identidad**. La verificación se registra una sola vez con el método y la evidencia que corresponda; al completarse, el sistema fija quién y cuándo la verificó. No se puede registrar información recibida para completar un requerimiento mientras la identidad siga pendiente.

## 5. Radicación y validación de la persona solicitante

### 5.1 Flujo

La radicación es un formulario contextual en una sola página con secciones progresivas. Al escoger el tipo, se muestran solo los campos que aplican. En pantalla estrecha, las secciones siguen la gramática de tres estados de Firma iWana (actual, completada, pendiente) y no se convierten en una secuencia de pasos redundantes.

1. **Solicitud:** tipo (consulta, reclamo o reporte de suplantación), derecho y, solo si el derecho es retirar una autorización, finalidad. `receivedAt` toma la fecha civil de hoy; no se solicita de nuevo salvo que se esté registrando un recibo anterior permitido por el contrato. El reporte de suplantación se inicia desde la ficha 360° de la persona titular y conserva su vínculo.
2. **Persona solicitante:** clase de solicitante, nombre, tipo y número de documento y correo o dirección para responder, según A1. Si se inicia desde la ficha 360° de la misma persona, se conserva `partyId` y pueden precargarse los datos ya disponibles para ese titular; el operador los confirma. Para un causahabiente, representante o apoderado se capturan los datos de quien presenta la solicitud. No se muestra un control para escribir o copiar UUID.
3. **Verificación:** en una consulta o reclamo se puede elegir un método de verificación o **Verificar después**. Si se adjunta evidencia, el método es obligatorio; en un reporte de suplantación, el método se exige desde la radicación. Los tipos de archivo son PDF, JPEG, PNG y WEBP, hasta 10 MiB, según A9/A16. Al verificar, el actor y la fecha los registra el sistema; no son campos editables. Una consulta o reclamo sin verificar se radica igual, con plazo desde `received_at`, y puede verificarse después desde el detalle. No se permite completar un requerimiento con identidad pendiente.
4. **Contratos impugnados** (solo suplantación): se eligen entre 1 y 20 contratos de la sección **Contratos** en **Servicios** de esa ficha 360°. No se solicita escribir identificadores. Sin contratos impugnados, el caso se radica como reclamo, según A17.
5. **Confirmación:** resumen legible de tipo, derecho, finalidad si aplica, solicitante, contratos elegidos si es suplantación y archivo adjunto. Antes de enviar, se pueden corregir errores de campo.

La evidencia de la solicitud se carga mediante el uso restringido `privacy_evidence`. La carga no vuelve obligatorio adjuntar un archivo si el método elegido no lo requiere. Para datos precargados se evita pedirlos de nuevo, pero la cuenta confirma que la persona solicitante coincide con la persona titular antes de enviar.

### 5.2 Campos y validación

- El tipo de solicitante corresponde a titular, causahabiente, representante o apoderado; sus nombres visibles son legibles y no se exponen enums.
- El tipo de documento conserva el catálogo existente de `DocumentTypeParty`, con rótulos visibles en español. No se crea un catálogo alterno.
- El número de documento y el contacto se muestran enmascarados al volver a consultar un registro, excepto en el detalle autorizado de gestión. Nunca se copian al listado, URL, notificación o auditoría visible.
- En consulta y reclamo, la verificación es opcional al radicar; si se aplaza, el estado permite identificar que falta y el detalle ofrece **Verificar identidad** en **Recibida** o **Necesita información**. La acción fija una sola vez el método, fecha y cuenta que verificó.
- El método es obligatorio si se adjunta evidencia y al radicar una suplantación. La suplantación se inicia desde la ficha 360° y requiere seleccionar contratos impugnados de esa persona.
- La finalidad es obligatoria únicamente para **Revocar una autorización** y no se pregunta para otros derechos. Las finalidades se muestran con la descripción de §11, no con su clave técnica.
- Errores junto al campo; validación en blur; al enviar, foco al primer campo inválido y resumen con enlaces a los campos cuando haya más de uno. No se borran los datos válidos al corregir un error recuperable.

### 5.3 Copy de confirmación

- Radicación ordinaria: **Solicitud registrada** / **La solicitud quedó en la bandeja con su fecha límite.**
- Suplantación: **Reporte de suplantación registrado** / **La respuesta confirma N contratos impugnados suspendidos. Revisa la sección Contratos en Servicios y las tareas pendientes a continuación.** El número N se deriva de `suspendedContractIds.length`; no se exponen UUID ni se inventan nombres o números de contrato.
- Si una operación falla, se indica que no quedó registrada y se ofrece reintentar. No se muestra como suspendido ningún contrato que no venga confirmado por la respuesta.

## 6. Transiciones y plantillas de respuesta

Las plantillas son textos iniciales editables para el campo contractual `responseText` o `reason`; no reemplazan la revisión del operador ni añaden campos.

| Acción visible                     | Cuerpo contractual                                                             | Comportamiento y validación                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pedir información**              | `missingItems` (máx. 1.000 caracteres) y canal                                 | Solo cuando la solicitud está radicada o incompleta. La interfaz muestra la fecha límite de cinco días hábiles desde el recibo.                                            |
| **Registrar información recibida** | `completedAt` opcional; por defecto, fecha civil de hoy                        | Solo si la identidad está verificada. Al completar un reclamo se muestra la marca **Reclamo en trámite** y la nueva fecha límite.                                          |
| **Solicitar prórroga**             | `reason` (máx. 1.000 caracteres)                                               | Solo una vez y antes del cierre. El sistema calcula y muestra la nueva fecha: cinco días hábiles para consulta u ocho para reclamo. No se pide fecha manual.               |
| **Responder y cerrar**             | `responseText` (máx. 4.000), canal y `dataChangeReference` opcional (máx. 200) | En ACTUALIZAR o RECTIFICAR se ofrece la referencia del cambio realizado en CRM; en otros derechos no se muestra.                                                           |
| **Indicar que no procede**         | `responseText`, canal y fundamento legal                                       | El fundamento “Otro” requiere explicar la razón en la respuesta. Se muestran el deber de conservación, el deber contractual y la falta de legitimación con lenguaje claro. |
| **Trasladar**                      | Destinatario (máx. 200), motivo (máx. 1.000) y canal                           | La interfaz recuerda el plazo de dos días hábiles. No permite cambiar la fecha calculada.                                                                                  |

Los canales se presentan como **Correo electrónico**, **Correo físico**, **Entrega presencial** y **Portal de la empresa**. El canal queda al lado de la respuesta antes de confirmar. La pantalla distingue la respuesta guardada de la notificación efectivamente enviada; no afirma un envío que la API no confirme.

Las plantillas cubren consulta, reclamo, suplantación, requerimiento de información, prórroga, respuesta, no procedencia y traslado. Cada texto puede editarse antes de enviar. La confirmación muestra la consecuencia y el canal. Las acciones de cierre requieren una revisión deliberada y no tienen opción de deshacer.

### 6.1 Reglas R1–R6 presentadas en la interfaz

- **R1:** al completar un reclamo aparece la marca **Reclamo en trámite** en su detalle y en las superficies de la persona. No se ofrece un botón manual para abrirla. Si la identidad sigue pendiente, **Verificar identidad** está disponible mientras el estado sea **Recibida** o **Necesita información**; **Registrar información recibida** exige identidad verificada.
- **R2:** la solicitud incompleta cambia a **Cerrada por falta de respuesta** al cumplirse dos meses calendario desde el requerimiento sin subsanar. La bandeja la presenta como cerrada, sin botón para reabrir.
- **R3:** una revocatoria de prestación del servicio puede mostrarse como no procedente cuando hay contrato abierto o plazo de conservación vigente. Se presenta el fundamento recibido y el operador puede comunicar la decisión; el sistema no ofrece anular el deber de conservación. Retirar autorización de ofertas se presenta como procedente conforme a ADR-094.
- **R4:** una solicitud de eliminación que no procede por conservación muestra la razón y la marca **Datos restringidos por conservación**. La UI no agrega una operación de bloqueo o desbloqueo en esta fase.
- **R5:** la radicación de suplantación confirma la marca, los contratos suspendidos devueltos y las dos tareas de A2. La fecha para denunciar se rotula siempre **Fecha estimada para presentar la denuncia**.
- **R6:** la persona usuaria ve el historial útil de la solicitud, pero la UI y las notificaciones nunca muestran PII en eventos de auditoría.

### 6.2 Tareas de suplantación

El detalle de la solicitud incluye **Seguimiento de suplantación**, con las tareas que devuelve el contrato:

| Tarea visible                                                     | Vencimiento                          | Cierre                                                                                                  |
| ----------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| **Suspender el cobro en el sistema de facturación de la empresa** | Inmediato, en la fecha de radicación | **Marcar como completada**, con nota. Antes de confirmar, se aclara que el cierre no se puede revertir. |
| **Entregar copia de los documentos de aprobación**                | Fecha límite de la solicitud         | **Marcar como completada**, con nota.                                                                   |

El estado se deriva de `doneAt`; la nota y la fecha de cierre quedan en el detalle. No se permite reabrir una tarea cerrada. El detalle de suplantación muestra la cantidad de contratos impugnados confirmados por `suspendedContractIds` y ofrece ir a **Contratos** dentro de **Servicios** en la ficha 360°; no presenta UUID ni inventa nombres o números de servicio.

## 7. Autorizaciones y prueba

### 7.1 Ficha 360° y listados

En **Cumplimiento**, el panel **Autorizaciones** muestra las finalidades y su evento vigente por persona, usando la fecha, el canal, la versión vinculada y el tipo de evento. La vigencia se deriva del último evento por persona y finalidad, como fija ADR-094 D2. Se muestran rótulos **Autorización vigente**, **Retirada** o **Autorización importada**; nunca `GRANT`, `REVOCATION` ni `LEGACY_IMPORT`.

La acción **Ver comprobante** solicita la prueba del registro seleccionado. La vista muestra la versión exacta del texto, su huella SHA-256 y la evidencia disponible mediante la URL firmada; la URL no se guarda ni se publica en listados. El enlace firmado dura como máximo 300 segundos y solo se obtiene por la ruta de privacidad autorizada.

Desde la ficha 360°, una cuenta con `privacy.manage` puede adjuntar evidencia al registrar una autorización nueva: carga el archivo por la acción de privacidad, y su `mediaId` se envía junto con la autorización. El archivo queda asociado al nuevo registro; una autorización ya guardada no se edita ni se reemplaza.

En la pestaña Cumplimiento, las solicitudes se resumen con `RequestSummary` sin PII: tipo, derecho, finalidad, estado, recibido, fecha límite, prórroga y vencimiento. Abrir una solicitud navega a su detalle, conservando contexto; el resumen no intenta mostrar nombre, documento ni evidencia.

### 7.2 Captura en alta y expediente

La captura ocurre en el flujo ya existente de alta o expediente, junto al propósito que explica por qué se usarán los datos. No crea una nueva pantalla paralela ni un consentimiento genérico que agrupe finalidades.

- Cada autorización tiene su casilla independiente, **vacía por defecto**, con texto legible antes de decidir y enlace/expansión accesible al texto completo.
- La captura consulta el texto actual de tipo `AUTORIZACION` mediante el contrato vigente; muestra su versión y contenido antes de aceptar, y vincula el registro a esa versión exacta. Si no hay texto publicado, bloquea la captura y ofrece ir a **Administración de privacidad → Textos legales** para publicar uno. No se sustituye silenciosamente el contenido que la persona está revisando.
- **Prestación del servicio** es necesaria para continuar el alta conforme a D2. **Ofertas y novedades** y **Datos biométricos** son opciones separadas; la opción biométrica se presenta solo cuando aplique y siempre es facultativa. La finalidad de centrales de riesgo no se incorpora a estos flujos de Fase 1, pues ADR-094 la ubica en Fase 3.
- El canal se toma de la superficie que realiza la captura y no se vuelve a pedir al usuario. Ninguna captura dentro del expediente, potencial o alta de CRM adjunta archivos; la evidencia de una autorización se carga desde la ficha 360°.
- Si la persona no otorga el tratamiento contractual, el alta no continúa y explica que se necesita para prestar y soportar el servicio. Rechazar una finalidad facultativa no bloquea el alta.
- Luego de guardar, aparece el propósito, la versión y la fecha del evento capturado. La prueba se puede abrir desde Cumplimiento.

La captura sigue la superficie existente: en el expediente o potencial usa el panel **Consentimientos** y registra la versión vigente; al convertir un expediente, sus autorizaciones se traspasan una sola vez sin volver a solicitarlas. El alta directa de una persona suscriptora solicita las autorizaciones en su formulario y exige la de prestación del servicio. Al crear un contrato para una persona ya suscriptora se comprueba que esa autorización siga vigente; si falta, se bloquea el alta con el mensaje correspondiente. Ninguno de estos recorridos de CRM permite adjuntar un archivo.

## 8. Marcas visibles

Las marcas activas se ubican junto al nombre o encabezado de la persona en:

- la ficha 360°, en las secciones donde se presenta información del titular;
- los listados de suscriptores;
- los listados de expedientes, únicamente en las filas vinculadas a una persona titular (Party). Un expediente o potencial sin ese vínculo no muestra marcas.

Se muestra texto e icono además del color y una explicación breve al abrir el detalle. Solo se presentan marcas vigentes; un evento de cierre retira el indicador activo. Las etiquetas visibles son **Reclamo en trámite**, **Reporte de suplantación activo** y **Datos restringidos por conservación**. No se muestra el enum ni un identificador de solicitud.

## 9. Administración de textos legales

El listado presenta tipo, versión, fecha de publicación y una huella abreviada con acción para copiar la huella completa. Al abrir una fila, un side peek permite leer el contenido íntegro, consultar su URL si existe y revisar la huella SHA-256.

La acción **Crear nueva versión** abre un formulario con tipo, versión, contenido y URL opcional. Antes de guardar se confirma la nueva versión y se aclara que queda inmutable; no hay acciones Editar o Eliminar. Una corrección requiere crear otra versión. El contenido completo conserva lectura por teclado, título y estructura accesible.

El listado presenta **Vigente** en la versión para la que `isCurrent` es verdadero. En los formularios de autorización se muestra el texto publicado más reciente de tipo autorización, con su versión y contenido. Si no existe una versión publicada, la captura queda bloqueada y ofrece ir a administrar textos legales. No se afirma que una versión esté aprobada.

## 10. Administración de incidentes

El listado distingue incidentes pendientes de reportar y ya marcados como reportados mediante `reportedAt`. En cada fila se muestra fecha de detección, fecha límite de reporte a la SIC, categorías afectadas y estado de reporte. La fecha límite procede de `sicReportDueAt` y se presenta como fecha civil en español de Colombia.

**Registrar incidente** solicita descripción y categorías afectadas conforme al DTO; la fecha de detección la fija el sistema. Ayuda visible: **Describe las categorías afectadas sin incluir nombres ni números de documento.** El plazo se muestra después de guardar.

Para un incidente pendiente se ofrece **Marcar como reportado**. La confirmación pide fecha civil de reporte y referencia externa (hasta 100 caracteres), como define A8. Al confirmar, la acción queda fija y auditada; no se ofrece editarla ni repetirla. El copy posterior dice **Marcado como reportado** y no asegura que iWana haya enviado la comunicación externa.

## 11. Inventario declarativo de bases

La vista **Inventario de bases** explica que la información sirve como referencia para que la empresa diligencie el Registro Nacional de Bases de Datos (RNBD). Se presenta una sección por cada `key` existente: Clientes, Personas interesadas, Proveedores y Usuarios del sistema.

Por base se muestran únicamente `categories`, `purposes`, `retention`, `hasSensitiveData`, `internationalTransfer` y `securityMeasures`; arriba se indica `generatedAt`. El dato `NO_DECLARADA` se traduce como **Transferencias internacionales: sin declaración registrada**. No se presenta como “sin transferencias”.

La vista declara **Inventario informativo; no contiene conteos de personas ni registros**. No agrega cifras, gráficas, importes ni acciones de edición. Las finalidades conocidas se traducen según §11; ninguna clave técnica se muestra cruda.

## 12. Estados, accesibilidad y responsive

- **Carga:** skeletons con forma de tabla, panel, formulario o lista, anunciados como ocupados; se usan si la carga supera el umbral visual definido por el sistema. No se vacía una tabla durante una actualización ni se usa spinner bloqueante.
- **Primera vez:** mensaje específico y acción donde el usuario puede iniciar el trabajo: **Aún no hay solicitudes** / **Cuando registres una solicitud, aparecerá aquí** / **Radicar solicitud**. Para textos legales e incidentes, sus vacíos iniciales incluyen **Crear nueva versión** y **Registrar incidente** respectivamente.
- **Sin resultados:** conserva los filtros y ofrece **Limpiar filtros**. No usa el mensaje de primera vez.
- **Error:** alerta recuperable que explica qué no se pudo cargar y ofrece **Reintentar**. Un error no se pinta como vacío.
- **Sin acceso:** estado informativo distinto a vacío, con una acción de pedir acceso a quien administra la empresa. No se muestran valores ni controles que la cuenta no puede usar.
- **Confirmación y fallo:** cada mutación informa qué quedó registrado, cuál es el siguiente paso y si se puede reintentar. Los cierres irreversibles advierten antes de confirmar.
- **Teclado y lector de pantalla:** orden de foco igual al orden visual; side peek gestiona foco, Escape cierra y el foco vuelve a la fila; encabezados de tabla semánticos; región de estado anuncia el cambio del vencimiento; errores asociados a sus campos; ninguna acción solo en hover.
- **WCAG 2.2 AA:** texto normal ≥4,5:1, texto grande y componentes gráficos ≥3:1, foco siempre visible, objetivos táctiles ≥44×44 px, información no dependiente solo del color, zoom y texto ampliado sin recorte. Validar contraste sobre tokens reales en tema claro y oscuro; no se definen colores ni tokens en esta spec.
- **Responsive:** en ancho reducido la tabla pasa a tarjetas con los mismos campos y acciones, sin scroll horizontal de página. Acciones de fila y formularios siguen disponibles por teclado y táctil.
- **Movimiento:** transiciones breves y no esenciales; respeta `prefers-reduced-motion`.
- **Fechas:** formato es-CO; plazos legales se cuentan y nombran en días hábiles, con fechas civiles en `America/Bogota`.

## 13. Vocabulario visible

| Valor contractual (no mostrar) | Texto de producto                                           |
| ------------------------------ | ----------------------------------------------------------- |
| `CONSULTA`                     | Consulta                                                    |
| `RECLAMO`                      | Reclamo                                                     |
| `SUPLANTACION`                 | Reporte de suplantación                                     |
| `CONOCER`                      | Conocer los datos                                           |
| `ACTUALIZAR`                   | Actualizar los datos                                        |
| `RECTIFICAR`                   | Corregir los datos                                          |
| `SUPRIMIR`                     | Eliminar los datos                                          |
| `REVOCAR`                      | Retirar una autorización                                    |
| `PRUEBA_AUTORIZACION`          | Solicitar copia de una autorización                         |
| `INCUMPLIMIENTO`               | Reportar un incumplimiento                                  |
| `TRATAMIENTO_CONTRACTUAL`      | Prestación del servicio, facturación y soporte              |
| `CONTACTO_COMERCIAL`           | Ofertas y novedades                                         |
| `REPORTE_CENTRALES_RIESGO`     | Reporte a centrales de riesgo                               |
| `DATOS_BIOMETRICOS`            | Datos biométricos                                           |
| `RADICADA`                     | Recibida                                                    |
| `INCOMPLETA`                   | Necesita información                                        |
| `DESISTIDA`                    | Cerrada por falta de respuesta                              |
| `EN_TRAMITE`                   | En trámite                                                  |
| `PRORROGADA`                   | Con plazo ampliado                                          |
| `RESUELTA`                     | Respondida                                                  |
| `NO_PROCEDENTE`                | No procede                                                  |
| `TRASLADADA`                   | Trasladada                                                  |
| `EMAIL`                        | Correo electrónico                                          |
| `CORREO_FISICO`                | Correo físico                                               |
| `PRESENCIAL`                   | Entrega presencial                                          |
| `PORTAL_ISP`                   | Portal de la empresa                                        |
| `DEBER_LEGAL_CONSERVACION`     | Deber legal de conservar la información                     |
| `DEBER_CONTRACTUAL`            | Obligación contractual vigente                              |
| `SOLICITANTE_NO_LEGITIMADO`    | La persona solicitante no está autorizada para este trámite |
| `OTRO`                         | Otro motivo (requiere explicación)                          |
| `RECLAMO_EN_TRAMITE`           | Reclamo en trámite                                          |
| `VICTIMA_FALSEDAD_PERSONAL`    | Reporte de suplantación activo                              |
| `DATOS_BLOQUEADOS`             | Datos restringidos por conservación                         |
| `POLITICA_TRATAMIENTO`         | Política de tratamiento de datos                            |
| `AVISO_PRIVACIDAD`             | Aviso de privacidad                                         |
| `AUTORIZACION`                 | Autorización para el uso de datos                           |

En la interfaz no aparece la palabra **ARCO**, claves enum, nombres internos de tablas, IDs de módulos ni etiquetas de permisos. Si un valor futuro no tiene etiqueta aprobada, se escala antes de mostrarlo; no se imprime su clave como salida de emergencia.

## 14. Criterios de aceptación

### Bandeja y detalle

- **CA-UX-PRIV-01** — La bandeja muestra Solicitudes de datos personales, filtros por tipo, estado y plazo, y la acción visible **Radicar solicitud**; no agrega un filtro de búsqueda no respaldado por la API.
- **CA-UX-PRIV-02** — Los filtros transmiten `kind`, `status` y `dueWithinDays`; permanecen en la URL y se restauran al recargar o volver atrás.
- **CA-UX-PRIV-03** — La tabla contiene solo campos de `RequestSummary`; no muestra datos personales, evidencia ni identificadores opacos.
- **CA-UX-PRIV-04** — El semáforo identifica vencidas, vencimiento de hoy/próximos dos días hábiles y solicitudes en plazo con texto e icono; `isOverdue` y el calendario C-CAL-1 gobiernan el cálculo.
- **CA-UX-PRIV-05** — Los filtros no borran la fila activa sin anunciar carga; al cambiar filtro, la paginación vuelve al inicio.
- **CA-UX-PRIV-06** — Primera vez, cero resultados por filtro, error y falta de permiso son estados visuales y accesibles distintos; el vacío filtrado permite limpiar los filtros.
- **CA-UX-PRIV-07** — Una fila abre el side peek y al cerrarlo conserva página y filtros. Campos de identidad aparecen solo con acceso de gestión.
- **CA-UX-PRIV-08** — Los estados y tipos se traducen con §13; ninguna pantalla final muestra los enums crudos.

### Radicación y atención

- **CA-UX-PRIV-09** — La radicación ofrece consulta, reclamo y reporte de suplantación, con campos condicionales al tipo/derecho.
- **CA-UX-PRIV-10** — `receivedAt` se precarga con la fecha civil de hoy y no se pide si el sistema ya conoce la fecha contextual.
- **CA-UX-PRIV-11** — Si la radicación parte de la ficha 360° o expediente, conserva la persona relacionada; no solicita un UUID ni repite el vínculo.
- **CA-UX-PRIV-12** — El formulario solicita la identidad y contacto A1 y el tipo de solicitante. El método de verificación del catálogo A1 puede aplazarse en consulta y reclamo; es obligatorio si se adjunta evidencia y en suplantación. No agrega campos que el contrato no define.
- **CA-UX-PRIV-13** — El método, la fecha y la cuenta que verificó quedan vinculados al registro; no se puede pasar a atención sin `identity_verified_at` y `identity_verified_by`.
- **CA-UX-PRIV-14** — La carga de evidencia acepta PDF, JPEG, PNG o WEBP hasta 10 MiB y la trata con el uso restringido `privacy_evidence`.
- **CA-UX-PRIV-15** — `purpose` aparece y es obligatorio solo para retirar autorización; no aparece en otros derechos.
- **CA-UX-PRIV-16** — Los errores de validación quedan junto al campo, el foco va al primer error y el contenido válido se conserva.
- **CA-UX-PRIV-17** — Si existe evidencia de la solicitud, el detalle ofrece **Ver evidencia** solo con `privacy.manage`; solicita la URL firmada bajo demanda (máximo 300 segundos, `no-store`), no la persiste y registra la consulta sin PII. La acción no aparece si no hay evidencia.
- **CA-UX-PRIV-18** — La confirmación de suplantación cuenta los contratos de `suspendedContractIds`, no expone IDs y no afirma suspensión si la respuesta no los confirma.
- **CA-UX-PRIV-19** — Las dos tareas de A2 se muestran con su vencimiento, estado derivado de `doneAt` y nota; cerrar una advierte que no puede reabrirse.
- **CA-UX-PRIV-20** — La fecha de denuncia se presenta literalmente como **Fecha estimada para presentar la denuncia** y se muestra como fecha civil local.
- **CA-UX-PRIV-21** — Cada una de las seis transiciones muestra solo los campos de A5, sus límites definidos y el canal legible; no expone claves enum.
- **CA-UX-PRIV-22** — La prórroga requiere motivo, no deja elegir una fecha, muestra una única prórroga y presenta la fecha calculada por el servidor.
- **CA-UX-PRIV-23** — Resolver o indicar que no procede requiere la respuesta y el canal; cambios ACTUALIZAR/RECTIFICAR permiten `dataChangeReference`; “Otro” exige explicación.
- **CA-UX-PRIV-24** — Las plantillas son editables antes del envío y la confirmación distingue respuesta guardada de mensaje efectivamente enviado.
- **CA-UX-PRIV-25** — R1, R2, R3 y R4 se presentan en los estados descritos en §6.1, sin acciones de bloqueo, desbloqueo o reapertura fuera de alcance.
- **CA-UX-PRIV-26** — Los eventos de la interfaz y sus anuncios no incluyen PII; no se muestra el `actor_id` como nombre.

### Autorizaciones y marcas

- **CA-UX-PRIV-27** — Autorizaciones y solicitudes aparecen dentro de Cumplimiento de la ficha 360°, sin crear una pestaña nueva.
- **CA-UX-PRIV-28** — El resumen 360° solo usa `RequestSummary` y no muestra PII del solicitante.
- **CA-UX-PRIV-29** — La autorización vigente se deriva del último evento por persona y finalidad; el historial traduce GRANT/REVOCATION/LEGACY_IMPORT a lenguaje de producto.
- **CA-UX-PRIV-30** — La prueba muestra versión exacta, SHA-256 y evidencia mediante URL firmada obtenida bajo demanda; nunca deja el enlace firmado persistido o visible en la tabla.
- **CA-UX-PRIV-31** — La captura en alta y expediente presenta finalidades separadas, casillas no premarcadas y el texto exacto de la versión vinculada.
- **CA-UX-PRIV-32** — La prestación del servicio es requerida conforme a D2; contacto comercial y biometría se deciden por separado, la biometría es facultativa y centrales de riesgo queda fuera de Fase 1.
- **CA-UX-PRIV-33** — El canal se obtiene del contexto de captura; el usuario no vuelve a ingresarlo.
- **CA-UX-PRIV-34** — Las marcas activas aparecen junto a la persona en ficha 360°, listados de suscriptores y filas de expedientes vinculadas a un Party; un expediente sin vínculo no muestra marcas. Cerrar una marca retira su indicador activo.
- **CA-UX-PRIV-35** — Cada marca presenta texto e icono además del color y usa los nombres visibles definidos en §8.

### Administración

- **CA-UX-PRIV-36** — La administración de textos lista tipo, versión, fecha, huella y contenido; crear una versión nueva no ofrece editar ni eliminar las anteriores.
- **CA-UX-PRIV-37** — La acción para crear texto respeta campos y límites del DTO, permite URL opcional y muestra antes de guardar que el registro será inmutable.
- **CA-UX-PRIV-38** — Un incidente muestra su fecha límite SIC; registrarlo usa descripción y categorías y no pide fecha de detección al usuario.
- **CA-UX-PRIV-39** — **Marcar como reportado** solicita fecha civil y referencia externa de hasta 100 caracteres, solo se ofrece una vez y el mensaje posterior no asegura un envío desde iWana.
- **CA-UX-PRIV-40** — El inventario muestra las cuatro bases del contrato, todos sus campos declarativos y fecha de generación; no muestra conteos ni datos de personas.
- **CA-UX-PRIV-41** — `NO_DECLARADA` se representa como **Sin declaración registrada**, no como ausencia confirmada de transferencias internacionales.

### Accesibilidad e identidad

- **CA-UX-PRIV-42** — Todos los recorridos son operables por teclado, mantienen foco visible y retorno de foco desde side peek; los controles alcanzan 44×44 px.
- **CA-UX-PRIV-43** — Contraste WCAG 2.2 AA se verifica sobre tokens reales, en claro y oscuro; ningún estado depende solo del color y lima no representa urgencia.
- **CA-UX-PRIV-44** — En pantalla estrecha los listados usan presentación en tarjetas sin scroll horizontal de página; no se pierde ninguna acción de fila.
- **CA-UX-PRIV-45** — Carga usa skeleton con forma; vacío inicial y vacío filtrado son distintos; errores son recuperables; movimiento respeta `prefers-reduced-motion`.
- **CA-UX-PRIV-46** — La spec, copies y cualquier fixture de implementación se mantienen libres de PII real y de ejemplos identificables.

### Adenda v1.2

- **CA-UX-PRIV-47** — Consulta y reclamo pueden radicarse con **Verificar después**; el plazo empieza al radicar. Si la identidad no está verificada, el detalle muestra **Verificar identidad** solo en **Recibida** o **Necesita información**. Registrar información recibida sigue exigiendo verificación.
- **CA-UX-PRIV-48** — El reporte de suplantación se inicia desde la ficha 360° y conserva la persona vinculada; permite seleccionar de 1 a 20 contratos impugnados de su lista en **Servicios → Contratos**. No solicita UUID manuales; sin contratos impugnados se tramita como reclamo. El detalle muestra la cantidad confirmada y enlaza a esa sección.
- **CA-UX-PRIV-49** — Textos legales marca **Vigente** únicamente si `isCurrent` es verdadero. La captura muestra versión y contenido del texto publicado actual de tipo autorización; sin texto publicado, bloquea la captura y enlaza a Textos legales.
- **CA-UX-PRIV-50** — La captura usa Consentimientos del expediente/potencial y se traspasa en la conversión sin volver a pedirla; el alta directa solicita las autorizaciones y el alta de contrato comprueba la vigencia de prestación del servicio. Ninguna captura de CRM adjunta archivos.
- **CA-UX-PRIV-51** — La evidencia puede cargarse en la radicación y desde la ficha 360° con acceso de gestión, en PDF, JPEG, PNG o WEBP hasta 10 MiB. Desde la ficha se asocia al registrar una autorización nueva; no modifica registros anteriores.
- **CA-UX-PRIV-52** — Los listados de expedientes muestran marcas solo en filas vinculadas a un Party; prospectos y expedientes sin vínculo no presentan marcas.

## 15. Deudas y límites contractuales

Las deudas de v1.1 sobre lectura de evidencia de solicitudes y selección del texto legal quedan resueltas por A11 y A14. Permanecen estos límites de Fase 1:

1. **P3 — Nombre de contrato en el detalle de suplantación:** la respuesta identifica los contratos por sus IDs. La confirmación muestra la cantidad y ofrece ir a **Servicios → Contratos** de la ficha 360°; exponer nombres o números en el detalle requeriría una proyección contractual posterior.
2. **P3 — Limpieza de evidencias huérfanas:** los archivos cargados que no quedan asociados a una solicitud o autorización no se limpian en esta fase. La limpieza queda para la Fase 2, según A16.

## 16. Fuera de alcance

Implementación de UI, tokens, paleta, tipografía o API de componentes; endpoints o campos nuevos; formulario público (Fase 2); envío externo de reportes; conteos del inventario; automatización de retención/bloqueo (fases posteriores); centrales de riesgo y Ley 2300 (Fase 3); aprobación legal de los textos de cada empresa. Esta spec queda pendiente de ratificación de AI-EM-ARCH.

## 17. Ratificación (AI-EM-ARCH, 2026-10-14)

**Ratificada** la v1.2 con sus 52 criterios. Las siete condiciones del prompt v1.2 §3 quedan trazadas a CA-17 y CA-47 a CA-52. Q7 implementa esta versión.

**Precisión por la adenda A22 del prompt v1.3.** Corrige un defecto del emisor; no cambia el flujo:
- **Trasladar** está disponible aunque la identidad siga pendiente: el traslado responde a la competencia, no a la identidad (Ley 1581 art. 15).
- **Indicar que no procede** está disponible con la identidad pendiente **solo** con el fundamento «La persona solicitante no está autorizada para este trámite». Con los demás fundamentos se exige la identidad verificada.

| CA | Criterio |
| --- | --- |
| **CA-UX-PRIV-53** | Con la identidad pendiente, el detalle ofrece Trasladar e Indicar que no procede. Este último limita el fundamento a la falta de legitimación y lo explica junto al campo |

**Precisión por A23 (prompt v1.3).**
- El detalle recibe `identityStatus`, `identityVerificationMethod`, `identityVerifiedAt` y `hasRequesterEvidence`.
- Los datos de identidad (`requester`) llegan solo con acceso de gestión.
- CA-13 se cumple mostrando el **método y la fecha** de verificación. La cuenta que verificó queda en la auditoría y no se muestra, por coherencia con CA-26.
- **Ver evidencia** aparece solo si `hasRequesterEvidence`.

**Precisión por A24 (prompt v1.3). Reemplaza CA-33 y corrige §7.2:**
- El **canal** es el medio por el que la persona otorgó o retiró la autorización, no la pantalla donde se registra.
- El operador lo elige una vez por acto de captura, en el expediente, el alta y la ficha 360°: **Teléfono**, **Presencial**, **Correo electrónico**, **Mensaje de texto** o **Mensajería instantánea**.
- La pantalla de origen no se pide ni se muestra como canal.

| CA | Criterio |
| --- | --- |
| **CA-UX-PRIV-33** (reemplazado) | Toda captura pide el medio con esos cinco rótulos, obligatorio y sin valor preseleccionado. La conversión conserva el medio original del expediente y no lo vuelve a pedir |
