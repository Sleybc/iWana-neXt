# PROMPT DE EJECUCIÓN — MOD11 Corrección de OT · T2: anulación por error y los huecos de la cancelación

**Versión:** 1.0
**Fecha:** 2026-09-15
**Generado por:** AI-SR-FULL destinatario · emitido por AI-EM-ARCH
**Agente destinatario:** **AI-SR-FULL** (`sr-backend`) · **paralelo:** `prod-ux` (copy y motivos) · **C:** `sec-eng`
**Estado:** **Ejecutable.** G1 cerrado: ADR-090 (Aprobado) por el CTO el 2026-09-15. T0, E1, E2 y H1 cerrados.

## Vínculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` (v1.2, **En revisión**)
- Spec: `docs/specs/2026-09-14-mod11-correccion-ot-design.md` (Aprobada) — **§4.4 y §4.5 son de lectura obligatoria**
- Plan: `docs/plans/2026-09-14-mod11-correccion-ot.md` — **T2 se adelantó a T1**
- ADR marco: [ADR-090](../adrs/ADR-090-Correccion-de-OT-Dueno-del-Dato-y-Anulacion-por-Error.md) (Aprobado) §D3 y §D5 · [ADR-091](../adrs/ADR-091-Origen-de-la-OT-Despacho-y-Agenda-Actos-Separados.md) (Aprobado)
- Auditorías de E2 y H1 (AI-EM-ARCH, 2026-09-15): el hallazgo H3 que este tramo cierra

---

## 1. Por qué T2 se adelantó

El plan tenía T1 antes que T2. Era contención de archivo, no dependencia de fondo, y **E2 cambió la urgencia**: al abrir la puerta de despacho creó una OT que **nadie puede cancelar**.

La cadena, verificada: no hay ruta de cancelación en MOD11; `cancelFromSchedulingWithManager` exige `scheduleEventId`, que la despachada no tiene; `CREATED` está fuera del pool, así que ningún técnico la ve; y `close` exige ejecución técnica, que exige asignación previa. **Para deshacer un despacho equivocado hay que asignar un técnico, que la inicie y la cierre: una visita de campo fingida para deshacer un error de captura.** Y mientras tanto el origen sigue bloqueado.

Es literalmente el problema con el que el CTO abrió este trabajo. §D3 es su salida gobernada.

## 2. La trampa: los estados terminales están duplicados por todo el repositorio

**Léelo antes de elegir mecanismo.** Si resuelves la anulación con un estado terminal nuevo, ese valor tiene que llegar a **todos** los sitios que hoy enumeran la terminalidad a mano — y hay muchos, en código y en SQL:

| Sitio | Si lo olvidas |
| --- | --- |
| Índice `uq_execution_orders_active_origin_unique` (migración 135) | **La OT anulada sigue bloqueando su origen.** Deshaces el error y el trabajo legítimo sigue muerto: no habrías arreglado nada |
| Anonimización por retención (migración 134, `TERMINAL_STATUSES_SQL`) | **La línea de tiempo de la anulada no se anonimiza nunca**: `changed_by` y `reason` quedan indefinidamente, saltándose los 24 meses del dictamen de retención |
| Transiciones (migración 132), backfills de plantilla (118, 131) | Incoherencia entre la verdad de la tabla y la de las proyecciones |
| Servicio y reconciliador (varias listas literales en TypeScript) | Una OT anulada tratada como viva por unos caminos y como cerrada por otros |

**El segundo es el más grave y el más irónico:** ADR-090 §Contexto descartó el borrado físico precisamente porque rompía la anonimización por retención. Si la anulación llega sin entrar en la 134, **rompe esa misma garantía por otra puerta** — y con la firma del CTO encima.

La spec §8 ya registraba esta duplicación como deuda. **No te pido que la refactorices entera**, pero sí que no añadas una quinta fuente de verdad sin saber a cuáles alcanza.

## 3. Las invariantes, no el mecanismo

Elige el mecanismo —estado terminal nuevo, discriminador sobre `CANCELLED`, u otro— y **justifícalo en el informe**. Lo que no es negociable es que se cumplan estas cuatro:

1. **La anulada libera su origen.** El trabajo legítimo se puede volver a crear.
2. **La anulada entra en la anonimización por retención** igual que cualquier otra terminal.
3. **La anulada es distinguible de la cancelada** en el dato y en la consulta, y **se excluye del cálculo** de la tasa de cancelación (ADR-090 §D3).
4. **No se destruye rastro** (§D5). La anulada permanece consultable y sale de la bandeja operativa.

## 4. Alcance

5. **La anulación por error** exige **motivo** y **rol de supervisión** (CA-10). Debe alcanzar **también a la OT despachada sin cita** — que es el caso que motivó el adelanto y el que ninguna vía actual toca.
6. **Cierra los cuatro huecos de la cancelación** (spec §4.5):
   - `close` con `result=CANCELLED` **deja de ser vía de cancelación** (CA-11). Hoy es puerta trasera abierta a técnicos y deja la tarea vinculada sin transicionar.
   - **Cancelar una OT terminal se rechaza** (CA-12). Hoy una `COMPLETED` puede reescribirse a `CANCELLED`, pisando su cierre.
   - **La cancelación emite evento de dominio** (CA-13), como ya hace el cierre.
   - **La vía de la UI dice lo que hace** (CA-14): hoy el usuario reclasifica la causa de una visita no realizada y el efecto lateral es cancelar la OT con una razón literal fija. **El copy y los motivos son de `prod-ux`**; tú entregas el dato y la API que los soportan.
7. **No construyas pantalla.** La superficie de portal llega después (spec §7).

## 5. Tests

8. **CA-09** — anulada y cancelada son distinguibles en el dato y en la consulta.
9. **CA-10** — sin motivo o sin rol de supervisión, se rechaza.
10. **El caso que motivó el tramo:** una **OT despachada sin cita** se puede anular, y **tras anularla el origen queda libre** — el despacho legítimo del mismo origen funciona. Verifícalo **contra base real**, como H1.
11. **La invariante de retención:** una OT anulada **es alcanzada por la purga** de la migración 134. Si tu mecanismo no entra en ese conjunto, este test lo destapa.
12. **CA-11 / CA-12 / CA-13** — puerta trasera cerrada, terminal no reescribible, evento emitido.
13. **Por negación:** quien no tiene rol de supervisión **no puede anular**, y nadie puede anular una OT ya terminal.
14. Conteo real: jest directo, `--ci --runInBand`, sin turbo y sin `--passWithNoTests`. `tasks` **no baja de 682**. La suite completa **sigue terminando sola** (`pnpm --filter @iwana/api test:exit-guard`).

## 6. Restricciones no negociables

- **No toques la guarda de unicidad de E1 ni el pool reclamable.** Si tu mecanismo exige tocar el índice 135, es **porque añades un estado terminal** — eso sí entra, y con migración propia; cualquier otra razón es `[BLOQUEO]`.
- **No abras la propagación desde agenda**: es T1.
- **No retires la vía de cancelación desde la agenda**, que es legítima (spec §7): se hace honesta, no se elimina.
- **No implementes el reverso de inventario.** Si una OT anulada ya consumió material, el ajuste sigue siendo manual: `is_reversal` existe y nadie lo activa. Es deuda de MOD12 y queda fuera (spec §7).
- Sin PII real en fixtures ni tests.
- Si al cerrar la puerta trasera de `close` descubres llamadores legítimos que dependían de ella, **detente y emite `[CONSULTA]`**: puede haber flujo operativo real apoyado en el defecto.

## 7. Entregables

- Anulación por error con motivo y rol de supervisión, alcanzando a la OT despachada.
- Los cuatro huecos de §4.5 cerrados.
- Migración propia si el mecanismo la exige, con `down` que declare su límite (patrón de la 135).
- Tests de §5, con el de origen liberado y el de retención contra base real.
- Informe en `docs/informes/` con el mecanismo elegido, **la lista de sitios de terminalidad que alcanza y los que deliberadamente no**, y deuda por severidad.

## 8. Stop/go

**GO si y solo si:**

- Una OT despachada sin cita se anula, y **tras anularla su origen queda libre** (punto 10, contra base).
- La anulada **entra en la anonimización por retención** (punto 11).
- Anulada ≠ cancelada en dato y consulta, y la anulada no cuenta como cancelación (CA-09).
- Motivo y rol exigidos; terminal no anulable (CA-10, punto 13).
- `close` con `result=CANCELLED` ya no cancela; terminal no reescribible; evento emitido (CA-11 a CA-13).
- `tasks` ≥ 682 con conteo real y la suite completa termina sola.

**NO-GO si:** el mecanismo introduce un estado terminal que no entra en el índice de origen o en la purga de retención. Lo primero deja el trabajo legítimo bloqueado después de deshacer el error; lo segundo conserva dato personal para siempre — y sería romper, por otra puerta, justo la garantía que ADR-090 invocó para descartar el borrado.
