# Spec UX — MOD10 Mesa de ayuda · Detalle del ticket compacto

**Versión:** 1.1 (ver nota al final de §4)
**Estado:** Aprobado (G0) por el usuario en sesión el 2026-11-16 · D1–D3 resueltas con la recomendación · Plan: [2026-11-16-mod10-detalle-ticket](../plans/2026-11-16-mod10-detalle-ticket.md)
**Fecha:** 2026-11-16
**Emisor:** Claude Code, con criterio de AI-PROD-UX y AI-DS-OWNER
**Alcance de pantalla:** panel de detalle del ticket (`AssuranceTicketDrawer`), abierto desde `/dashboard/assurance` y desde la pestaña Soporte de la ficha del suscriptor
**Relacionado:** [contrato de densidad de la ficha, §8](2026-11-10-mod05-ficha-suscriptor-estilo-uisp-ux.md) (se extiende) · [pestaña Soporte](2026-10-20-mod05-pestana-soporte-ux-spec.md) (se enmienda, D2) · [bandeja de OT, D8](2026-09-13-mod11-operaciones-subrutas-bandeja-ot-ux.md) (enlaces desde el ticket) · [adjuntos en tickets](2026-11-16-mod09-adjuntos-en-tickets.md) (se conserva)

---

## 0. Principio rector

Complementar sin retroceso, igual que [la ficha, §0](2026-11-10-mod05-ficha-suscriptor-estilo-uisp-ux.md): ninguna propiedad, acción, guarda ni mensaje del panel desaparece ni queda más lejos. Cada bloque de §3 trae su columna «se conserva» y §6 lo prueba.

## 1. Hechos verificados (2026-11-16, `main` en `e22ce7e0` más el árbol de trabajo)

Todos leídos en código o medidos en navegador en esta sesión.

| # | Hecho | Fuente |
|---|---|---|
| H1 | El panel es un `<aside>` dentro de `ModalLayer`, sin `role="dialog"`, nombre accesible, foco inicial ni trampa de foco | `AssuranceTicketDrawer.tsx:199-205` |
| H2 | Orden actual: cabecera → insignias (tipo, estado, prioridad, plazo si hay política) → rejilla de 9 a 12 tarjetas → Descripción → Adjuntos (N) → alertas → pestañas Comentarios, Timeline, Acciones | `:206-222`, `:246-260`, `:262-326`, `:328-363`, `:365-378`, `:380-753` |
| H3 | A 1440×900, en el ticket `UISP-25790` (9 propiedades, sin descripción, 1 adjunto), las pestañas empiezan en el píxel 733 | Medido en navegador |
| H4 | «Solicitante» y «Objeto afectado» muestran el tipo; el ticket solo trae `requesterRefId` y `subjectRefId` | `:274-285`; `api-client.ts:3440-3442` |
| H5 | Acciones y guardas: crear tarea vinculada (`canOperate`, no terminal, solo si llega `onCreateLinkedTask`); estado con nota (`canOperate`, no terminal; ofrece todos los estados menos el actual); responsable y cola (`canManage`); trabajo de campo con nota (`canOperate`, solo en progreso o espera interna, no terminal); vincular orden por identificador con nota (`canManage`); aviso de solo lectura; alerta de plazo | `:186-194`, `:530-752` |
| H6 | Dos consumidores: la bandeja y la pestaña Soporte; esta no pasa `onCreateLinkedTask` | `AssuranceClient.tsx:727`; `SubscriberSupportTab.tsx:320` |
| H7 | El ticket abierto vive en memoria: no tiene ruta ni parámetro de URL | `AssuranceClient.tsx:161-164` |
| H8 | El servidor admite de dos a cinco destinos por estado y exige nota para resolver | `tickets.service.ts:80-113`; `dto/index.ts:57-66` |
| H9 | «Orden de trabajo» muestra 8 caracteres del identificador de la orden de programación, no el número de la orden de ejecución | `assurance-labels.ts:204-210` |
| H10 | `PortalFieldList` es de una columna y `empty` solo pinta «Sin dato» | `portal-ui.tsx:2105-2142` |

## 2. Problema

El panel gasta el 81 % de la primera pantalla antes de la conversación (H3), reparte el mismo peso visual entre datos que informan y valores por defecto, esconde las acciones frecuentes en la tercera pestaña y no dice de quién es el caso (H4).

## 3. Alcance

### Paso 1 — una columna compacta, sin cambios de API

| Bloque | Qué cambia | Se conserva |
|---|---|---|
| **A · Contenedor** | `PortalSidePeek` en lugar del `<aside>`; título = número, descripción = asunto; carga con `SkeletonBlock` con la forma del contenido | Ancho actual, cierre con Escape y velo, bloqueo de desplazamiento, difusión al chrome (`usePortalModalDrawerBroadcast`), estados de error y «no disponible» |
| **B · Cabecera de acciones** | Insignias de tipo, prioridad y plazo; a su lado, control **Estado** (lista de destinos, nota, «Guardar estado») y control **Responsable** | Guardas de H5; la nota sigue opcional salvo al resolver (H8); en estado terminal los controles muestran el valor sin abrir |
| **C · Propiedades** | Una sola superficie: `PortalFieldList` a dos columnas (§5). Orden: Solicitante, Área, Relacionado con, Visita técnica, Abierto, Orden de trabajo, Actualizado, Origen. Los valores por defecto («Sin área», «No requiere», «Sin vincular») se muestran atenuados | Todas las propiedades de H2, siempre visibles (Responsable queda en la cabecera, bloque B); «Cerrado» y los dos plazos conservan su condición actual |
| **D · Descripción y adjuntos** | Sin tarjeta propia. Vacíos ocupan una línea atenuada | Sección «Adjuntos (N)» con su lista compacta, vista previa y descarga; `data-testid="ticket-attachments-section"` |
| **E · Visita y orden** | Fila de acciones bajo las propiedades: «Solicitar visita», «Vincular orden de trabajo», «Crear tarea vinculada»; cada una abre su formulario en línea | Notas, regla de estado con su texto de ayuda, guardas de H5 y la ausencia de «Crear tarea vinculada» cuando el consumidor no la pasa (H6) |
| **F · Hilo** | Filtro Comentarios (por defecto), Historial, Todo, en lugar de pestañas. Historial con `PortalTimeline`. «Todo» intercala por fecha y omite el evento «comentario agregado» | Comentarios con autor, insignia interno o visible, fecha y adjuntos; comentario importado sin texto |
| **G · Redactor** | Fijo al pie del panel: texto, conmutador «Interno», adjuntar, «Agregar comentario» | Solo con `canOperate`; límites de adjuntos; texto y archivos conservados si falla |
| **H · Mensajes** | Éxito y error aparecen junto al control que los provocó | Textos y variantes actuales; aviso de solo lectura visible sin abrir nada |
| **I · Vocabulario** | Tabla de §4, corregida en `assurance-labels.ts` | — |

### Paso 2 — dos columnas, dirección propia y enlaces

| Bloque | Qué cambia | Se conserva |
|---|---|---|
| **J · Dos columnas** | Izquierda: descripción, hilo y redactor. Derecha: riel de tarjetas densas Personas, Atención, Visita y orden de trabajo, Adjuntos, Registro; responsable y área se editan en el riel. Bajo `lg` el riel se apila antes del hilo, como en el paso 1 | Todo lo del paso 1; el control Estado sigue en cabecera |
| **K · Dirección propia** | La bandeja abre el panel con `?ticketId=` (mismo patrón que `?executionOrderId=`); ruta `/dashboard/assurance/tickets/[id]` con el mismo componente de contenido; «Abrir en página» en la cabecera | El panel sigue siendo la vista por defecto desde la bandeja y desde la ficha |
| **L · Nombres y enlaces** | Solicitante y «Relacionado con» muestran nombre y enlazan a su ficha; Visita y Orden muestran estado y enlazan a su pantalla; la orden se busca por número; Estado solo ofrece destinos válidos | El tipo queda como texto de apoyo; sin dato del servidor se muestra lo de hoy |

**Fuera de alcance:** bandeja y tablero, consola de la orden de ejecución, plazos de atención y PQR en servidor, permisos por rol (D3), incidente masivo, notificaciones. El desfase del enum del historial se trata en sesión aparte.

## 4. Vocabulario

Los rótulos se corrigen en la fuente; la tabla y el formulario de la bandeja heredan el rótulo sin cambiar de disposición.

| Hoy | Nuevo |
|---|---|
| Cola funcional · Sin cola | Área · Sin área |
| Decisión de campo · No requiere campo | Visita técnica · No requiere, Por definir tras diagnóstico, Requerida |
| Objeto afectado | Relacionado con |
| Timeline | Historial |
| Transición de estado · Aplicar transición · Nota operativa | Cambiar estado · Guardar estado · Nota |
| Trabajo de campo · Solicitar trabajo de campo · Nota para WFM | Visita técnica · Solicitar visita · Nota para el equipo de campo |
| Vincular work order · Identificador de work order · UUID de la OT | Vincular orden de trabajo · Orden de trabajo |
| No asignado (responsable) · No asignado (autor) | Sin asignar · Usuario no disponible |
| Primera respuesta SLA · Resolución SLA · Seguimiento SLA requerido | Responder antes de · Resolver antes de · Plazo de atención en seguimiento |
| «portal empresarial», «contrato del backend», «tablas internas de WFM» | Se eliminan |
| Trabajo de campo solicitado (estado y evento) · Se escaló el caso a trabajo de campo | Visita técnica solicitada · Se solicitó una visita técnica |
| Work order (relacionado con, evento y avisos) · OT … cerrada | Orden de trabajo |
| Incidencia SLA · incumplimiento SLA | Plazo de atención vencido |
| Deadline PQR registrada | Plazo de la PQR registrado |
| NOC (área) | Monitoreo operativo, como en `system-vocabulary.ts` |
| NMS · WFM (origen) | Monitoreo de red · Programación |
| Resultado de la orden sin traducir en el historial | Rótulo en español del resultado |
| Confirmación de los formularios en línea | «Confirmar solicitud» · «Confirmar vínculo» |

**v1.1 (2026-11-16, punto de control del paso 1, aprobado por el usuario):** las ocho filas finales de esta tabla; Área vive solo como control en la cabecera; sin lista de responsables cargada, el responsable de un ticket asignado se muestra como «Responsable no disponible», nunca «Sin asignar»; la ayuda de «Crear tarea vinculada» sigue visible; un formulario en línea no se abre sin el permiso de su acción.

## 5. Contratos por congelar antes de construir

**Densidad v1.1 (dueño `ds-owner`, aditivo sobre [§8](2026-11-10-mod05-ficha-suscriptor-estilo-uisp-ux.md)).** Lo que la pantalla necesita; nombres y clases exactas los fija `ds-owner`:

| Necesidad | Propuesta |
|---|---|
| Lista a dos columnas desde `sm`, una en móvil | `PortalFieldList columns={2}`; por defecto 1, sin cambio para los consumidores actuales |
| Valor por defecto atenuado con su propio texto | `PortalFieldRow emptyLabel="Sin área"`; sin la prop, `empty` sigue pintando «Sin dato» |
| Ancho del panel para el riel del paso 2 | D5 |

**Datos del paso 2 (dueño `sr-backend`).** Regla → dato; antes de congelar se cruza cada fila con DTO y origen:

| Regla de pantalla | Dato en el detalle del ticket | Nulo cuando |
|---|---|---|
| Mostrar de quién es el caso | Nombre visible del solicitante | Titular bloqueado o suprimido; referencia no resoluble |
| Mostrar con qué se relaciona | Nombre visible del relacionado | Igual |
| Ver la visita sin salir | Identificador, estado y ventana de la visita activa | No hay visita |
| Ver la orden sin salir | Identificador, número, estado y resultado de la orden | No hay orden; D4 |
| Ofrecer solo destinos válidos | Lista de estados destino para quien consulta | Nunca; vacía en terminal |

## 6. Criterios de aceptación

| # | Paso | Criterio |
|---|---|---|
| CA-1 | 1 | Una prueba de inventario enumera las propiedades de H2 y las acciones de H5 antes y después, en los dos consumidores de H6 |
| CA-2 | 1 | A 1440×900, con el ticket de H3, el primer comentario se ve al abrir el panel sin desplazar, medido en navegador. *Enmendado 2026-11-16 por el usuario: la meta de 450 px se midió en 542 px; la altura se exige en CA-10 (paso 2)* |
| CA-3 | 1 | Estado y responsable se cambian con el hilo a la vista, en dos interacciones más la confirmación |
| CA-4 | 1 | Cada acción conserva su guarda de H5: una prueba por guarda, con y sin permiso |
| CA-5 | 1 | El panel es un diálogo con nombre, foco inicial, trampa y retorno de foco al disparador en ambos consumidores; axe sin violaciones en claro y oscuro |
| CA-6 | 1 | Ningún hex, `text-[11px]` ni espaciado de letras arbitrario en el panel; `AssuranceKeyValueItem` se retira |
| CA-7 | 1 | Ningún término de la columna «Hoy» de §4 queda visible; `system-vocabulary-review` sin hallazgos |
| CA-8 | 1 | A 375 px no hay desborde horizontal y el redactor se usa completo |
| CA-9 | 1 | Cada expectativa cambiada en las pruebas existentes se explica por un renombre de §4 o un movimiento de §3 (`test-change-reviewer`). Archivos: specs del panel y de adjuntos, `e2e/tests/portal-assurance*.spec.ts` y las E2E que abren el panel |
| CA-10 | 2 | A 1440×900 el hilo empieza en 200 px o menos |
| CA-11 | 2 | Recargar con un ticket abierto lo reabre; Atrás lo cierra; la ruta propia muestra lo mismo que el panel |
| CA-12 | 2 | El nombre no aparece si el titular está bloqueado o suprimido; cada enlace exige el permiso de lectura del módulo destino |

## 7. Decisiones abiertas

| # | Decisión | Recomendación | Dueño |
|---|---|---|---|
| D1 | **Resuelta 2026-11-16:** la mesa de ayuda es MOD10, como en su PRD; la spec de adjuntos la llamó MOD09 | — | Usuario |
| D2 | **Resuelta 2026-11-16:** esta spec sustituye el «sin modificarlo» de la spec de Soporte (l. 43 y 130); anotado allá | — | Usuario |
| D3 | **Resuelta 2026-11-16:** el informe sin reproducir sobre técnico (acciones que la API rechaza) y auditor (bloqueado en pantalla) se trata aparte; aquí las guardas no cambian (CA-4) | — | Usuario |
| D4 | **Resuelta 2026-11-16 por el usuario:** la orden de ejecución (OTE), con su número; el vínculo manual escribe `ticket_id` en la orden por su módulo y `work_order_id` no cambia de significado. Con ella: «Visita técnica solicitada» no se ofrece como destino directo; sin `crm.subscribers.read` el nombre llega nulo; «Abrir en página» no se muestra en la pestaña Soporte; el nombre de usuarios internos como solicitante queda fuera (deuda) | — | Usuario |
| D5 | Ancho del panel con riel; hoy mide 768 px | Lo fija `ds-owner` con el contrato v1.1 | `ds-owner` |

D4 y D5 solo bloquean el paso 2.

## 8. Orden sugerido

Paso 1: `ds-owner` congela la densidad v1.1 → `fe-platform` construye A–I → `sr-qa` verifica §6. Paso 2: `sr-backend` congela los datos de §5 → `fe-platform` construye J–L. El plan de orquestación, con su matriz de dispatch y su lanzador, se emite tras el G0.
