# Spec UX — MOD10 Mesa de ayuda · Lateral del ticket en un solo panel

**Versión:** 1.0
**Estado:** Aprobado (G0) por el usuario en sesión el 2026-11-20 · D1–D4 resueltas con la recomendación · Plan: [2026-11-20-mod10-detalle-ticket-lateral-un-panel](../plans/2026-11-20-mod10-detalle-ticket-lateral-un-panel.md)
**Fecha:** 2026-11-20
**Emisor:** Claude Code, con criterio de AI-PROD-UX
**Alcance de pantalla:** el lateral «Datos del caso» de `AssuranceTicketDetail`, en sus tres contenedores: vista dividida de la ficha del suscriptor, panel de Mesa de ayuda y página propia del ticket. No cambia el hilo ni el redactor
**Relacionado:** [detalle del ticket](2026-11-16-mod10-detalle-ticket-ux.md) v1.2 §3 J (vigente; esta spec reemplaza la disposición del riel de cinco tarjetas y conserva todo lo demás) · [Soporte en vista dividida](2026-11-20-mod05-soporte-vista-dividida-ux.md) v1.3

---

## 0. Principio rector

Complementar sin retroceso: ningún dato, acción ni aviso del lateral desaparece. Se agrupan, se ordenan por uso y se oculta solo lo que no dice nada (una caja vacía) o lo que ya se ve en la misma pantalla.

## 1. Hechos verificados (2026-11-20, `main` local en `637e84ae`)

Observado en la captura del usuario y en `AssuranceTicketDetail.tsx`.

| # | Hecho | Fuente |
|---|---|---|
| H1 | El lateral son cinco tarjetas con título y borde: Personas, Atención, Visita y orden de trabajo, Adjuntos y Registro; suman unos 1200 px de alto | `AssuranceTicketDetail.tsx:801-1200`; medido en el panel (2026-11-20) |
| H2 | Solo tres controles cambian algo: estado, responsable y área. El estado flota sobre el lateral, sin etiqueta; responsable está en Personas y área en Atención, aunque los dos comparten guardado | `:695`, `:827`, `:850` |
| H3 | Las fechas están en dos tarjetas: «Abierto» y «Actualizado» en Atención; «Primera respuesta», «Resuelto» y «Cerrado» en Registro | `:865-868`, `:1178-1195` |
| H4 | «Relacionado con» muestra al mismo titular de la ficha desde la que se abrió el ticket | `:812`; captura |
| H5 | «Adjuntos (0)» ocupa una tarjeta para decir que no hay | medido |
| H6 | El mismo componente sirve a tres contenedores; el lateral se pone al lado o debajo según el ancho de su contenedor | spec vista dividida, dictamen D1 |

## 2. Problema

Quien abre un ticket busca dos cosas en el lateral: cambiar a quién le toca y ver la visita o la orden. Las encuentra repartidas entre cinco cajas, mezcladas con datos de consulta y con uno que ya tiene delante (H2–H5).

## 3. Alcance

| Bloque | Qué cambia | Se conserva |
|---|---|---|
| **A · Un panel** | Las cinco tarjetas pasan a un solo panel con secciones separadas por una línea, en este orden: Estado y asignación, Visita y orden de trabajo, Datos del caso, Fechas | Todos los datos y acciones de H1; el comportamiento del lateral según el ancho (H6) |
| **B · Estado y asignación** | El selector de estado entra al panel y muestra el estado actual; responsable y área van en una fila, con su guardado único | Las transiciones permitidas, la nota del cambio de estado, los avisos de plazo y de acciones restringidas, y el guardado conjunto |
| **C · Visita y orden** | Sube al segundo lugar | Sus datos, enlaces y acciones («Solicitar visita», «Vincular orden de trabajo»), sin cambios |
| **D · Datos del caso** | Solicitante, relacionado con y origen. «Relacionado con» no se muestra cuando es el mismo titular de la ficha desde la que se abrió | En Mesa de ayuda y en la página propia, «Relacionado con» se muestra siempre |
| **E · Fechas** | Una sola línea compacta: abierto, primera respuesta, resuelto, cerrado y, si hay política, los dos plazos. «Actualizado» deja de mostrarse; el historial ya lo dice | Los valores y sus reglas (el cierre de un importado no se repite si coincide con la apertura) |
| **F · Adjuntos** | Sale del lateral: la lista de adjuntos va en el hilo, sobre los comentarios, y solo cuando hay alguno | Abrir, descargar y el conteo; adjuntar desde el redactor |

**Fuera de alcance:** el hilo, el redactor, la cabecera del ticket, las reglas de transición, cualquier dato nuevo y cualquier cambio de API.

## 4. Criterios de aceptación

| # | Criterio |
|---|---|
| CA-1 | Una prueba de inventario enumera datos, acciones y avisos del lateral antes y después, en los tres contenedores |
| CA-2 | El lateral baja de unos 1200 px a 700 px o menos en un ticket con visita y orden, medido en el panel de Mesa de ayuda a 1440×900 |
| CA-3 | Estado, responsable y área se ven sin desplazar el lateral al abrir el ticket |
| CA-4 | Cambiar estado, asignar, cambiar área, solicitar visita, vincular orden y adjuntar funcionan igual: sus pruebas pasan sin tocar expectativas |
| CA-5 | En la ficha, «Relacionado con» no aparece si es el titular de esa ficha; en Mesa de ayuda y en la página propia aparece |
| CA-6 | Con cero adjuntos no hay bloque de adjuntos; con uno o más, se ven en el hilo con las mismas acciones |
| CA-7 | El lateral se opera con teclado en el orden visual; axe sin violaciones en claro y oscuro |
| CA-8 | A 375 px no hay desplazamiento lateral |

## 5. Decisiones

Resueltas el 2026-11-20 por el usuario, con la recomendación.

| # | Decisión | Resuelto | Dueño |
|---|---|---|---|
| D1 | Si «Actualizado» se retira de la vista | Sí: lo cubre el historial | Usuario |
| D2 | Dónde van los adjuntos | En el hilo, sobre los comentarios, solo si hay | Usuario |
| D3 | Si el panel único es una primitive nueva o composición de las existentes | Composición; lo dictamina `ds-owner` antes de construir | Usuario |
| D4 | Dónde vive la enmienda | Spec nueva que reemplaza solo la disposición del riel de la spec del 2026-11-16 §3 J | Usuario |

## 6. Orden sugerido

`ds-owner` dictamina D3 → `sr-qa` fija inventario y medición → `fe-platform` construye A–F → `sr-qa` verifica en los tres contenedores, con `test-change-reviewer` sobre las pruebas que cambien. Un solo paso; el plan de orquestación se emite tras el G0.
