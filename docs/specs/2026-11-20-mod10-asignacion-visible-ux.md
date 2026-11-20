# Spec UX — MOD10 Mesa de ayuda · Asignación visible

**Versión:** 1.0
**Estado:** Aprobado (G0) por el usuario en sesión el 2026-11-20: «Realiza la integración de lo que vale la pena traer de UISP, sigo tus sugerencias»
**Fecha:** 2026-11-20
**Emisor:** Claude Code, con criterio de AI-PROD-UX
**Alcance de pantalla:** hilo del ticket (`AssuranceTicketDetail`), fila de ticket en la ficha del suscriptor (`TicketListItem`) y en la bandeja de Mesa de ayuda (`AssuranceTicketsTable`)
**Relacionado:** [lateral del ticket en un panel](2026-11-20-mod10-detalle-ticket-lateral-un-panel-ux.md) (se construye sobre él) · [bandeja con colas](2026-11-18-mod10-bandeja-colas-de-trabajo-ux.md) · [detalle del ticket](2026-11-16-mod10-detalle-ticket-ux.md) · [UISP: complementar sin retroceso](2026-11-10-mod05-ficha-suscriptor-estilo-uisp-ux.md)

---

## 0. Principio rector

Complementar sin retroceso. iWana ya asigna con menos pasos que UISP (selector directo, «Asignarme», colas «Míos» y «Sin asignar»): eso no cambia. De UISP se trae que la asignación se vea; no se trae su diálogo ni mover el ticket a otro cliente.

## 1. Hechos verificados (2026-11-20)

| # | Hecho | Fuente |
|---|---|---|
| H1 | UISP asigna y reasigna con un diálogo (menú ⋮ → «Asignar ticket» → usuario y cliente → Guardar): tres clics | Observado en la instancia real, sin guardar |
| H2 | UISP muestra al responsable como iniciales en cada fila y en la cabecera, y cada asignación como una línea dentro de la conversación | Observado |
| H3 | iWana asigna con el selector «Responsable» y «Guardar asignación», y con «Asignarme» en la fila de la bandeja, solo en tickets sin responsable | `AssuranceTicketDetail.tsx`; `AssuranceTicketsTable.tsx:132`, `:483` |
| H4 | iWana registra `ASSIGNED` y `REASSIGNED` con el responsable anterior y el nuevo, sin nota | `tickets.service.ts:926-938` |
| H5 | El hilo abre en «Comentarios»; las asignaciones solo se ven en «Historial» o «Todo» | `AssuranceTicketDetail.tsx:1313-1317` |
| H6 | La fila muestra al responsable como texto, que se corta en la lista estrecha | `TicketListItem.tsx:42`; captura del usuario |
| H7 | El contrato de asignación acepta responsable y área; no acepta nota | `dto/index.ts:116-124` |
| H8 | Asignar exige rol ADMIN, NOC o SUPPORT y el permiso de gestión de tickets | `assurance.controller.ts:427-429` |

## 2. Alcance

| Bloque | Qué cambia | Se conserva |
|---|---|---|
| **A · Asignaciones en la conversación** | En «Comentarios», las asignaciones, reasignaciones y cambios de estado aparecen intercalados por fecha, como líneas discretas de una sola línea («Ana asignó a Luis · 30 jun»). El resto del historial sigue en «Historial» y «Todo» | Las tres pestañas, sus contenidos y la visibilidad de comentarios internos |
| **B · Iniciales del responsable** | El responsable se muestra como un círculo con iniciales y el nombre completo en `title`. En la fila estrecha de la ficha, solo las iniciales, con el nombre como texto accesible. En la bandeja, las iniciales y al lado el nombre visible, truncado con elipsis si no cabe (ajuste del usuario, 2026-11-20: hay iniciales repetidas). Sin responsable: un círculo vacío punteado con «Sin asignar» | El dato, su regla («Sin asignar», «Responsable no disponible») y el filtro por responsable |
| **C · Reasignar desde la fila** | En la bandeja, el responsable de la fila es un control: abre un selector con los mismos usuarios que el detalle y guarda al elegir. «Asignarme» sigue como atajo en los tickets sin responsable | Los permisos de H8: sin ellos el responsable es texto, no control |
| **D · Nota al reasignar** | Al cambiar el responsable (en el detalle o en la fila) se puede escribir una nota opcional; se guarda en el evento del historial y se ve en la línea de la conversación | Asignar sin nota sigue siendo un solo paso |

**Fuera de alcance:** el diálogo de UISP, mover un ticket a otro cliente, avisar por correo o notificación al nuevo responsable, asignación múltiple, y reasignar desde la fila de la ficha del suscriptor.

## 3. Contrato de datos (dueño `sr-backend`)

| Regla de pantalla | Dato | Nota |
|---|---|---|
| Guardar la nota | Campo opcional de texto en la asignación, con el mismo saneado y tope que la nota del cambio de estado | Va al `payload` del evento `ASSIGNED` o `REASSIGNED`; sin migración |
| Mostrarla | El historial ya devuelve el `payload` | Es texto escrito por un usuario: se muestra como texto plano |
| Nombres en la línea | Los que el detalle ya resuelve para el historial | Con titular o usuario no disponible, el rótulo que ya usa el historial |

## 4. Criterios de aceptación

| # | Criterio |
|---|---|
| CA-1 | Una reasignación hecha en el detalle aparece en «Comentarios» sin cambiar de pestaña, en su lugar por fecha |
| CA-2 | «Comentarios» no muestra otros eventos del historial (prioridad, plazo, vínculos): solo asignaciones y cambios de estado |
| CA-3 | Un comentario interno sigue oculto para quien no puede verlo; las líneas de asignación no revelan su contenido. La nota de una asignación es interna: la reciben ADMIN, NOC y SUPPORT, y además el responsable de ese mismo evento, sea cual sea su rol; la API la quita al resto, incluidos el auditor y un responsable anterior (D5) |
| CA-4 | En las dos listas el responsable se identifica sin texto cortado, y su nombre completo llega al lector de pantalla |
| CA-5 | Desde la fila de la bandeja se reasigna en dos clics; sin permiso de gestión no hay control |
| CA-6 | La nota es opcional, se guarda con la reasignación y se ve en la conversación; asignar sin nota no pide nada más |
| CA-7 | «Asignarme», las colas «Míos» y «Sin asignar», y el guardado conjunto de responsable y área funcionan igual: sus pruebas pasan sin tocar expectativas |
| CA-8 | Un usuario sin rol de asignación recibe el mismo rechazo de hoy al intentar reasignar por la API, con nota o sin ella |
| CA-9 | Teclado y axe sin violaciones en claro y oscuro; a 375 px sin desplazamiento lateral |

## 5. Decisiones

Tomadas con la recomendación, por indicación del usuario.

| # | Decisión | Resuelto |
|---|---|---|
| D1 | Qué eventos entran a «Comentarios» | Asignación, reasignación y cambio de estado |
| D2 | Dónde se reasigna desde la fila | Solo en la bandeja de Mesa de ayuda |
| D3 | Si la nota es obligatoria | No |
| D4 | Avisar al nuevo responsable | Fuera de este frente; queda como deuda con dueño de producto |
| D5 | Quién ve la nota de reasignación | Nota interna, visible también para el nuevo responsable. Lo decide la API por evento (`assignedUserId` del evento = usuario que consulta); el responsable anterior conserva solo la nota de su propia asignación. Decisión del usuario, 2026-11-20 |

## 6. Orden sugerido

`sr-qa` fija inventario y línea base → `sr-backend` añade la nota (con `sec-eng` y `contract-drift-reviewer`) → `fe-platform` construye A–D → `sr-qa` verifica con `test-change-reviewer`. Se ejecuta después de cerrar el frente del lateral, sobre los mismos archivos.
