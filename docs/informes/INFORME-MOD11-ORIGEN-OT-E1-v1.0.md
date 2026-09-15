# INFORME — MOD11 Origen de la OT · E1: el esquema deja de exigir una cita

**Versión:** 1.0
**Fecha:** 2026-09-15
**Agente:** AI-SR-FULL (`sr-backend`)
**Encargo:** `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E1-v1.0.md`
**Plan:** `docs/plans/2026-09-14-mod11-origen-ot.md` · **Spec:** `docs/specs/2026-09-14-mod11-origen-ot-design.md` (§3.2, §3.3) · **ADRs:** ADR-091 §D1/D2, ADR-076 §D1/D4
**Estado:** **GO.** CA-01 a CA-04 en verde con conteo real; migración verificada contra Postgres real, ida y vuelta.

---

## 1. Veredicto stop/go

| CA | Estado | Evidencia |
| --- | --- | --- |
| CA-01 — tres columnas admiten nulo; OT existentes intactas | ✅ | Integración PG `135_...integration.spec.ts`: nulabilidad `YES` ×3 en `information_schema` + contenido fila a fila preservado; inserción de OT sin evento/ventana aceptada |
| CA-02 — unicidad activa por `(tenant_id, origin_context, origin_ref, work_type)` en el camino de nacimiento | ✅ | Unit `execution-orders.origin-identity.spec.ts` 8/8 (409 con referencia, terminal libera, nulo exento, trim, idempotencia por evento intacta, 23505→409); PG: distinto `work_type` no colisiona, cancelada libera el origen |
| CA-03 — dos creaciones **simultáneas** del mismo origen → una sola OT | ✅ | `execution-orders.origin-identity.postgres.integration.spec.ts`: `Promise.allSettled` ×3 rondas; la perdedora trae `activeExecutionOrderId` (rechazo en el chequeo serializado, no 23505) y `COUNT(*)=1` por tupla |
| CA-04 — el `down` declara su límite | ✅ | Unit + PG: con OT sin evento rechaza con conteo por columna y remediación; sin ellas revierte limpio |
| Migración ida y vuelta contra PG real | ✅ | `up` en schema aislado + `up`/`down` sobre `tenant_iwana` real; schema restaurado byte a byte (§5) |
| Suite `tasks` sin regresión (piso 617) | ✅ | **680/680 en 34 suites**, jest directo `--ci --runInBand`, sin turbo, sin `--passWithNoTests` |

**NO-GO evitados:** la unicidad no se validó solo secuencial (CA-03 es `Promise.allSettled` real con discriminante de lock, §4) ni la migración solo con mocks (suite dedicada contra PG real).

---

## 2. Cambios (solo esquema e identidad)

| Archivo | Cambio |
| --- | --- |
| `packages/database/src/migrations/tenant/135_execution_order_origin_identity.ts` **(nuevo)** | `up`: pre-chequeo de duplicados activos (falla accionable), `DROP NOT NULL` ×3, índice de evento reexpresado como parcial, índice único parcial de origen. `down`: conteo y fallo accionable ante OT sin evento/ventana; si está limpio restaura 091 + `NOT NULL` |
| `packages/database/src/migrations/tenant/runner.ts` | Registro de la 135 al final de `TENANT_MIGRATIONS` |
| `packages/database/src/entities/execution-order.entity.ts` | `scheduleEventId`, `plannedWindowStartAt/EndAt` → `nullable: true`. Índices decorados intactos (la base manda; `synchronize: false`) |
| `packages/database/src/index.ts` | Export de la clase 135 (precedente: 089, 114) para los specs de integración |
| `apps/api/src/modules/tasks/services/execution-orders.service.ts` | Guarda de origen en `createFromSchedulingWithManager` (lock + chequeo + trim + safety net 23505); `findActiveExecutionOrderByOrigin` reutilizable por E2; tripwire en `toListItem` |
| `apps/api/src/modules/tasks/execution-orders.controller.ts` | Tripwire en el detalle (misma razón que `toListItem`) |
| `apps/api/src/modules/tasks/tests/execution-orders.service.spec.ts` | Test de consecutivos: distinguido el mock de guarda vs. numeración + segunda OT con otro evento/origen (antes colisionaba dos consultas en un solo mock) |
| Tests nuevos | `135_...spec.ts` (4), `135_...integration.spec.ts` (3, PG), `execution-orders.origin-identity.spec.ts` (8), `execution-orders.origin-identity.postgres.integration.spec.ts` (3, PG) |

**No tocado (fuera de alcance):** puerta de despacho (E2), control de acceso (los cinco sitios de §3.6.2 intactos), consola (E4), `@iwana/shared` (congelado), DTO de agenda de MOD09, FKs nuevas (ninguna).

---

## 3. Decisión del paso 4: el índice `(tenant_id, schedule_event_id)` se reexpresa como parcial explícito

Elegido **índice parcial explícito** (`WHERE schedule_event_id IS NOT NULL`, mismo nombre) frente a mantener el único total. Justificación:

1. En PostgreSQL los nulos nunca colisionaron en un único, así que **la semántica para OT agendadas no cambia**: el camino de agenda conserva su idempotencia bit a bit.
2. Dejar el único total ocultaría la intención: tras E1 existen filas legítimas fuera de esa clave y el esquema debe decirlo. La forma parcial declara que las OT sin evento están fuera de la clave de agenda.
3. Efecto práctico: índice acotado al camino de agenda (menor y más honesto en el plan de consulta).
4. El `down` lo restaura a su forma 091 total, verificado en PG (`indexdef` sin `WHERE`).

---

## 4. Justificación del índice único de origen

**No se inventó nada:** es la réplica exacta del patrón `idx_visit_requests_active_origin_unique` (035) sobre la tabla de OT, como ordena el encargo:

- **Nombre distinto por necesidad, no por capricho:** `uq_execution_orders_active_origin_unique`. El nombre de la constraint es identidad comportamental —`AssuranceFieldServiceProcessor` captura el 23505 **por nombre** y E1 hace lo mismo (`isExecutionOrderOriginUniqueViolation`)—. Reutilizar el nombre de VR en otra tabla sería colisión; el prefijo `uq_execution_orders_*` sigue la convención de la familia 046/091/098.
- **Columna `origin_ref_id`, no `origin_ref`:** es el nombre real de la columna OT (046). El eje lógico es el mismo de ADR-076 §D1.
- **Sin `deleted_at` en el predicado:** la OT no tiene borrado lógico; copiar el predicado a ciegas sería deuda. Documentado en la migración.
- **Terminalidad del predicado** (`CANCELLED`, `COMPLETED`, `COMPLETED_WITH_OBSERVATIONS`, `NOT_EXECUTED`): `BLOCKED` es trabajo vivo (desbloqueable) y sigue deduplicando; los terminales liberan la tupla para reinstalación (ADR-076 regla 9, con test de no-regresión en la suite PG).
- **Defensa en dos capas, como VR:** advisory lock + chequeo en servicio, índice como safety net. Clave del lock con la misma tupla (`origen:tenant|context|ref|tipo`); se usa `hashtextextended` en vez de `hashtext` por coherencia con el helper del módulo (`acquireExecutionOrderNumberLock`), y el orden de locks es fijo (número → origen) para que E2 no invierta la jerarquía.
- **`origin_ref` nulo/vacío fuera de deduplicación** (ADR-076 §D4, sin ampliar): el servicio normaliza `''`→`null` antes de comparar **y** de persistir, para que `'ABC '` y `'ABC'` no sean dos filas de la misma unidad.

**Desviación justificada de la 098 (down sin bypass):** el `down` cuenta y falla **siempre** ante OT sin evento/ventana, sin variable de entorno que lo autorice. La 098 puede autorizar su DDL destructivo (`DROP COLUMN` es válido con datos); aquí ningún consentimiento vuelve válido `SET NOT NULL` sobre nulos —la única vía sería borrar OTs, prohibido—. El mensaje da conteos por columna y remediación (vincular vía E3 o archivar por camino gobernado). El test de gobernanza `tenant-migration-revert.spec.ts` sigue verde porque la 135 no referencia la variable.

---

## 5. Evidencia con conteo real

- `tasks` + revert: **34 suites, 680/680** (piso 617; base T0 643 + 8 E1 + 29 del spec de revert ya presente). Una regresión inicial en el test de consecutivos se diagnosticó como mock de fidelidad insuficiente (un solo `createQueryBuilder` para guarda + numeración) y se corrigió distinguiendo ambas consultas —el comportamiento productivo era correcto—.
- `wfm` (llamadores del puerto): **19 suites, 238/238**.
- `db` migraciones (orden + 135 unit): **10/10**; `migration-order.spec.ts` confirma la 135 registrada y ordenada.
- PG migración (schema aislado `it_e1_origin_*`): **3/3** —up con preservación de contenido, unicidad/terminales/nulos/tipos, down bloqueado y luego limpio—.
- PG servicio (`E2E_TENANT_SLUG=iwana`, `IWANA_DB_INTEGRATION_AVAILABLE=true`): **3/3** —CA-03 ×3 rondas, tipos distintos, cancelación que libera—.
- Ida y vuelta sobre `tenant_iwana` verificada por fuera del test: `uq_execution_orders_tenant_schedule_event` restaurado en forma total, `uq_execution_orders_active_origin_unique` ausente, **0 filas `E1-CA%`** remanentes.
- `tsc --noEmit` (api, db) y `eslint` sobre los 11 archivos tocados: limpios. `@iwana/db` recompilado (`dist/` al día, exigido por AGENTS.md para migraciones).

---

## 6. Inventario §5: lectores que asumen `schedule_event_id` no nulo (alcance E4, no se arreglan aquí)

| Lector | Supuesto | Estado en E1 |
| --- | --- | --- |
| `toListItem` (servicio) + detalle (controlador) | `eventId`/ventana como strings (contrato shared congelado) | Tripwire fail-closed con mensaje que nombra a E4. **Inalcanzable en E1** (ningún camino crea nulos); E2 lo sustituye al abrir el despacho |
| `cancelFromSchedulingWithManager` (`order.scheduleEventId !== scheduleEventId`) | Compara directo | Intacto: con columna nullable la comparación sigue compilando y comportándose igual para filas agendadas |
| `tasks/dto` `scheduleEventId: z.string().uuid()` (línea 311, vínculo agenda) | Requiere UUID | Intacto; E3 decide si acepta nulo al vincular |
| `schedule-events.service.ts` (llamadas al puerto con evento real) | Siempre pasa evento + ventana | Intacto; el camino de agenda no cambia de forma |
| Orden por defecto `planned_window_start_at DESC` (migración 130) | Ventana existente | Intacto y sin nulos reales; E4 lo rediseña (ADR-091 §D5) |

Ningún lector falla hoy: en E1 no existe ningún creador de nulos (verificado: el único constructor sigue siendo el puerto agenda con `scheduleEventId` requerido en el input).

## 7. Deuda por severidad

- **P1 (handoff a E2, no defecto):** `findActiveExecutionOrderByOrigin` es la guarda común pero el input de agenda aún exige `scheduleEventId`/ventana —E2 relaja el input y reutiliza la guarda sin duplicarla—.
- **P1 (handoff a E2/E4):** los dos tripwires de proyección deben sustituirse por manejo real al nacer la primera OT sin ventana; fallarían en voz alta, nunca en silencio.
- **P2:** decoradores `@Index` de la entidad no reflejan la parcialidad del índice de evento (ya divergían desde 091); la base es fuente de verdad.
- **P3 (preexistente, documentada en spec §8.5):** `CONTRACTOR` bloquea y no desbloquea (H6, carril propio); `PROVISIONING` sin camino y pérdida de origen `BILLING`/`SYSTEM`→`TASKS` (decisión E2 §3.8).

## 8. Archivos del workspace ajenos a E1 (no tocados)

El árbol trae trabajo en curso de carriles hermanos (T0, H6, dictamen sec-eng): `execution-orders.service.ts`/`controller`/`ola1-regression` con cambios T0, specs `assign-persistence.*` y `h6-unblock-parity`, ADRs 090/091 y sus informes. E1 solo suma lo listado en §2; la suite conjunta (680) confirma convivencia sin regresión.
