# ADR-090: Corrección de una OT — dueño del dato, propagación y anulación por error

**Versión:** 1.0
**Estado:** Aprobado
**Aprobado por:** CTO — 2026-09-15
**Urgencia sobrevenida:** E2 (2026-09-15) abrió la puerta de despacho y con ella una OT que **nadie puede cancelar** —sin evento de agenda no hay vía de cancelación, y `CREATED` está fuera del pool—. §D3 es hoy la única salida gobernada.
**Fecha:** 2026-09-14
**Modo activo:** Product Architect + Architect
**Autor:** AI-EM-ARCH
**Módulos:** MOD11 Ejecución Operativa · MOD09 Programación
**Relacionado:** [ADR-068](ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md) (Aprobado) — este ADR **implementa la frontera que aquel declaró** y no la modifica · [ADR-046](ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md) (Aprobado) · [ADR-047](ADR-047-Separacion-Programacion-y-OT-Ejecucion.md) (Aprobado) · [ADR-089](ADR-089-Linea-de-Tiempo-de-la-OT-de-Ejecucion.md) (Aprobado)
**Enmendado por:** [ADR-091](ADR-091-Origen-de-la-OT-Despacho-y-Agenda-Actos-Separados.md) (Aprobado) — acota el alcance de §D1 al caso de la OT agendada
**Spec que lo desarrolla:** `docs/specs/2026-09-14-mod11-correccion-ot-design.md`

---

## Contexto

El CTO pidió el 2026-09-14 **poder eliminar una OT creada por error**. Al explorar la petición, su alcance real resultó ser otro: lo que hace falta es **corregir** —sitio equivocado, ventana mal puesta, técnico erróneo— y, cuando corregir no sea posible, **anular distinguiendo el error de creación de una cancelación operativa**.

### Por qué borrar quedó descartado

No existe **ni una sola clave foránea** apuntando a `execution_orders` en todo el repositorio: los vínculos son lógicos por `execution_order_id` + `tenant_id`, decisión documentada y deliberada. En consecuencia, un `DELETE` **tiene éxito silencioso** y deja huérfanas nueve tablas hijas, la agenda, la tarea operativa, el ticket de soporte y los movimientos de stock —que además son irreversibles: las columnas `is_reversal` y `reversed_by_movement_id` existen en el esquema y **ningún código las activa jamás**.

Dos consecuencias hacen el borrado inaceptable por sí solas:

1. **Rompe la anonimización por retención.** La purga de `execution_order_status_transitions` hace `JOIN` contra `execution_orders`; sin la fila padre, los asientos conservan `changed_by` y `reason` **indefinidamente**, saltándose los 24 meses del dictamen de retención. Limpiar una bandeja destruiría una garantía de protección de dato personal.
2. **Reutiliza el consecutivo.** `OTE-YYYYMMDD-NNN` se calcula con `MAX` sobre la propia tabla: borrar la última OT del día hace que la siguiente reutilice un número **ya escrito en `audit_logs` inmutables** y en eventos publicados.

Además, el patrón del repositorio es consistente y explícito: lo que ya tuvo consecuencias no se destruye, se neutraliza con otro registro (ledger de inventario, auditoría con trigger de base de datos, líneas de tiempo append-only). El único hard delete tolerado —el de un ítem de inventario— exige antes verificar **siete** tablas de historial para confirmar que el registro nunca tuvo efecto.

### Lo que la exploración encontró al buscar cómo corregir

**Hoy no existe ninguna forma de corregir una OT.** Ni editándola ni corrigiendo su origen:

- **No hay superficie de edición en MOD11.** El controlador expone lecturas y comandos de ejecución; no hay `PATCH` sobre la OT. Y hay un límite físico: `persistOrderOptimistically` escribe **siete columnas** —estado, resultado, versión, instantes de inicio y cierre, notas y actor— de modo que ningún otro campo llega a la base aunque se mute en memoria.
- **La propagación desde la agenda está diseñada pero no implementada.** `VisitWindowChangedV1` **no lo emite nadie**; `VisitResourceChangedV1` lo emite MOD11 en vez de MOD09; y ambos handlers del worker son `return Promise.resolve()` — no-ops.
- **MOD09 sí permite editar** ventana, sitio y técnico del evento, pero ninguna de esas rutas toca la OT. Reprogramar deja la OT con su ventana original, desincronizada en silencio.
- **El reconciliador no lo detecta:** compara únicamente estados, nunca ventana, recurso ni sitio.

Y un defecto activo que el mismo límite provoca: **`assign()` no persiste el técnico**. Muta el objeto en memoria, el `UPDATE` no incluye la columna, y la respuesta devuelve el objeto mutado — el supervisor ve un 200 con el técnico nuevo mientras la base conserva el anterior. Como el control de acceso lee la base, **el técnico reasignado no puede iniciar la OT y el anterior sí**.

---

## Decisión

### D1. El dato maestro se corrige en su dueño, y se propaga

**MOD09 es dueño de ventana, recurso y sitio. MOD11 lo es del estado de ejecución.** No es una decisión nueva: ADR-068 ya la fijó, incluida la propagación por evento idempotente. Lo que este ADR resuelve es que **se implemente**.

**No se abre un `PATCH` sobre la OT.** Sería un segundo dueño de los mismos datos y garantizaría divergencia: dos superficies escribiendo la ventana de la misma visita, sin árbitro. La corrección entra por la agenda y llega a la OT por evento.

**Alcance (enmienda 2026-09-14).** Esta decisión se escribió asumiendo que **toda** OT tiene evento de agenda. [ADR-091](ADR-091-Origen-de-la-OT-Despacho-y-Agenda-Actos-Separados.md) (Aprobado) retiró esa premisa: la OT nace del despacho y la ventana es atributo, no precondición. **D1 no cae, pero queda acotada: MOD09 es dueño de ventana, recurso y sitio mientras la OT esté agendada.** Una OT despachada sin cita no tiene evento del cual propagar; su ventana no existe todavía y su sede es obligatoria desde el despacho (ADR-091 (Aprobado) §D6). Corregir el dato maestro de una OT sin cita **es corregir el despacho, no la agenda**: entra por donde nació, y solo pasa a regirse por D1 cuando se agenda y se vincula.

### D2. El tipo de trabajo no se corrige: obliga a anular y recrear

`workType` determina el **snapshot de plantilla congelado** que gobierna el gate de cierre. Corregirlo exigiría re-congelar ese snapshot sobre una OT viva, lo que rompería la inmutabilidad que ADR-068 garantiza y dejaría requisitos evaluados contra una definición distinta de la que se aceptó al crear.

**Se rechaza explícitamente**, con mensaje accionable que indique la vía correcta: anular por error y recrear.

### D3. La anulación por error es un hecho distinto de la cancelación operativa

`CANCELLED` significa hoy *el trabajo comprometido se deshace*: el cliente canceló, la visita no se hará. **Una OT que no debió existir no es eso.** Mezclarlas hace que la tasa de cancelación mida ruido y oculta una señal valiosa: un volumen alto de OT anuladas por error indica que algo falla **aguas arriba**, en la agenda o en el alta de la visita, no en la ejecución.

La OT anulada **permanece consultable y sale de la bandeja operativa**, y **se excluye del cálculo** — el mismo patrón que el repositorio ya aplica a los documentos cancelados de compras. No se borra ningún rastro.

### D4. Una OT en ejecución no se corrige en silencio

Corregir ventana, sitio o recurso de una OT ya iniciada cambia las condiciones del trabajo mientras alguien lo está haciendo. ADR-068 lo dice para la reasignación —*una visita en ejecución no se reasigna silenciosamente*— y aquí se extiende a todo el dato maestro: la corrección sobre una OT en ejecución **se rechaza**, y si es inevitable, exige un acto explícito y registrado, nunca una propagación automática.

### D5. Ninguna corrección destruye rastro

Toda corrección deja asiento: la línea de tiempo registra el hecho, y la corrección de un asiento es aditiva (ADR-089 §D3). Este ADR **no abre ninguna excepción** a esa regla, ni siquiera para una OT que no debió existir.

---

## Consecuencias

**Positivas**

- Corregir una OT deja de exigir cancelar y recrear con consecutivo nuevo, que es el único camino que existe hoy.
- El defecto de `assign()` deja de ser invisible: el supervisor sabrá si la reasignación funcionó.
- Las métricas de cancelación dejan de contar errores de captura.
- La deriva entre agenda y OT pasa de silenciosa a observable.

**Negativas y costes**

- **Implementar la propagación exige tocar los dos módulos** y un puerto compartido. Es trabajo de frontera, con el riesgo habitual de que una de las dos partes quede a medias.
- **Ampliar lo que la persistencia escribe es delicado.** El `UPDATE` acotado de hoy protege por accidente contra escrituras no intencionadas; ampliarlo exige que cada comando declare qué campos toca, o se abre la puerta a que cualquier mutación en memoria llegue a la base.
- El rechazo de `workType` obligará a recrear en casos que el operador percibirá como corregibles. Es el precio de no romper la inmutabilidad del snapshot.

**Impacto declarado**

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | Sin cambio: toda operación sigue dentro del schema del tenant. |
| **Seguridad** | El defecto de `assign()` **es hoy un problema de control de acceso**: el técnico reasignado no puede operar y el anterior conserva el acceso. Corregirlo restaura la intención. La anulación por error exige rol de supervisión y motivo. |
| **Escala** | La propagación es por evento idempotente sobre infraestructura existente; sin consultas nuevas por lectura. |
| **Regulación** | Ninguna corrección destruye rastro (D5). La retención de la línea de tiempo no se altera. |
| **Boundaries** | **No se crea ninguno.** Se implementa la frontera que ADR-068 ya declaró; el puerto entre MOD09 y MOD11 gana un método, y sigue siendo interfaz tipada. |

---

## Riesgos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| R1 | Ampliar el `UPDATE` deja pasar mutaciones no intencionadas de otros comandos | Cada comando declara qué campos persiste; el cambio entra con test de persistencia real, no solo de respuesta |
| R2 | La propagación se implementa en MOD11 y no se emite desde MOD09, o al revés: queda a medias y nadie lo nota | Los dos lados entran en el mismo tramo, y el criterio de aceptación se verifica de extremo a extremo |
| R3 | Se abre un `PATCH` sobre la OT «porque es más rápido» | D1 lo prohíbe: sería un segundo dueño del mismo dato |
| R4 | La anulación por error se usa para ocultar cancelaciones reales y falsear la métrica | Exige motivo y rol de supervisión; el volumen de anulaciones es él mismo una métrica a vigilar |
| R5 | Se corrige una OT en ejecución y el técnico trabaja contra datos que cambiaron bajo sus pies | D4 |
| R6 | Se aprovecha el tramo para introducir el borrado «solo para OT sin actividad» | Descartado en §Contexto: incluso una OT recién creada ya tiene consecutivo, asientos, auditoría y proyecciones |

---

## Alternativas descartadas

**A1 — Borrado físico con guarda, al estilo del ítem de inventario.** Es el precedente más cercano: hard delete permitido solo si el registro nunca tuvo consecuencias. Se descarta porque **una OT siempre las tiene desde el instante de su creación**: consecutivo asignado, asiento de transición, registro en auditoría inmutable y proyecciones en agenda y visita. La analogía no se sostiene.

**A2 — `PATCH` sobre la OT.** Resolvería la corrección sin tocar MOD09 ni el worker. Se descarta por D1: duplicaría el dueño del dato maestro y convertiría la divergencia en cuestión de tiempo.

**A3 — Reutilizar `CANCELLED` con un motivo tipificado.** Más barato y sin tocar el enum. Se descarta por D2 del CTO: deja ambas situaciones juntas en cualquier métrica, que es justo lo que se quiere evitar.

**A4 — Re-congelar el snapshot al corregir `workType`.** Permitiría corregir el tipo sin recrear. Se descarta por romper la inmutabilidad de ADR-068: los requisitos ya evaluados pasarían a medirse contra otra definición.
