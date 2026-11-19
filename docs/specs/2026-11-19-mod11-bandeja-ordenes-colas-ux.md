# Spec UX — MOD11 Operaciones · Bandeja de órdenes de ejecución con colas

**Versión:** 1.1
**Estado:** Aprobado (G0) por el usuario en sesión el 2026-11-19 · D1–D4 resueltas con la recomendación · Plan: [2026-11-19-mod11-bandeja-ordenes-colas](../plans/2026-11-19-mod11-bandeja-ordenes-colas.md)
**Fecha:** 2026-11-19
**Cambios v1.1 (2026-11-19, decisiones del usuario en ejecución):** §3 D conserva las 8 columnas; §3 B reemplazado por colas Activas, Por programar, Sin asignar, Hoy, Mías y Todas con conteos (los estados pasan al filtro Estado); CA-2 aceptado con 6 filas. Detalle en [INFORME-MOD11-BANDEJA-ORDENES-COLAS-v1.0](../informes/INFORME-MOD11-BANDEJA-ORDENES-COLAS-v1.0.md) §5–§6.
**Emisor:** Claude Code, con criterio de AI-PROD-UX
**Alcance de pantalla:** `/dashboard/operations/execution-orders` (encabezado, filtros y tabla); no cambia la consola de la orden ni la bandeja de tareas
**Relacionado:** [subrutas y bandeja de OT](2026-09-13-mod11-operaciones-subrutas-bandeja-ot-ux.md) §4.5, §6 y §7.2 (vigente; esta spec la complementa y no la reemplaza) · [tablas operativas](2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md) · [bandeja de tickets con colas](2026-11-18-mod10-bandeja-colas-de-trabajo-ux.md) (precedente) · [consola: densidad y enlaces](2026-11-18-mod11-consola-orden-densidad-y-enlaces-ux.md) · [bloqueo en proyecciones](2026-11-05-privacy-bloqueo-proyecciones-operativas-spec.md) (F-4, sin G0)

---

## 0. Principio rector

Complementar sin retroceso: ningún filtro, columna, enlace entrante ni estado vacío de la bandeja desaparece ni queda más lejos. Rigen sin cambio las reglas de la spec vigente: encabezados no ordenables (ADR-065 §22-bis), un solo pie según `meta.capabilities`, estado en la URL y detalle por `?executionOrderId=`.

## 1. Hechos verificados (2026-11-19, `main` en `c9c36094`)

Medido en navegador a 1440×900, rol administrador, 47 órdenes.

| # | Hecho | Fuente |
|---|---|---|
| H1 | La primera fila empieza en el píxel 748; se ven 2 filas de 20 (65 px cada una) | Medido |
| H2 | Encima hay dos bloques de título con descripción y los seis filtros en dos filas | `ExecutionOrdersClient.tsx:319-321`, `:333-334`; medido |
| H3 | La tabla tiene 8 columnas y ancho mínimo de 1024 px; a 375 px se desplaza de lado dentro de su contenedor | `ExecutionOrdersTable.tsx:93`; medido |
| H4 | La lista mezcla órdenes abiertas y terminadas: 18 abiertas y 2 ejecutadas en la primera página | Medido |
| H5 | 18 de 20 filas dicen «Por programar» en la columna de ventana | Medido |
| H6 | El listado filtra por un solo estado, resultado, tipo, responsable, sede y rango de ventana; no tiene búsqueda, varios estados, «sin responsable» ni «sin ventana» | `execution-orders.dto.ts:806-848` |
| H7 | La spec vigente fija seis filtros, sin búsqueda de texto y sin orden por encabezado | Spec del 2026-09-13 §4.5 |
| H8 | Cinco pantallas enlazan aquí con `?executionOrderId=`: ticket, equipos del suscriptor, aprovisionamiento, visitas y agenda | `assurance-ticket-links.ts:63`, `SubscriberEquipmentTab.tsx:64`, `NetworkProvisioningInboxClient.tsx:341`, `PendingVisitRequestDetailPanel.tsx:518`, `SchedulingClient.tsx:1532` |
| H9 | La columna Cliente muestra `customerDisplayLabel` aun con titular bloqueado (fuga F-4, pendiente de G0) | `execution-orders.service.ts:3961` |

## 2. Problema

Al entrar no se ve el trabajo (H1), y la lista no separa lo que hay que mover de lo que ya terminó ni dice qué falta programar o asignar (H4–H6).

## 3. Alcance

### Paso 1 — disposición y lo que la API ya permite

| Bloque | Qué cambia | Se conserva |
|---|---|---|
| **A · Encabezado** | Un solo bloque: título y total. Fuera el segundo título y las dos descripciones | El marco del módulo, las pestañas y «Crear tarea» |
| **B · Colas** | Fila de `PortalFilterChip`: Asignadas, En progreso, Bloqueadas y Todas, cada una como el filtro de estado que la API ya tiene; «Mías» para quien ejecuta, por responsable. La cola escribe sus filtros en la URL y se marca con `aria-pressed`. Sin conteos | El filtro de Estado sigue disponible con todos sus valores |
| **C · Filtros** | Los seis filtros de la spec vigente en una fila; el rango de ventana se compacta | Los seis filtros, «Limpiar filtros» y sus textos de §7.2 |
| **D · Tabla** | Cinco columnas: Orden (número, tipo de trabajo y cliente), Estado (con su resultado), Ventana, Asignado a y Municipio. La fila entera abre la consola | Los ocho datos de hoy; el número sigue en tipografía de datos; `?executionOrderId=`, paginación y pie |
| **E · Ventana** | Con ventana: día y hora relativos («Hoy 14:00», «Mañana 9:00», fecha si es más lejos) con la fecha exacta como `title`. Sin ventana: «Por programar» en abiertas y «Sin ventana planificada» en terminales, como hoy | La regla E4 de ventana nula |
| **F · Móvil** | A menos de 768 px la tabla se lee como lista de tarjetas, sin desplazamiento lateral | Todos los datos de la fila |
| **G · Vocabulario** | Repaso con `system-vocabulary-review` | Copy cerrado de la spec vigente §6 y §7 |

### Paso 2 — lo que pide servidor

| Bloque | Qué cambia | Se conserva |
|---|---|---|
| **H · Colas exactas** | Parámetro de cola en el listado y conteo por cola: **Activas** (no terminales), **Por programar** (activas sin ventana), **Sin asignar** (activas sin responsable) y **Hoy** (ventana que empieza hoy, zona del tenant). «Mías» pasa a contar solo activas | Los filtros sueltos se combinan con la cola |
| **I · Entrada por defecto** | Sin parámetros, la bandeja abre en Activas | «Todas» y el filtro de Estado muestran las terminadas a un clic; un enlace con filtros explícitos no se reinterpreta |
| **J · Búsqueda por número** | Campo de búsqueda por número de orden, en servidor y en la URL | La paginación |

**Fuera de alcance:** búsqueda por cliente y cualquier cambio a la columna Cliente (H9: espera el G0 de la spec de bloqueo; esta spec no corrige ni amplía F-4), orden por encabezado, agendar desde la fila, selección múltiple, bandeja de tareas.

## 4. Contrato de datos del paso 2 (dueño `sr-backend`)

Regla → dato; antes de congelar se cruza cada fila con DTO y origen.

| Regla de pantalla | Dato | Nota |
|---|---|---|
| Pedir una cola | Parámetro de cola en `GET /tasks/execution-orders` | «Activa» = estado no terminal y no anulada |
| Contar cada cola | Conteos por cola, relativos a quien consulta y a su alcance de sede | Agregados SQL; mismo `WHERE` que el listado |
| Abrir en Activas | El portal envía la cola; la API no cambia su comportamiento sin parámetros | Protege a los demás consumidores del listado |
| Buscar por número | Parámetro de texto que compara solo con el número de la orden | Sin búsqueda por cliente (H9) |

## 5. Criterios de aceptación

| # | Paso | Criterio |
|---|---|---|
| CA-1 | 1 | Una prueba de inventario enumera filtros, columnas, estados vacíos y pie antes y después |
| CA-2 | 1 | A 1440×900 se ven al entrar al menos 7 filas, medido en navegador |
| CA-3 | 1 | Cada cola deja sus filtros en la URL; recargar o compartir el enlace reproduce la misma lista |
| CA-4 | 1 | Los cinco enlaces de H8 siguen abriendo la consola de su orden |
| CA-5 | 1 | Ningún encabezado es ordenable ni lleva `aria-sort` |
| CA-6 | 1 | A 375 px no hay desplazamiento lateral, ni de la página ni de la tabla |
| CA-7 | 1 | Colas y filtros se operan con teclado; axe sin violaciones en claro y oscuro |
| CA-8 | 1 | La columna Cliente muestra exactamente lo que mostraba: ni más datos ni otra regla |
| CA-9 | 2 | El conteo de cada cola coincide con el total de su lista, con una prueba de integración por cola |
| CA-10 | 2 | Sin parámetros se ve Activas; un enlace con `status` de un estado terminal sigue mostrando ese estado |
| CA-11 | 2 | La búsqueda encuentra por número y no devuelve órdenes de otro tenant ni fuera del alcance de sede |
| CA-12 | 2 | El listado sin parámetro de cola responde igual que hoy para los demás consumidores (`contract-drift-reviewer`) |

## 6. Decisiones

Resueltas el 2026-11-19 por el usuario, con la recomendación.

| # | Decisión | Resuelto | Dueño |
|---|---|---|---|
| D1 | Cola por defecto antes del paso 2 | «Todas», como hoy; pasa a «Activas» cuando exista (bloque I) | Usuario |
| D2 | Si «Mías» se muestra a quien administra | No: solo a quien puede ser responsable de una orden | Usuario |
| D3 | Si «Hoy» incluye órdenes con ventana vencida sin cerrar | No en esta spec: «Hoy» es ventana que empieza hoy; lo atrasado se trata aparte si se pide | Usuario |
| D4 | Dónde vive la enmienda | Spec nueva que complementa la del 2026-09-13, sin editarla | Usuario |

## 7. Orden sugerido

Paso 1: `fe-platform` construye A–G → `sr-qa` verifica. Paso 2: `sr-backend` congela §4 y construye H–J con sus revisores → `fe-platform` lo conecta → `sr-qa`. El plan de orquestación está enlazado en la cabecera.
