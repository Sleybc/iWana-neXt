# Spec UX — MOD09 Programación · Agenda: densidad y enlaces

**Versión:** 1.0
**Estado:** Aprobado (G0) por el usuario en sesión el 2026-11-19 · D1–D3 resueltas con la recomendación · Plan: [2026-11-19-mod09-agenda-programacion-densidad-y-enlaces](../plans/2026-11-19-mod09-agenda-programacion-densidad-y-enlaces.md)
**Fecha:** 2026-11-19
**Emisor:** Claude Code, con criterio de AI-PROD-UX
**Alcance de pantalla:** `/dashboard/scheduling/agenda` (encabezado, barra de control y las vistas Día, Lista, Semana y Mes); no cambia las bandejas de pendientes ni de visitas sin realizar
**Relacionado:** [agenda diaria con borrador editable](SPEC-WFM-AGENDA-DESPACHO-DIARIO-BORRADOR-EDITABLE-v1.0.md) v1.1 y [centro de agendamiento](SPEC-WFM-SCHEDULING-CENTRO-AGENDAMIENTO-GLASS-v1.0.md) (vigentes; esta spec las complementa y no las reemplaza) · [bandeja de órdenes con colas](2026-11-19-mod11-bandeja-ordenes-colas-ux.md) y [consola: densidad y enlaces](2026-11-18-mod11-consola-orden-densidad-y-enlaces-ux.md) (precedentes)

---

## 0. Principio rector

Complementar sin retroceso: ninguna vista, filtro, acción, enlace entrante ni estado vacío de la agenda desaparece ni queda más lejos. Rigen sin cambio el borrador de despacho, el arrastre de pendientes a la grilla, crear evento desde una celda y el motor de recomendaciones.

## 1. Hechos verificados (2026-11-19, `main` en `9f9aeca0`)

Medido en navegador a 1440×900, rol administrador, tenant de pruebas con 2 técnicos y **sin eventos en noviembre**.

| # | Hecho | Fuente |
|---|---|---|
| H1 | En la vista Día la primera fila de técnico empieza en el píxel 779; se ven 2 filas | Medido |
| H2 | Encima hay tres bloques con título y descripción (página, «Control de agenda», «Despacho diario») y un cuarto encabezado «Vista diaria» con otra frase de ayuda | `SchedulingClient.tsx:976`, `SchedulingToolbar.tsx:100-101`, `ScheduleCalendar.tsx:1255-1261`, `:1568-1571`; medido |
| H3 | La fecha aparece cuatro veces en la primera pantalla | Medido |
| H4 | El panel de control ocupa del píxel 248 al 545: navegación y vistas en una fila, cuatro filtros y «Actualizar» en otra | Medido |
| H5 | En Semana y Mes el contenido empieza en el píxel 601; cada día vacío gasta unas ocho líneas | `ScheduleCalendar.tsx:446`; medido |
| H6 | Cambiar de vista no escribe en la URL: tras pulsar «Semana» o «Mes» la dirección no cambia | Medido |
| H7 | La agenda lee `view`, `fromDate` y `technicianId` de la URL al entrar | `scheduling-ui.ts:631-633` |
| H8 | Los enlaces entrantes llegan con `view=day&fromDate=` (consola de la orden, inicio) o con `technicianId`; ninguno abre un evento concreto | `execution-order-links.ts:46`, `dashboard-attention-queue.ts:63`, `DashboardTodayAgenda.tsx:59`, `SchedulingDashboard.tsx:64` |
| H9 | El detalle de un evento ya se carga por identificador | `SchedulingClient.tsx:531-540` |
| H10 | A 375 px no hay desplazamiento lateral; la página mide 3833 px en Semana | Medido |

**Sin medir:** la grilla con eventos reales (alto de fila con carga, solapes). El plan lo cubre con datos sembrados antes de construir.

## 2. Problema

Quien entra a despachar no ve la grilla sin desplazar (H1), y no puede compartir lo que está viendo ni llegar desde una orden a su visita (H6, H8).

## 3. Alcance

### Paso 1 — disposición, sin cambios de API

| Bloque | Qué cambia | Se conserva |
|---|---|---|
| **A · Encabezado** | Un solo bloque: título, fecha o rango una vez y total de eventos. Fuera las descripciones y el encabezado «Vista diaria» | El marco del módulo y los accesos a Pendientes y Visitas sin realizar |
| **B · Barra de control** | Una fila: Hoy, anterior y siguiente, las cuatro vistas y los cuatro filtros. «Actualizar» pasa a un botón de icono con nombre accesible | Las cuatro vistas, los cuatro filtros, la fecha base y sus valores |
| **C · Grilla arriba** | La grilla de Día sube; la ayuda de arrastre pasa a una línea junto a ella | Filas por técnico, celdas de media hora, crear evento desde la celda, arrastre y borrador |
| **D · Semana y Mes compactos** | Un día sin carga ocupa una línea con «Abrir día»; el detalle aparece solo con carga | Los indicadores del mes, «Abrir día» y todos los datos de un día con carga |
| **E · Estado en la URL** | Vista, fecha base y filtros se escriben en la URL al cambiar | Los parámetros de H7 y los enlaces de H8, sin reinterpretar |
| **F · Vocabulario** | Repaso con `system-vocabulary-review` | Copy cerrado de las specs vigentes |

### Paso 2 — enlaces y pendientes

| Bloque | Qué cambia | Se conserva |
|---|---|---|
| **G · Abrir un evento por enlace** | Un parámetro con el identificador del evento abre su panel sobre el día correspondiente. Lo usan la consola de la orden y el ticket | Con un evento inexistente o ajeno a la sede de quien consulta, la agenda abre sin panel y lo dice |
| **H · Pendientes a la vista** | Conteo de solicitudes por agendar y de visitas sin realizar junto a sus accesos | Los accesos y sus destinos |

**Fuera de alcance:** motor de recomendaciones, reglas del borrador, bandejas de pendientes y de visitas sin realizar, horarios de operación, vista del técnico, y cualquier dato del cliente que la agenda no muestre hoy.

## 4. Contrato de datos del paso 2 (dueño `sr-backend`)

Regla → dato; antes de congelar se cruza cada fila con DTO y origen.

| Regla de pantalla | Dato | Nota |
|---|---|---|
| Abrir un evento por enlace | Identificador del evento en la URL; el detalle ya existe (H9) | Se verifica si el detalle respeta el alcance de sede; si no, es hallazgo para `sec-eng` |
| Enlazar desde la orden | Identificador del evento de agenda en el detalle de la orden | Ya previsto en la spec de la consola §4; se confirma si viaja hoy |
| Contar pendientes | Total de solicitudes por agendar y de visitas sin realizar, con el alcance de quien consulta | Se reutiliza un total existente si lo hay; solo si no, un conteo nuevo |

## 5. Criterios de aceptación

| # | Paso | Criterio |
|---|---|---|
| CA-1 | 1 | Una prueba de inventario enumera vistas, filtros, acciones y estados vacíos antes y después |
| CA-2 | 1 | A 1440×900, en Día, la primera fila de técnico empieza por encima del píxel 400 y se ven al menos 6 filas, medido con datos sembrados |
| CA-3 | 1 | En Semana se ven los siete días sin desplazar cuando ninguno tiene carga |
| CA-4 | 1 | Cambiar vista, fecha o filtro deja el estado en la URL; recargar o compartir el enlace reproduce lo mismo |
| CA-5 | 1 | Los enlaces de H8 siguen abriendo el día o el técnico que abrían |
| CA-6 | 1 | Crear evento desde la celda, arrastrar un pendiente y confirmar el borrador funcionan igual: sus pruebas pasan sin tocar expectativas |
| CA-7 | 1 | La barra y la grilla se operan con teclado; axe sin violaciones en claro y oscuro |
| CA-8 | 1 | A 375 px no hay desplazamiento lateral y la página de Semana sin carga baja de 3833 px a 1600 px o menos |
| CA-9 | 2 | El enlace con evento abre su panel en el día correcto; con un evento inexistente o fuera de alcance no revela nada |
| CA-10 | 2 | Desde la consola de una orden con visita se llega al evento con un clic |
| CA-11 | 2 | Cada conteo coincide con el total de su bandeja, con una prueba de integración |

## 6. Decisiones

Resueltas el 2026-11-19 por el usuario, con la recomendación.

| # | Decisión | Resuelto | Dueño |
|---|---|---|---|
| D1 | Vista por defecto al entrar sin parámetros | La de hoy, sin cambio | Usuario |
| D2 | Si el ticket también enlaza al evento en este frente | Sí, si el dato ya viaja; si pide servidor en MOD10, se deja como deuda | Usuario |
| D3 | Dónde vive la enmienda | Spec nueva que complementa las vigentes, sin editarlas | Usuario |

## 7. Orden sugerido

Paso 1: `sr-qa` siembra datos y fija la línea base → `fe-platform` construye A–F → `sr-qa` verifica. Paso 2: `sr-backend` cruza §4 y construye lo que falte con sus revisores → `fe-platform` lo conecta → `sr-qa`. El plan de orquestación se emite tras el G0.
