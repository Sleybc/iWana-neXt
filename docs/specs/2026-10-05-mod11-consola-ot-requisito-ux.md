# Spec UX — MOD11: consola de OT por requisito y por momento

**Versión:** 1.3<br>
**Fecha:** 2026-10-06<br>
**Estado:** La línea base v1.1 conserva su estado **Aprobado — G2 cerrado por AI-EM-ARCH el 2026-10-05** (registro en el plan v1.2, §Registro de bloqueos — Ola 2). Las adendas de producto v1.2 (§14) y v1.3 (§14.2 y §15) fueron producidas por AI-PROD-UX y están **pendientes de verificación consolidada**; no han sido aprobadas por AI-EM-ARCH.<br>
**Productora:** AI-PROD-UX (prod-ux)  
**Alcance:** R0 de la consola + UX de E4 para OT sin ventana; adendas de producto §§14–15 para la deuda del historial de consumos R3 y la ratificación de copy R2.

## Trazabilidad y contratos de entrada

- Encargo: [PROMPT-MOD11-CONSOLA-OT-OLA2-R0-PROD-UX-v1.0](../prompts/PROMPT-MOD11-CONSOLA-OT-OLA2-R0-PROD-UX-v1.0.md), incluidas las adendas A1 y A2.
- Plan: [MOD11 consola OT, remediación v1.2](../plans/2026-09-14-mod11-consola-ot-remediacion.md).
- Diseño aprobado que ejecuta: [el requisito como eje v1.2](2026-09-14-mod11-consola-ot-requisito-como-eje-design.md), §§4.1–4.6 y 10.12.
- E4: [origen de la OT](2026-09-14-mod11-origen-ot-design.md), §3.5 y CA-12; ADR-091, §§D5 y D6.1.
- Plantilla: [acta de instalación](2026-09-14-mod11-acta-instalacion-design.md), §4.2; publicación INSTALACION_ESTANDAR v2 en la migración 131.
- Predecesora de bandeja: [UX de subrutas operativas](2026-09-13-mod11-operaciones-subrutas-bandeja-ot-ux.md).
- Copy de compromiso por rol y estado preservado: [informe OLA 1 prod-ux](../informes/INFORME-MOD11-CONSOLA-OT-OLA1-PROD-UX-v1.0.md) y apps/portal/src/components/operations/execution-order-commitment-copy.ts. En este diseño solo se reemplaza el copy de BLOQUEADA que dependía de un motivo no legible.

| Contrato consumido | Versión | Regla en R0 |
| --- | --- | --- |
| packages/shared/src/contracts/operations/execution-orders.ts | v1.4 según su historial publicado | Solo consume campos existentes; no se corrige su cabecera ni se amplía. |
| packages/shared/src/contracts/operations/execution-orders-completion.ts | v1 | El estado real por requisito gobierna el checklist; no se infiere cumplimiento desde el historial. |
| docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md | v1.1 | No se modifica en R0. R1 resuelve cómo compatibilizar su raya para ventana nula con la semántica de E4. |

## 1. Resultado de experiencia

La OT se lee como un expediente de trabajo: cada requisito reúne su estado, la razón del estado y la acción que puede satisfacerlo. El expediente cambia con el momento de trabajo. El detalle conserva el historial agrupado bajo el requisito que explica cada registro.

La interfaz muestra acciones solo cuando aparecen en allowedActions. El estado aporta contexto, no permisos. Ninguna decisión de acceso se deriva de un rol leído en el cliente, del responsable mostrado ni de una clave de plantilla.

La barra de avance, si se presenta, conserva la semántica de completion: cuenta requisitos obligatorios. La actividad opcional queda visible como opcional y no altera el avance ni bloquea el cierre.

## 2. Línea base observada

La implementación actual organiza el detalle en seis bloques planos —checklist, trabajo, materiales, evidencias y cierre, además del resumen— y mezcla consulta con captura. El checklist previo al inicio se atenúa, pero permanece montado. Al abrir una OT, el hook carga las colecciones de actividades, consumos, evidencias, inventario y custodia; la custodia queda como listado permanente. La evidencia se inicia desde un control global que elige el primer requisito EVIDENCE.

El copy promete arrastrar fotos o documentos, aunque el control no tiene manejadores de arrastre. El resumen y la celda de ventana dereferencian window.startAt sin tratar window nulo. La consulta de actividad vuelve a cargar más colecciones de las que la acción necesita. Estas son observaciones de la superficie actual; R0 no modifica código.

La lente de compromiso de OLA 1 ya se calcula con allowedActions. Su copy de inicio, progreso y cierre se conserva. Sus tres textos de bloqueo que piden revisar un motivo quedan sustituidos por la tabla de §5: no existe una fuente de lectura aprobada para mostrarlo.

## 3. Requisitos de INSTALACION_ESTANDAR v2

El orden y las etiquetas corresponden al snapshot v2 publicado. Las razones entre comillas son las que produce el evaluador hoy; se muestran solo cuando el estado no está satisfecho. No se sustituyen por claves internas ni se atribuyen verificaciones adicionales al requisito.

| Clave y requisito visible | Estado y razón al estar pendiente | Acción originada en el requisito | Copy de acción y criterio |
| --- | --- | --- | --- |
| installed-equipment — Equipos instalados en el sitio del cliente. MATERIAL obligatorio: categoría CPE y disposición INSTALLED_AT_CUSTOMER. | Cumplido o Pendiente. Razón pendiente: «No se ha registrado el material "Equipos instalados en el sitio del cliente".» | Registrar consumo con la categoría CPE. El registro debe cumplir la disposición que evalúa el requisito. Custodia solo se consulta al abrir este acto. | «Registrar equipo instalado». En el selector: «Selecciona un equipo de tu custodia». La etiqueta de resultado puede decir «Instalado en el sitio del cliente»; no se muestra el enum. |
| service-test — Prueba de servicio en el sitio. EVIDENCE PHOTO obligatorio. | Cumplido o Pendiente. Razón pendiente: «No se ha vinculado una foto para "Prueba de servicio en el sitio".» | Adjuntar foto con requirementKey service-test y evidenceType PHOTO. | «Añadir foto de la prueba de servicio». El copy acredita una foto vinculada a la prueba, no que el servicio funcione ni el resultado de una medición. |
| work-photo — Fotos del trabajo realizado. EVIDENCE PHOTO obligatorio. | Cumplido o Pendiente. Razón pendiente: «No se ha vinculado una foto para "Fotos del trabajo realizado".» | Adjuntar foto con requirementKey work-photo y evidenceType PHOTO. | «Añadir fotos del trabajo». Cada archivo guardado aparece en el historial de este requisito. |
| CUSTOMER_SIGNATURE — Acta de conformidad firmada por el cliente. EVIDENCE SIGNATURE obligatorio. | Cumplido o Pendiente. Razón pendiente: «No se ha vinculado una firma para "Acta de conformidad firmada por el cliente".» | Capturar firma en el navegador y subir el artefacto como evidenceType SIGNATURE y requirementKey CUSTOMER_SIGNATURE. | «Capturar firma del cliente». Guardar la captura produce el artefacto; la acción de cierre conserva el registro automático existente y lo referencia. |
| installation-activity — Registro de la actividad en bitácora (NO requerido). ACTIVITY opcional: activityType INSTALLATION. | Cumplido o «Sin registrar». Si se presenta la razón del evaluador: «No se ha registrado la actividad "Registro de la actividad en bitácora (NO requerido)".» | Registrar actividad con activityType INSTALLATION, solo si REGISTER_ACTIVITY está permitido. | «Registrar actividad». Ayuda fija: «Puedes dejar constancia de la instalación. Este registro es opcional y no bloquea el cierre.» |

La etiqueta de `installation-activity` se conserva literalmente desde el snapshot publicado. El «NO» en mayúsculas es una deuda de copy de la plantilla; corregirlo requiere publicar una v3 y queda fuera de este tramo.

### 3.1 Captura de firma en navegador

La acción se inicia dentro de CUSTOMER_SIGNATURE y abre una superficie temporal para que el cliente dibuje su firma en el navegador. La persona puede limpiar y volver a firmar, cancelar sin guardar o guardar la captura. Después de guardarla, el artefacto se carga como evidencia SIGNATURE con la clave CUSTOMER_SIGNATURE; el registro visible vuelve a la ficha de ese requisito. Un error de carga conserva la captura mientras la persona decide si reintenta o cancela.

La firma no ejecuta el cierre de la OT. El acto posterior de cierre conserva el registro automático existente y referencia el artefacto. La forma visual de la superficie, el lienzo y sus controles son materia de R1/G3; R0 no selecciona biblioteca ni dependencia.

El trazo libre es una entrada dependiente de la trayectoria y queda exceptuado por WCAG 2.1.1 (Teclado); la excepción aplica al trazo, no a las demás funciones de la superficie ([W3C, comprensión de SC 2.1.1](https://www.w3.org/WAI/WCAG22/Understanding/keyboard)). Las instrucciones se anuncian en el orden de lectura. Los controles «Limpiar», «Guardar firma» y «Cancelar» son operables por teclado, con foco gestionado y anuncios para lector de pantalla. No se ofrece un nombre escrito como evidencia `SIGNATURE`: no probaría lo que la etiqueta promete (ADR-088 §D4; `close()` exige `method = SIGNATURE`). La ausencia de una vía alternativa para quien no puede usar puntero queda como deuda de v1.

### 3.2 Contrato de lectura del checklist

- Cada fila conserva etiqueta del snapshot, obligatorio/opcional, estado textual, razón si está pendiente y acción si corresponde y está permitida.
- La razón no desaparece al abrir la acción; se mantiene asociada al requisito hasta que la lectura actualizada indique satisfacción.
- La presentación distingue el estado opcional pendiente del obligatorio pendiente. No se colorea ni se calcula de nuevo el resultado en el cliente.
- Si completion.requirements no llega, o falta la evaluación de una clave del snapshot, el estado es «Estado no disponible», no «Pendiente». La fila puede conservar la etiqueta y la descripción del snapshot; no se inventa una razón ni se abre una acción que la respuesta no autorice.
- FIELD y MEASUREMENT conservan la limitación de la spec base: se muestra la razón publicada y no se promete una vía de captura inexistente.

## 4. Expediente progresivo por momento

La estructura se ordena por requisito. No se mantienen las seis secciones siempre montadas ni se pliegan en acordeones.

| Momento | Ejecutor asignado | Ejecutor sin asignación que puede ver la OT | Supervisión |
| --- | --- | --- | --- |
| Pre-inicio: CREATED, ASSIGNED, EN_ROUTE | Resumen, ventana, compromiso y checklist de solo lectura. Si allowedActions contiene START, acción de inicio. No se monta captura ni se consulta custodia fuera del acto de consumo, que todavía no aplica. | En ASSIGNED/EN_ROUTE y solo si la orden se devuelve a esta persona, mismo resumen y checklist de lectura; las acciones aparecen únicamente por allowedActions. CREATED no forma parte del pool técnico y no se lista ni se abre para este rol. | Resumen y checklist de lectura. Acciones de coordinación como asignar, reasignar o seguimiento aparecen solo cuando allowedActions las ofrece. CREATED pertenece a esta bandeja de coordinación. |
| En progreso: IN_PROGRESS | Índice activo de requisitos. Cada acción permitida abre su acto junto al requisito; debajo se ven los registros que lo satisfacen. Cierre disponible solo si allowedActions contiene CLOSE. | Si una OT es visible para esta persona y allowedActions ofrece una acción, ve solo esa acción y su requisito; de lo contrario, no obtiene la superficie. No se deduce acceso de la ausencia de responsable. | Checklist e historial en lectura. Seguimiento solo si allowedActions lo ofrece. No se muestran controles de actividad, consumo, evidencia o cierre como editables. |
| Bloqueada: BLOCKED | Estado «Orden bloqueada», sin motivo. Resto del expediente en lectura. Si allowedActions incluye UNBLOCK, se conserva la disponibilidad real y se muestra «Desbloqueo no disponible» mientras no haya catálogo y ruta utilizables; no se crea una captura de motivo. | Misma regla cuando la orden sea accesible: estado sin motivo, lectura y acciones solo por allowedActions. No se presenta una OT CREATED al pool. | Estado sin motivo y expediente en lectura. CREATE_FOLLOW_UP puede mostrarse si allowedActions lo incluye. No se afirma que haya un motivo oculto ni una explicación consultable. |
| Cierre y terminal: estados terminales del contrato | Resultado, requisitos, evidencias y registros asociados en lectura; se conserva el copy de cierre OLA 1. Sin superficie de captura. | Si tiene acceso al detalle, mismo resultado de lectura; no se prometen acciones. | Resultado y expediente en lectura. Seguimiento solo si allowedActions lo permite. No se añade una acción de anulación. |

La matriz cubre 12 combinaciones. Para cualquier celda, allowedActions y status publicados son la fuente de las acciones; una combinación no autorizada se resuelve como «No tienes acceso a esta orden», sin exponer el detalle. Los estados de carga, error y conexión son transversales (§9).

### 4.1 Composición de cada expediente

1. Resumen de orden, responsable, estado y ventana planificada.
2. Compromiso por rol y momento, reutilizando el copy de OLA 1 excepto BLOQUEADA.
3. Lista de requisitos como índice de navegación. Cada requisito contiene estado, razón y acción aplicable.
4. Dentro de cada requisito: formulario de captura cuando el momento y allowedActions lo permitan; debajo, los registros que lo satisfacen. La captura y el historial son superficies distintas.
5. Cierre y resultado después de los requisitos, en modo de lectura cuando la orden sea terminal.

Una mutación se vincula visualmente al requisito que la originó. Registrar una actividad no crea una bitácora global separada del índice ni recarga seis colecciones.

## 5. Copy cerrado

Todo el texto visible usa español en sentence case. Estados y acciones se entienden por texto y no por color; no se renderizan enums crudos.

| Contexto | Título, estado o acción | Descripción o ayuda |
| --- | --- | --- |
| Obligatorio no satisfecho | «Pendiente» | Se muestra la razón publicada por el evaluador. |
| Obligatorio satisfecho | «Cumplido» | Sin razón pendiente. |
| Actividad opcional no registrada | «Sin registrar» | «Puedes dejar constancia de la instalación. Este registro es opcional y no bloquea el cierre.» |
| Evaluación ausente o incompleta | «Estado no disponible» | «No pudimos consultar el estado de los requisitos. Intenta actualizar la orden.» |
| Material | «Registrar equipo instalado» | «Selecciona un equipo de tu custodia». Sin categoría disponible: «No hay equipos de esta categoría en tu custodia. Contacta a supervisión para revisar la disponibilidad.» |
| Foto por requisito | «Añadir foto de la prueba de servicio» o «Añadir fotos del trabajo» | «Selecciona una foto». El acceso es por selector de archivo; se retira la promesa de arrastrar fotos o documentos. |
| Firma | «Capturar firma del cliente» | «Pide al cliente que firme el acta de conformidad». |
| Superficie de firma | «Limpiar», «Guardar firma», «Cancelar» | «Firma guardada». El error de carga: «No pudimos guardar la firma. Intenta de nuevo.» La captura permanece disponible para reintentar. |
| Bloqueada — título | «Orden bloqueada» | No se muestra motivo ni se dice «motivo no disponible». |
| Bloqueada — ejecutor | «Orden bloqueada» | «La orden está bloqueada. Contacta a supervisión para acordar cómo continuar.» |
| Bloqueada — supervisión | «Orden bloqueada» | «La orden está bloqueada. Coordina con el equipo de campo el siguiente paso.» |
| Acción UNBLOCK ofrecida, pero sin ruta/catálogo utilizable | «Desbloqueo no disponible» | No se habilita una acción ficticia ni se pide un motivo. Si UNBLOCK no aparece en allowedActions, esta leyenda tampoco aparece. |
| Sin ventana, no terminal | «Por programar» | «Esta orden no tiene una ventana planificada. Coordina su programación con el equipo de programación.» |
| Sin ventana, terminal | «Sin ventana planificada» | El estado terminal indica que ya no es trabajo por programar. |
| Carga inicial del detalle | «Cargando orden» | Se presenta estructura de carga; ninguna superficie de captura se monta durante la carga. |
| Bandeja sin órdenes para supervisión | «No hay órdenes para coordinar» | «Las órdenes creadas aparecerán aquí para que puedas asignarlas.» |
| Bandeja sin órdenes para el ejecutor | «No hay órdenes disponibles para ti» | Si hay filtros, se conserva el vacío y la acción de limpiarlos de la bandeja. |
| Historial de actividad vacío | «Todavía no hay actividades registradas» | Se ofrece el acto de registro solo si está permitido y corresponde al requisito. |
| Historial de consumos vacío | «Todavía no hay consumos registrados para este requisito» | El acto de consumo está dentro del requisito MATERIAL. |
| Historial de evidencia vacío | «Todavía no hay evidencias para este requisito» | Se ofrece seleccionar archivo o capturar firma según el requisito y allowedActions. |
| Error de lectura | «No pudimos cargar esta orden» | «Intenta de nuevo». Acción: «Reintentar». Se conservan los datos válidos ya mostrados. |
| Sin acceso | «No tienes acceso a esta orden» | No se confirma si la orden existe ni se presenta información de detalle. |
| Sin conexión | «Sin conexión» | «Sin conexión; vuelve a intentar cuando recuperes la red.» Se bloquean las escrituras; no se promete ni se presenta persistencia local. |
| Inicio en progreso, asignado | Copy OLA 1 sin cambios | «La ejecución está en curso. Registra avances, evidencias y consumos desde la lista de requisitos.» |
| Inicio en progreso, supervisión | Copy OLA 1 sin cambios | «La ejecución está en curso. Puedes seguir el avance en la lista de requisitos y crear una orden de seguimiento si hace falta.» |

Las acciones de asignación, inicio, seguimiento y cierre conservan sus etiquetas vigentes en OLA 1 y en el cliente; esta spec solo fija el copy nuevo de requisitos, evidencia, firma, ventana y bloqueo.

## 6. Custodia bajo demanda

La custodia del ejecutor no forma parte permanente del expediente ni se consulta al abrir una OT. Solo se consulta cuando una persona con REGISTER_ITEM_USAGE abre «Registrar equipo instalado» desde el requisito MATERIAL.

El selector se filtra por la categoría del requisito que lo originó —CPE en INSTALACION_ESTANDAR v2— y el acto conserva el requisito de origen. Los consumos ya registrados permanecen como historial dentro de «Equipos instalados en el sitio del cliente». La disponibilidad no se representa como si fuera un consumo.

El cierre, el inicio y la carga de otra colección no disparan una consulta de custodia. Si no hay elementos compatibles, se muestra el copy de §5 y no se ofrece una opción de otra categoría como si satisficiera el requisito.

## 7. E4 — OT sin ventana

### 7.1 Bandeja

La columna existente «Ventana planificada» se conserva; no se agrega otra columna ni un control de orden. Para una OT no terminal con schedule.window nulo, el contenido semántico es «Por programar». Para una orden terminal sin ventana, el contenido es «Sin ventana planificada». Una ventana existente conserva el formato de fecha y hora de la bandeja.

La tabla operativa v1.1 fija hoy null como raya. Esta spec no modifica ese contrato: R1 debe resolver cómo expresa el estado «Por programar» sin ventana, o tramitar formalmente una versión posterior; no se cambia el contrato congelado en R0 ni se oculta la incompatibilidad.

### 7.2 Orden por defecto

El orden por defecto pertenece al servidor: `planned_window_start_at DESC NULLS FIRST, id DESC`. Las órdenes sin ventana quedan primero; las demás conservan fecha descendente, y los empates se resuelven por id descendente. `NULLS FIRST` explicita el comportamiento de PostgreSQL para `DESC`; el índice `idx_execution_orders_tenant_window_start` de la migración 130 ya cubre este orden, por lo que no requiere DDL nueva. La decisión alinea la bandeja con el orden aprobado en la spec de subrutas del 2026-09-13 §4.7.1.

La tabla no agrega encabezados ordenables, estado de orden local ni sortBy/sortDir; `sortableFields` permanece vacío conforme al contrato operativo v1.2 *(referencia actualizada en la aprobación de G2: R1 versionó el contrato de tablas)*. La propuesta anterior de ordenar en tres tramos queda como mejora diferida: retomarla requiere dictamen de DATA-ENG sobre índice y paginación, además de una enmienda a la spec de subrutas del 2026-09-13.

### 7.3 Detalle y bolsa CREATED

El resumen muestra «Ventana planificada: Por programar» para una orden abierta sin ventana y una ayuda dirigida a coordinación. Si ya existe ventana, muestra el intervalo publicado. Si la OT es terminal, muestra «Sin ventana planificada».

CREATED es una bolsa solo de supervisión: la orden sin asignación que aún no se ha programado aparece a quien coordina y no al pool de técnicos o contratistas. El copy orienta a coordinar programación; no invita al técnico a reclamarla. Programar desde MOD09 permanece como acto y superficie aparte.

## 8. Convivencia con snapshots v1

La OT OTE-20260828-001 conserva su snapshot v1 de tres requisitos. El detalle presenta ese snapshot y las evaluaciones correspondientes; no añade equipos instalados, prueba de servicio ni CUSTOMER_SIGNATURE retroactivamente. Las órdenes creadas con INSTALACION_ESTANDAR v2 muestran los cinco requisitos de §3. Publicar v2 no reescribe las órdenes existentes.

El índice recorre la plantilla congelada de cada orden y cruza su clave con completion.requirements. Nunca se presenta una definición v2 como si estuviera guardada en una OT v1. La misma regla aplica a otras plantillas: se muestra su snapshot publicado, no un catálogo global actual.

## 9. Estados transversales y accesibilidad

| Estado | Comportamiento |
| --- | --- |
| Carga | Skeleton con forma para resumen y lista; sin spinners como contenido principal. No se montan acciones ni consultas de custodia antes de disponer del detalle y del momento. |
| Vacío | La bandeja compone el vacío según rol/filtros. Los historiales vacíos usan los mensajes de §5; el formulario permanece separado y solo si aplica. |
| Error | Alerta con «Reintentar». Conserve último dato válido; el error reemplaza el vacío. Error de mutación permanece junto al requisito que originó el acto. |
| Sin acceso | Mensaje genérico de §5 sin render de resumen, cliente, requisitos, ventana ni historial. |
| Degradado sin completion.requirements | Snapshot visible con estado «Estado no disponible» por ítem; no se convierte ausencia en incumplimiento. Permite refrescar la lectura. |
| Sin conexión | Se muestra el estado «Sin conexión» con el copy vigente de §5. Se bloquean las escrituras. La consola no persiste borradores offline ni promete recuperación local. |

El estado, obligatoriedad y razón se leen en texto para lector de pantalla. Los botones de archivo y acción son operables por teclado. El trazo libre de la firma es una entrada dependiente de trayectoria exceptuada por WCAG 2.1.1; las instrucciones y los controles «Limpiar», «Guardar firma» y «Cancelar» sí son accesibles por teclado, con foco gestionado y anuncios para lector de pantalla. No se usa un nombre escrito como alternativa para producir evidencia `SIGNATURE`. La ausencia de otra vía para quien no puede firmar con puntero queda como deuda de v1; cualquier alternativa de aceptación electrónica requeriría análisis posterior y verificación jurídica con fuente oficial (Ley 527 de 1999), fuera del alcance de R0.

## 10. Límites de alcance

- No se diseña Oportunidades ni se reserva un enlace a su expediente.
- No se diseña superficie para anular una OT.
- No se diseña una interfaz de línea de tiempo; los registros quedan asociados al requisito como historial de expediente.
- No se especifican tokens, componentes ni props visuales; corresponden a R1.
- No se especifican handlers, reconciliador ni otros datos de E4 asociados a schedule_event_id nulo (CA-13 y fase backend).
- No se modifica ninguno de los tres contratos congelados.

## 11. Necesidades para R1 y G3

### 11.1 Para AI-DS-OWNER — R1

1. Definir API de RequirementChecklist y RequirementActionSheet para estado, razón, acción contextual, requisito opcional y estado desconocido, sin inferir permisos.
2. Contratar estados textuales accesibles: «Cumplido», «Pendiente», «Sin registrar» y «Estado no disponible».
3. Resolver el render de ventana nula: el contrato v1.1 prescribe raya y E4 necesita «Por programar» para órdenes abiertas y «Sin ventana planificada» para terminales. Documentar compatibilidad con v1.1 o tramitar formalmente v1.2; no editar el contrato durante R0.
4. Contratar el layout del historial dentro de cada requisito y el acto temporal de captura sin convertirlos en seis bloques planos. La superficie de firma debe hacer legibles sus instrucciones y permitir operar por teclado «Limpiar», «Guardar firma» y «Cancelar», con foco gestionado y anuncios para lector de pantalla; el trazo libre queda exceptuado por WCAG 2.1.1.
5. Mantener superficies de error, carga y offline dentro de primitives existentes; en offline, bloquear escrituras y conservar el copy vigente, sin presentar un borrador local.

### 11.2 Para AI-FE-PLATFORM — dictamen G3

1. Confirmar que el artefacto del lienzo se puede enviar por el endpoint de evidencia existente como SIGNATURE para CUSTOMER_SIGNATURE, incluidos tipo MIME, tamaño y expiresAt requerido. No introducir política de caducidad ni dependencia nueva por inferencia.
2. Identificar si ya existe una librería de lienzo aprobada y compatible. Si hace falta una nueva, registrar decisión de dependencia antes de instalarla.
3. Comprobar que las instrucciones y los controles «Limpiar», «Guardar firma» y «Cancelar» son operables por teclado, con foco gestionado y anuncios para lector de pantalla. El trazo libre se trata como entrada dependiente de trayectoria exceptuada por WCAG 2.1.1; no se acepta un nombre escrito como evidencia `SIGNATURE`.
4. Confirmar la consulta de custodia al abrir el acto MATERIAL y solo en ese momento; no consultar custody en pre-inicio. Confirmar carga de evidencias/consumos/historial en el momento que corresponde.
5. Proponer refetch selectivo por acción: actividad actualiza evaluación e historial de actividad; consumo actualiza evaluación e historial de consumos; evidencia actualiza evaluación e historial de evidencia; cierre actualiza detalle y resultado. No volver a disparar las seis colecciones por registrar actividad.
6. Confirmar que E4 conserva en servidor el orden `planned_window_start_at DESC NULLS FIRST, id DESC` y cómo se mantiene estable con paginación; la vista no ordena localmente ni presenta encabezados ordenables.
7. Hacer explícita la dependencia visual de R1 para «Por programar» sin ventana antes de implementar E4 en portal.
8. Conservar `close()` y su registro de conformidad existente: primero se guarda el artefacto de firma; el cierre usa la evidencia referenciada.

## 12. Criterios de salida de R0

| Criterio del encargo §7 | Resultado |
| --- | --- |
| Los cinco requisitos v2 tienen estado, razón y acción o ausencia de acción con copy. | Cumple: §3 y §5. |
| Matriz momento × rol completa; en pre-inicio no se monta captura. | Cumple: §4; las 12 combinaciones están definidas. |
| Custodia solo aparece dentro del acto de consumo. | Cumple: §6. |
| OT sin ventana tiene presentación y orden por defecto definidos para bandeja y detalle. | Cumple: §7 fija presentación y orden de servidor; R1 resuelve compatibilidad visual con v1.1 sin modificarlo en R0. |
| Se decidió el arrastre de archivos. | Cumple: se retira; selector de archivo solamente. |
| Se declara el comportamiento de una OT viva con snapshot v1. | Cumple: §8. |

## 13. Stop/go — §7 del encargo

**GO para la mitad R0 de G2.** Los seis criterios del encargo están descritos y trazables en §12. No hay dato requerido ausente en los contratos congelados para diseñar R0; por ello no se emite [BLOQUEO]. El contrato de tabla no se cambia. La decisión de accesibilidad de la firma queda resuelta por A2; el único handoff pendiente para R1 es la compatibilidad de «Por programar» con el render de raya del contrato v1.1. G2 permanece parcial hasta la entrega de R1.

## 14. Adenda de producto v1.2 — consumos sin requisito asociado (2026-10-06)

**Estado:** Adenda producida por AI-PROD-UX; pendiente de verificación consolidada. No modifica el estado aprobado de la línea base v1.1 ni constituye aprobación de AI-EM-ARCH.

La revisión R3 detectó que algunos consumos de `ExecutionOrderItemUsage` no guardan la clave del requisito que los originó. Pueden ser registros previos o proceder de un cliente que todavía no envía la clave; la fecha no demuestra su procedencia. Su categoría o disposición no permiten inferirla: varios requisitos MATERIAL pueden compartirlas y la plantilla visible hoy no reconstruye la intención registrada al crear cada consumo. No se atribuye retrospectivamente una clave.

### 14.1 Asociación e historial

- Los registros que incluyan `requirementKey` se muestran una sola vez bajo la fila cuyo `snapshot.requirement.key` coincide exactamente. No se asocian por etiqueta, categoría, acción, disposición ni orden temporal.
- Los registros con clave nula o ausente se muestran una sola vez en un grupo neutral, al final de las filas del checklist y fuera de cualquier fila de requisito. El grupo aparece solo si hay registros y usa este copy:
  - Título: **«Consumos sin requisito asociado»**.
  - Descripción: **«Estos registros no indican a qué requisito corresponden.»**
- El grupo no es un requisito ficticio, no concede acciones y no se repite bajo cada requisito MATERIAL. Así se conserva el índice por snapshot y no se recuperan los seis bloques planos que R0 retiró.
- El vacío definido en §5 —«Todavía no hay consumos registrados para este requisito»— sigue aplicando por separado a cada requisito sin registros asociados por clave exacta. Los consumos sin clave no rellenan ni ocultan ese estado.
- La agrupación visual no recalcula cumplimiento ni progreso. `completion.requirements`, su estado y el progreso publicados por la API siguen siendo la fuente del checklist. El bucket sin atribución no significa que el consumo no pueda contar para el evaluador: se conserva la compatibilidad existente del backend para consumos sin clave. No se cambia el gate de cierre por esta decisión de presentación.
- Se espera que el contrato de lectura exponga aditivamente `requirementKey: string | null` en cada `ExecutionOrderItemUsage`. El campo de escritura se añade de forma compatible y opcional: si llega, se persiste la clave exacta del snapshot; si se omite, permanece nulo, sin importar la fecha del registro. No se hace backfill ni atribución inferida. Esta UX no fija la versión ni el endpoint del cambio API: corresponden a sr-backend y a la verificación consolidada. Esta adenda tampoco versiona ni modifica por sí misma los contratos API o de componente.

### 14.2 Carga, error y paginación accesibles

- `GET itemUsage` pagina la colección completa de consumos de la OT; no filtra por `requirementKey` (API v1.5, contrato de componente v1.1). Por tanto, solo hay un contador y un pie de paginación global al final del checklist, después de las filas y del grupo neutral si aparece. El contador, `total` y `hasMore` corresponden al conjunto global de consumos; no se derivan ni se inventan metadatos para el grupo sin clave.
- En las páginas cargadas, cada consumo con clave se muestra bajo la única fila cuyo `requirementKey` coincide exactamente. Cada consumo con clave nula o ausente se muestra en el grupo neutral definido en §14.1. El grupo aparece cuando al menos una fila sin clave ya está en las páginas cargadas; muestra solo esas filas vistas y no implica que el conjunto sin clave esté completo mientras queden páginas globales.
- El grupo neutral se presenta como una sección identificada por su título y descripción, con los consumos en una lista semántica de lectura. No recibe foco automáticamente ni se convierte en control de acción. Los elementos conservan el orden de respuesta del servidor y se deduplican por identidad.
- Durante la carga inicial, el historial usa un skeleton con forma de contenido y comunica `aria-busy`; no se anuncia un vacío antes de terminar la consulta. El error de lectura se muestra junto al historial global con la alerta y la acción «Reintentar» previstas en §9. Se conservan los registros válidos ya cargados; el error reemplaza el vacío, no los registros.
- El pie global anuncia el conteo de la colección en una región viva accesible. «Cargar más» aparece solo si el `hasMore` global lo indica; es un botón con foco visible, operable por teclado y target de al menos 44 px. Durante la petición queda deshabilitado y comunica la carga. El pie no se repite debajo de cada requisito ni del grupo neutral.
- El vacío por requisito de §5 solo se presenta cuando termina la paginación global y no hay consumos con clave exactamente asociada a esa fila. Si todavía quedan páginas y no se ha visto un consumo asociado, se difiere ese vacío. Los registros sin clave no lo rellenan ni lo ocultan; tampoco reciben estado de carga, error, conteo o paginación propios.

Esta adenda conserva §§1–13 como la definición aprobada de R0, incluido el principio de historial bajo el requisito que explica cada registro. El grupo separado es una excepción limitada a registros cuya procedencia no está persistida, sin importar su fecha; los registros asociados siguen bajo su requisito exacto.

## 15. Ratificación de copy R2 (2026-10-06)

**Estado:** Copy ratificado por AI-PROD-UX como complemento de §5; producido en esta adenda v1.3 y pendiente de verificación consolidada. No constituye aprobación de AI-EM-ARCH.

Se ratifican los textos de captura de evidencia y firma documentados en el [informe R2, §10](../informes/INFORME-MOD11-CONSOLA-OT-OLA2B-R2-FE-PLATFORM-v1.0.md). Se conservan literalmente:

| Contexto | Copy ratificado |
| --- | --- |
| Selector de foto y documento | «Selecciona una foto» (ayuda ya fijada en §5) · «Seleccionar foto» · «Seleccionar documento» · «Selecciona un documento en PDF o una imagen.» · «Archivo seleccionado: {nombre}» · «Reintentar registro» |
| Instrucción complementaria de firma | «Dibuja la firma dentro del recuadro con el dedo, un lápiz o el ratón.» |
| Estados y nombres accesibles de firma | «Todavía no hay firma dibujada.» · «Firma dibujada. Puedes guardarla o limpiarla.» · «Firma limpiada. Puedes volver a firmar.» · «Dibuja la firma antes de guardarla.» · «Captura de firma del cliente» · «Área de firma» |
| Firma en revisión | «La firma sigue en revisión y aún no se guardó. Puedes volver a intentarlo en unos minutos.» |
| Validación del archivo | «Selecciona una foto en formato JPG, PNG, WebP o GIF.» · «Selecciona un documento en PDF o una imagen en formato JPG, PNG, WebP o GIF.» · «El archivo está vacío.» · «El archivo supera el tamaño máximo de 25 MB.» |
| Vacío del historial de evidencia | «Las fotos que añadas aparecerán aquí.» · «Los documentos que adjuntes aparecerán aquí.» · «La firma del cliente aparecerá aquí cuando se guarde.» |

La base de copy de firma y sus botones permanece como en §5: «Capturar firma del cliente», «Pide al cliente que firme el acta de conformidad.», «Limpiar», «Guardar firma», «Cancelar», «Firma guardada» y «No pudimos guardar la firma. Intenta de nuevo.» La ratificación complementa esos textos sin cambiar el flujo ni los estados aprobados.

## Registro de cambios

| Versión | Fecha | Cambio |
| --- | --- | --- |
| 1.1 | 2026-10-05 | Aplicación de la adenda A2: se elimina la promesa de borrador offline; se fija el orden `planned_window_start_at DESC NULLS FIRST, id DESC` y se aplaza la propuesta de tres tramos; se conserva la etiqueta exacta del snapshot y el estado opcional «Sin registrar»; se resuelve la excepción del trazo de firma por WCAG 2.1.1 y se especifican controles e instrucciones accesibles por teclado. |
| 1.2 | 2026-10-06 | Adenda de producto §14: historial único para consumos sin clave, copy que explicita su falta de atribución, compatibilidad del evaluador preservada y reglas accesibles de carga, error y paginación. Pendiente de verificación consolidada; no aprobada por AI-EM-ARCH. |
| 1.3 | 2026-10-06 | Se alinea §14.2 con la paginación global de `GET itemUsage` y el contrato de componente v1.1: contador/footer únicos, metadata global y vacío por requisito al final de la paginación. Se ratifica en §15 el copy complementario de R2. Pendiente de verificación consolidada; no aprobada por AI-EM-ARCH. |
