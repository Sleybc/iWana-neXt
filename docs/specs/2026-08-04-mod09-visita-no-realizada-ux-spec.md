# UX Spec — Visita agendada que no se realiza (MOD09 / MOD11)

**Fecha:** 2026-08-04
**Autor:** AI-EM-ARCH
**Estado:** Propuesta — pendiente de aprobacion del CTO
**Modulos:** MOD09 Programacion / WFM, MOD11 Ejecucion Operativa
**Superficies:** orden de ejecucion (tecnico), `/dashboard/scheduling/pending-visits`, vista de revision de vencidos, detalle de solicitud
**ADR de referencia:** [ADR-077 (propuesto)](../adrs/ADR-077-Ciclo-Vida-Visita-No-Realizada.md)
**ADR hermano:** [ADR-076 (propuesto)](../adrs/ADR-076-Unicidad-Trabajo-Campo-Activo-Por-Origen.md)

---

## 1. Principio rector

**El sistema nunca decide por el operador, pero tampoco le deja el trabajo invisible.**

Una visita que no se realiza es informacion operativa valiosa: dice algo del cliente, de
la cuadrilla o del territorio. Hoy se pierde. Esta spec la captura con la minima fricción
posible en campo y la maxima claridad posible en coordinacion.

Dos reglas que gobiernan todo lo demas:

- Al tecnico se le pide **el hecho**, en segundos, con el pulgar y sin teclado.
- Al coordinador se le pide **la decision**, con todo el contexto delante.

---

## 2. Reparto de responsabilidad

| Actor | Que aporta | Autoridad |
| --- | --- | --- |
| Tecnico | Causa observada en campo + evidencia | Registra el hecho. No decide destino ni SLA |
| Coordinador | Confirmacion o reclasificacion + destino | **Autoritativa** para intentos, SLA y metricas |
| Sistema | Deteccion del silencio | Marca y hace visible. **No decide nada** |

---

## 3. E1 — Cierre en campo: causa obligatoria

**Superficie:** orden de ejecucion en el portal (`ExecutionOrderDrawer`), usada en movil.

Al cerrar como **no ejecutada**, el tecnico debe elegir causa antes de poder confirmar.
Seis opciones en tarjetas grandes, una sola pulsacion, sin desplegable:

| Opcion visible | Causa |
| --- | --- |
| El cliente no estaba | `CUSTOMER_ABSENT` |
| No hubo acceso al sitio | `CUSTOMER_NO_ACCESS` |
| El cliente pidio aplazar | `CUSTOMER_DECLINED` |
| Falto material o equipo | `OPERATION_MISSING_MATERIAL` |
| Clima o via cerrada | `FORCE_MAJEURE` |
| Ya no se necesita la visita | `NO_LONGER_APPLICABLE` |

`OPERATION_NO_SHOW` no aparece: nadie reporta su propia ausencia. La asigna el
coordinador sobre un evento vencido sin reporte.

Campo de nota opcional: `Cuentanos que paso` — una linea, ayuda a la reclasificacion.

### Evidencia

Para las tres causas de cliente, la evidencia es **obligatoria** (foto del sitio) porque
sostiene la pausa del SLA (ADR-077 (propuesto) D5). Texto de ayuda visible al pedirla:

> Toma una foto del sitio. Es lo que respalda que la visita se intento.

Para el resto, la evidencia es opcional.

### Copy de confirmacion

| Causa elegida | Mensaje tras confirmar |
| --- | --- |
| Causas de cliente | Registramos que la visita no se pudo hacer. Coordinacion la revisara para reprogramarla. |
| Falto material o equipo | Registrado. Coordinacion lo revisara y reprogramara la visita. |
| Clima o via cerrada | Registrado. Coordinacion lo revisara y reprogramara la visita. |
| Ya no se necesita | Registrado. Coordinacion cerrara el caso. |

**Nunca** se le dice al tecnico cuantos intentos van ni si el SLA se pausa: no es su
decision y no debe condicionar lo que reporta.

### Criterios de aceptacion

1. El boton de confirmar cierre como no ejecutada permanece deshabilitado hasta elegir
   causa.
2. Elegir una causa de cliente exige evidencia antes de confirmar; el resto no.
3. Las tarjetas de causa son operables con una mano: objetivo ≥44 px, alcanzables sin
   desplazamiento horizontal en 375 px.
4. El flujo completo se resuelve sin teclado salvo la nota opcional.
5. Sin conexion, el cierre queda en cola y se reintenta; el tecnico ve el estado de
   envio y no pierde lo registrado.
6. El mensaje de confirmacion no menciona intentos, SLA ni consecuencias comerciales.

---

## 4. E2 — Vista de revision: el trabajo que quedo sin hacer

**Superficie nueva**, accesible desde programacion. Concentra dos poblaciones que hoy
son invisibles:

- **Reportadas por el tecnico**: cerradas como no ejecutadas, esperando decision.
- **Vencidas sin reporte**: la franja paso, nadie cerro nada (ADR-077 (propuesto) D7).

### Estructura

Cada fila muestra: cliente o sujeto, tipo de trabajo, fecha de la franja perdida,
tecnico asignado, causa reportada (o *"Sin reporte"*), numero de intento, y estado del
SLA.

Tres acciones por fila:

| Accion | Que hace |
| --- | --- |
| **Reprogramar** | Devuelve a la bandeja y abre el despacho |
| **Cerrar el caso** | Cierra la solicitud con motivo |
| **Reclasificar** | Cambia la causa antes de decidir |

La reclasificacion es donde el coordinador puede asignar `OPERATION_NO_SHOW`, la unica
causa que el tecnico no puede reportar.

### Copy de estados

- Titulo de la vista: `Visitas sin realizar`
- Descripcion: `Trabajo agendado que no se ejecuto. Revisa la causa y decide si se reprograma o se cierra.`
- Vacio: `No hay visitas sin realizar. Todo el trabajo agendado se ejecuto o esta en curso.`
- Fila sin reporte: chip `Sin reporte` con texto accesible `La franja vencio y no se registro el cierre. Confirma que paso antes de decidir.`
- Divergencia entre clasificaciones: chip `Reclasificada` con texto `El tecnico reporto otra causa. Se conservan ambas.`

### Criterios de aceptacion

1. Las dos poblaciones (reportadas y sin reporte) conviven en la vista y se distinguen
   visualmente sin depender solo del color.
2. Reclasificar conserva la causa original del tecnico y la muestra junto a la nueva.
3. Ninguna accion de esta vista es automatica: toda fila requiere decision humana.
4. El vacio distingue "no hay nada" de "el filtro no arroja resultados".
5. El estado de la vista se refleja en la URL y sobrevive al boton Atras.
6. Una fila desaparece de la vista solo cuando su decision se ejecuta.

---

## 5. E3 — La solicitud que vuelve, en la bandeja

**Superficie:** `PendingVisitRequestInbox`, fila y tarjeta movil.

Una solicitud en `REQUIRES_RESCHEDULE` es **agendable** (ADR-077 (propuesto) D3) y se distingue de
las nuevas:

| Situacion | Chip | Texto accesible |
| --- | --- | --- |
| Vuelve tras intento fallido | `Intento {n} de 3` | `La visita no se pudo hacer el {fecha}: {causa}. Es el intento {n}.` |
| Vuelve por causa de la operacion | `Reprogramar — causa interna` | `La visita no se hizo por una novedad de la operacion del {fecha}.` |
| Tercer intento agotado | `Requiere decision` | `Se agotaron los tres intentos. Alguien debe decidir si continua o se cierra.` |

El trabajo que vuelve por causa de la operacion **sube** en el orden de la bandeja
(ADR-077 (propuesto) D5): es deuda propia.

### Criterios de aceptacion

1. Una solicitud en `REQUIRES_RESCHEDULE` puede agendarse desde la bandeja sin pasos
   adicionales y sin exigir motivo de excepcion (ADR-077 (propuesto) D8).
2. El chip de intento refleja el contador real y solo cuenta intentos imputables al
   cliente.
3. Con los tres intentos agotados, la accion de agendar deja paso a la de decidir; no se
   bloquea en silencio.
4. Las causas de operacion no incrementan el contador visible.
5. El orden de la bandeja sitúa por delante el trabajo devuelto por causa interna.

---

## 6. E4 — Historial de intentos en el detalle

**Superficie:** `PendingVisitRequestDetailPanel`.

Bloque con una linea por intento: fecha y franja, tecnico, causa reportada, causa
confirmada si difiere, y evidencia si existe.

- Titulo: `Intentos anteriores`
- Vacio: no se renderiza (una solicitud sin intentos no necesita el bloque)
- Linea: `{fecha} · {tecnico} · {causa}` — con `Reportado como {causa original}` cuando hubo reclasificacion

### Criterios de aceptacion

1. Cada intento fallido aparece con su causa y su evidencia enlazada.
2. La reclasificacion se muestra sin ocultar lo que reporto el tecnico.
3. El bloque no se renderiza cuando no hay intentos previos.
4. Ningun identificador tecnico es visible.

---

## 7. E5 — Aviso al agotar los intentos

Al confirmar el tercer intento fallido imputable al cliente, el coordinador ve, en el
punto de decision:

> **Se agotaron los tres intentos**
> No se pudo hacer la visita de {cliente} en tres oportunidades. Decide si se reprograma
> una vez mas o si el caso se cierra.

Acciones: `Reprogramar de todas formas` · `Cerrar el caso`. **Ninguna preseleccionada, y
ninguna automatica** (ADR-077 (propuesto) D4). Cerrar exige motivo.

Para instalaciones, el cierre devuelve el caso al expediente con nota visible en CRM,
porque la decision es comercial.

### Criterios de aceptacion

1. El aviso aparece exactamente al tercer intento imputable al cliente, no antes.
2. Ninguna de las dos acciones es la opcion por defecto.
3. Cerrar exige motivo; sin el, la accion no procede.
4. Para instalaciones, el cierre deja nota visible en el expediente.
5. El sistema no cancela nada por su cuenta en ningun punto de este flujo.

---

## 8. Criterios transversales

- Ninguna causa, estado ni contador se expresa con el valor crudo del enum.
- Los chips de esta spec usan la escala de aviso; el lima queda reservado para avance
  (Firma iWana). Color mas palabra, siempre.
- Todos los estados nuevos resuelven carga, vacio, error y exito.
- La superficie del tecnico se verifica en 375 px con una sola mano; la del coordinador
  en escritorio y tablet.
- Ninguna accion de esta spec es irreversible sin confirmacion explicita.
- Ninguna pantalla revela al tecnico informacion comercial o de SLA del cliente.

---

## 9. Dependencias

| Elemento | Depende de |
| --- | --- |
| E1 | Taxonomia de causa en el contrato de cierre de orden (MOD11) |
| E2 | Job de deteccion de vencidos (ADR-077 (propuesto) D7) y vista nueva en el portal |
| E3 | `REQUIRES_RESCHEDULE` agendable (ADR-077 (propuesto) D3) y contador de intentos |
| E4 | Conservacion del evento fallido (ADR-077 (propuesto) D6) |
| E5 | Contador de intentos y puerto de retorno hacia CRM para instalaciones |

**Orden recomendado:** E3 primero — es la correccion que desbloquea trabajo hoy
inagendable —, despues E1, luego E2 y E4, y E5 al final.

---

## 10. Referencias

- [ADR-077 (propuesto)](../adrs/ADR-077-Ciclo-Vida-Visita-No-Realizada.md)
- [ADR-076 (propuesto)](../adrs/ADR-076-Unicidad-Trabajo-Campo-Activo-Por-Origen.md)
- docs/adrs/ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md
- docs/specs/SPEC-WFM-PENDING-VISITS-ACTO-OPERATIVO-v1.0.md
- [UX antiduplicacion](2026-08-04-mod09-antiduplicacion-visitas-ux-spec.md)
