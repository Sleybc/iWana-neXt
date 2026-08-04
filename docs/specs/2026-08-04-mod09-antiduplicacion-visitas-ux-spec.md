# UX Spec — Prevencion de agendamiento duplicado en visitas pendientes (MOD09)

**Fecha:** 2026-08-04
**Autor:** AI-EM-ARCH sobre analisis de AI-PROD-UX
**Estado:** Propuesta — pendiente de aprobacion del CTO
**Modulo:** MOD09 Programacion / WFM
**Superficies:** `/dashboard/scheduling/pending-visits`, `/dashboard/scheduling`, detalle de expediente CRM, detalle de ticket
**ADR de referencia:** [ADR-076 (propuesto)](../adrs/ADR-076-Unicidad-Trabajo-Campo-Activo-Por-Origen.md)
**Informe de referencia:** docs/informes/INFORME-MOD09-DUPLICACION-AGENDAMIENTO-VISITAS-v1.0.md

---

## 1. Principio rector

**No bloquear a ciegas: hacer que duplicar sea una decision consciente y trazable.**

Ninguna heuristica puede distinguir en los datos "otra visita para este trabajo" de "la
misma pedida dos veces". La distincion la aporta una persona. Por eso el sistema
rechaza por defecto, muestra el trabajo que ya existe, y deja una salida explicita con
motivo.

En ningun caso de esta spec el operador queda sin poder agendar. Lo que cambia es que
pasa de hacerlo sin saberlo a hacerlo sabiendolo y dejando constancia.

---

## 2. Taxonomia de trabajo que gobierna los mensajes

Toda la copy se diferencia por la naturaleza del trabajo, segun el modelo ya existente:

| Naturaleza | Como se reconoce | Ancla de unicidad | Sujeto que se nombra al operador |
| --- | --- | --- | --- |
| Instalacion de cliente nuevo | `origin_context = CRM`, `work_type = INSTALLATION` | expediente | nombre del cliente |
| Visita a suscriptor por falla | ticket externo (`TicketSubjectType` = `SUBSCRIBER`, `CONTRACT`, `SERVICE`) | ticket | nombre del cliente |
| Trabajo interno de red u oficina | ticket interno (`TicketSubjectType` = `NETWORK_NODE`, `DEVICE`, `INTERNAL_AREA`) | ticket | nodo, equipo o sede |
| Trabajo manual sin ticket | `origin_context = MANUAL`, sin referencia | no se bloquea | municipio y sector |

Regla de redaccion: **nunca se nombra al suscriptor como si fuera la causa del bloqueo.**
El bloqueo es siempre por el trabajo (expediente o ticket); el sujeto aparece como
contexto que ayuda a reconocerlo.

---

## 3. Cortes de entrega

| Corte | Contenido | Dependencia de contrato |
| --- | --- | --- |
| **C-A** | E1 (CTA consciente del estado) + E2 (advertencia de colision al confirmar) | Ninguna nueva; usa datos ya disponibles |
| **C-B** | E3 (indicador en la bandeja) + E5 (huella de reprogramacion) | Indicador derivado en el listado |
| **C-C** | E4 (trabajos relacionados) + E6 (filtro) + E7 (retiro por resolucion remota) | Consulta por origen y sujeto; puerto MOD10 → MOD09 |

Se recomienda aprobar **C-A** primero: corta la ruta que genera el duplicado reportado
y no exige cambios de contrato.

---

## 4. E1 — CTA de origen consciente del estado

**Prioridad 1 · impacto muy alto · coste bajo**

Aplica al bloque "Coordinacion de visita" del expediente
(`apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx:700-724`,
`ExpedienteSchedulingActions.tsx:22-45`) y al equivalente en el detalle de ticket.

### Comportamiento

Cuando la unidad de origen ya tiene trabajo de campo activo, el par de botones se
sustituye por una tarjeta de estado con accion primaria **"Ver la visita agendada"** y
secundaria discreta **"Coordinar otra visita"**.

El estado se resuelve del **hecho real** (existe trabajo activo), no del estado del
expediente. Esto elimina la dependencia del sync best-effort que hoy falla en silencio
(`scheduling-visit-request-sync.ts:58-70`, vector V2 del informe).

### Estados

| Situacion | Titulo | Cuerpo | Primaria | Secundaria |
| --- | --- | --- | --- | --- |
| Trabajo agendado | Visita ya coordinada | La instalacion quedo agendada para el {fecha} a las {hora} con {tecnico}. | Ver la visita agendada | Coordinar otra visita |
| Trabajo en ejecucion | Visita en curso | La instalacion esta en ejecucion desde el {fecha}. | Ver la visita en curso | Coordinar otra visita |
| Solicitud creada sin franja | Solicitud en bandeja | Ya hay una solicitud de instalacion en la bandeja de pendientes. | Abrir en pendientes | Coordinar otra visita |
| Sin trabajo activo | — | Comportamiento actual sin cambios | Agendar ahora | Enviar a pendientes |

### Criterios de aceptacion

1. Un origen con trabajo agendado o en ejecucion muestra la tarjeta correspondiente en
   lugar del par de botones, con enlace funcional al trabajo existente.
2. "Coordinar otra visita" abre el flujo de creacion y la advertencia E2 se dispara al
   confirmar.
3. Si la transicion de estado del expediente falla tras agendar, el CTA **sigue**
   mostrando el estado correcto.
4. Un origen sin trabajo activo conserva exactamente el comportamiento actual.
5. Doble activacion rapida no produce dos solicitudes (no regresion del criterio 3 de
   `2026-07-27-crm-coordinacion-visita-cta-design.md`).
6. Operable por teclado, foco visible, objetivos ≥44 px.

---

## 5. E2 — Advertencia de colision en el dialogo de confirmacion

**Prioridad 1 · impacto muy alto · coste medio · cubre las tres rutas de confirmacion**

Aplica a `ScheduleVisitRequestConfirmDialog.tsx:121-130`, que es el gate comun de la
bandeja, de "abrir en agenda" y del calendario. **El contenedor de advertencias
operativas ya existe** y hoy solo se alimenta de riesgos de franja: se amplia para
admitir riesgos de origen.

### Comportamiento

Al abrir el dialogo, si la unidad de origen ya tiene trabajo activo:

- Alerta de aviso sobre el bloque de franja, con tipo de trabajo, fecha, hora, tecnico
  y enlace "Ver la visita agendada".
- El boton primario cambia de "Confirmar agenda" a **"Agendar de todas formas"**.
- Aparece un campo obligatorio **"Motivo de la segunda visita"** (una linea, maximo 200
  caracteres) con sugerencias rapidas por tipo de trabajo.
- El motivo viaja a la orden de trabajo y queda auditado con actor.

Cuando la unidad de origen **no** colisiona pero el **sujeto** si tiene trabajo activo
(mismo suscriptor con otro ticket, mismo nodo con otro trabajo, misma zona), se muestra
la variante informativa: aviso sin campo de motivo y sin cambio del boton primario.

### Copy por naturaleza del trabajo

**Colision de unidad de origen — bloqueo con salida justificada**

| Naturaleza | Titulo | Descripcion |
| --- | --- | --- |
| Instalacion | Este expediente ya tiene una instalacion agendada | La instalacion de {cliente} esta agendada para el {fecha} a las {hora} con {tecnico}. Si necesitas una segunda visita, explica el motivo antes de continuar. |
| Visita a suscriptor | Este caso ya tiene una visita agendada | La visita de {tipo} para {cliente} esta agendada para el {fecha} a las {hora} con {tecnico}. Puedes agendar otra si el caso lo requiere; cuentanos por que. |
| Trabajo interno | Este caso ya tiene un trabajo agendado | El {tipo} sobre {nodo o sede} esta agendado para el {fecha} a las {hora} con {tecnico}. Puedes agendar otro si el trabajo lo requiere; cuentanos por que. |

**Coincidencia de sujeto — aviso informativo, sin bloqueo**

| Naturaleza | Texto |
| --- | --- |
| Mismo cliente, otro caso | Este cliente tiene otra visita agendada para el {fecha}. Revisa si conviene atender ambas en la misma salida. |
| Mismo nodo o sede | Ya hay otro trabajo agendado sobre {nodo o sede} para el {fecha}. Revisa si conviene unirlos. |
| Misma zona (trabajo manual) | Ya hay {n} trabajos agendados en {municipio · sector} para el {fecha}. Revisa si conviene sumarlo a esa salida. |

**Campo de motivo**

- Etiqueta: `Motivo de la segunda visita`
- Ayuda: `Se guarda en la orden de trabajo para que el tecnico sepa por que hay dos.`
- Error si queda vacio: `Escribe el motivo para poder agendar la segunda visita.`
- Sugerencias rapidas:
  - Instalacion → `Trabajo quedo incompleto` · `Cliente cambio la fecha` · `Falta material o acometida`
  - Visita a suscriptor → `La falla continua` · `Se requiere segundo diagnostico` · `Cliente reporto novedad nueva`
  - Trabajo interno → `Se amplia el alcance` · `Requiere otra cuadrilla` · `Continuacion del trabajo anterior`

### Criterios de aceptacion

1. Con colision de unidad de origen, la alerta se muestra **antes** de que el boton
   primario sea alcanzable en orden de tabulacion.
2. Con colision, el boton primario dice "Agendar de todas formas" y permanece
   deshabilitado mientras el motivo este vacio.
3. Sin colision, ni la alerta ni el campo se renderizan y el boton primario sigue
   diciendo "Confirmar agenda" (sin regresion del camino feliz).
4. Con coincidencia de sujeto pero sin colision de origen, se muestra la variante
   informativa y **no** se exige motivo.
5. El motivo confirmado queda visible en el detalle de la solicitud y en las notas de la
   orden de trabajo.
6. La alerta se anuncia por lector de pantalla al abrir el dialogo; el foco inicial cae
   en el dialogo, no en el boton primario.
7. Contraste AA en claro y oscuro sobre tokens reales; el estado se identifica por texto
   ademas de por color.
8. Se comporta igual en las superficies que montan el dialogo: bandeja y agenda.
9. El servidor rechaza con `409` aunque el cliente omita la advertencia: la alerta es
   experiencia, no control (ADR-076 (propuesto) regla 3).

---

## 6. E3 — Indicador preventivo en la bandeja

**Prioridad 2 · impacto alto · requiere indicador derivado en el listado**

`PendingVisitRequestInbox.tsx:461-465` (escritorio) y `:207-218` (movil).

Chip tonal de la escala de aviso junto al badge de estado. **Nunca lima ni verde**: el
lima comunica avance, no riesgo (Firma iWana). Color mas palabra, siempre (WCAG 1.4.1).

| Naturaleza | Chip | Texto accesible |
| --- | --- | --- |
| Instalacion | Instalacion agendada | Este expediente ya tiene una instalacion agendada para el {fecha}. |
| Visita a suscriptor | Visita agendada | Este caso ya tiene una visita agendada para el {fecha}. |
| Trabajo interno | Trabajo agendado | Ya hay un {tipo} agendado sobre {nodo o sede} para el {fecha}. |
| Tras mover a pendientes | Reprogramada | Esta visita ya se habia agendado antes y volvio a pendientes. |

### Criterios de aceptacion

1. Toda fila cuya unidad de origen tenga trabajo activo muestra el chip, en tabla y en
   tarjeta movil.
2. El chip no depende del color y su descripcion ampliada es accesible por teclado, no
   solo por hover.
3. Renderizar la bandeja **no** dispara llamadas adicionales por fila: el dato viaja con
   el listado.
4. Las filas con chip siguen siendo seleccionables y despachables; no se atenuan.
5. Los skeletons reservan el espacio del chip para evitar salto de layout.

---

## 7. E4 — Bloque "Trabajos relacionados" en el panel de despacho

**Prioridad 3 · impacto medio**

`PendingVisitRequestDetailPanel.tsx:214`, despues del resumen y antes de las alertas de
contexto, y su equivalente en el panel de recomendacion CRM.

Bloque colapsable, abierto solo si hay algo que mostrar. Hasta 3 lineas con tipo de
trabajo, fecha, tecnico y estado, con enlace a cada una. Incluye tanto trabajos de la
misma unidad de origen como del mismo sujeto, etiquetados de forma distinguible.

- Titulo: `Trabajos relacionados`
- Vacio: `Sin trabajos previos registrados para este caso.`
- Linea: `{Tipo} · {fecha} · {tecnico} · {estado}`
- Enlace: `Ver detalle`

### Criterios de aceptacion

1. Con trabajos previos, el bloque aparece expandido, lista maximo 3 ordenados del mas
   reciente al mas antiguo, con enlace a cada uno.
2. Sin trabajos previos, aparece colapsado o con estado vacio y no añade altura
   perceptible (respeta el objetivo de densidad de `SPEC-WFM-PENDING-VISITS-ACTO-OPERATIVO-v1.0` §15).
3. El disparador expone `aria-expanded` y `aria-controls`.
4. Ninguna fecha, direccion ni nombre mostrado incluye identificadores tecnicos.

---

## 8. E5 — Huella de reprogramacion

**Prioridad 3 · coste bajo**

`MoveEventToPendingDialog.tsx:60-67`, bloque de contexto ya existente:

> Esta visita ya se habia agendado una vez. Al moverla, el evento sale del calendario y
> la solicitud vuelve a la bandeja para reprogramarla.

Al volver, la fila lleva el chip `Reprogramada`, que desaparece al reagendarse.

### Criterios de aceptacion

1. El dialogo muestra el texto antes del boton de confirmacion.
2. Tras mover, la solicitud aparece con el chip "Reprogramada".
3. El chip desaparece cuando la solicitud vuelve a agendarse.

---

## 9. E6 — Filtro "Trabajo activo"

**Prioridad 4 · herramienta de depuracion, no de prevencion**

`PendingVisitRequestInbox.tsx:318-381` (la grid pasa de 5 a 6 columnas en `xl`) y
`pending-visits-ui.ts:14-22`.

- Etiqueta: `Trabajo activo`
- Opciones: `Todas` · `Sin trabajo activo` · `Ya tiene trabajo activo`
- Vacio al filtrar: titulo `No hay solicitudes con trabajo activo`, descripcion
  `Ninguna solicitud de esta vista coincide con el filtro. Cambia el filtro o revisa la bandeja completa.`

### Criterios de aceptacion

1. Operable por teclado; el valor se refleja en la URL y el boton Atras lo restaura.
2. Cambiar el filtro reinicia la paginacion a la primera pagina.
3. El vacio por filtro es distinto del vacio de primera vez (corrige el hallazgo de
   `PendingVisitRequestInbox.tsx:403-406`, hoy unico para ambos casos).
4. El valor por defecto es `Todas`: ninguna solicitud queda oculta sin accion explicita.

---

## 10. E7 — Retiro de la solicitud cuando el caso se resuelve sin visita

**Prioridad 2 · elimina la visita despachada para un trabajo inexistente (vector V8)**

Un ticket puede resolverse por WhatsApp, correo o telefono. Cuando su decision de campo
vuelve a "no requiere visita" o el ticket se cierra sin visita, la solicitud pendiente
asociada debe retirarse de la bandeja automaticamente.

### Comportamiento

- La solicitud pendiente pasa a cerrada con motivo trazable, sin intervencion del
  coordinador.
- Si la visita **ya estaba agendada**, no se cancela en silencio: la superficie muestra
  una alerta en el detalle del trabajo — *"El caso se resolvio sin visita. Revisa si el
  trabajo agendado para el {fecha} sigue siendo necesario."* — con acciones "Cancelar la
  visita" y "Mantenerla".
- En el detalle del ticket, al marcar que no requiere visita existiendo solicitud viva:
  *"Hay una visita pendiente para este caso. Al marcarlo como resuelto sin visita, la
  solicitud saldra de la bandeja de programacion."*

### Criterios de aceptacion

1. Un ticket que pasa a "no requiere visita" retira su solicitud pendiente de la bandeja
   sin accion manual.
2. Un ticket cerrado sin visita retira igualmente su solicitud pendiente.
3. Si el trabajo ya estaba agendado, **no** se cancela automaticamente: se advierte y se
   deja la decision al coordinador.
4. El retiro queda trazado con motivo y origen del cambio.
5. Solicitar trabajo de campo dos veces sobre el mismo ticket no acumula vinculos: es
   idempotente mientras exista un vinculo vivo.

---

## 11. Criterios transversales

- Ningun texto visible expone valores de enum, identificadores tecnicos ni datos
  personales mas alla del nombre de cliente que la bandeja ya muestra (ADR-039 regla 7).
- Todos los estados nuevos resuelven sus cuatro variantes: carga (skeleton con forma de
  contenido), vacio con accion, error junto al elemento, y exito.
- Ninguna propuesta introduce bloqueo duro: en todos los casos de colision el operador
  puede llegar a agendar dejando constancia.
- Verificado en 375 px, tablet y escritorio. La advertencia de colision y el CTA de
  estado permanecen visibles y operables en movil.
- Ninguna guarda de esta spec puede impedir los tres casos legitimos: reinstalar tras
  cancelar, atender varios tickets del mismo suscriptor, y abrir varios tickets sobre el
  mismo nodo.

---

## 12. Deuda tecnica adyacente detectada

1. `ScheduleVisitRequestConfirmDialog.tsx:121-130` es un contenedor ad hoc con clases
   `amber` locales que duplica `PortalAlert`. Consolidar al implementar E2 (fe-platform).
2. `scheduling-visit-request-sync.ts:58-70` degrada un fallo de transicion a texto dentro
   de un mensaje de exito. Debe separarse en una alerta de advertencia propia.
3. `PendingVisitRequestInbox.tsx:403-406` usa un unico estado vacio para "primera vez" y
   "sin resultados". Se corrige con E6.
4. Si el catalogo de `Badge` no tiene variante tonal adecuada para un chip informativo de
   riesgo que no compita con el badge de estado de la misma fila, se solicita a
   ds-owner. **No se inventa aqui.**

---

## 13. Referencias

- docs/adrs/ADR-039-Bandeja-Visitas-Pendientes-WFM.md
- [ADR-076 (propuesto)](../adrs/ADR-076-Unicidad-Trabajo-Campo-Activo-Por-Origen.md)
- docs/informes/INFORME-MOD09-DUPLICACION-AGENDAMIENTO-VISITAS-v1.0.md
- docs/specs/SPEC-WFM-PENDING-VISITS-ACTO-OPERATIVO-v1.0.md
- docs/specs/SPEC-WFM-PENDING-VISITS-CALENDAR-FIRST-v1.0.md
- docs/specs/2026-07-27-crm-coordinacion-visita-cta-design.md
