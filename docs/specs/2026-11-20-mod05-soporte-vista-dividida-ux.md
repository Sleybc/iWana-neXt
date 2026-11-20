# Spec UX — MOD05 Suscriptores · Soporte en vista dividida

**Versión:** 1.2
**Estado:** Aprobado (G0) por el usuario en sesión el 2026-11-20 · D1–D4 resueltas con la recomendación · Plan: [2026-11-20-mod05-soporte-vista-dividida](../plans/2026-11-20-mod05-soporte-vista-dividida.md)
**Fecha:** 2026-11-20
**Cambios v1.1 (2026-11-20, pedido del usuario tras publicar los pasos 1 y 2):** paso 3, franja única de próximas visitas (bloque I, H11–H13, CA-13 a CA-16, D5). Sustituye al bloque E.
**Cambios v1.2 (2026-11-20, pedido del usuario):** densidad de la lista en vista dividida (bloque J, H14, CA-17 y CA-18). Ajusta el bloque C.
**Emisor:** Claude Code, con criterio de AI-PROD-UX
**Alcance de pantalla:** `/dashboard/crm/subscribers/[id]?tab=soporte` (paso 1) y `/dashboard/assurance` (paso 2, bloque G)
**Relacionado:** [rediseño de la pestaña Soporte](2026-11-17-mod05-pestana-soporte-rediseno-ux.md), [detalle del ticket](2026-11-16-mod10-detalle-ticket-ux.md) y [bandeja con colas](2026-11-18-mod10-bandeja-colas-de-trabajo-ux.md) (vigentes; esta spec las complementa y no las reemplaza) · [ficha estilo UISP](2026-11-10-mod05-ficha-suscriptor-estilo-uisp-ux.md)

---

## 0. Principio rector

Complementar sin retroceso: ninguna cola, filtro, dato de la fila, acción del ticket ni estado vacío desaparece ni queda más lejos. El detalle del ticket no se rediseña: se muestra el mismo, en otro lugar. De UISP se adopta la disposición, no sus atajos.

## 1. Hechos verificados (2026-11-20, `main` en `e3a4d127`)

Medido en el Chrome del usuario (1464×788, administrador) sobre un suscriptor con 11 tickets importados y cerrados, y sobre la misma ficha en la instancia real de UISP.

| # | Hecho | Fuente |
|---|---|---|
| H1 | UISP muestra lista (≈510 px) y conversación a la vez; el ticket más reciente ya está abierto y la caja de respuesta siempre visible | Observado en UISP |
| H2 | La fila de UISP lleva número, fecha, asunto, dos líneas del relato y cantidad de comentarios | Observado en UISP |
| H3 | En iWana la lista ocupa todo el ancho y el ticket abre en un panel de 896 px que la cubre; pasar al siguiente exige cerrar y volver a pulsar | `SubscriberSupportTab.tsx:416`; medido |
| H4 | La primera fila empieza en el píxel 478; filas de 60 px; se ven 5 de 11; «Visitas» queda en el píxel 1200 | Medido |
| H5 | La fila de iWana lleva número, asunto, estado, prioridad, tipo, responsable, adjuntos y fecha; no lleva relato ni cantidad de comentarios | Medido |
| H6 | Colas, prioridad y tipo se escriben en la URL; el ticket abierto no | `SubscriberTicketsSection.tsx:97-112`; medido |
| H7 | La lista ya recibe la descripción del ticket (la usa la búsqueda) | `SubscriberTicketsSection.tsx:121` |
| H8 | En los tickets importados la descripción está vacía y el relato vive en el primer comentario; el detalle muestra «Sin descripción adicional registrada para este caso» sobre ese relato | `AssuranceTicketDetail.tsx:1211`; medido |
| H9 | El panel del ticket tiene lo que UISP no: personas, área, visita y orden, adjuntos y registro | Medido |
| H11 | La sección «Visitas» de la pestaña excluye las visitas que tienen ticket: solo muestra las que nacen de una oportunidad o un contrato | `SubscriberVisitsSection.tsx:179-184`; RF-SO-06 de la spec del 2026-10-20 |
| H12 | La visita de un ticket se ve dentro del ticket, en «Visita y orden de trabajo» | `AssuranceTicketDetail.tsx`; medido |
| H13 | La solicitud de visita creada desde un ticket no guarda el suscriptor: el filtro de visitas por suscriptor no la trae | `visit-request-origin-orchestration.ts:441-451` |
| H14 | Tras el paso 1, a 1440×900: filas de 116 px (antes 60), 3 visibles (antes 5), primera fila en el píxel 542 (antes 478); el ticket abierto al entrar era el quinto de la lista y quedaba fuera de la vista | Medido con el suscriptor sintético |
| H10 | La bandeja de Mesa de ayuda mostraba «3 tickets» en «Todos» mientras este suscriptor tenía 11 | Medido; **causa sin investigar** |

## 2. Problema

Para leer la historia de soporte de un cliente hay que abrir y cerrar un panel por cada ticket (H3), sin ver de qué trata cada uno hasta abrirlo (H5) y sin poder compartir el que se está viendo (H6).

## 3. Alcance

### Paso 1 — la ficha, sin cambios de API

| Bloque | Qué cambia | Se conserva |
|---|---|---|
| **A · Vista dividida** | Con ancho suficiente, lista a la izquierda y el ticket a la derecha, con el mismo componente de detalle. Por debajo de ese ancho, el panel actual | Todo el detalle del ticket (H9) y sus acciones; el panel en pantallas estrechas y en móvil |
| **B · Ticket en la URL** | El ticket abierto se escribe en la URL; recargar, compartir o «atrás» lo respetan | Los parámetros de H6 |
| **C · Ticket abierto al entrar** | En vista dividida abre el abierto más reciente; sin abiertos, el más reciente. Sin tickets, el estado vacío actual a todo el ancho | En panel (pantalla estrecha) no se abre nada solo |
| **D · Fila con relato** | Una línea de la descripción bajo el asunto, truncada | Los ocho datos de H5; la fila se reorganiza para caber en la columna, sin perder ninguno |
| **E · Visitas a la vista** | Las visitas dejan de quedar bajo toda la lista: la lista tiene su propio desplazamiento | El contenido y las acciones de Visitas |
| **F0 · Descripción vacía** | Si la descripción está vacía y hay comentarios, no se muestra el texto de H8 | El texto, cuando no hay descripción ni comentarios |

### Paso 2 — lo que pide servidor, y Mesa de ayuda

| Bloque | Qué cambia | Se conserva |
|---|---|---|
| **F · Relato y comentarios en la lista** | El listado trae la cantidad de comentarios visibles y, si la descripción está vacía, un extracto del primer comentario | El relato sigue las reglas de visibilidad del comentario: un comentario interno no se muestra a quien no puede verlo |
| **G · Mesa de ayuda** | Anterior y siguiente dentro del ticket, según la lista filtrada; la línea de relato bajo el asunto en la tabla | La tabla, sus columnas, colas, filtros y el panel; **no pasa a vista dividida** |
| **H · Importados en la bandeja** | Se investiga H10 y se documenta; se corrige solo si es un defecto | — |

### Paso 3 — una sola respuesta a «¿tiene una visita pendiente?»

| Bloque | Qué cambia | Se conserva |
|---|---|---|
| **I · Próximas visitas** | Una franja sobre la lista con las visitas pendientes del suscriptor, de cualquier origen: fecha o «por agendar», tipo de trabajo y origen. La de un ticket abre ese ticket en la vista dividida; la de una oportunidad o contrato abre su visita en la agenda. Sin pendientes, la franja es una línea. La sección «Visitas» del fondo se retira como bloque; su historial queda a un clic, como «Historial de visitas» plegable en la misma pestaña (D5) | Cada dato y acción que hoy tiene una visita sin ticket («Abrir en Agendamiento» incluido); la visita de un ticket sigue en su ticket; el contador «Visitas próximas» pasa a contar todas |

| **J · Lista densa** | La fila en vista dividida ocupa como máximo tres líneas: número y asunto; estado, prioridad e indicador de visita; relato. Tipo, responsable, adjuntos y fecha van en esas líneas o en una secundaria compacta, sin añadir una cuarta. El ticket abierto al entrar es el primero de la lista tal como está ordenada (ajusta el bloque C) y la fila seleccionada siempre queda a la vista | Los ocho datos de H5, visibles o con nombre accesible; el orden de la lista; un ticket pedido por URL se respeta y la lista se desplaza hasta él |

**Fuera de alcance:** rediseñar el detalle del ticket, responder desde la lista, etiquetas de ticket, tareas enlazadas al estilo UISP, selección múltiple y cualquier dato del titular que la lista no muestre hoy.

## 4. Contrato de datos del paso 2 (dueño `sr-backend`)

Regla → dato; antes de congelar se cruza cada fila con DTO y origen.

| Regla de pantalla | Dato | Nota |
|---|---|---|
| Mostrar cuántos comentarios tiene | Cantidad de comentarios visibles para quien consulta | Agregado en SQL, no una consulta por ticket |
| Mostrar el relato de un importado | Extracto del primer comentario visible, truncado en servidor | Solo cuando la descripción está vacía; sin datos de terceros añadidos |
| Listar las visitas pendientes del suscriptor | Visitas activas por suscriptor, incluidas las que nacen de un ticket suyo (H13) | La relación ticket → suscriptor se resuelve por puerto del módulo dueño; sin migración salvo que `sr-backend` demuestre que hace falta, y entonces se detiene y avisa |
| Anterior y siguiente | Ninguno nuevo: sale de la lista ya cargada | Al llegar al borde de la página, se desactiva |

## 5. Criterios de aceptación

| # | Paso | Criterio |
|---|---|---|
| CA-1 | 1 | Una prueba de inventario enumera colas, filtros, datos de la fila, acciones del ticket y estados vacíos antes y después |
| CA-2 | 1 | A 1440×900, en vista dividida, se ven a la vez la lista y el ticket abierto, y pasar al siguiente ticket es un clic, medido en navegador |
| CA-3 | 1 | Abrir un ticket lo deja en la URL; recargar o abrir el enlace muestra ese ticket; «atrás» vuelve al anterior |
| CA-4 | 1 | Un enlace a un ticket de otro suscriptor o inexistente abre la pestaña sin ticket y no revela nada |
| CA-5 | 1 | Las acciones del ticket (responder, asignar, cambiar área, solicitar visita, vincular orden, adjuntar) funcionan igual: sus pruebas pasan sin tocar expectativas |
| CA-6 | 1 | A 375 px y por debajo del ancho de corte, la pestaña se comporta como hoy, sin desplazamiento lateral |
| CA-7 | 1 | La lista se recorre con teclado y anuncia el ticket seleccionado; axe sin violaciones en claro y oscuro |
| CA-8 | 1 | «Visitas» se alcanza sin recorrer toda la lista |
| CA-9 | 2 | La cantidad de comentarios coincide con los que ve quien consulta, con una prueba por rol |
| CA-10 | 2 | El extracto nunca muestra un comentario que el detalle no mostraría a ese usuario |
| CA-11 | 2 | En Mesa de ayuda, anterior y siguiente recorren la lista filtrada sin cerrar el panel; la tabla conserva sus columnas |
| CA-12 | 2 | H10 queda explicado en el informe, con evidencia |
| CA-13 | 3 | La franja muestra toda visita pendiente del suscriptor, nazca de un ticket, una oportunidad o un contrato, con una prueba de integración por origen |
| CA-14 | 3 | Cada visita lleva a su origen con un clic; ninguna aparece dos veces en la pestaña |
| CA-15 | 3 | La franja no muestra visitas de otro suscriptor ni de otro tenant, y respeta el permiso de lectura de Programación |
| CA-16 | 3 | A 1440×900 la franja se ve sin desplazar; el historial de visitas sin ticket sigue a un clic |
| CA-17 | 3 | A 1440×900, en vista dividida, se ven al menos 5 filas de la lista con la franja de visitas presente, medido en navegador |
| CA-18 | 3 | Al entrar y al abrir un ticket por URL, la fila seleccionada está visible en la lista sin desplazar a mano |

## 6. Decisiones

Resueltas el 2026-11-20 por el usuario, con la recomendación.

| # | Decisión | Resuelto | Dueño |
|---|---|---|---|
| D1 | Ancho de corte y reparto de la vista dividida, y dónde va el lateral del ticket cuando no cabe | Lo dictamina `ds-owner` antes de construir; punto de partida: dividir desde 1280 px, lista de unos 400 px | Usuario |
| D2 | Mesa de ayuda en vista dividida | No: tabla con anterior y siguiente (bloque G) | Usuario |
| D3 | Qué ticket se abre al entrar | El abierto más reciente; sin abiertos, el más reciente. Sustituido en v1.2 por el bloque J: el primero de la lista tal como está ordenada | Usuario |
| D4 | Dónde vive la enmienda | Spec nueva que complementa las tres vigentes, sin editarlas | Usuario |
| D5 | Si la sección «Visitas» del fondo se retira o se renombra | Se retira y se reemplaza por la franja única (pedido del usuario, 2026-11-20). El historial queda plegable en la pestaña, cerrado por defecto, porque la agenda no filtra por suscriptor (decisión del usuario, 2026-11-20) | Usuario |

## 7. Orden sugerido

Paso 1: `ds-owner` dictamina D1 → `sr-qa` fija la línea base → `fe-platform` construye A–F0 → `sr-qa` verifica. Paso 2: `sr-backend` congela §4 e investiga H10 con sus revisores → `fe-platform` conecta F y G → `sr-qa`. El plan de orquestación se emite tras el G0.
