# INFORME — MOD11 Operaciones · OLA 4 · Review de experiencia (etapa 6 · G6) — AI-PROD-UX

**Versión:** 1.0
**Fecha:** 2026-09-13
**Autor:** AI-PROD-UX (track UX; R de flujos y de criterios de accesibilidad de flujo — protocolo §2)
**Orden de despacho:** `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-OLA4-PROD-UX-v1.0.md` v1.0 (encargo autosuficiente; sin prompt de fase)
**Patrón de medida (no modificado):** `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-ux.md` v1.0
**Referencias normativas consultadas:** design spec `2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 §6 · contrato de componente `2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md` v1.0 (H4, AI-DS-OWNER) · spec Firma iWana · ADR-065/ADR-064/ADR-067 (Aprobados) · tokens reales en `packages/ui/src/styles/globals.css` y primitives en `apps/portal/src/components/shared/portal-ui.tsx`
**Entrega revisada (en disco):** `apps/portal/src/app/dashboard/operations/**` y `apps/portal/src/components/operations/**` (integración F5; G5 completo según `INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA3-CONSOLIDACION-v1.0.md`)
**Skills leídas antes de revisar:** `iwana-identity-ui-review` (modo review, formato P0–P3 y reglas anti-falsos-positivos), `system-vocabulary-review`; de apoyo: `senior-ui-systems-designer`, `wcag-audit-patterns`. `ui-ux-pro-max` no fundamenta ninguna severidad. `brainstorming` no se usó.
**Modo:** review de código en disco (sin captura de pantalla); la verificación E2E de navegador corresponde a F6/SR-QA.
**Marcadores emitidos:** ninguno. No hubo `[BLOQUEO]` (DoR cumplida: G5 completo, entrega y UX spec localizables). Las decisiones que exceden UX quedan ruteadas como hallazgos con dueño.

---

## Resumen ejecutivo

Se revisaron las tres sub-rutas de Operaciones (`/tasks`, `/tasks/new`, `/execution-orders`) y el flujo de llegada por deep link contra la UX spec v1.0. La estructura es la correcta: marco continuo real, estado de bandeja en URL, CTA y pestañas exactamente como se especificaron, ADR-065 con un solo pie, siete columnas de tareas con «Vence», filtros y copy tomados de los mapas canónicos, y los vacíos E1–E5/E7 con acción. El riesgo dominante está en los **bordes del flujo**: falta el estado E6 del deep link de OT, la acción secundaria del alta, la preservación del estado de origen en el alta (M3.1), un control «Cerrar» visible en el detalle de tarea y el destino de foco al cerrar por deep link; además, el filtro «Ticket» promete el número visible pero solo resuelve el identificador interno. **Seis de los siete estados existen; los tres mecanismos de continuidad se sostienen salvo M3.1.** No se requiere rediseño.

**Modo:** código (implementación en disco, sin captura)
**Script:** `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations apps/portal/src/app/dashboard/operations` — **sin hallazgos (exit 0)**; 0 deterministas, 0 heurísticos confirmados.
**Puntaje (OLA 4):** 63/100 (P0: 0, P1: 2, P2: 5, P3: 2)
**Actualización post-OLA 4.1 (2026-09-13):** los 7 bloqueantes del veredicto quedaron resueltos y verificados contra el estado final del código; veredicto final **Aprobada** — ver «Verificación post-corrección (OLA 4.1)» y «Veredicto final».

---

## Verificación de la continuidad del despachador (§5 de la UX spec)

| Mecanismo | Estado | Evidencia |
| --- | --- | --- |
| **M1 — Marco continuo** | ✅ Sostenido | `layout.tsx:18-29`: `PageHeader` + pestañas viven en el layout del módulo (App Router conserva el layout entre sub-rutas); los skeletons de contenido son de página, no de marco (`tasks/page.tsx:10-12`). |
| **M2 — Estado en la URL** | ✅ Sostenido | `tasks-query.ts` / `execution-orders-query.ts`; página → push y filtro/tamaño → replace + página 1 (`TasksInboxClient.tsx:175-221`, `ExecutionOrdersClient.tsx:180-213`); detalle por merge de un solo parámetro al abrir/cerrar (`TasksInboxClient.tsx:322-329, 347-358`; `ExecutionOrdersClient.tsx:226-234, 404-415`); `taskId` se conserva al paginar/filtrar (`tasks-query.ts:76`). Cubierto además por `TasksInboxClient.spec.tsx:135-177`. |
| **M3 — Redirect post-alta con detalle abierto** | ⚠️ Parcial | Éxito → `/tasks?taskId=<nuevo>` operativo (`TaskIntakeClient.tsx:76-78`); la preservación del estado de la bandeja de origen (**M3.1**, §5.4) **no está implementada** → hallazgo 6. |

---

## Los siete estados vacíos y de error con acción (§6 de la UX spec)

_(Estado medido en el review OLA 4. La corrección posterior está verificada en §«Verificación post-corrección (OLA 4.1)»: E6 quedó resuelto y E7 se limpia al ejecutar su acción.)_

| # | Estado | Estado observado | Evidencia |
| --- | --- | --- | --- |
| E1 | Primera vez, tareas | ✅ Con acción según permiso | `TasksInboxClient.tsx:439-457` |
| E2 | Filtros sin resultados, tareas | ✅ «Limpiar filtros» | `TasksInboxClient.tsx:428-436` |
| E3 | Ticket sin resultados | ✅ «Limpiar filtros» | `TasksInboxClient.tsx:417-426` |
| E4 | Primera vez, órdenes | ✅ «Ir a Programación» / «Actualizar» | `ExecutionOrdersClient.tsx:324-347` |
| E5 | Filtros sin resultados, órdenes | ✅ «Limpiar filtros» | `ExecutionOrdersClient.tsx:313-322` |
| **E6** | **Deep link de OT inexistente o sin acceso** | ❌ **No existe** con el copy y la acción especificados | Grep sin ocurrencias de «No pudimos abrir esta orden de ejecución» / «Ver todas las órdenes de ejecución»; el error cae en el drawer (`ExecutionOrdersClient.tsx:365-374`; `ExecutionOrderDrawer.tsx:782-796`; `execution-order-requirements.ts:17`) → hallazgo 3 |
| E7 | Deep link de tarea inexistente | ✅ Con acción, pero la alerta no se limpia al ejecutarla | `TasksInboxClient.tsx:375-386` → hallazgo 4 |

**Resultado:** 6 de 7 estados implementados con su acción; E6 ausente y E7 con defecto de cierre de estado.

---

## Los once criterios de accesibilidad de flujo (§11 de la UX spec)

_(Estado medido en el review OLA 4; el criterio 3 (Cerrar y foco de cierre) quedó resuelto en la OLA 4.1. Las brechas restantes de 8/9/10 son deuda excluida por decisión del orquestador — ver §«Verificación post-corrección (OLA 4.1)».)_

| # | Criterio | Estado | Evidencia / brecha |
| --- | --- | --- | --- |
| 1 | Teclado completo y en orden | ✅ | Filtros, tablas, pie y drawers íntegramente alcanzables; trampa de foco modal correcta (`OperationalSidePeek.tsx:98-127`; `Dialog.tsx:231-292`). |
| 2 | Foco visible y no tapado | ✅ | `interactiveFocusClassName` en filas y primitives; overlays no tapan el foco del panel. |
| 3 | Diálogo: entrar y salir con foco | ⚠️ Parcial | Entra al detalle ✅ y Escape/velo cierran ✅; **el detalle de tarea no ofrece control visible «Cerrar»** (hallazgo 1) y **el cierre por deep link no aterriza en la región de resultados** (hallazgo 7). |
| 4 | Pestañas navegables y anunciadas | ✅ | `aria-current="page"` + `nav` rotulado en `OperationsModuleTabs.tsx:64-82`; enlaces reales. |
| 5 | Navegación consistente | ✅ | Encabezado, pestañas y CTA inmutables en las tres rutas (`layout.tsx:18-29`). |
| 6 | Vencimiento no depende del color | ✅ | «Vencida · fecha» + icono en escala error, nunca lima (`TasksTable.tsx:93-95, 220-230`). |
| 7 | Paginación/filtro anunciados | ✅ (con desviación ratificada) | Conteo en región `aria-live` (`portal-ui.tsx:1409-1411`); el foco permanece en el pager tras paginar (no salta al inicio de la tabla) — ver «Desviaciones ratificadas». |
| 8 | Llegada por deep link con contexto | ⚠️ Parcial | El foco entra al detalle ✅; el título del detalle de OT no enuncia el recurso («OT»/número, hallazgo 9). |
| 9 | Objetivos táctiles ≥44 px | ⚠️ Parcial | Pestañas, CTA, pager y «Cerrar» del side peek cumplen; falta el control «Cerrar» del detalle de tarea (hallazgo 1); inputs de filtro `h-10` (40 px) — ver «Por verificar». |
| 10 | Formulario de alta accesible | ⚠️ Parcial | Labels asociados, error junto al campo, foco al primer inválido y estado de envío ✅; la validación ocurre al enviar, no «al salir del campo» — ver observación O-3. |
| 11 | Movimiento contenido | ✅ (por ausencia) | Las primitivas de overlay no animan: apertura/cierre instantáneos; no hay movimiento que reducir. Si DS-OWNER introduce motion, aplica 150–300 ms + `prefers-reduced-motion`. |

---

## Criterios de aceptación UX (§12) — estado

_(Estado medido en el review OLA 4; CA-U3, CA-U4 y CA-U7 quedaron conformes tras la OLA 4.1. CA-U8 mantiene como deuda excluida las brechas de los criterios 8/9/10 — ver §«Verificación post-corrección (OLA 4.1)».)_

| CA | Estado | Nota |
| --- | --- | --- |
| CA-U1 (pestañas exactas, orden, `aria-current`, sin tercera pestaña) | ✅ | `OperationsModuleTabs.tsx:34-45, 64-82` |
| CA-U2 (CTA solo con permiso, visible, no deshabilitado) | ✅ | `OperationsCreateTaskAction.tsx:18-26`; permiso de `POST /tasks` verificado (`tasks.controller.ts:108`) |
| CA-U3 (tres mecanismos de continuidad) | ⚠️ | M1 y M2 ✅; M3 parcial: falta M3.1 (hallazgo 6) |
| CA-U4 (los siete estados con acción) | ❌ | E6 ausente (hallazgo 3); E7 no se limpia tras su acción (hallazgo 4) |
| CA-U5 (copy de filtros y «Vence» según §7, sin enums crudos) | ✅ (con corrección D-1) | Mapas canónicos en `operations-labels.ts`; copy de toolbars y vacíos textual según §7 |
| CA-U6 (gramática de «Vence») | ✅ (con ratificación D-4) | `TasksTable.tsx:71-108` |
| CA-U7 (deep link abre sobre bandeja; cierre conserva; sin callejones) | ⚠️ | Apertura y cierre conservan ✅; foco de cierre ✗ (hallazgo 7) y E6 ✗ (hallazgo 3) |
| CA-U8 (los once criterios de flujo) | ⚠️ | Brechas en 3, 8, 9 y 10 (ver tabla anterior) |

---

## Hallazgos criticos (P0)

Ninguno.

---

## Hallazgos

### [P1][Accesibilidad · flujo] El detalle de tarea no ofrece un control «Cerrar» visible

- **Evidencia:** `apps/portal/src/components/operations/TaskDetailDrawer.tsx:55-60, 139-140` — el diálogo se compone con `DialogContent` + `DialogHeader` y termina sin `DialogClose`, sin botón «Cerrar» y sin pie; no existe ninguna ocurrencia de cierre visible en el archivo. Contraste: el detalle de OT sí lo tiene (`packages/ui/src/components/OperationalSidePeek.tsx:180-192`, `aria-label="Cerrar"`, `min-h-11 min-w-11`). La UX spec §8.2/§11.3/§11.9 lista «Cerrar» como mecanismo de cierre y exige objetivo ≥44 px.
- **Impacto:** el cierre del detalle de tarea —la superficie más usada del seguimiento diario— solo ocurre con Escape o clic en el velo. Usuarios de puntero/lector de pantalla sin ese hábito no tienen afordancia visible para volver a la bandeja, y el módulo es inconsistente consigo mismo (OT sí, tareas no).
- **Recomendación:** componer el cierre con la primitive existente `DialogClose` de `@iwana/ui` (`Dialog.tsx:439-472`) o botón ghost equivalente con `aria-label="Cerrar"` y `min-h-11 min-w-11`, invocando `onClose`. No requiere API nueva ni token nuevo.
- **Esfuerzo:** S · **Dueño:** AI-FE-PLATFORM

### [P1][Flujo · vocabulario] El filtro «Ticket» solo resuelve el identificador interno, pero su copy promete el número visible

- **Evidencia:** `apps/portal/src/components/operations/TasksToolbar.tsx:118-121` — placeholder «Número de ticket» y ayuda «Muestra las tareas derivadas de un ticket de mesa de ayuda»; `apps/portal/src/components/assurance/AssuranceClient.tsx:746` — el emisor de Assurance usa `ticketId=${selectedTicket.id}` (UUID interno); `packages/database/src/entities/support-ticket.entity.ts:47, 55-56` — `id` UUID vs `ticketNumber` visible; `apps/portal/src/components/assurance/AssuranceTicketsTable.tsx:277` — la UI de mesa de ayuda muestra `ticketNumber`; `apps/api/src/modules/tasks/services/tasks.service.ts:263-265` — el filtro es `task.ticket_id = :ticketId` exacto sobre el valor almacenado (UUID). El punto abierto §13.5 de la UX spec dejó esta verificación a F5 y no consta resuelta en el informe de fase §1.
- **Impacto:** el despachador escribe el número que ve en Mesa de ayuda y recibe E3 («No hay tareas para ese ticket», `TasksInboxClient.tsx:417-426`) — un **falso negativo** que puede hacerle concluir que no hay tareas derivadas cuando sí existen. El propio copy de E3 («Revisa el número del ticket») agrava la confusión. El mismo gap impide mostrar «Derivada del ticket {referencia}» con una referencia legible en el alta (§4.6).
- **Recomendación:** decisión por el conducto de contrato (plan §11.2 → AI-EM-ARCH): resolver número→identificador en el listado (factibilidad AI-SR-FULL) o, en su defecto, ajustar/retirar la promesa de copy en la misma ola. No se resuelve en el frontend.
- **Esfuerzo:** M (decisión) / S si se opta por ajustar copy · **Dueño propuesto:** AI-EM-ARCH (decisión) + AI-SR-FULL (factibilidad); copy/implementación AI-FE-PLATFORM

### [P2][Flujo] Deep link de OT sin estado E6: copy genérico y «Reintentar» inerte

- **Evidencia:** no existen las cadenas «No pudimos abrir esta orden de ejecución» ni «Ver todas las órdenes de ejecución» en `apps/portal` (grep negativo). El fallo de apertura abre el drawer con error (`ExecutionOrdersClient.tsx:365-374, 400`); el drawer muestra «No fue posible cargar la OT» + «Reintentar» (`ExecutionOrderDrawer.tsx:782-796`); el 404 mapea a «La tarea consultada ya no está disponible.» (`execution-order-requirements.ts:17` — sustantivo equivocado para una orden); y `retryExecutionOrder` depende de `selectedExecutionOrder`, que es `null` cuando el detalle no cargó, por lo que el botón **no hace nada** (`use-execution-order-console.ts:394-399`).
- **Impacto:** quien llega con un enlace vencido o sin acceso ve un mensaje con el recurso equivocado y una acción muerta, sin la salida especificada (volver a la bandeja por defecto). La UX spec §6.3 (E6) y §8.2.4 exigen «ningún camino de llegada termina en una pantalla sin acción».
- **Recomendación:** renderizar en el contenedor la alerta E6 con el copy y la acción «Ver todas las órdenes de ejecución» (limpiar los parámetros del enlace); mapear el 404 de OT sin el sustantivo «tarea»; y que el reintento reutilice el id intentado en vez de `selectedExecutionOrder`.
- **Esfuerzo:** M · **Dueño:** AI-FE-PLATFORM

### [P2][Flujo] La alerta E7 permanece tras ejecutar su acción («Ver todas las tareas»)

- **Evidencia:** `apps/portal/src/components/operations/TasksInboxClient.tsx:91` (estado), `:294-319` (solo se limpia al iniciar la resolución de un nuevo `taskId`; el catch no la limpia), `:375-386` (la alerta se pinta sin condicionar a `taskIdParam`), `:381-384` (acción `href={TASKS_PATH}`, misma ruta sin parámetros: el cliente no se remonta, el estado persiste).
- **Impacto:** tras pulsar «Ver todas las tareas», la alerta de error sigue visible en la bandeja sin forma de descartarla; el usuario cree que el enlace sigue fallando.
- **Recomendación:** limpiar `detailLinkError` cuando desaparece `taskId` (o derivar la alerta de `taskIdParam` + error) y cubrir el click-through en `TasksInboxClient.spec`.
- **Esfuerzo:** S · **Dueño:** AI-FE-PLATFORM

### [P2][Flujo] El alta no cumple el pie de creación de dos acciones: falta «Cancelar»

- **Evidencia:** `apps/portal/src/components/operations/TaskForm.tsx:162-166` — único control de acción: el submit «Crear tarea»; sin «Cancelar», sin pie fijo y sin salida secundaria en `TaskIntakeClient.tsx` (grep negativo). La UX spec §4.6 exige «dos acciones visibles: "Crear tarea" (primaria, con estado de envío) y "Cancelar" (secundaria)» y §5.4.3 fija el retorno del cancelar.
- **Impacto:** abandonar el formulario exige el botón Atrás del navegador o navegar por el marco; el flujo de alta queda sin la salida explícita que la spec congeló.
- **Recomendación:** añadir «Cancelar» (secundaria) en un pie de creación, que retorne al `returnTo` cuando exista (hallazgo 6) o a `/tasks`.
- **Esfuerzo:** S · **Dueño:** AI-FE-PLATFORM

### [P2][Flujo] M3.1 no implementado: el alta no preserva el estado de la bandeja de origen

- **Evidencia:** `apps/portal/src/components/operations/OperationsCreateTaskAction.tsx:22-24` — el CTA enlaza a `/tasks/new` sin `returnTo`; `TasksInboxClient.tsx:448-450` — el CTA del vacío, ídem; `TaskIntakeClient.tsx:47-51, 76-78` — no lee `returnTo` y el éxito redirige fijo a `/tasks?taskId=<nuevo>`; búsqueda de `returnTo` en `apps/portal/src`: solo un método homónimo en `AccessControlSettingsClient`. La UX spec §5.4 (M3.1) y CA-U3 exigen el retorno con estado restaurado; §13.5 lo registró para F5, pero el encargo de F5 (pasos 1–9) no lo incluyó.
- **Impacto:** crear una tarea desde una bandeja filtrada (p. ej. estado «Abierta», página 3) devuelve al despachador a la bandeja limpia y pierde el contexto que el encargo pide sostener.
- **Recomendación:** construir el enlace del CTA con el estado vigente (`returnTo` codificado), y en éxito/cancelar restaurarlo por merge añadiendo `taskId`; la llegada directa sin `returnTo` conserva el comportamiento actual (§5.4.4). Los helpers de merge ya existen (`merge-url-search-params.ts`).
- **Esfuerzo:** M · **Dueño:** AI-FE-PLATFORM · **Ruteo:** brecha entre spec congelada y alcance despachado; decisión de AI-EM-ARCH sobre su entrada en F6

### [P2][Accesibilidad · flujo] El cierre por deep link no aterriza el foco en la región de resultados

- **Evidencia:** `packages/ui/src/components/OperationalSidePeek.tsx:69-70, 91-95` — al cerrar se restaura el foco al elemento previo, que en llegada directa es `document.body`; `packages/ui/src/components/Dialog.tsx:182-183, 308-312` — mismo comportamiento en el detalle de tarea; `ExecutionOrdersClient.tsx:404-415` y `TasksInboxClient.tsx:347-358` cierran sin fijar destino alternativo. La UX spec §8.2.2 y §11.3 exigen que, en llegada por deep link, el foco vaya al encabezado de la región de resultados.
- **Impacto:** quien llega por enlace (notificación, correo, historial) y cierra el detalle queda con el foco al inicio del documento en vez de la bandeja; teclado y lector de pantalla deben recorrer la página de nuevo. En la apertura por fila el retorno solo funciona si el navegador enfocó el control al hacer clic.
- **Recomendación:** al cerrar sin disparador de fila, enfocar el encabezado de la región de resultados (`tabIndex={-1}`) y conservar el anuncio del conteo del pie; en la apertura por fila, mantener el retorno actual al disparador.
- **Esfuerzo:** M · **Dueño:** AI-FE-PLATFORM

### [P3][Vocabulario] Textos heredados sin tildes en el formulario de alta

- **Evidencia:** `apps/portal/src/components/operations/TaskCoreFields.tsx:185` («Titulo»), `:187` («Usa un verbo de accion…»), `:230` («Modo de ejecucion»), `:409` («Visible para la operacion…»), `:417` («Contrato, codigo o referencia externa»). Verificado como preexistente en HEAD (no es regresión de F5; el archivo sí fue tocado en F5).
- **Impacto:** copy visible del alta con faltas de ortografía e inconsistente con el resto del módulo («Título» en tabla y detalle, «Órdenes de ejecución»). No bloquea; es deuda de copy heredado.
- **Recomendación:** corregir desde la fuente (este archivo) y ajustar las specs que esperen esos textos.
- **Esfuerzo:** S · **Dueño:** AI-FE-PLATFORM

### [P3][Accesibilidad · copy] El título del detalle de OT no enuncia el recurso

- **Evidencia:** `apps/portal/src/components/operations/ExecutionOrderDrawer.tsx:770-771` — `title={forbidden ? 'Orden de trabajo' : (order?.number ?? 'OT')}` y descripción «Registra y consulta el trabajo realizado en la OT»; el `h2` se enlaza por `aria-labelledby` en `OperationalSidePeek.tsx:158-167`. La UX spec §8.1/§11.8 esperan «Orden de ejecución {número}».
- **Impacto:** en la llegada por deep link, el lector de pantalla anuncia «OT» o un código sin el nombre del recurso; la orientación es más débil que la especificada.
- **Recomendación:** titular «Orden de ejecución {número}» (fallback de carga: «Orden de ejecución») y eliminar la sigla de la descripción.
- **Esfuerzo:** S · **Dueño:** AI-FE-PLATFORM

---

## Quick wins

1. **Hallazgo 4** — limpiar la alerta E7 cuando `taskId` desaparece (S).
2. **Hallazgo 5** — «Cancelar» en el alta (S).
3. **Hallazgo 1** — control «Cerrar» en el detalle de tarea con `DialogClose` (S).
4. **Hallazgo 8** — tildes del formulario (S).
5. **Hallazgo 9** — título del detalle de OT (S).

## Mejoras estratégicas

- **Contrato del filtro «Ticket» (hallazgo 2):** decidir en AI-EM-ARCH entre resolución número→identificador en el listado (factibilidad AI-SR-FULL) o ajuste de la promesa de copy. Habilita además el contexto legible «Derivada del ticket {referencia}» del alta (§4.6).
- **Cuadrillas v2 (deuda D-1 resuelta como técnicos-only):** cuando exista el port de membresía WFM (`CREW_MEMBERSHIP_RESOLVER_UNAVAILABLE`, `execution-orders.service.ts:1240-1245`), «Asignado a» incorpora cuadrillas y la OT podrá ejecutarse por cuadrilla; entonces la factibilidad vuelve a AI-SR-FULL.
- **`returnTo` como patrón de continuidad (hallazgo 6):** generalizarlo a toda alta iniciada desde una bandeja con estado, con un helper compartido, para que las próximas bandejas no repitan el costo.
- **Trazabilidad cruzada como filtros visibles (O-1):** cuando exista resolución de referencias (ticket/tarea/visita), exponerlos como chips de filtro con «Limpiar filtros»; hoy el deep link es el canal correcto (D8 ratificado).

## Resolución de las deudas asignadas (D-1, D-4, D-5)

### D-1 — «Asignado a» solo busca técnicos (tu spec §7.2 decía «técnicos y cuadrillas») — **RESUELTA: se ratifica la conducta implementada (técnicos) y se corrige la expectativa de la UX spec §7.2 para v1**

- **Hechos verificados en disco:** asignar a cuadrilla está bloqueado en el servicio (`execution-orders.service.ts:1240-1245`, `CREW_MEMBERSHIP_RESOLVER_UNAVAILABLE`); una OT asignada a CREW queda fuera del alcance de ejecución (`:311-313`); **ningún código escribe `assigned_crew_id`** (grep en `apps/api/src` excluyendo el propio servicio: 0 resultados; WFM crea OT con `assignedTechnicianId: validated.assignedUserId` en `schedule-events.service.ts:292` y `visit-requests.service.ts:941`); el listado sí acepta crew en el filtro (`:533-538`), pero no hay forma de asignarlo ni de buscarlo.
- **Resolución UX:** un buscador de cuadrillas sería interfaz muerta (no hay OT asignables a cuadrilla en v1) y prometería una capacidad que el producto bloquea. Se **ratifica** el buscador de técnicos y el copy honesto («Busca por nombre de técnico»); la ayuda de §7.2 («Busca por técnico o cuadrilla») queda **corregida por esta ratificación** (la spec v1.0 no se edita).
- **Deuda futura registrada (v2, condicionada):** cuando AI-SR-FULL entregue el port de membresía/vigencia de WFM, «Asignado a» suma cuadrillas; la factibilidad y precedencia son de AI-SR-FULL. **No se asume resuelta.**

### D-4 — `dueAt` nulo pinta «—» (H4 §7.1) vs «Sin fecha» (UX §7.3) — **RESUELTA: se ratifica «—»**

- **Fundamento:** el contrato de componente congelado manda `null → '—'` (H4 §7.1) y la implementación lo aplica (`TasksTable.tsx:71-74`); la misma tabla ya usa «—» como gramática de dato ausente (Destinatario `:219`, Resultado y Municipio en OT `ExecutionOrdersTable.tsx:144, 159`). «Sin fecha» alargaría una celda mono estrecha sin cambiar el significado (el encabezado «Vence» da el contexto) y rompería la consistencia interna de la tabla.
- **Acción:** no se pide cambio por la vía del contrato; la implementación queda ratificada y la divergencia de §7.3 se documenta aquí (sin editar la spec v1.0).

### D-5 — Botón «Actualizar» en la toolbar de OT fuera de la anatomía §4.5 — **RESUELTA: entra a la anatomía (se ratifica)**

- **Fundamento:** es la misma acción de recuperación que la propia UX spec exige en E1/E4 («Actualizar») para perfiles sin permiso de creación; el dato operativo cambia durante el día (trabajo de campo) y el refresh visible evita recargar la página; hay paridad con la toolbar de tareas (`TasksToolbar.tsx:138-140`) y precedente en el portal (`InventoryClient.tsx:2626, 2840`). Queda fuera del contrato H4 por diseño (§1 del contrato).
- **Acción:** la próxima revisión de la UX spec añadirá «Actualizar» a las anatomías §4.4/§4.5; no cambia alcance, rutas ni contratos.

---

## Desviaciones ratificadas (fuera del conteo)

- **Foco tras paginar (§11.7):** la implementación mantiene el foco en el pager y anuncia página y conteo por región `aria-live` (`portal-ui.tsx:1347-1382, 1409-1411`), en vez de aterrizar al inicio de la tabla como decía la spec. Se ratifica como mejor comportamiento (patrón de paginación estándar: conserva la posición del operador y anuncia el cambio); la intención de perceptibilidad del criterio queda cubierta.
- **Criterio 11 — movimiento (por ausencia):** las primitivas de overlay no animan; no hay movimiento que reducir. Se ratifica como cumplimiento; si DS-OWNER introduce motion, aplica 150–300 ms y `prefers-reduced-motion`.

## Observaciones (documentadas, sin severidad puntuada)

- **O-1 — Filtros de trazabilidad no cuentan como activos:** `ExecutionOrdersClient.tsx:236-244` calcula `hasActiveFilters` sin `ticketId`/`taskId`/`visitRequestId`; si un enlace futuro trae solo esos parámetros y no hay resultados, se muestra E4 (primera vez) en vez de E5 y no aparece «Limpiar filtros» (§8.2.4). Hoy ningún emisor los usa. Dueño: AI-FE-PLATFORM (S).
- **O-2 — Deep link de tareas: fallo de red indistinguible de recurso inexistente:** `TasksInboxClient.tsx:309-315` mapea cualquier error al estado E7 («enlace desactualizado») sin la variante «Reintentar» que exige la regla transversal de §6.3. Dueño: AI-FE-PLATFORM (S).
- **O-3 — Validación del alta al enviar, no al salir del campo:** `TaskForm.tsx:71-74` no configura `mode: 'onBlur'` (§11.10). Labels, error junto al campo y foco al primer inválido sí cumplen. Dueño: AI-FE-PLATFORM (S).
- **O-4 — Inputs de filtro `h-10` (40 px) vs objetivo 44 px de §11.9:** Selects son `h-11` (`Select.tsx:485`) e Inputs `h-10` (`Input.tsx:97`), en la misma fila de filtros. Pasa WCAG 2.2 AA (2.5.8 = 24 px); la decisión es de contrato DS. Ver «Por verificar».

---

## Por verificar

1. **Objetivo táctil de los inputs de filtro (O-4):** ¿se ratifica el `h-10` del contrato vigente de `@iwana/ui` para campos de texto, o aplica el objetivo de 44 px de §11.9 a los controles de filtro? Frontera AI-DS-OWNER; no bloquea.
2. **Foco inicial del detalle de tarea:** cae en el primer focusable, que es «Marcar en progreso» (`Dialog.tsx:185-186`; `TaskDetailDrawer.tsx:109-130`). ¿Se ratifica o se fija foco al contenedor/título? Es una acción que cambia estado recibiendo el foco inicial; AI-FE-PLATFORM si se corrige.

## Verificación post-corrección (OLA 4.1) — cierre de bloqueantes

**Insumo:** `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA4-CORRECCION-FE-PLATFORM-v1.0.md` v1.0 (bloqueantes de PROD-UX + P1-1 de DS-OWNER).
**Verificación independiente de esta sesión (no repetí las corridas de QA; evidencia propia):** `audit-ui.mjs` re-ejecutado sobre `apps/portal/src/components/operations` y `apps/portal/src/app/dashboard/operations` → **sin hallazgos (exit 0)**; `pnpm --filter @iwana/portal exec jest src/components/operations` → **23/23 suites, 302/302 casos en verde** (coincide con lo declarado por FE-PLATFORM). Cada punto se verificó además contra el código final, `archivo:línea`.

| # | Punto del veredicto OLA 4 | Estado | Evidencia del estado final |
| --- | --- | --- | --- |
| 1 | «Cerrar» visible en el detalle de tarea (P1) | ✅ Resuelto | `TaskDetailDrawer.tsx:63-75` — `DialogClose asChild` + `Button` ghost `size="icon"` con `aria-label="Cerrar"` y `min-h-11 min-w-11` (44 px), con la primitive existente; cubierto por `TaskDetailDrawer.spec.tsx:27, 42` y e2e `portal-operations-bandeja-ot.spec.ts:701` |
| 2 | Filtro «Ticket» sin prometer el número visible (P1) | ✅ Resuelto según la decisión «solo copy» de AI-EM-ARCH | `TasksToolbar.tsx:119-120` — placeholder «Referencia del ticket» y ayuda sin «número»; `TasksInboxClient.tsx:466` — E3 «Revisa la referencia del ticket o limpia los filtros…». La resolución número visible→identificador queda como **deuda v2 registrada** (plan §11.2 / UX spec §13.5): no bloquea G6 |
| 3 | E6 en deep link de OT; 404 sin «tarea»; retry con el id intentado (P2) | ✅ Resuelto | `ExecutionOrdersClient.tsx:255-262` (condición de fallo de llegada), `:308-319` (alerta con el copy de §6.3 y acción «Ver todas las órdenes de ejecución» al path limpio), `:408-410` (el drawer ya no se abre por el error de llegada); `execution-order-requirements.ts:17` (404 neutral); `use-execution-order-console.ts:119, 141, 399-407` (retry con `lastAttemptedExecutionOrderIdRef`); cubierto por `ExecutionOrdersClient.spec.tsx:733`, `use-execution-order-console.spec.ts:45` y e2e `portal-operations-bandeja-ot.spec.ts:611` |
| 4 | La alerta E7 cede al desaparecer `taskId` (P2) | ✅ Resuelto | `TasksInboxClient.tsx:312-319` (el efecto limpia `detailLinkError` cuando no hay `taskId`); cubierto por `TasksInboxClient.spec.tsx:378` y e2e `:631` |
| 5 | «Cancelar» en el pie del alta (P2) | ✅ Resuelto | `TaskForm.tsx:33, 165-174` (secundaria, `disabled` durante el envío) + `TaskIntakeClient.tsx:111-116, 138` (retorno §5.4.3); cubierto por `TaskForm.spec.tsx:327, 349` y `TaskIntakeClient.spec.tsx:180, 195` |
| 6 | M3.1: `returnTo` y restauración del estado de origen (P2) | ✅ Resuelto | `OperationsCreateTaskAction.tsx:29-38` (CTA del encabezado desde `/tasks` con el estado vigente; desde otra sub-ruta no adjunta `returnTo`); `TasksInboxClient.tsx:264-269, 495` (CTA del vacío); `TaskIntakeClient.tsx:33-51` (valida que `returnTo` apunte solo a la bandeja — rechaza destinos externos), `:99-102` (éxito: merge de `taskId` sobre el estado restaurado), `:111-116` (cancelar sin detalle), llegada directa conserva el comportamiento de §5.4.4; cubierto por `OperationsCreateTaskAction.spec.tsx:38-75`, `TaskIntakeClient.spec.tsx:156-209`, `TasksInboxClient.spec.tsx:295` y e2e `:665` |
| 7 | Foco al cerrar por deep link; apertura por fila conserva el retorno al disparador (P2) | ✅ Resuelto | Tareas: `TasksInboxClient.tsx:96-100, 346-355, 373-393` y destino `#tasks-results` con `tabIndex={-1}` en `:431-441`; OT: `ExecutionOrdersClient.tsx:97-101, 234-243, 444-464` y destino `#execution-orders-results` en `:329-339`; solo se reubica el foco cuando la apertura no vino de una fila; cubierto por `TasksInboxClient.spec.tsx:419, 435` y `ExecutionOrdersClient.spec.tsx:762` y e2e `:684` |

**D-1, D-4 y D-5 tras la corrección:** siguen como se resolvió en este informe y el código final no las contradice — D-1, búsqueda de técnicos ratificada (`ExecutionOrdersToolbar.tsx:153`, «Busca por nombre de técnico»); D-4, «—» para `dueAt` nulo (`TasksTable.tsx:73, 79, 219`); D-5, «Actualizar» presente en ambas toolbars (`TasksToolbar.tsx:139`, `ExecutionOrdersToolbar.tsx:219`).

**Regresiones:** ninguna observada en las rutas revisadas. Además del script de identidad limpio y la suite verde, se verificó que el nuevo `useSearchParams` del CTA del layout queda bajo el `Suspense` del layout raíz (`apps/portal/src/app/layout.tsx:46`), por lo que no introduce el fallo de prerender de Next.js — relevante porque la ola 4.1 no declaró corrida de `build`. El bloqueante DS P1-1 de la misma ola (contrato v1.1 §6.7) también es verificable de paso: el error no co-renderiza el vacío y la grilla conserva el último dato válido (`TasksInboxClient.tsx:144-151, 459-462`; `ExecutionOrdersClient.tsx:146-153, 352-355`); queda fuera del conteo de este informe. Los P3 (hallazgos 8 y 9) y las observaciones O-1…O-4 permanecen como deuda excluida por decisión del orquestador (ola 4.1 §3) y no se reabren.

## Veredicto final

**Aprobada** — los 7 bloqueantes del veredicto OLA 4 están resueltos y verificados contra el estado final del código, con evidencia `archivo:línea`, la suite de operaciones en verde (23/23 · 302/302, corrida propia) y el script de identidad limpio. El veredicto anterior («Aprobada con cambios», 7 bloqueantes) queda superado por esta verificación. El residuo de datos número→identificador del filtro «Ticket» queda como deuda v2 registrada por AI-EM-ARCH (no bloqueante), y los P3/observaciones excluidos permanecen como deuda explícita.

**Frente de experiencia para G6: GO.** El cierre de G6 queda supeditado únicamente a los demás frentes de la etapa 6 (contrato DS-OWNER y QA — matriz criterio↔test, H7).

**Nota de alcance:** este informe cubre flujo, copy y accesibilidad de flujo de las tres sub-rutas y sus deep links. Contraste/estados de componente quedan en la frontera de AI-DS-OWNER y la verificación E2E de navegador (CA-01…CA-07) en AI-SR-QA.
