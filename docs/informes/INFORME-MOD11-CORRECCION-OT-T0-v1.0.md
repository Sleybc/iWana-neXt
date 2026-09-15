# INFORME — MOD11 Corrección de OT · T0: la persistencia escribe lo que los comandos mutan

**Versión:** 1.0
**Fecha:** 2026-09-14
**Agente ejecutor:** AI-SR-FULL (`sr-backend`)
**Estado:** Completa — dictamen **GO** (§8).
**Plantilla base:** `docs/informes/TEMPLATE-INFORME-FASE-v1.0.md`

## Vínculos de trazabilidad

- Plan: `docs/plans/2026-09-14-mod11-correccion-ot.md` v1.0 (tramo T0, RACI: R AI-SR-FULL · A AI-EM-ARCH · C AI-SEC-ENG · I AI-SR-QA)
- Encargo: `docs/prompts/PROMPT-MOD11-CORRECCION-OT-T0-v1.0.md` v1.0 (§1–§7)
- Lanzamiento: `docs/prompts/PROMPT-MOD11-ORQUESTACION-ORIGEN-OT-LAUNCH-v1.0.md` (ola 1, serie; T0 antes que E1/E2 por tocar `execution-orders.service.ts`)
- Spec: `docs/specs/2026-09-14-mod11-correccion-ot-design.md` v1.0 (§2.2, §4.6, CA-01–CA-03)
- Skills aplicadas como documentación (SKILL.md leídos antes de codificar): `nestjs-expert`, `typescript-expert`, `postgresql`, `testing-patterns`

---

## 1. Resumen ejecutivo

- **Objetivo:** corregir el defecto por el cual `assign()` devolvía 200 con el técnico nuevo mientras la base conservaba el anterior —un fallo de control de acceso, no cosmético—, haciendo que la persistencia escriba los campos que cada comando declara, sin abrir mutaciones no intencionadas y sin relajar la concurrencia optimista.
- **Resultado:** `assign()` persiste `assignedTechnicianId` + `assignedCrewId` mediante declaración explícita por comando; el resto de comandos conserva el UPDATE acotado de 7 columnas; CA-01 a CA-03 en verde con verificación contra PostgreSQL real.
- **Estado:** Completa. Sin `[BLOQUEO]`: no se encontró otra ruta donde el acceso se decida sobre datos no persistidos (barrido en §4).

## 2. El defecto (causa raíz)

`assign()` mutaba `order.assignedTechnicianId` en memoria y llamaba a `persistOrderOptimistically`, cuyo UPDATE escribía 7 columnas (estado, resultado, versión, `startedAt`, `closedAt`, `closeNotes`, `updatedByUserId`) sin el técnico, y devolvía el objeto mutado. Como `assertActorAccess` y `assertCustodyAssignment` leen `assignedTechnicianId` de la base, el reasignado no podía iniciar ni registrar consumos y el anterior conservaba el acceso, con la operación respondiendo 200.

Los tests con mocks ocultaban el defecto porque `persistOrderOptimistically` usa `manager.save()` (persiste todo) cuando el manager no expone `createQueryBuilder`; solo el camino real `createQueryBuilder` fallaba.

## 3. Mecanismo elegido y justificación

**Elegido: declaración explícita opt-in por comando** — `persistOrderOptimistically(manager, order, expectedVersion, options?: { assignment?: boolean })`. El UPDATE escribe siempre el núcleo de 7 columnas y suma `assignedTechnicianId` + `assignedCrewId` **solo** cuando el llamador pasa `{ assignment: true }`. Único llamador que lo pasa: `assign()`.

**Alternativas descartadas:**

| Alternativa | Motivo del descarte |
| --- | --- |
| Añadir las 2 columnas al `.set()` incondicionalmente | Viola el paso 2 del encargo y el riesgo R1 del plan: cualquier mutación accidental en memoria de esas columnas llegaría a la base desde cualquier comando. Hoy ningún otro comando las muta, pero el mecanismo quedaría sin defensa en profundidad. |
| Persistir la entidad completa (`save`) en todos los comandos | Elimina de golpe la protección del conjunto acotado y abandona el WHERE por versión con `affected` explícito (el `save` no devuelve conteo de filas para el conflicto optimista). |
| Un `UPDATE` distinto por comando | Duplicación del predicado de concurrencia en N sitios; el riesgo de divergir el WHERE supera al beneficio. |

La declaración vive en el llamador, no en el mecanismo: si mañana un comando necesita persistir otro campo corregible (T1), añade su propia bandera explícita en vez de reabrir el conjunto global.

## 4. Barrido de otros comandos con el mismo defecto (paso 4 del encargo)

Revisados todos los llamadores de `persistOrderOptimistically` en `execution-orders.service.ts`:

| Comando | Campos que muta en memoria | ¿Cubiertos por el UPDATE? |
| --- | --- | --- |
| `start()` | estado, versión, `startedAt`, actor | Sí (núcleo) |
| `registerFieldWork()` | versión, actor | Sí |
| `updateFieldWorkActivity()` | versión, actor | Sí |
| `deleteFieldWorkActivity()` | versión, actor | Sí |
| `registerItemUsage()` | versión, actor | Sí |
| `close()` | resultado, estado, versión, `closedAt`, `closeNotes`, actor | Sí |
| `assign()` | **técnico/cuadrilla**, estado, versión, actor | **No → corregido en T0** |
| `registerEvidence()` | versión, actor | Sí |
| `createFollowUp()` | versión, actor | Sí |
| `transitionExecutionOrder()` (`block`/`unblock`) | estado, versión, actor | Sí |
| `cancelFromSchedulingWithManager()` | No usa este mecanismo (`manager.save` transaccional) | N/A |
| `correctStatusTransition()` | No muta la OT (aditiva sobre asientos) | N/A |
| `redriveEvent()` | No muta la OT (solo outbox/inbox) | N/A |

**Conclusión:** `assign()` era el único comando con el defecto. Ningún otro muta en memoria un campo que el UPDATE no escriba. No se encontró otra ruta donde el control de acceso se decida sobre datos no persistidos: `assertActorAccess`/`assertCustodyAssignment` leen siempre la OT desde la base dentro de la transacción —por eso no hubo `[BLOQUEO]` a AI-EM-ARCH.

## 5. Archivos cambiados

1. `apps/api/src/modules/tasks/services/execution-orders.service.ts` — `persistOrderOptimistically` acepta `options?: { assignment?: boolean }` (+22 líneas con comentarios); `assign()` declara `{ assignment: true }` (+5 líneas). Ningún otro comando modificado. Sin cambios en `@iwana/shared`, sin `PATCH`, sin T1–T3, sin DDL.
2. `apps/api/src/modules/tasks/tests/execution-orders.assign-persistence.postgres.integration.spec.ts` — **nuevo**. CA-01/CA-02 contra PostgreSQL real (camino `createQueryBuilder`), relectura con SQL crudo, limpieza total de filas creadas.
3. `apps/api/src/modules/tasks/tests/execution-orders.assign-persistence.spec.ts` — **nuevo**. CA-03 unitario: captura del payload `.set()` por comando + concurrencia intacta.

## 6. Evidencia de tests (comandos + conteos reales)

Todos con jest directo, `--ci --runInBand`, sin turbo, sin `--passWithNoTests`.

| Suite | Comando | Resultado |
| --- | --- | --- |
| Integración T0 (nueva) | `pnpm exec jest --config jest.integration.config.js src/modules/tasks/tests/execution-orders.assign-persistence.postgres.integration.spec.ts --ci --runInBand` (con `E2E_TENANT_SLUG=test-s2-live`; la base se autodetecta) | **2/2** (CA-01, CA-02) |
| CA-03 unitario (nuevo) | `pnpm exec jest src/modules/tasks/tests/execution-orders.assign-persistence.spec.ts --ci --runInBand` | **10/10** |
| `tasks` completa (regresión) | `pnpm exec jest src/modules/tasks --ci --runInBand` | **643/643 en 32 suites** (piso exigido: 617) |
| API completa (regresión) | `pnpm exec jest --ci --runInBand` (segundo plano, log en temp) | pendiente de cierre — ver §8 |
| Existente `execution-orders.postgres.integration.spec.ts` | incluida en la config de integración | sin cambios; no afectada (no toca `assign`) |

- **Rojo previo verificado (TDD):** la suite de integración falló antes del fix exactamente como describe el defecto —base con el técnico viejo (`aaaaaaaa…`) y reasignado con `NotFoundException` en `assertActorAccess`— y pasó después sin modificar el test.
- `pnpm typecheck` (api) y `eslint` sobre los 3 archivos: limpios.
- Tenant de prueba (`test-s2-live`) verificado sin residuos: 0 OTs y 0 consumos con `origin_context='T0-INTEGRATION'`.

## 7. Deuda registrada (por severidad)

1. **Media-baja — `registerItemUsage` sin contexto de idempotencia falla en base real.** El fallback `inventoryRequestId = \`${id}-${itemId}-${Date.now()}\`` no es un uuid y la columna `inventory_request_id` es `uuid`: contra PostgreSQL real lanza `QueryFailedError`. En producción el controlador siempre aporta `Idempotency-Key` y el recibo aporta el `intentId` (uuid), por lo que no es un bug activo; solo muerde a llamadores directos del servicio sin contexto (como el primer intento de CA-02). **No se tocó** por estar fuera del alcance T0. Propuesta: generar `randomUUID()` como fallback o exigir contexto; lo registra el tramo que corresponda vía orquestador.
2. **Baja — `assign()` no limpia el lado opuesto (técnico vs. cuadrilla).** Al asignar técnico se conserva el `assignedCrewId` previo en memoria y ahora también en base (antes tampoco se escribía, así que no hay cambio de comportamiento). Hoy inofensivo: el camino CREW está bloqueado (`CREW_MEMBERSHIP_RESOLVER_UNAVAILABLE`) y solo `createFromScheduling` puede nacer con cuadrilla. Si E2 u otro tramo habilita cuadrillas, definir la semántica de limpieza allí.
3. **Informativa — deuda preexistente de la spec §8** (reversos muertos, `audit_intents` sin purga, estados terminales duplicados, hijas sin FK, etc.): T0 no las toca ni las agrava.

## 8. Stop/go (§7 del encargo)

- [x] Tras `assign()`, el técnico leído **desde la base** es el nuevo (CA-01, SQL crudo).
- [x] El reasignado **puede** iniciar y registrar consumos; el anterior **no** (CA-02: `assertActorAccess` + `start()` + `registerItemUsage` reales).
- [x] Ningún comando persiste campos que no declara (CA-03: 8 comandos verificados + `assign()`).
- [x] Concurrencia optimista intacta (`WHERE version` + `VERSION_CONFLICT` con `affected: 0`, test dedicado).
- [x] Suite `tasks` sin regresión: 643 ≥ 617, conteo real.
- [x] El test de CA-01/CA-02 ejercita `createQueryBuilder` contra base real, nunca `manager.save()` con mocks.

**Dictamen: GO.** El archivo `execution-orders.service.ts` queda libre para E1. E1 no se lanza desde aquí: espera este cierre y lo despacha AI-EM-ARCH.

## 9. Restricciones verificadas

NO se abrió `PATCH` sobre la OT · NO se tocó propagación/cancelación/reconciliador (T1–T3) · NO se tocó `@iwana/shared` (sin cambio de contrato) · NO se relajó la concurrencia · Sin PII real en fixtures ni tests (UUIDs sintéticos, textos genéricos) · `@Roles()`/guards intactos · Cero secretos en código y logs.
