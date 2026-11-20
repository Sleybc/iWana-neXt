# INFORME — MOD10 Mesa de ayuda · Lateral del ticket en un solo panel

**Versión:** 1.0
**Fecha:** 2026-11-20
**Estado:** Olas 1–3 ejecutadas; **punto de control con el usuario pendiente**; sin commit ni push; E2E sin correr (falta la ventana del puerto 3002)
**Fuente:** [spec](../specs/2026-11-20-mod10-detalle-ticket-lateral-un-panel-ux.md) v1.0 (G0 2026-11-20) · [plan](../plans/2026-11-20-mod10-detalle-ticket-lateral-un-panel.md) · [lanzador](../prompts/PROMPT-MOD10-LATERAL-TICKET-UN-PANEL-LAUNCH-v1.0.md)

## 1. Qué cambió

- `AssuranceTicketDetail.tsx`:
  - El lateral queda en un solo `PortalPanel` denso con cuatro secciones: Estado y asignación, Visita y orden de trabajo, Datos del caso y Fechas.
  - El selector de estado entra al panel.
  - Responsable y área comparten un solo guardado.
  - «Actualizado» se retira (D1).
  - Los adjuntos pasan al hilo y solo se muestran si hay alguno (D2).
  - «Relacionado con» se oculta si no tiene valor o si es el titular de la ficha.
- `SubscriberSupportTab.tsx`: pasa `contextSubscriberId` al detalle para cumplir CA-5.
- Sin cambios de API ni de contrato.

## 2. Decisiones y desviaciones

| # | Tema | Resolución |
|---|---|---|
| D3 | Pieza nueva o composición | Composición con `PortalPanel`, `PortalFieldList` y `PortalFieldRow`; sin token nuevo (dictamen `ds-owner`) |
| V1 | Apilado de responsable y área | Umbral `@[29rem]` en vez de `@[18rem]`: «Monitoreo operativo» no cabe en dos columnas. En el riel y a 375 px se apilan; en la ficha van en fila |
| V2 | Rótulo del estado | «Nuevo estado» (no «Estado»), para que coincidan el texto visible y el nombre accesible que usa la E2E |
| V3 | «Datos del caso» interno | Es `group` y no región: la región externa ya se llama así |
| V4 | Fechas | Línea `flex-wrap`. Cada par etiqueta-valor no se parte (`whitespace-nowrap`), así que en 320 px cada par ocupa su renglón. Texto vacío acortado: «Sin respuesta» (pedido del usuario, 2026-11-20) |
| V5 | «Relacionado con» vacío | Se oculta cuando no hay parte relacionada (spec §0) |

## 3. Evidencia

| CA | Resultado | Evidencia |
|---|---|---|
| CA-1 | PASS | `AssuranceTicketDetail.inventory.spec.tsx`, nuevo, cubre los tres contenedores |
| CA-2 | PASS | Mesa de ayuda a 1440×900, ticket sintético con visita y orden: **1203 → 689 px**. Sin visita ni orden: 658 px. Margen de 11 px |
| CA-3 | PASS | Estado, responsable y área quedan dentro de los 900 px en los tres contenedores |
| CA-4 | PASS | `test-change-reviewer`: ningún ajuste toca expectativas que protegen reglas |
| CA-5 | PASS parcial | Unitarias en los tres contenedores. En el navegador no se vieron los casos «relacionado = titular» ni «relacionado con valor»: faltan datos de prueba |
| CA-6 | PASS parcial | Con cero adjuntos no hay bloque (navegador). El caso con adjuntos solo está cubierto por unitarias |
| CA-7 | PASS parcial | La tabulación sigue el orden visual a 1440 y 375 px. axe no corrió en el navegador porque la CSP (`connect-src 'self'`) lo bloquea; jest-axe pasa sin medir contraste |
| CA-8 | PASS | A 375 px, `scrollWidth = clientWidth` en los tres contenedores |

- **Conteos jest** (`--no-cache --ci`):
  - `components/assurance` + `crm/subscribers`: línea base 79/1235. Tras W0, 80/1247. Al cierre, **80/1256**, todo verde.
  - Suite completa del portal: 455/455 suites, 5154 tests en verde y 1 omitido. En una segunda corrida, `RadioCardGroup.contract.spec` falló una vez por timeout bajo carga; aislado pasa.
- **Gates:** `tsc`, `eslint` y `audit-ui.mjs` sin hallazgos.
- **Datos:** se usaron los tickets sintéticos del tenant de pruebas. No se sembró ni se retiró nada.

## 4. Pendiente

1. **Punto de control:** que el usuario vea el lateral en su portal con un ticket real.
2. **E2E** (ventana del 3002 dada por el usuario, `--workers=1`, reutilizando su servidor): **16/17 pasan**.
   - Pasan `portal-assurance` (incluida la aserción :752-753 actualizada), `portal-assurance-adjuntos` y `portal-mod05-pestana-soporte`.
   - Falla `portal-importacion-uisp-live.spec.ts:736` (adjuntos importados), antes de llegar al lateral:
     - 1.ª corrida: la promoción del lote no terminó en 120 s (:784).
     - 2.ª y 3.ª: quedan mapeos pendientes (CICLO, ETIQUETA, METODO_PAGO, PLAN) (:775).
     - Es la etapa de importación y del worker, ajena a este cambio. La aserción del lateral (:859, `ticket-attachments-section` con «Adjuntos (3)») no llegó a ejecutarse. El mismo selector pasa en `portal-assurance-adjuntos`.
     - Clasificación de `e2e-triage`: **flaky, ajena al lateral**.
       - Corridas 2 y 3: error de método. Ese caso depende de que antes corra el primero del mismo archivo, así que no debe correrse solo.
       - Corrida 1: carrera latente en `requestPromotion` (`migration-promotion.service.ts:259-290`), que encola el trabajo antes del commit y por eso devuelve `OMITIDO` sin reintentar.
       - Con el archivo completo y el árbol actual: **3/3 pasan**, incluidas la :736 y su aserción del lateral (:859).
     - Deuda derivada: arreglar la carrera (`sr-backend`) y documentar la dependencia serial del test (`sr-qa`).
     - Los tenants de prueba residuales los barre la purga R7.
3. **G6.5:** solo tras un push autorizado y con CI de `main` en verde.

## 5. Deudas

- Los adjuntos quedan sobre las pestañas del hilo, así que también se ven en Historial y en Todo.
- En la ficha, «Solicitante» repite al titular; queda fuera de la spec.
- A 375 px, el campo de comentario queda angosto.
- axe en el navegador sigue bloqueado por la CSP.

---

## Anexo A — Asignación visible (2026-11-20)

**Fuente:** [spec](../specs/2026-11-20-mod10-asignacion-visible-ux.md) v1.0 (G0 2026-11-20) · **Estado:** construido y verificado sobre `e352c837`; sin commit; E2E sin escribir ni correr; una decisión abierta (A.4)

### A.1 Qué cambió

- **API:** `AssignTicketSchema` acepta `note` opcional, con recorte y tope de 2000. Se guarda en el `payload` de `ASSIGNED` o `REASSIGNED` solo si no queda vacía. Sin migración. El borrado de texto libre ya cubre `ticket_timeline_events.payload`, porque lo vacía entero.
- **Portal:**
  - En «Comentarios», las asignaciones, reasignaciones y cambios de estado aparecen intercalados por fecha, con la nota como texto plano (A).
  - El responsable se muestra con iniciales en la ficha y en la bandeja (`AssigneeMark`) (B).
  - En la bandeja se reasigna desde la fila, con permiso de gestión (`AssigneeReassignControl`) (C).
  - Al reasignar se puede añadir una nota opcional, en el detalle o en la fila (D).

### A.2 Evidencia

| CA | Resultado |
|---|---|
| CA-1, CA-4, CA-6 | PASS en el navegador (ticket sintético, reasignado y devuelto) |
| CA-2, CA-3, CA-7 | PASS por pruebas unitarias. En el navegador no había eventos de prioridad ni comentarios internos |
| CA-5 | PASS con permiso en el navegador; sin permiso, por prueba unitaria |
| CA-8 | PASS: nuevas pruebas de 403 con nota y sin ella |
| CA-9 | Tabulación, foco atrapado, Escape y 375 px: PASS. axe no corre por la CSP; el popover ya tiene nombre accesible |

- **Conteos jest** (`--no-cache --ci`):
  - Portal `assurance` + `crm/subscribers`: 81/1272 → **81/1280**.
  - API `assurance`: 27/266 → **27/278**.
  - Portal completo: 5177 verdes y 1 intermitente por carga (`AssuranceClient.spec`), que pasa aislado.
- **Gates:** typecheck de API y portal en exit 0.
- **Revisiones:** `sec-eng` y `contract-drift-reviewer` sin hallazgos bloqueantes. `test-change-reviewer`: ajustes justificados; ve un hueco en A.4.

### A.3 Deudas

- E2E de CA-4, CA-5 y CA-9.
- Dos usuarios de prueba comparten iniciales («QR»).
- La nota no aparece en «Historial».
- La nota del cambio de estado no tiene tope; está desalineada con la de asignación.
- `Avatar` de `@iwana/ui` sin tamaño de 20 px ni variante vacía (`ds-owner`).
- Avisar al nuevo responsable (D4, producto).

### A.4 Visibilidad de la nota

El usuario decidió el 2026-11-20 que sea una **nota interna, visible también para el nuevo responsable** (spec D5 y CA-3).

- `GET tickets/:id/timeline` aplica `redactAssignmentNotes` (`comment-visibility.ts`), que decide evento por evento:
  - ADMIN, NOC y SUPPORT ven todas las notas.
  - El responsable de ese evento (`payload.assignedUserId` igual a `actor.sub`) ve la nota de su asignación, sea cual sea su rol.
  - El resto no la recibe: el auditor, otro técnico o contratista y el responsable anterior, frente a las asignaciones posteriores a otra persona.
- Prueba: `comment-visibility.assignment-note.spec.ts`, por rol y por caso.
- La redacción se limita a `ASSIGNED` y `REASSIGNED`, como sugirió `sec-eng`.
- API `assurance`: **28/288** en verde y typecheck en exit 0.
- `sec-eng` no encontró nada que bloquee. Deuda: ninguna prueba HTTP demuestra que el controlador aplica la redacción.

### A.5 Nombre visible en la bandeja

Ajuste del usuario del 2026-11-20: en la bandeja, las iniciales van con el nombre visible al lado, truncado con elipsis (`AssigneeMark` y `AssigneeReassignControl` con `showName`). La ficha conserva solo las iniciales.

- En el navegador se ve el nombre completo a 1440×900 y a 375 px, sin desplazamiento horizontal.
- Portal: **81/1280** en verde.

---

## Anexo B — Ticket cerrado en solo lectura (2026-11-20)

**Fuente:** [spec](../specs/2026-11-20-mod10-ticket-cerrado-solo-lectura.md) v1.0 (G0 2026-11-20: «Sí, bloquéalo») · **Estado:** construido sin commit; sin decisiones abiertas

### B.1 Qué cambió

- **API:** `assertTicketWritable` (`ticket-transitions.ts`) responde 409 `TICKET_CLOSED_READ_ONLY` en tickets CLOSED y CANCELLED.
  - Lo aplican comentar, comentar con adjuntos, reasignar o cambiar área, vincular orden de trabajo, vincular orden de ejecución y solicitar visita.
  - El ticket se lee con `pessimistic_write` en la misma transacción, en el orden 404 → 403 → 409.
  - RESOLVED no cambia.
  - Las escrituras del sistema no pasan por la guarda: el aviso de cierre de orden solo cambia el estado y el historial, y la importación de UISP inserta por SQL.
- **Portal:**
  - En un ticket cerrado o cancelado, el redactor se reemplaza por «Este ticket está cerrado. Si el caso continúa, crea uno nuevo».
  - Quien puede crear tickets ve además «Crear ticket» con el mismo cliente. En la página propia del ticket, el botón lleva a Mesa de ayuda con `?crearDesde=`.
  - Responsable y área quedan como dato. En la bandeja no se ofrecen «Cambiar responsable» ni «Asignarme».

### B.2 Evidencia

- **API `assurance`:** 29/324 en verde (29/335 tras B.4). Integración con DB_NAME=test: **9/98**, que incluye el 409 sin filas guardadas y la importación sobre CLOSED. Typecheck en exit 0.
- **Portal `assurance` + `crm/subscribers`:** **81/1289** en verde. Typecheck en exit 0; `audit-ui` sin P0 a P2.
- **Revisiones:**
  - `sec-eng`: dos huecos altos (vincular órdenes) y uno bajo (solicitar visita), ya corregidos.
  - `test-change-reviewer`: ajustes justificados; solo cambian expectativas en estados terminales.
- **E2E:** ninguna comenta, adjunta ni reasigna sobre un ticket cerrado.
- **Navegador:** sin verificar. El tenant de pruebas no tiene tickets cerrados y cerrar uno es irreversible.

### B.3 Deudas

- La prueba HTTP del 409 usa el servicio simulado.
- No hay prueba de `?crearDesde=` ni de la conexión entre la ficha y Mesa de ayuda.
- No hay verificación en el navegador.

### B.4 Toda edición bloqueada

El usuario decidió el 2026-11-20: «Sí, bloquea todo».

- `PATCH tickets/:id` (`_update`) rechaza con 409 cualquier campo en CLOSED y CANCELLED, y lee el ticket con bloqueo.
- Solo lo llama el controlador, así que ningún flujo del sistema pasa por ahí.
- Se retiró la prueba que permitía cambiar el asunto en CLOSED, porque contradice la regla nueva. Se añadió la matriz de asunto, descripción, prioridad y decisión de campo.
- API `assurance`: **29/335** en verde. Integración: **9/98**. Typecheck en exit 0.
- El portal no ofrece editar esos campos, así que no hay cambio de UI.

### B.5 «Vincular orden de trabajo» en el portal

Un usuario lo vio en un ticket cerrado real: el botón seguía activo, aunque la API ya responde 409.

- Ahora se desactiva en estados terminales, igual que «Solicitar visita». «Crear tarea vinculada» ya se ocultaba.
- Una expectativa cambia por esta regla, solo en CLOSED, en `AssuranceTicketDrawer.p1.spec.tsx`; OPEN conserva la suya. También cambian las filas de vínculo de `AssuranceTicketDrawer.inventory.spec.tsx`.
- Portal: **81/1289** en verde.
- La captura del aviso «Este ticket está cerrado…» sigue pendiente: el tenant de pruebas no tiene tickets cerrados y en el real no se toman capturas.

### B.6 Aviso en la cabecera

Ajuste del usuario del 2026-11-20: «Pasa que suba el aviso a la cabecera». En un ticket cerrado real, en la vista dividida, el aviso quedaba en el píxel 989, bajo el lateral apilado.

- El aviso y «Crear ticket» pasan a la cabecera del detalle, antes de las insignias y del hilo, con `role="status"`. En los cancelados dice «cancelado».
- Ya no se repite donde iba el redactor.
- Portal: **81/1289** en verde; typecheck y eslint en exit 0. La prueba fija que el aviso aparece una sola vez, como estado y antes del hilo.
- Pendiente: medirlo en el navegador a 375 px. El tenant de pruebas no tiene tickets cerrados.

### A.6 Quitar el responsable

Ajuste del usuario del 2026-11-20: «Sí, agrega la opción «Sin asignar»». Antes, desde ningún punto del portal se podía devolver un ticket a «Sin asignar».

- El selector «Responsable» del detalle ofrece «Sin asignar» primero. Al guardar envía `assignedUserId: null` y conserva el área.
- En la fila de la bandeja, «Dejar sin asignar» encabeza la lista solo si el ticket tiene responsable.
- La API ya lo aceptaba: el historial registra `REASSIGNED` con `assignedUserId: null` y la conversación lo muestra como «quitó el responsable».
- Portal: **81/1292** en verde (3 pruebas nuevas). Typecheck y eslint en exit 0.
- Visto en el navegador con el ticket sintético TK-20261117-004, sin guardar.
- El ticket TK-20261117-002, que quedó asignado por un cambio ajeno, se devolvió a «Sin asignar» por la API.
