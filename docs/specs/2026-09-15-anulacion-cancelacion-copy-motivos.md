# Spec UX — Copy y motivos: anular por error frente a cancelar

**Fecha:** 2026-09-15
**Autor:** AI-PROD-UX (`prod-ux`)
**Encargo:** `docs/prompts/PROMPT-MOD11-CORRECCION-OT-T2-v1.0.md` §4 punto 6 (en paralelo con `sr-backend`)
**Spec base:** `docs/specs/2026-09-14-mod11-correccion-ot-design.md` §4.4 y §4.5 (criterio CA-14)
**ADR:** ADR-090 §D3 (Aprobado) — la anulación es un hecho distinto de la cancelación
**Skill:** `system-vocabulary-review` (disciplina de vocabulario del sistema)
**Alcance:** copy y catálogo de motivos. **No diseña pantalla** (la superficie llega después) y **no decide la semántica del dato** (de `sr-backend` en el mismo tramo).

---

## 1. Audiencia y principio

Audiencia: coordinación y supervisión (quienes anulan y cancelan) y campo lector (que ve estados). Principio: **dos actos, dos nombres**. Si la pantalla no nombra el efecto sobre la orden, el usuario opera a ciegas — hoy ocurre (ver §2).

## 2. El engaño actual (evidencia)

En `apps/portal/src/components/scheduling/UnrealizedVisitsView.tsx`, el diálogo de revisión ofrece «Cerrar el caso» con la descripción «Confirma la causa y cierra la solicitud. Debes dejar una nota con el motivo.» En ningún punto dice que **la orden de trabajo se cancela**. El mensaje de éxito («El caso quedó cerrado») confirma el ocultamiento. La misma omisión afecta a «Reprogramar visita» («devuelve el trabajo a la bandeja para despacho»): la orden actual también se cierra y nace otra al reagendar. El diálogo gemelo `ExhaustedAttemptsDecisionDialog.tsx` repite «Cerrar el caso» / «Cierra la solicitud» sin nombrar la orden.

## 3. Vocabulario canónico

| Acto | Verbo canónico | Cuándo | Quién | Efecto sobre la orden |
| --- | --- | --- | --- | --- |
| Anular por error | **Anular** | La orden no debió existir (error de captura o despacho) | Solo supervisión, con motivo obligatorio | La orden queda **anulada**: sale de la bandeja, sigue consultable, libera su origen para redespachar |
| Cancelar | **Cancelar** | El trabajo comprometido se deshace (el cliente canceló, la visita no se hará) | Coordinación, con causa de la taxonomía | La orden queda **cancelada** y cuenta como cancelación |
| Reprogramar | **Reprogramar** | La visita no se hizo pero el trabajo sigue vivo | Coordinación | La orden actual se **cierra** y el trabajo vuelve a despacho para una orden nueva |
| Reclasificar | **Reclasificar** | Cambia solo la causa registrada | Coordinación | **Ninguno**: no cierra ni cancela nada |

Tríada terminal que la UI debe mantener separada: **No ejecutada** (se intentó, no se logró) ≠ **Cancelada** (trabajo deshecho) ≠ **Anulada** (nunca debió existir).

## 4. Copy propuesto (diálogo de revisión, visitas sin realizar)

Mantiene los tres botones y el flujo; cambia lo que cada uno declara:

- **Reclasificar causa** (sin decisión): título «Reclasificar causa». Descripción: «Cambia solo la causa registrada. No cierra la solicitud ni cancela la orden.» Esta frase es el candado de CA-14: la acción que hoy es honesta debe seguir siéndolo por escrito.
- **Reprogramar visita**: título sin cambio. Descripción: «Confirma o ajusta la causa. La orden actual queda cancelada y el trabajo vuelve a la bandeja para despacho con una orden nueva.» Éxito: «La visita quedó lista para reprogramar. La orden anterior quedó cancelada.» La palabra «cancelada» aquí es deliberada: esa orden sí cuenta como cancelación y el copy no debe esconderlo.
- **Cerrar el caso** → pasa a declarar la cancelación. Título: «Cancelar la orden y cerrar el caso». Descripción: «Confirma la causa. La orden de trabajo queda cancelada y el caso se cierra. Debes dejar el motivo.» Campo: etiqueta «Motivo de la cancelación», ayuda «Queda registrado en la orden y cuenta como cancelación, no como error.» Éxito: «La orden quedó cancelada y el caso cerrado.»
- Validaciones con siguiente paso (se conservan, con el verbo corregido): «Elige una causa antes de continuar.» / «Indica el motivo de la cancelación para continuar.»

Diálogo gemelo (`ExhaustedAttemptsDecisionDialog`): «Cerrar el caso» → «Cancelar la orden y cerrar el caso», ayuda «Cierra la solicitud y cancela su orden. Debes indicar el motivo.», campo «Motivo de la cancelación».

## 5. Catálogo de motivos de anulación (acto nuevo, solo supervisión)

El dato lo define `sr-backend` (motivo libre obligatorio); este catálogo son **motivos sugeridos** de selección rápida que rellenan el campo, no una lista cerrada:

1. Sitio equivocado al despachar
2. Trabajo duplicado: ya existe una orden para el mismo origen
3. Tipo de trabajo incorrecto: requiere anular y recrear
4. Cliente o dirección incorrectos
5. La necesidad ya no existe
6. Otro motivo (texto libre obligatorio)

Copy del acto (futura superficie): título «Anular orden por error». Descripción: «La orden no debió existir. Queda anulada: sale de la bandeja, sigue consultable y su origen queda libre para despachar de nuevo. No cuenta como cancelación.» Ayuda del campo: «Describe el error. El volumen de anulaciones se vigila como señal de fallas en agenda o en el alta.» Éxito: «La orden quedó anulada. Puedes despachar de nuevo el mismo origen.» Error sin motivo: «Indica el motivo de la anulación para continuar.»

## 6. Etiquetas y variantes (futura superficie; fuente `operations-labels.ts`)

- `Anulada`, variante `neutral` — a propósito distinta de `Cancelada` (`error`): la anulación no es un fracaso operativo y el rojo las fundiría.
- Sin etiqueta nueva de resultado: la anulación no fija resultado (el dato queda nulo), así que `EXECUTION_ORDER_RESULT_LABELS` no crece.
- Línea de tiempo: «Anulada por error: ‹motivo›» frente a «Cancelada desde agenda: ‹motivo›».
- Formato de motivo con causa `[CÓDIGO] etiqueta` (dato de `sr-backend`, CA-14): el código entre corchetes es la clave estable de la taxonomía y la etiqueta es legible; ambas viajan juntas para que el motivo sea trazable sin conocer el catálogo de memoria.

## 7. Términos del sistema que esta propuesta obliga a revisar

1. **«Cerrar el caso» a secas** — queda prohibido donde exista efecto sobre la orden; siempre «Cancelar la orden y cerrar el caso» o equivalente con verbo explícito.
2. **«Reclasificar»** — solo donde no haya efecto lateral; cualquier reclasificación que cancele debe renombrarse a cancelar.
3. **«Cancelada» frente a «Anulada»** — par canónico nuevo; revisar seeds, reportes y tableros que agrupen terminales para que la anulada no sume como cancelación.
4. **`[CÓDIGO] etiqueta`** — formato semivisible nuevo en motivos y asientos; documentarlo donde se expliquen códigos de causa.
5. **«OT»** — no aparece en copy final; siempre «orden» u «orden de trabajo».
6. **«Bandeja»** — uso existente («bandeja para despacho», «bandeja pendiente»); se conserva con ese sentido operativo.

## 8. Handoff a la superficie

Archivos que implementarán este copy: `UnrealizedVisitsView.tsx` (títulos, descripciones, mensajes), `ExhaustedAttemptsDecisionDialog.tsx` (radio y ayuda), `operations-labels.ts` (`Anulada` + variante), futura vista de anulación (catálogo del §5). Tests que hoy fijan el copy viejo y deberán actualizarse entonces: `UnrealizedVisitsView.spec.tsx:312`, `ExhaustedAttemptsDecisionDialog.spec.tsx:99-104`, `PendingVisitRequestsView.tsx:440` (mensaje «quedó cerrado»). Ningún test se toca en este tramo: no hay superficie nueva que romper.
