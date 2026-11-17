# INFORME — MOD05 Suscriptores · Rediseño de la pestaña Soporte · Cierre

**Versión:** 1.0
**Fecha:** 2026-11-17
**Estado:** Cerrado con observaciones. G6 condicionado (ver §4); sin commit ni push, por decisión del usuario.
**Fuentes:** [spec](../specs/2026-11-17-mod05-pestana-soporte-rediseno-ux.md) v1.0 · [plan](../plans/2026-11-17-mod05-pestana-soporte-rediseno.md) · [lanzador](../prompts/PROMPT-MOD05-PESTANA-SOPORTE-REDISENO-LAUNCH-v1.0.md)
**Evidencias:** `docs/informes/evidencias/2026-11-17-mod05-pestana-soporte/`

## 1. Qué se entregó

Se ejecutaron las olas 1 a 6. La ola 3 se construyó sobre los archivos de MOD10 con cambios sin commit; la API (ola 5) se adelantó en paralelo con la ola 3, como permite el plan §3.

| Bloque | Resultado |
|---|---|
| W0 | Línea base: 64 suites / 817 tests. Prueba de inventario v1.0 (`SubscriberSupportTab.inventario-v1.spec.tsx`, 12 tests) |
| M | `assurance-ticket-model.ts`: `isTerminalTicket`, `needsAttention`, orden de 4 claves, plazo, indicador de trabajo de campo y etiqueta del responsable. Consumidores migrados: pestaña, Vista general y detalle de MOD10 (solo el import del predicado) |
| T | `TicketListItem.tsx` (filas de 60 px), `ticket-badges.tsx`, franja de cifras, chips y filtros en la URL, búsqueda solo local, estados de §7, aviso de éxito descartable, foco al cerrar el detalle |
| V | Visitas compactas debajo de la lista; el detalle pasa a `PortalSidePeek` |
| C | Modo «desde suscriptor» del formulario (5 campos visibles y «Más opciones»); rótulos en la fuente; Mesa de ayuda con badges compartidos y sin cambiar su disposición |
| API (B-1 a B-3) | `GET /assurance/tickets` añade `assignedUserDisplayName`, `activeVisit`, `executionOrder` y `order=urgency|recent` (si llega con `sortBy`, responde 400). Contrato en `packages/shared/src/contracts/assurance/ticket-list.contract.ts`. Sin migración |
| P2 | La fila muestra el nombre que da el API, el indicador del paso 2 («Visita 18 nov, 8:00–12:00», «Visita por agendar», «Visita por reagendar», «Orden OTE-… · estado»), el orden por urgencia y la nota con el total |
| Correcciones de QA1 y de las revisiones | Banda compacta (CA-2 y CA-10). «Vencido» sale de `slaBreachStatus`; un plazo pasado sin marcar se muestra como «Plazo pasado el …». La visita por reagendar no muestra una fecha vieja. La Vista general pide `order=urgency`. La nota pasa a «Se muestran N de T tickets, los más urgentes primero.» |

## 2. Criterios de aceptación

| CA | Resultado | Evidencia |
|---|---|---|
| CA-1 | ✅ | Inventario v1.0 en verde |
| CA-2 | ✅ | 1440×900: primera fila en y=478 y 6 filas completas (antes y=541 y 3 filas). `qa2-ca2-ca3-lista-1440x900.png` |
| CA-3 | ✅ | Filas de 60 px |
| CA-4 | ✅ | En el navegador ninguna fila muestra «Sin responsable» |
| CA-5, CA-6 | ✅ | Pruebas unitarias del modelo |
| CA-7, CA-8, CA-9, CA-11, CA-13 | ✅ | Medidos en QA1 y cubiertos por pruebas unitarias |
| CA-10 | ✅ | 375×812: 157 px desde el borde del panel, completa con un gesto y sin desplazamiento horizontal |
| CA-12 | ⚠️ | axe: 0 violaciones en claro. En oscuro hay 1 de contraste en «Volver a suscriptores» (`SubscriberHeader.tsx`), que ya estaba en HEAD y está fuera de la pestaña. La pestaña no tiene violaciones |
| CA-14 | ⏳ | Pendiente: `next build` pisaría el `.next` del servidor 3002 del usuario. En desarrollo hay 2 consultas por StrictMode y el código hace una sola (lo prueba un test). Se cierra en CI o en una ventana acordada |
| CA-15 | ✅ (API e integración) | Con NOC (sin `users.read`), `/users` responde 403 y la lista trae el nombre. No se vio la fila en la UI porque NOC no puede abrir la ficha |
| CA-16 | ✅ | Verificado en navegador el 2026-11-17, después de corregir D1 y D11: TK-20261117-006 muestra «Visita 18 nov, 13:00–17:00 · OTE-20261117-002» y la sección Visitas no la repite. Capturas `d11-ca16-fila-1440x900.png` y `d11-ca16-fila-375x812.png` |

## 3. Conteos reales (jest directo, sin caché)

| Paquete | Resultado |
|---|---|
| Portal: `crm/subscribers`, `assurance` y `api-client.spec` | 69 suites / 910 tests en verde (tras la última corrección). Bajo carga, `mod05-deuda-fiscal-ui` puede agotar el tiempo; aislada pasa 33/33 |
| API, pruebas unitarias de assurance, wfm, tasks y users | 98 suites / 1528 tests en verde |
| API, suite completa (cambió un `@Module`) | 8128 de 8129 tests. El rojo, `app.config.production-urls.spec.ts`, es ajeno y aislado pasa 29/29 |
| Contratos de assurance en shared | 4 suites / 62 tests |
| Integración `ticket-list.postgres` (`NODE_ENV=test DB_NAME=test E2E_TENANT_SLUG=test`) | 7/7 |
| E2E en 3002 | 4/5. El rojo es la doble consulta de desarrollo (CA-14) |

`tsc` y `eslint` limpios en lo tocado; `audit-ui.mjs` sin hallazgos.

## 4. Revisiones

| Revisor | Veredicto |
|---|---|
| `test-change-reviewer` (M/T/C) | Sin P0/P1. Dos P2 quedan para decisión (D2 y D3 de §6) |
| `test-change-reviewer` (P2) | Sin P0/P1. El P2 de «plazo pasado sin marcar» quedó resuelto con el texto «Plazo pasado el …» |
| `boundary-reviewer` | Sin P0/P1/P2. Los cuatro P3 se cerraron: 400 con `sortBy`, prueba negativa de tenant, prueba de cableado y lista de estados permitidos |
| `sec-eng` | GO. El P2 S-1 está en `getDetail` de MOD10 (D4 de §6) |
| `contract-drift-reviewer` | Sin P0/P1. H1 (visita por reagendar) y H2 (Vista general sin orden) cerrados. Quedan P3 |
| `gate-verifier`, `docs-governance` | No se ejecutaron (ver §7) |

## 5. Archivos tocados

**Portal, nuevos:** `components/assurance/{assurance-ticket-model.ts, assurance-ticket-model.spec.ts, TicketListItem.tsx, TicketListItem.spec.tsx, ticket-badges.tsx}`, `components/crm/subscribers/{SubscriberSupportTab.inventario-v1.spec.tsx, SubscriberSupportTab.rediseno.spec.tsx}`.
**Portal, modificados:** `components/crm/subscribers/{SubscriberSupportTab, SubscriberTicketsSection, SubscriberVisitsSection, SubscriberOverviewCards, SubscriberDetailClient}.tsx` y sus specs (`SubscriberTicketsSection.spec`, `.adjuntos.spec`, `SubscriberVisitsSection.spec`, `SubscriberSupportTab.spec`, `subscriber-ficha-inventario.portal.spec`), `lib/api-client.ts` y `lib/api-client.spec.ts`.
**Portal, sobre cambios ajenos sin commit de MOD10:** `AssuranceCreateTicketForm.tsx` y su spec, `AssuranceTicketsTable.tsx`, `AssuranceClient.spec.tsx`, `AssuranceTicketDetail.tsx` (solo el import de `isTerminalTicket`). El diff ajeno previo quedó guardado en las notas de la sesión. No se tocaron `assurance-labels.ts`, `assurance-ui.tsx` ni `AssuranceTicketDrawer.tsx`.
**API, nuevos:** `assurance/ports/assurance-assignee-names.port.ts`, `users/ports/assurance-assignee-names.{adapter,module}.ts`, `assurance/ticket-list.openapi.ts` y su spec, `assurance/tests/{tickets.service.list-extensions.spec.ts, ticket-list.postgres.integration.spec.ts}`.
**API, modificados (varios con cambios ajenos previos):** `assurance/{assurance.controller.ts, assurance.module.ts, dto/index.ts, services/tickets.service.ts, ports/field-service-work.port.ts}`, `wfm/ports/field-service-work.adapter.ts`, `tasks/{ports/execution-order-read.port.ts, services/execution-orders.service.ts}`, `app.module.boot.spec.ts`.
**Shared:** `contracts/assurance/ticket-list.contract.ts` y su spec (nuevos); `contracts/assurance/index.ts`.
**E2E:** `portal-mod05-pestana-soporte.spec.ts`, `portal-assurance.spec.ts`.

## 6. Deudas y decisiones abiertas

| # | Deuda | Sev. | Dueño |
|---|---|---|---|
| D1 | **Corregido el 2026-11-17, sin commit.** El worker no registraba la entidad `VisitRequest`, así que «Solicitar visita» dejaba el ticket sin visita. Ahora `apps/worker/src/worker-entities.ts` la registra y `worker.module.ts` usa esa lista. Pruebas: `worker-entities.spec.ts` (unitaria) y `assurance-field-service.visit-request.integration.spec.ts` contra Postgres (en rojo sin el arreglo, con `EntityMetadataNotFoundError`; en verde con él). Suite del worker: 28 suites / 307 tests. Pendiente: el job fallido de TK-20261117-003 en Redis y volver a ver CA-16 en el navegador con el worker ya reiniciado | — | — |
| D11 | **Corregido el 2026-11-17, sin commit.** `PATCH /wfm/visit-requests/:id/context` anulaba todo campo que no se enviaba (`ticketId`, `subscriberId`, `expedienteId`, `address`…): el `ValidationPipe` crea la instancia del DTO con todas sus propiedades y `hasField` las tomaba por enviadas. Ahora `hasField` cuenta solo las que no son `undefined` (`null` sigue borrando). Prueba: `visit-requests.service.spec.ts` «D11», en rojo antes del arreglo; WFM: 19 suites / 254 tests. Al verificar CA-16 salió otro problema: con orden de ejecución, la fila mostraba la orden y no la fecha. Ahora una visita agendada muestra su fecha más el número de la orden (portal: 69 suites / 911 tests). También corregidos y verificados en vivo con TK-20261117-007: (a) `resolveCrmExpedienteId` solo usa `originRef` como expediente cuando la visita viene de CRM (prueba nueva en `visit-requests.service.spec.ts`); (b) el worker rotula «Ticket TK-…», con el campo opcional `ticketNumber` en `FieldServiceRequest`, o «Ticket de Mesa de ayuda» si el job encolado no lo trae (`packages/shared` reconstruido con `tsc`). Suites: worker 28 / 308; assurance y WFM de la API 41 / 455. Cerrados también: (c) corregido: en Inventario, `updatePurchaseRequest` (`purchasing.service.ts`) borraba la fecha requerida y las notas en cualquier edición parcial (`'campo' in validated` sobre la instancia del DTO). Ahora usa `!== undefined`. Prueba nueva en `purchasing.service.spec.ts`, en rojo antes del arreglo; inventario: 84 suites / 857 tests; (d) corregido: datos de TK-20261117-003 reparados en una transacción, con condición sobre el valor anterior de cada fila. Visita, evento de agenda y orden de ejecución recuperan el `ticket_id`; el expediente falso queda en NULL; el rótulo pasa a «Ticket TK-20261117-003». La fila muestra «Visita 18 nov, 8:00–12:00 · OTE-20261117-001»; (e) corregido: a 375 px la fila mide 96 px en todos los tickets (antes 136 con «Visita … · OTE-…»). La línea de detalles va en dos renglones fijos (estado, prioridad, responsable y clip; trabajo de campo y fecha de apertura), con recorte y el texto completo en `title`; el tipo queda solo para lectores de pantalla en móvil (no estaba en la fila v1.0). Escritorio sin cambios (60 px, y=478, 6 filas); a 320 px hay filas de 112 px sin desplazamiento horizontal. Captura `fila-movil-96-375x812.png` | — | — |
| D2 | «Expediente» → «Oportunidad» en Visitas: no viene de esta spec, y la §11 dice «se conserva» sobre un texto que no estaba en HEAD | P2 | AI-EM-ARCH / prod-ux |
| D3 | Desde la ficha, «Relacionado con» solo ofrece el suscriptor o un servicio. Se pierde relacionar con un equipo, un nodo o una orden, que sigue disponible en Mesa de ayuda. La §8 lo pide, pero choca con el §0 | P2 | AI-EM-ARCH |
| D4 | `getDetail` (MOD10) devuelve visita y orden sin comprobar los permisos de WFM y de órdenes; el listado sí los comprueba (sec-eng S-1) | P2 | sesión MOD10 |
| D5 | D4 de la spec: la nota no lleva el enlace «Ver todos en Mesa de ayuda», porque exige un filtro `subscriberId` en `AssuranceClient.tsx` (MOD10) | P3 | fe-platform tras MOD10 |
| D6 | Enmendar la spec §5.3 al texto nuevo de la nota y documentar «Plazo pasado el …» y «Visita por reagendar» | P3 | prod-ux |
| D7 | `visit_requests.ticket_id` y `execution_orders.ticket_id` no tienen índice | P3 | sr-backend si crece el volumen |
| D8 | CA-12: contraste en oscuro de «Volver a suscriptores» (cabecera de la ficha) | P2 | fuera de la pestaña |
| D9 | Con más de 100 tickets, el conteo «Resueltos y cerrados» queda corto; la paginación es el paso 2 de D4 | P3 | — |
| D10 | La pestaña espera la carga de usuarios aunque el nombre ya llegue del API | P3 | fe-platform |

## 7. Qué se omitió y qué no se verificó

No se ejecutaron `gate-verifier` ni `docs-governance`; CA-14 y la vista de CA-15 y CA-16 en el navegador quedan pendientes, por las causas de §2. Riesgo: el árbol mezcla este trabajo con el de MOD10 en los mismos archivos, así que el commit exige índice temporal (`GIT_INDEX_FILE`).
