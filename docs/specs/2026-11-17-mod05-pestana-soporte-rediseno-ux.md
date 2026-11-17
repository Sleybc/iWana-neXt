# Spec UX — MOD05 Suscriptores · Rediseño de la pestaña Soporte

**Versión:** 1.0
**Estado:** Aprobada — G0 del usuario el 2026-11-17 (D1–D5 según la recomendación de §14)
**Fecha:** 2026-11-17
**Emisor:** AI-PROD-UX, con dictamen de `ds-owner` del 2026-11-17 incorporado (§5.4)
**Alcance de pantalla:** `/dashboard/crm/subscribers/[id]?tab=soporte`
**Sustituye parcialmente:** [pestaña Soporte v1.0](2026-10-20-mod05-pestana-soporte-ux-spec.md) (ver §1)
**Relacionado:** [detalle del ticket MOD10](2026-11-16-mod10-detalle-ticket-ux.md) (no se rediseña aquí) · [ficha estilo UISP](2026-11-10-mod05-ficha-suscriptor-estilo-uisp-ux.md) §0 y §8 · [Firma iWana](2026-07-12-firma-iwana-diseno-visual-design.md)

---

## 0. Principio rector

Complementar sin retroceso: ningún dato, acción, permiso, estado ni mensaje de la pestaña desaparece ni queda más lejos. Se adopta de UISP la lista de tickets densa a ancho completo. CA-1 lo prueba.

## 1. Relación con la spec v1.0

| Sección v1.0 | Situación |
|---|---|
| §1 Objetivo y estructura | **Reemplaza** el párrafo de dos columnas (§3 de esta spec). Sigue vigente: orden de pestañas, QW2 (`?tab=soporte`, flechas, `Home`/`End`), RF-SO-14 (`privacyRestricted` oculta la pestaña) |
| §2 Sección Tickets | **Reemplaza** contenido, orden y vencimiento (§4 y §5). Sigue vigente: número visible nunca UUID, fila completa como única acción, nombre accesible «Abrir ticket {número}: {asunto}» |
| §3 Sección Visitas | **Reemplaza** la disposición (§3) y el contenedor del detalle (§5.4). Sigue vigente: campos, orden, exclusión de visitas de tickets (RF-SO-06), «Abrir en Agendamiento» |
| §4 Permisos y estados | **Vigente completo.** §7 de esta spec lo extiende |
| §5 Crear ticket | **Reemplaza** la composición del diálogo (§8). Siguen vigentes: suscriptor fijado, `requesterRefId`, «Crear ticket»/«Cancelar», mensaje de error, sin segunda búsqueda |
| §6 Buscador del formulario | **Vigente completo** |
| §7 Accesibilidad | Vigente; §10 lo amplía |

## 2. Hechos verificados (2026-11-17, `main` en `b04c8f7e` más el árbol de trabajo)

| # | Hecho | Fuente |
|---|---|---|
| H1 | A 1440×900 la lista empieza en y=541, cada fila mide 113 px y caben 3 filas; Tickets mide 679 px y Visitas ocupa una columna casi vacía sin visitas | Medido en navegador (encargo) |
| H2 | A 375×812 el primer ticket empieza en y=902 y Visitas en y=1619; cabecera de ficha y tablist de 3 filas suman ~750 px | Medido en navegador |
| H3 | Los usuarios para el nombre del responsable solo se cargan al abrir «Crear ticket» o un ticket, y solo con `ASSURANCE_TICKETS_MANAGE`; antes la fila dice «Sin responsable» aunque haya responsable | `SubscriberSupportTab.tsx:91-104`, `:175`; `SubscriberTicketsSection.tsx:149` |
| H4 | `GET /users` exige `USERS_READ`: quien solo lee tickets no puede resolver nombres en el portal | `users.controller.ts:95-97` |
| H5 | El orden de abiertos usa solo el plazo; sin plazo cae a fecha de actualización; la prioridad no participa | `SubscriberTicketsSection.tsx:52-80` |
| H6 | La pestaña trata «Resuelto» como cerrado; el detalle trata como terminal solo Cerrado y Cancelado | `SubscriberTicketsSection.tsx:41-45`; `AssuranceTicketDetail.tsx:130-132` |
| H7 | La fila muestra descripción en 2 líneas, «Abierto el…» con fecha civil sobre un timestamp, badges, responsable y vencimiento: 3 a 5 líneas | `SubscriberTicketsSection.tsx:107-156` |
| H8 | El aviso «Ticket creado y vinculado al suscriptor» es un `PortalAlert` sin cierre encima de todo | `SubscriberSupportTab.tsx:262` |
| H9 | La lista pide `limit: 100` e ignora el total; no hay búsqueda ni filtro por prioridad o tipo; existen los chips Abiertos/Cerrados/Todos | `SubscriberTicketsSection.tsx:194`, `:264-281` |
| H10 | El listado de tickets del servidor no tiene búsqueda, `limit` máx. 100 y ninguna columna ordenable; ordena por creación | `dto/index.ts:123-137`; `tickets.service.ts:127`, `:448-450` |
| H11 | El listado devuelve `fieldDecision`, `workOrderId`, `status` y `slaBreachStatus`, pero no la visita activa ni la orden de ejecución; el detalle sí las resuelve | `tickets.service.ts:456-460`, `:515-546` |
| H12 | Las solicitudes de visita creadas desde un ticket no llevan `subscriberId`: el filtro de WFM por suscriptor no las trae | `visit-request-origin-orchestration.ts:441-451`; `visit-requests.service.ts:238-250` |
| H13 | Visitas excluye las originadas en tickets | `SubscriberVisitsSection.tsx:164-183` |
| H14 | El diálogo de creación tiene 11 campos; el suscriptor fijado se pinta como campo de solo lectura; rótulos «Asunto operativo», «Referencia del objeto» con «Ej. service-001», «Política SLA» con «No disponible» | `AssuranceCreateTicketForm.tsx:238-478`, `:289-295`, `:339`, `:362-363`, `:476-478` |
| H15 | La consulta de tickets se lanza dos veces al montar; puede ser `StrictMode` de desarrollo | Medido en red (encargo); efecto en `SubscriberTicketsSection.tsx:203-205`. **Sin confirmar** |

## 3. Objetivo, trabajos y arquitectura de información

**Objetivo:** que quien atiende al suscriptor sepa en un vistazo qué está abierto, qué urge, quién lo tiene y si hay técnico en camino, y abra o cree un ticket sin buscar.

| Perfil | Trabajo | Lo que necesita en la primera pantalla |
|---|---|---|
| Agente de soporte | «El cliente llama: ¿ya tiene caso abierto?» | Abiertos ordenados por urgencia, asunto, estado, responsable |
| Monitoreo operativo | «¿Este cliente está en una falla conocida o tiene visita?» | Prioridad, tipo, indicador de visita u orden |
| Comercial | «¿Puedo vender o hay un reclamo abierto?» | Conteo de abiertos y vencidos, sin abrir nada |

### Direcciones

| Dirección | Qué es | A favor | En contra |
|---|---|---|---|
| **A · Franja + lista densa a ancho completo + Visitas compacta debajo** | Franja de 3 cifras que filtran; lista de tickets de 1 columna a todo el ancho; Visitas como sección densa debajo, de una línea si está vacía | Duplica las filas visibles; patrón de UISP; un solo eje de lectura; quita la columna vacía (H1); la visita de un ticket ya se ve en su fila (§4) | Con muchos tickets, las visitas propias bajan; se mitiga con la cifra «Visitas próximas» de la franja, que salta a la sección |
| B · Línea de tiempo unificada | Tickets y visitas intercalados por fecha | Una sola lista | Mezcla lo urgente con lo histórico; ordenar por fecha contradice el orden por urgencia; duplica la Actividad de la ficha (spec UISP §3 D) |
| C · Dos columnas 3fr/1fr con riel fijo de visitas | Como hoy, con lista densa | Visitas siempre a la vista | Conserva la columna vacía cuando no hay visitas; la lista sigue estrecha |

**Recomendada: A.** Orden del documento y de lectura: franja → herramientas de lista → Tickets → Visitas (se conserva «Tickets antes que Visitas»).

### Franja de resumen

Una fila de 3 cifras, cada una botón que aplica su filtro y lleva el foco a la lista: **Abiertos** (N) · **Vencidos** (N, tono `error` solo si N > 0) · **Visitas próximas** (N, salta a la sección Visitas). Sin permiso de lectura de una sección, su cifra no se muestra. No añade consultas: se calcula con lo ya cargado.

## 4. Fila densa del ticket

Componente de dominio `assurance/TicketListItem.tsx` (dictamen `ds-owner`). Botón de fila completa, sin controles anidados.

| Línea | Contenido, en orden de lectura |
|---|---|
| 1 | Número (mono, `iwana-secondary-700`) · Asunto (1 línea, truncado con texto completo en el nombre accesible) · a la derecha: plazo («Vence 18 nov, 9:00»; «Vencido hace 2 h» en `error`) |
| 2 | `TicketStatusBadge` · `TicketPriorityBadge` · tipo en texto · Responsable (nombre, «Sin asignar» o «Responsable no disponible») · indicador de trabajo de campo · clip de adjuntos (N) · «Abierto 12 nov» |

- **Fuera de la fila:** la descripción (queda en el detalle) y el ícono de flecha.
- **Altura objetivo:** ≤ 64 px en escritorio (desde `sm`); en móvil la línea 2 puede envolver, ≤ 96 px.
- **Responsable:** nunca «Sin responsable». Sin nombre resuelto y con `assignedUserId`, «Responsable no disponible» (regla de la spec MOD10 v1.1, `getAssuranceAssigneeLabel`).
- **Indicador de trabajo de campo** (`fieldWork`), solo ícono + texto, nunca lima:

| Paso | Dato | Texto |
|---|---|---|
| 1 | `status = FIELD_SERVICE_REQUESTED` o `fieldDecision = FIELD_SERVICE_REQUIRED` | «Visita solicitada» |
| 1 | `workOrderId` no nulo | «Orden de trabajo vinculada» |
| 2 | Visita activa con ventana (B-2) | «Visita 18 nov, 8:00–12:00» o «Visita por agendar» |
| 2 | Orden de ejecución (B-2) | «Orden OTE-… · En ejecución» |

  La visita no se duplica en la sección Visitas (RF-SO-06 vigente).
- **Fechas:** `formatAssuranceDate` / `formatAssuranceDateTime`, no `formatBillingShortDate` (dictamen `ds-owner`).
- **Nombre accesible:** «Abrir ticket {número}: {asunto}, {estado}, prioridad {prioridad}{, vencido}{, con N adjuntos}».

## 5. Orden, filtros y búsqueda

### 5.1 Orden (lógica en `assurance/assurance-ticket-model.ts`)

Abiertos, por claves sucesivas:

1. Plazo vencido (`slaBreachStatus` de resolución o primera respuesta vencida) primero; luego «En riesgo».
2. Prioridad: Crítica → Urgente → Alta → Normal → Baja.
3. Plazo más próximo; sin plazo, al final de su prioridad.
4. Más antiguo primero (`createdAt`).

Cerrados: el más reciente primero (`closedAt ?? resolvedAt ?? updatedAt`). Con esto un ticket «Crítica» sin plazo nunca queda detrás de uno «Normal» sin plazo (defecto de H5). D2 confirma que la prioridad pesa más que un plazo no vencido.

### 5.2 Abierto o cerrado (D1)

El modelo exporta dos predicados distintos: `isTerminalTicket` (Cerrado, Cancelado: el detalle deja de ofrecer acciones) y `needsAttention` (excluye además Resuelto: listas y conteos). Recomendación: «Resuelto» **no** cuenta como abierto en la pestaña, la franja ni la Vista general (se conserva el comportamiento actual), y aparece en «Cerrados» con su badge «Resuelto». El chip pasa a llamarse **«Resueltos y cerrados»**.

### 5.3 Herramientas de lista

| Control | Comportamiento | URL |
|---|---|---|
| Chips Abiertos (N) · Resueltos y cerrados (N) · Todos (N) | Vigentes; por defecto Abiertos si hay alguno | `?tab=soporte&tickets=abiertos` |
| Prioridad (lista: Todas, Crítica, Urgente, Alta, Normal, Baja) | Filtro local | `&prioridad=` (valor del enum, no texto libre) |
| Tipo (lista con rótulos de `assurance-labels.ts`) | Filtro local | `&tipo=` |
| Buscar (`PortalSearchField`, «Número o asunto») | Filtro local sobre número, asunto y descripción | **Nunca en URL** (puede contener datos personales) |

Filtros sin resultados: «Ningún ticket coincide» + «Limpiar filtros». Con más tickets que los cargados (H9, H10): nota bajo la lista «Se muestran los 100 tickets más recientes de {total}» (D4 decide el enlace a Mesa de ayuda).

### 5.4 Dictamen `ds-owner` (2026-11-17), incorporado

Sin primitives ni tokens nuevos; carril rápido de UI. `TicketListItem` con props `ticket{id, ticketNumber, subject, status, priority, createdAt, attachmentCount}`, `assigneeLabel`, `slaDeadline | null`, `fieldWork?{kind:'visit'|'order', label} | null`, `onOpen`. `TicketStatusBadge` y `TicketPriorityBadge` compartidos con la Mesa de ayuda, que sigue siendo tabla. `VisitDetailPanel` migra a `PortalSidePeek` (`portal-ui.tsx:1590`) y se retira su trampa de foco manual.

## 6. Contrato con el detalle del ticket (MOD10)

El drawer es de MOD10 y está en curso en otra sesión: esta spec no lo rediseña.

| Momento | Contrato |
|---|---|
| Abrir | Fila → `AssuranceTicketDrawer` con `showOpenInPage={false}` (D4 de MOD10), el ticket de la lista como dato inicial, `assignees` ya cargados si existen y `canManage`/`canOperate` por permiso. Sin `onCreateLinkedTask` (H6 de MOD10) |
| Mientras está abierto | La lista no se recarga ni pierde filtros, búsqueda ni desplazamiento |
| Tras una acción en el drawer | Se refresca solo la fila afectada o la lista, conservando filtros y la posición del foco |
| Cerrar | Foco a la fila que lo abrió; si la fila salió del filtro (p. ej. pasó a Resuelto), foco al encabezado «Tickets» y anuncio «El ticket {número} pasó a {estado}» |

## 7. Estados

§4 de la v1.0 sigue vigente (permisos por sección, carga, vacío, error, reintento independiente). Se añaden:

| Estado | Interfaz |
|---|---|
| Carga de la lista | Skeleton de 4 filas de 64 px con la forma de §4, no bloques de 96 px |
| Primera vez (sin tickets) | Vigente: «Este suscriptor no tiene tickets»; acción «Crear ticket» si hay permiso |
| Sin resultados por filtro | «Ningún ticket coincide» + «Limpiar filtros» |
| Abiertos en cero con cerrados | «No hay tickets abiertos» + chip «Resueltos y cerrados» a la vista |
| Sin plazo en ningún abierto | Una línea bajo las herramientas: «Estos tickets no tienen plazo de atención; se ordenan por prioridad». Sustituye el «Sin vencimiento registrado» por fila de la v1.0 |
| Éxito al crear | Anuncio en región `status` y aviso descartable (`PortalSuccessAlert`, «Cerrar») sobre la lista; se va solo al cambiar de filtro o abrir otro ticket. El ticket nuevo aparece resaltado en la lista. No empuja la franja |
| Visitas vacías | Sección de una línea: «Este suscriptor no tiene visitas propias. Las visitas de un ticket se ven en el ticket» |

## 8. Crear ticket desde la ficha

El formulario de Mesa de ayuda conserva su disposición; desde la ficha el diálogo usa un modo «desde suscriptor» del mismo componente (la API la define `fe-platform`).

| Bloque | Campos |
|---|---|
| Encabezado | «Crear ticket para {nombre}»; el suscriptor es texto del encabezado, no un campo (H14) |
| Visible | Tipo · Prioridad · Asunto · Descripción · Visita técnica (y «Siguiente paso» si es Requerida) |
| «Más opciones» (plegado, `SectionAccordion`) | Relacionado con · Origen · Responsable · Área · Plazo de atención |

- «Relacionado con» desde la ficha: **«Este suscriptor»** por defecto o uno de sus servicios (contratos ya cargados en la ficha). No se muestra la referencia de texto libre.
- Sin políticas, «Plazo de atención» no se muestra y aparece la ayuda «No hay plazos de atención configurados». Con políticas: «Usar el plazo predeterminado».
- Valores por defecto vigentes (`AssuranceCreateTicketForm.tsx:99-115`): ningún campo de «Más opciones» es obligatorio.
- Rótulos en la fuente (aplican también a Mesa de ayuda): «Asunto operativo» → «Asunto»; «Referencia del objeto» → «Referencia» con ayuda «Número de servicio o equipo», sin «service-001»; «Política SLA» → «Plazo de atención»; «Usar default» → «Usar el plazo predeterminado».

## 9. Móvil (375×812)

- Franja en una fila de 3 cifras; herramientas: chips en una fila con desplazamiento horizontal propio, Prioridad, Tipo y Buscar tras «Filtros» (un botón que abre la fila de controles).
- Sin descripción del panel ni aviso de éxito empujando la lista.
- Fila: línea 1 número + plazo; línea 2 asunto; línea 3 badges y responsable.
- **Criterio:** el primer ticket empieza a ≤ 160 px del borde superior del panel de la pestaña (hoy ≈ 152 px más la franja) y queda completo en pantalla con un solo gesto de desplazamiento. Llevarlo sobre el pliegue exige compactar la cabecera de la ficha y el tablist de 3 filas, que no son de esta pestaña (D3).

## 10. Accesibilidad (WCAG 2.2 AA)

- Fila: un solo botón, foco visible `interactiveFocusClassName`, target ≥ 44 px de alto (2.5.8), nombre de §4. El plazo vencido se dice con texto, no solo con color (1.4.1).
- Franja: botones con nombre «Ver {N} tickets vencidos»; no son métricas decorativas.
- Filtros: `role="group"` con nombre; el número de resultados se anuncia en `status` con retardo; aplicar un filtro no mueve el foco.
- Contraste: badges y textos con las variantes y pares de la spec UISP §8.4; `error` para vencido, `warning` para en riesgo; lima nunca como urgencia.
- Side peek de visita: diálogo con nombre, foco inicial, `Escape` y retorno de foco (por `PortalSidePeek`).
- Reflujo a 320 px sin desplazamiento horizontal de página (1.4.10).

## 11. Vocabulario

| Hoy | Nuevo |
|---|---|
| Sin responsable (con responsable) | Nombre · «Responsable no disponible» |
| Cerrados (chip) | Resueltos y cerrados |
| Casos de atención vinculados a este suscriptor (descripción del panel) | Se elimina |
| Asunto operativo · Referencia del objeto · Ej. service-001 | Asunto · Referencia · Número de servicio o equipo |
| Política SLA · Usar default · No disponible | Plazo de atención · Usar el plazo predeterminado · No hay plazos de atención configurados |
| Sin vencimiento registrado | Línea única de §7 |
| Sin oportunidad ni contrato vinculado (visitas) | Se conserva |

Revisión con `system-vocabulary-review` antes del G6.

## 12. Pasos entregables

| Paso | Contenido | API |
|---|---|---|
| **1 · Portal** | §3 dirección A, §4 líneas y paso 1 del indicador, §5 completo, §6, §7, §8, §9, §10, §11; modelo en `assurance-ticket-model.ts`; carga de usuarios al montar en paralelo con la lista cuando hay `ASSURANCE_TICKETS_MANAGE` o `USERS_READ`; verificar H15 en compilación de producción | Ninguna |
| **2 · Con API** | Nombre del responsable para quien no puede leer usuarios; indicador con fecha de visita y número de orden; total y orden en servidor | B-1 a B-3 |

## 13. Criterios de aceptación

| # | Paso | Criterio |
|---|---|---|
| CA-1 | 1 | Prueba de inventario: cada dato, acción, permiso y estado de la v1.0 (§2–§5) existe antes y después |
| CA-2 | 1 | A 1440×900, con 6 o más tickets abiertos, la primera fila empieza a y ≤ 480 px y se ven completas ≥ 6 filas sin desplazar (hoy 541 px y 3 filas) |
| CA-3 | 1 | Cada fila mide ≤ 64 px desde `sm` con asunto de una línea, medido en navegador |
| CA-4 | 1 | Con un ticket asignado, la fila nunca muestra «Sin asignar» ni «Sin responsable»: muestra el nombre (con lectura de usuarios) o «Responsable no disponible» desde el primer pintado, sin abrir nada |
| CA-5 | 1 | Sin plazos, un ticket «Crítica» precede a uno «Normal»; un vencido precede a cualquiera no vencido; prueba unitaria de las 4 claves de §5.1 |
| CA-6 | 1 | «Resuelto» se cuenta según D1 en pestaña, franja y Vista general a la vez; prueba de los dos predicados |
| CA-7 | 1 | Filtros de chips, prioridad y tipo sobreviven a la recarga por URL; la búsqueda no aparece en la URL |
| CA-8 | 1 | El aviso de éxito se puede cerrar y no desplaza la franja; el éxito también se anuncia en `status` |
| CA-9 | 1 | Diálogo de crear desde la ficha: ≤ 6 campos visibles al abrir; el suscriptor no es un campo; Mesa de ayuda sin cambio de disposición (prueba de inventario de sus campos) |
| CA-10 | 1 | A 375×812 el primer ticket empieza a ≤ 160 px del borde del panel de la pestaña y queda completo con un gesto; sin desplazamiento horizontal de página |
| CA-11 | 1 | Cerrar el drawer devuelve el foco a la fila o, si salió del filtro, al encabezado con anuncio |
| CA-12 | 1 | axe sin violaciones en claro y oscuro; navegación completa con teclado; `iwana-identity-ui-review` sin P0/P1 |
| CA-13 | 1 | Ningún término de la columna «Hoy» de §11 queda visible; sin hex ni tokens nuevos |
| CA-14 | 1 | En compilación de producción la lista se consulta 1 vez al montar (verifica H15) |
| CA-15 | 2 | Con solo `ASSURANCE_TICKETS_READ`, la fila muestra el nombre del responsable |
| CA-16 | 2 | Un ticket con visita agendada muestra su fecha en la fila; la visita no aparece en la sección Visitas |

## 14. Decisiones (resueltas en G0, 2026-11-17)

El usuario aprobó la columna «Recomendación» como decisión. D3 queda fuera de esta spec: enmienda pendiente de la spec de la ficha estilo UISP.

| # | Decisión | Recomendación (aprobada) |
|---|---|---|
| D1 | ¿«Resuelto» cuenta como abierto en la pestaña? (divergencia H6) | No; va a «Resueltos y cerrados»; dos predicados en el modelo (§5.2) |
| D2 | ¿La prioridad pesa más que un plazo no vencido? | Sí: vencido → prioridad → plazo → antigüedad (§5.1) |
| D3 | Compactar en móvil la cabecera de la ficha y el tablist (una fila desplazable) para dejar el primer ticket sobre el pliegue | Sí, como enmienda de la spec UISP, fuera de esta |
| D4 | Con más de 100 tickets: enlace «Ver todos en Mesa de ayuda» filtrado por suscriptor (exige añadir `subscriberId` a los filtros de URL de Mesa de ayuda, solo portal) o paginar en la pestaña | Enlace a Mesa de ayuda; paginar es paso 2 |
| D5 | ¿La franja muestra «Vencidos» aunque el tenant no tenga políticas de plazo? | No: sin políticas la cifra se oculta |

## 15. Fuera de alcance

Diseño del drawer del ticket (MOD10) · cabecera y tablist de la ficha (D3) · tabla de Mesa de ayuda · búsqueda en servidor · crear visita desde la pestaña (vía «Registrar ▾» de la ficha) · bitácora de Actividad.

## 16. Dependencias de backend (paso 2, dueño `sr-backend`)

| # | Necesidad | Hoy | Nulo cuando |
|---|---|---|---|
| B-1 | Nombre visible del responsable en el listado de tickets, sin exigir `USERS_READ` | El listado devuelve entidades crudas (`tickets.service.ts:456-460`); `GET /users` exige `USERS_READ` (`users.controller.ts:95-97`) | Sin responsable; usuario desactivado → «Responsable no disponible» |
| B-2 | Resumen de trabajo de campo por ticket en el listado: estado y ventana de la visita activa; número y estado de la orden de ejecución | Solo en el detalle (`tickets.service.ts:515-546`); la solicitud de visita del ticket no lleva `subscriberId` (`visit-request-origin-orchestration.ts:441-451`), así que el portal no puede cruzarla por WFM | Sin visita ni orden; sin permiso de lectura de WFM u órdenes |
| B-3 | Total fiable y orden por urgencia en servidor (o `limit` mayor) para suscriptores con más de 100 tickets | `limit` máx. 100 y sin columnas ordenables (`dto/index.ts:133-135`; `tickets.service.ts:127`) | — |

Antes de congelar B-1 y B-2 se cruza cada fila con el DTO y su origen (regla → campo), y B-1 respeta el bloqueo de datos del titular si el responsable fuera externo.
