# Spec UX — MOD11 Operaciones · Consola de la orden de ejecución: densidad y enlaces

**Versión:** 1.0
**Estado:** Aprobado (G0) por el usuario en sesión el 2026-11-18 · D1–D4 resueltas con la recomendación · Plan: [2026-11-18-mod11-consola-orden-densidad-y-enlaces](../plans/2026-11-18-mod11-consola-orden-densidad-y-enlaces.md)
**Fecha:** 2026-11-18
**Emisor:** Claude Code, con criterio de AI-PROD-UX
**Alcance de pantalla:** panel de detalle de `/dashboard/operations/execution-orders?executionOrderId=`; no cambia la bandeja de órdenes ni la agenda
**Relacionado:** [consola por requisito y por momento](2026-10-05-mod11-consola-ot-requisito-ux.md) v1.5 (vigente; esta spec la complementa y no la reemplaza) · [el requisito como eje](2026-09-14-mod11-consola-ot-requisito-como-eje-design.md) · [detalle del ticket](2026-11-16-mod10-detalle-ticket-ux.md) (precedente de enlaces con regla de nulo) · MOD13 Aprovisionamiento

---

## 0. Principio rector

Complementar sin retroceso: ningún dato, requisito, acción ni estado de la consola desaparece ni queda más lejos. Rigen sin cambio las reglas de la spec vigente: las acciones salen solo de `allowedActions`; no hay acordeones (reducir es no montar); la firma es el último requisito de captura; la custodia se consulta solo al abrir el registro de equipo.

## 1. Hechos verificados (2026-11-18, `main` en `64911917`)

Medido en navegador a 1440×900 sobre OTE-20261111-003 (instalación, en progreso, rol administrador).

| # | Hecho | Fuente |
|---|---|---|
| H1 | El panel mide 768 px de ancho y 2662 px de alto: casi tres pantallas | Medido |
| H2 | «Compromiso» empieza en el píxel 1075 y «Requisitos» en el 1280: ninguno se ve al abrir | Medido |
| H3 | Antes van el resumen (226 px) y Aprovisionamiento (708 px), que no figura en el orden de la spec vigente §4.1 | Medido; `ExecutionOrderMomentContainer.tsx:190`, `:199` |
| H4 | El número de la orden aparece cuatro veces en la primera pantalla; estado y técnico, dos | Medido |
| H5 | Dentro de Requisitos (1176 px), «Evidencia y conformidad» se repite como título tres veces | Medido |
| H6 | «Cierre» empieza en el píxel 2645 | Medido |
| H7 | El panel de Aprovisionamiento está siempre montado: entrega al contenedor el estado que usa el gate de cierre y el contexto del paso de contrato | `ExecutionOrderMomentContainer.tsx:202-203` |
| H8 | El detalle de la orden no trae cliente, dirección, ticket ni suscriptor; el suscriptor y el contrato que se ven salen del panel de Aprovisionamiento, como texto | `execution-orders.ts:218-243` |
| H9 | La consola no tiene enlaces a la ficha del suscriptor, al ticket de origen ni a la visita | `grep` de `href` en `ExecutionOrder*.tsx` |
| H10 | Una orden sin ventana gasta tres líneas en explicarlo dentro del resumen | Medido |

## 2. Problema

Quien abre una orden para trabajarla no ve qué le falta ni qué puede hacer sin desplazar más de una pantalla (H2), y no puede saltar al cliente ni al caso que la originó (H9).

## 3. Alcance

### Paso 1 — disposición, sin cambios de API

| Bloque | Qué cambia | Se conserva |
|---|---|---|
| **A · Cabecera** | Una franja: número, tipo, estado y resultado como hoy; sitio, ventana, responsable y plantilla en una fila de datos compacta. El número no se repite en el cuerpo | Los ocho datos del resumen; el texto de ayuda de la ventana ausente pasa a `title` y a una línea |
| **B · Orden del expediente** | Vuelve el orden de la spec vigente §4.1: cabecera, Compromiso, Requisitos, Cierre | Todas las secciones y sus avisos (sin conexión, sincronización, error, éxito) |
| **C · Aprovisionamiento como requisito** | Entra en el índice de requisitos, en el lugar que ya ocupa su fila; deja de repetir orden, estado y técnico | Todos sus datos propios (suscriptor, plan, contrato, equipo, router, red, método, reserva) y sus acciones; el gate de cierre y «Revisar aprovisionamiento» |
| **D · Índice activo** | La lista de requisitos es navegación: una línea por requisito con estado y razón; se monta el cuerpo de uno a la vez, por defecto el primer pendiente. Los homónimos se distinguen por su etiqueta de plantilla | Estado, razón, acción y registros de cada requisito; la firma al final; el aviso de requisitos pendientes |
| **E · Cierre a la vista** | Barra fija al pie con el avance de obligatorios y lo que falta; lleva al cierre | La sección de cierre completa, su copy y su gate; el avance cuenta solo obligatorios |
| **F · Vocabulario** | Revisión con `system-vocabulary-review`; «OT» visible pasa a «orden» donde aún aparezca | Copy cerrado de la spec vigente §5 y §15 |

### Paso 2 — lo que pide servidor

| Bloque | Qué cambia | Se conserva |
|---|---|---|
| **G · Enlaces** | A la ficha del suscriptor, al ticket de origen y a la visita en Programación | Nulo sin el permiso del módulo destino, y con titular bloqueado o suprimido, como en el detalle del ticket |
| **H · Cliente en la cabecera** | Nombre visible, dirección del servicio y municipio | Misma regla de nulo; sin teléfono ni documento |

**Fuera de alcance:** bandeja de órdenes, agenda, línea de tiempo, anulación, enlace a Oportunidades, cambios al gate de cierre, a la plantilla o a MOD13.

## 4. Contrato de datos del paso 2 (dueño `sr-backend`)

`ExecutionOrderDetail` está congelado por la spec vigente §10: el paso 2 lo amplía con campos opcionales y sube su versión; antes de congelar se cruza cada fila con DTO y origen.

| Regla de pantalla | Dato | Nota |
|---|---|---|
| Enlazar al suscriptor | Identificador del suscriptor | Solo con `crm.subscribers.read` y titular no bloqueado |
| Enlazar al ticket | Identificador y número del ticket de origen | Solo con lectura de Mesa de ayuda |
| Enlazar a la visita | Identificador del evento de agenda | Solo si existe y con lectura de Programación |
| Mostrar el cliente | Nombre visible, dirección y municipio | Se leen por puerto del módulo dueño; MOD11 no consulta tablas ajenas |

## 5. Criterios de aceptación

| # | Paso | Criterio |
|---|---|---|
| CA-1 | 1 | Una prueba de inventario enumera datos, requisitos, acciones y avisos de la consola antes y después, por cada momento de la spec vigente §4 |
| CA-2 | 1 | A 1440×900, al abrir una instalación en progreso se ven sin desplazar el compromiso y el primer requisito pendiente, medido en navegador |
| CA-3 | 1 | La altura total del panel baja de 2662 px a 1300 px o menos en la misma orden |
| CA-4 | 1 | El cierre de una instalación sigue exigiendo el aprovisionamiento certificado: las pruebas del gate pasan sin tocar sus expectativas |
| CA-5 | 1 | Ninguna acción aparece fuera de `allowedActions`; la matriz de 12 combinaciones de la spec vigente §4 sigue en verde |
| CA-6 | 1 | El número de la orden aparece una vez en la primera pantalla |
| CA-7 | 1 | El índice se opera con teclado y anuncia el requisito activo; axe sin violaciones en claro y oscuro |
| CA-8 | 1 | A 375 px no hay desborde horizontal y la barra de cierre no tapa la acción del requisito |
| CA-9 | 2 | Cada enlace abre el destino correcto y no existe sin su permiso: una prueba con permiso y otra sin él por enlace |
| CA-10 | 2 | Con titular bloqueado o suprimido no se ven nombre, dirección ni enlace al suscriptor |
| CA-11 | 2 | Ningún dato del paso 2 cruza tenants; MOD11 no importa internos de otros módulos (`boundary-reviewer`) |

## 6. Decisiones

Resueltas el 2026-11-18 por el usuario, con la recomendación.

| # | Decisión | Resuelto | Dueño |
|---|---|---|---|
| D1 | Cómo deja Aprovisionamiento de estar siempre pintado sin romper el gate (H7) | Subir su lectura al contenedor (un hook) y montar el cuerpo solo cuando es el requisito activo. Si resulta inviable sin tocar MOD13, se mantiene montado y se reduce lo que pinta | Usuario |
| D2 | Si el índice de un requisito a la vez cumple «sin acordeones» | Sí: es navegación con un solo cuerpo montado, no pliegue de secciones; `prod-ux` lo ratifica antes de construir | Usuario |
| D3 | Requisito activo al abrir | El primer obligatorio pendiente; en órdenes terminales, ninguno (solo lectura del índice) | Usuario |
| D4 | Dónde vive la enmienda | Spec nueva que complementa la v1.5, sin editarla | Usuario |

## 7. Orden sugerido

Paso 1: `prod-ux` ratifica D2 → `fe-platform` construye A–F → `sr-qa` verifica. Paso 2: `sr-backend` congela §4 y lo construye con sus revisores → `fe-platform` lo conecta → `sr-qa`. El plan de orquestación, con su matriz de dispatch y su lanzador, se emite tras el G0.
