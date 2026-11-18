# Spec UX — MOD10 Mesa de ayuda · Bandeja con colas de trabajo

**Versión:** 1.0
**Estado:** Aprobado (G0) por el usuario en sesión el 2026-11-18 · D1–D4 resueltas con la recomendación · Plan: [2026-11-18-mod10-bandeja-colas-de-trabajo](../plans/2026-11-18-mod10-bandeja-colas-de-trabajo.md)
**Fecha:** 2026-11-18
**Emisor:** Claude Code, con criterio de AI-PROD-UX
**Alcance de pantalla:** `/dashboard/assurance` (resumen y tabla); no cambia el detalle del ticket
**Relacionado:** [detalle del ticket](2026-11-16-mod10-detalle-ticket-ux.md) (cerrado, G6.5 2026-11-18) · [colas de Suscriptores](2026-10-18-mod05-suscriptores-ux-rediseno-spec.md) (precedente de colas con conteo) · [informe de la cola](../informes/INFORME-MOD10-ASSURANCE-UI-COLA-v1.0.md)

---

## 0. Principio rector

Complementar sin retroceso, igual que [el detalle, §0](2026-11-16-mod10-detalle-ticket-ux.md): ningún indicador, filtro, enlace entrante ni acción de la bandeja desaparece ni queda más lejos.

## 1. Hechos verificados (2026-11-18, `main` en `d479261e`)

| # | Hecho | Fuente |
|---|---|---|
| H1 | A 1440×900 la primera fila de la tabla empieza en el píxel 1125: no se ve al entrar | Medido en navegador |
| H2 | Encima de la tabla hay 4 indicadores (Abiertos, En progreso, En riesgo de incumplir, Visitas técnicas) y 2 paneles (por prioridad y tipo; Casos asignados, Resueltos hoy, SLA vencidos) | `AssuranceClient.tsx:420-449`, `:457-517` |
| H3 | «Abiertos» cuenta solo el estado Abierto, y su texto dice «casos sin cierre definitivo» | `assurance-dashboard.service.ts:79`; `AssuranceClient.tsx:422-425` |
| H4 | La tabla tiene 8 columnas y ancho mínimo de 980 px; no muestra cliente, apertura ni vencimiento; el número y «Ver detalle» abren lo mismo | `AssuranceTicketsTable.tsx:199-212`, `:319` |
| H5 | Filtros en la URL: estado, prioridad, tipo, área y plazo; cada uno admite un solo valor. El de plazo no tiene control visible | `AssuranceClient.tsx:57`; `dto/index.ts:126-140` |
| H6 | La búsqueda filtra solo la página cargada | `AssuranceClient.tsx:168-178`; `AssuranceTicketsTable.tsx:121` |
| H7 | La API acepta `assignedUserId` y `order=urgency`; no tiene «sin responsable», varios estados a la vez ni búsqueda por texto | `dto/index.ts:126-150`; `tickets.service.ts:152-169` |
| H8 | El resumen carga todos los tickets del tenant en memoria y ya calcula el conteo por área, que el portal no usa | `assurance-dashboard.service.ts:32`, `:41`, `:73` |
| H9 | El listado ya trae adjuntos, visita activa y orden de ejecución por fila | `api-client.ts:3465-3469` |
| H10 | El inicio enlaza a la bandeja con `?status=OPEN` y `?slaBreachStatus=AT_RISK` | `dashboard-role-composition.ts:437`, `:446`; `dashboard-module-health.ts:111` |
| H11 | Texto de desarrollo visible: «cuando el backend entregue el dato», «entregados por el backend», «`/api/v1/assurance`», «empresa autenticada» | `AssuranceClient.tsx:378`, `:458`, `:517`, `:602` |

## 2. Problema

La bandeja no responde qué atender ahora, qué está por vencer ni qué está sin asignar, y para ver un solo ticket hay que desplazar más de una pantalla (H1).

## 3. Alcance

### Paso 1 — disposición y lo que la API ya permite

| Bloque | Qué cambia | Se conserva |
|---|---|---|
| **A · Cabecera** | Una línea: título, casos activos, búsqueda y «Nuevo ticket». Sin subtítulo técnico | «Nuevo ticket» con su guarda de rol; avisos de éxito, error y página fuera de rango |
| **B · Colas de trabajo** | Fila de `PortalFilterChip` que reemplaza los 4 indicadores: Míos, Por vencer, Espera del cliente, Visita técnica, Todos. Cada cola escribe sus filtros en la URL; la cola activa se marca con `aria-pressed`. Conteo solo donde el resumen ya lo da (Por vencer, Visita técnica) | Los valores de H2 siguen visibles: como conteo de cola o en el bloque F. Los enlaces de H10 abren la cola equivalente |
| **C · Filtros** | Prioridad, Tipo, Área y Estado en una fila bajo las colas; el de plazo gana control visible | Los cinco filtros de H5 y «Limpiar filtros» |
| **D · Tabla** | Cinco columnas: Ticket (número, prioridad, asunto, adjuntos), Estado (con el de su visita u orden si existe), Responsable y área, Vence, Actualizado. La fila entera abre el ticket; desaparece «Ver detalle» como segundo control | Todos los datos de H4: tipo pasa a la línea del ticket; ningún dato se pierde. `?ticketId=`, paginación y tamaño de página |
| **E · Vence** | Tiempo relativo («Vence en 3 h», «Vencido hace 2 días») con la fecha exacta como `title`; sin política de plazo dice «Sin plazo», nunca «En tiempo» | Variante de color del estado de plazo actual |
| **F · Resumen** | Prioridad, tipo, área (H8), Casos asignados y Resueltos hoy pasan a un bloque plegado al pie | Sigue reservado a quien hoy ve el resumen |
| **G · Asignarme** | Botón en la fila de un ticket sin responsable; asigna a quien consulta sin abrir el ticket | Guarda actual de asignación (`canManage`) |
| **H · Orden** | `order=urgency` por defecto | Paginación de servidor |
| **I · Vocabulario** | Fuera los textos de H11; «Cola operativa de tickets» pasa a «Bandeja»; «SLA» pasa a «Plazo de atención», como en el detalle | — |

### Paso 2 — lo que pide servidor

| Bloque | Qué cambia | Se conserva |
|---|---|---|
| **J · Colas exactas** | Parámetro de cola en el listado y conteo por cola en el resumen, calculado en SQL: Míos y Todos solo con casos activos; **Sin asignar**; **Vencidos** (los dos estados de incumplimiento); Espera del cliente | Los filtros sueltos de H5 siguen funcionando y se combinan con la cola |
| **K · Búsqueda** | Por número, asunto o cliente, en servidor y en la URL | La paginación |
| **L · Cliente en la fila** | Nombre del solicitante bajo el asunto | Nulo con titular bloqueado o suprimido, o sin `crm.subscribers.read`, como en el detalle |

**Fuera de alcance:** bandeja partida (lista y detalle a la par), vistas guardadas, selección múltiple, consola de la orden de ejecución.

## 4. Contrato de datos del paso 2 (dueño `sr-backend`)

Regla → dato; antes de congelar se cruza cada fila con DTO y origen.

| Regla de pantalla | Dato | Nota |
|---|---|---|
| Pedir una cola | Parámetro de cola en `GET /assurance/tickets` | «Activo» = estado distinto de Resuelto, Cerrado y Cancelado |
| Contar cada cola | Conteo por cola en el resumen, relativo a quien consulta | Sustituye la carga en memoria de H8 |
| Buscar | Parámetro de texto en el listado | El cliente solo se busca con `crm.subscribers.read` |
| Mostrar el cliente | Nombre visible del solicitante por fila | Misma regla de nulo que el detalle |

## 5. Criterios de aceptación

| # | Paso | Criterio |
|---|---|---|
| CA-1 | 1 | Una prueba de inventario enumera indicadores, filtros, columnas y acciones de H2, H4 y H5 antes y después |
| CA-2 | 1 | A 1440×900 se ven al entrar al menos 6 filas de la tabla, medido en navegador |
| CA-3 | 1 | Cada cola deja sus filtros en la URL; recargar o compartir el enlace reproduce la misma lista |
| CA-4 | 1 | Los enlaces de H10 siguen llegando a la misma lista de tickets |
| CA-5 | 1 | Un ticket sin política de plazo nunca muestra «En tiempo» |
| CA-6 | 1 | «Asignarme» respeta la guarda de asignación: una prueba con permiso y otra sin él |
| CA-7 | 1 | Ningún texto de H11 queda visible; `system-vocabulary-review` sin hallazgos |
| CA-8 | 1 | A 375 px no hay desborde horizontal; la tabla se lee como lista |
| CA-9 | 1 | Colas y filtros se operan con teclado; axe sin violaciones en claro y oscuro |
| CA-10 | 2 | El conteo de cada cola coincide con el total de su lista, con una prueba de integración por cola |
| CA-11 | 2 | El resumen no carga tickets en memoria: sus cifras salen de agregados SQL |
| CA-12 | 2 | La búsqueda encuentra por número, asunto y cliente, y no devuelve nada de otro tenant |
| CA-13 | 2 | El nombre del cliente no aparece con titular bloqueado o suprimido ni sin el permiso |

## 6. Decisiones

Resueltas el 2026-11-18 por el usuario, con la recomendación.

| # | Decisión | Resuelto | Dueño |
|---|---|---|---|
| D1 | Qué significa «Abiertos» (H3) | «Todos» cuenta los casos activos; «Abierto» queda solo como estado | Usuario |
| D2 | Cola por defecto al entrar | «Míos» para soporte y técnico; «Todos» para quien administra | Usuario |
| D3 | Las colas Sin asignar y Vencidos, que dependen del paso 2 | No mostrarlas hasta que existan; no simularlas en el cliente | Usuario |
| D4 | Si el técnico ve «Asignarme» | No: hoy no puede asignar | Usuario |
| D5 | Si Vencidos incluye casos cerrados con plazo incumplido (2026-11-18, ola 4) | Sí: Vencidos cuenta los dos estados de incumplimiento sin filtrar por activo y coincide con «SLA vencidos» | Usuario |

## 7. Orden sugerido

Paso 1: `fe-platform` construye A–I → `sr-qa` verifica. Paso 2: `sr-backend` congela §4 y construye J–L en la API → `fe-platform` las conecta → `sr-qa`. El plan de orquestación, con su matriz de dispatch y su lanzador, se emite tras el G0.
