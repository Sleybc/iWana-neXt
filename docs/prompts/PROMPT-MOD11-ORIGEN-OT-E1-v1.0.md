# PROMPT DE EJECUCIÓN — MOD11 Origen de la OT · E1: el esquema deja de exigir una cita

**Versión:** 1.0
**Fecha:** 2026-09-14
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-SR-FULL** (`sr-backend`)
**Estado:** **Ejecutable.** G1 cerrado el 2026-09-14 (ADR-091 aprobado, spec aprobada, dictamen de `sec-eng` aceptado). **T0 cerrado en GO el 2026-09-15 y auditado**: `execution-orders.service.ts` queda libre.

## Vínculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` (v1.2, **En revisión**)
- Spec: `docs/specs/2026-09-14-mod11-origen-ot-design.md` v1.0 — **§3.2 y §3.3 son de lectura obligatoria**
- Plan: `docs/plans/2026-09-14-mod11-origen-ot.md` v1.0
- ADR marco: [ADR-091](../adrs/ADR-091-Origen-de-la-OT-Despacho-y-Agenda-Actos-Separados.md) (Aprobado) §D1 y §D2 · [ADR-076](../adrs/ADR-076-Unicidad-Trabajo-Campo-Activo-Por-Origen.md) (Aprobado) §D1 y §D4
- Dictamen de seguridad: `docs/informes/INFORME-MOD11-ORIGEN-OT-SEC-ENG-DICTAMEN-v1.0.md`

---

## 1. Qué cambia y por qué

Hoy la OT **no puede existir sin cita**: `schedule_event_id`, `planned_window_start_at` y `planned_window_end_at` son `NOT NULL` (migración 046), y un índice único sobre `(tenant_id, schedule_event_id)` (migración 091) convierte al evento de agenda en la **clave de idempotencia de la creación**.

ADR-091 (Aprobado) §D1 separa despachar de agendar: la ventana pasa a ser atributo, no precondición. §D2 muda la identidad al eje que ADR-076 (Aprobado) ya fijó: `(tenant_id, origin_context, origin_ref, work_type)`.

**E1 es solo el esquema y la identidad.** No abre la puerta de despacho: eso es E2. Al terminar E1 nada crea todavía OT sin evento, y por eso es seguro hacerlo primero.

## 2. Pasos

1. **Relajar la nulabilidad** de `schedule_event_id`, `planned_window_start_at` y `planned_window_end_at`. Las OT existentes no cambian de contenido.

2. **Mudar la clave de idempotencia de la creación** del evento de agenda al eje de origen. Hoy `createFromSchedulingWithManager` resuelve la idempotencia con un `findOne` por `scheduleEventId` bajo advisory lock; ese camino **debe seguir funcionando** —es el nacimiento por agenda, que sigue siendo legítimo y mayoritario—, pero la garantía de unicidad pasa a ser la de ADR-076 (Aprobado).

3. **Una sola guarda para los dos caminos de nacimiento.** **El patrón ya existe en base**: `idx_visit_requests_active_origin_unique` (migración 035) es un índice único parcial sobre la tupla de origen activa de `VisitRequest`, y el procesador `AssuranceFieldServiceProcessor` del worker ya captura su violación `23505` por nombre de constraint. **Replícalo en la OT**, no inventes uno nuevo. En el servicio, replica además lo que `createVisitRequest` hace: `pg_advisory_xact_lock` con clave derivada de la tupla de origen, `origin_ref` normalizado con `trim` antes de comparar y de persistir. `origin_ref IS NULL` queda fuera de deduplicación por ADR-076 (Aprobado) §D4: **no amplíes esa excepción**.

4. **Decide y justifica qué pasa con el índice único** `(tenant_id, schedule_event_id)`. En PostgreSQL los nulos no colisionan en un índice único, así que relajar la columna no lo rompe por sí solo — pero dejarlo implícito oculta la intención. Elige entre índice parcial explícito o mantenerlo, y **razona la elección en el informe**, no la des por obvia.

5. **El `down` debe declarar su límite.** Una vez existan OT sin evento o sin ventana, restaurar `NOT NULL` no es posible sin destruir datos. Sigue el patrón que la migración 098 ya usa en este módulo: contar las filas afectadas y **fallar con mensaje accionable** en vez de romper a ciegas o borrar en silencio.

## 3. Lo que NO se toca en E1

- **No abras la puerta de creación por despacho.** Es E2.
- **No toques el control de acceso.** El dictamen de `sec-eng` ya decidió: `CREATED` queda **fuera** del pool reclamable, y la regla vive en cinco sitios (spec §3.6.2). E1 no cambia ninguno.
- **No hagas alcanzable `CREATED`** por la vía de agenda relajando `assignedUserId`: ese DTO es de MOD09 y no entra aquí.
- **No toques la consola.** Que la lista ordene por `planned_window_start_at` con nulos es E4; en E1 todavía no existen nulos reales.
- **No toques `@iwana/shared`**: E1 no cambia contrato de API.

## 4. Tests

6. **CA-01** — las tres columnas admiten nulo y las OT existentes conservan su contenido tras la migración.
7. **CA-02** — la unicidad activa por `(tenant_id, origin_context, origin_ref, work_type)` se cumple **sea cual sea el camino de nacimiento**.
8. **CA-03 — concurrente, no secuencial.** Dos creaciones simultáneas para el mismo origen producen **una sola** OT, con la segunda rechazada. Un test secuencial pasaría aunque el advisory lock no estuviera, y no probaría nada.
9. **CA-04** — el `down` declara su límite ante OT sin evento en vez de fallar en silencio.
10. **Migración verificada contra Postgres real, ida y vuelta.** Un test de migración con mocks de `queryRunner.query` comprueba que la cadena SQL contiene un texto, no que la base la acepte.
11. Conteo real: jest directo, `--ci --runInBand`, sin turbo y sin `--passWithNoTests`. La suite de `tasks` no baja de **617**.

## 5. Restricciones no negociables

- **Sin FK cross-module.** ADR-047 (Aprobado) regla 6: los vínculos entre MOD09, MOD11 e Inventario son referencias lógicas. E1 no introduce ninguna.
- **Toda operación dentro del schema del tenant**, vía `runInTenantSchema`.
- Sin PII real en fixtures ni tests.
- Si al mudar la identidad descubres que **alguna lectura o proyección asume que `schedule_event_id` nunca es nulo**, repórtalo: es alcance de E4 y no se arregla aquí, pero debe quedar inventariado para que no falle en silencio.
- Si la guarda de unicidad te obliga a cambiar el comportamiento del nacimiento por agenda más allá de la idempotencia, **detente y emite `[BLOQUEO]`**: sería frontera con MOD09 y es dictamen de AI-EM-ARCH.

## 6. Entregables

- Migración con `up` y `down`, este último con su límite declarado.
- Guarda de unicidad por origen, común a los dos caminos de nacimiento.
- Tests de CA-01 a CA-04, con el de concurrencia y el de migración contra Postgres real.
- Informe de fase en `docs/informes/` con la decisión del paso 4 y su justificación, más el inventario del punto de §5 si aparece.

## 7. Stop/go

**GO si y solo si:**

- Las tres columnas admiten nulo y ninguna OT existente cambió de contenido (CA-01).
- La unicidad por origen se cumple en ambos caminos (CA-02) y resiste el test **concurrente** (CA-03).
- El `down` declara su límite (CA-04).
- La migración se aplicó contra Postgres real, ida y vuelta.
- Suite de `tasks` sin regresión, con conteo real.

**NO-GO si:** la unicidad se valida solo con un test secuencial, o la migración solo con mocks de `queryRunner.query`. Ambos son verdes falsos: el primero pasa sin el advisory lock, el segundo sin que la base haya aceptado nada.
