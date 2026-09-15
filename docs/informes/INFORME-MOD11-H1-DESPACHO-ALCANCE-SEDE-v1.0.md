# INFORME — MOD11 H1: el despacho valida el alcance sobre la sede

**Versión:** 1.0
**Fecha:** 2026-09-15
**Agente:** AI-SR-FULL (`sr-backend`) · **C:** `sec-eng` (condición de cierre)
**Encargo:** `docs/prompts/PROMPT-MOD11-H1-DESPACHO-ALCANCE-SEDE-v1.0.md` (bloqueante; E3 no arranca hasta su cierre)
**Spec:** `docs/specs/2026-09-14-mod11-origen-ot-design.md` §3.6.1 · **ADRs:** ADR-091 §D6 c.3, ADR-076 §D1
**Punto de partida:** `docs/informes/INFORME-MOD11-ORIGEN-OT-E2-v1.0.md` §5 y su P3 — severidad recalibrada por el encargo (ver §2)
**Estado:** **GO.** Sin `[BLOQUEO]`: el puerto existente alcanza.

---

## 1. Veredicto stop/go

| Criterio del encargo | Estado | Evidencia |
| --- | --- | --- |
| Supervisor sin alcance no despacha (punto 5, por negación) | ✅ | Unit H1: port `false` → `NotFoundException`, `save` no llamado; PG: `NotFoundException` + `COUNT(...)=0` por SQL crudo |
| Tras el rechazo, el origen sigue libre (punto 6, central) | ✅ | Unit: rechazo → mismo origen despacha `CREATED` (`save` ×1 total); PG: `COUNT=0` tras rechazo → despacho legítimo `CREATED` |
| Con alcance se despacha igual que antes (punto 7) | ✅ | Los 20 tests E2 previos pasan sin tocarlos (puerto `true` por defecto) + caso H1 de recibo/fila idénticos |
| `tasks` ≥ 676, conteo real | ✅ | **34 suites, 682/682**, jest directo `--ci --runInBand` |
| Suite completa termina sola | ✅ | `pnpm --filter @iwana/api test:exit-guard`: exit 0 — 324 suites, 4078 tests, `ECONNREFUSED=0` |
| Dictamen `sec-eng` | ✅ | GO: "no queda ruta de escritura sin alcance en el módulo `tasks`" |

---

## 2. Recalibración de severidad (responde al encargo §2)

El P3 del informe E2 era incorrecto y se retira. El daño no es "OT muerta": el índice de E1 `(tenant_id, origin_context, origin_ref, work_type)` no lleva sede, así que un despacho hacia sede ajena **quema el origen** — el despacho legítimo posterior muere con `DUPLICATE_ACTIVE_WORK`, y la OT queda en `CREATED` invisible al campo, inasignable por su creador (fail-closed sobre sede no supervisada) y sin cancelación hasta T2/ADR-090. **Denegación de trabajo de campo por sede, ejecutable por cualquier rol de supervisión.** El test central de este informe (§4) existe precisamente porque el defecto es quemar-el-origen, no la fila huérfana.

---

## 3. Cambio (mínimo, sin segundo mecanismo)

| Archivo | Cambio |
| --- | --- |
| `apps/api/src/modules/tasks/services/execution-orders.service.ts` | `dispatchFromCoordination` valida con el **mismo** `assertSupervisionScope` + `OrganizationOperationalAccessPort` de los otros comandos, **antes** de delegar en el núcleo. Orden de rechazos: 400 de forma → 404 de alcance → guarda/inserción |
| `apps/api/src/modules/tasks/execution-orders.controller.ts` | Comentario de `POST /dispatch` corregido: documenta que el guard retorna por el decorador y que el servicio valida el alcance antes de insertar |
| Tests | Bloque H1 en `execution-orders.dispatch.spec.ts` (5 casos) + `dispatch.postgres.integration.spec.ts` (1 caso contra base) + 1 caso HTTP 404 |

No tocado: esquema, guarda E1, pool reclamable, `@iwana/shared`, camino de agenda, roles que despachan, vía de cancelación (T2).

## 4. Decisión del paso 2: el rechazo es 404 (y por qué no 403)

Se reutiliza `assertSupervisionScope` tal cual: `NotFoundException` con el mismo mensaje que `assign`/`follow-ups`/reconciliación. Tres razones:

1. **Uniformidad:** la misma denegación (alcance de supervisión insuficiente) responde igual en los cinco comandos de coordinación. Dos dialectos para el mismo hecho serían deuda.
2. **Mínima información:** la sede la aporta el cliente y la topología de alcances (qué sedes supervisa quién) es sensible. Un 403 confirmaría "la sede existe y es supervisada por otro"; el 404 no confirma nada.
3. **Sin oráculo de OT:** nada existe aún, así que el 404 no oculta existencia de recurso — y el orden alcance-antes-que-guarda garantiza además que un origen ocupado responda 404 y no 409 ante quien no tiene alcance (sellado con test dedicado, sugerencia del dictamen `sec-eng`).

## 5. Inventario del paso 3: rutas con `@ExecutionOrderTenantScoped()`

El decorador solo existe en `tasks` (verificado por `sec-eng` en todo `apps/api/src`):

| Ruta | Tipo | Estado |
| --- | --- | --- |
| `GET /tasks/execution-orders` | lectura | OK (scoping en el `WHERE`) |
| `POST /tasks/execution-orders/dispatch` | **escritura** | **Era la única sin alcance; cubierta por H1** |
| `GET /tasks/execution-orders/health/relay` | lectura | OK (sin escritura) |

Resto de escritoras con `:id`/`:eventId`: pasan por el guard → `assertActorAccess`/`assertActorCanRedrive`. Confirmación `sec-eng`: **no queda ruta de escritura sin alcance en el módulo.**

## 6. Evidencia con conteo real

- `tasks`: **682/682** (676 E2 + 5 H1 unit + 1 HTTP H1).
- PG H1 (`jest.integration.config.js`, tenant `iwana`, ida y vuelta 135): **4/4** incluyendo "H1 central contra base".
- `tsc --noEmit` (api) + `eslint` sobre los 5 archivos tocados: limpios.
- Exit-guard completo posterior a todos los cambios productivos: **exit 0**.

## 7. Deuda por severidad

- **Ninguna nueva bloqueante ni media.** El defecto queda cerrado, no mitigado.
- **P3 (subsiste de E2, ya no P3-este-hallazgo):** existencia de `organizationSiteId` no validada contra catálogo (sin FK por ADR-047 regla 6); TOCTOU alcance-chequeado vs inserción (mismo patrón guard/servicio que el resto de comandos).
- **Informativa:** el `down` de la 135 sigue siendo fail-closed ante OT sin evento — la suite PG lo ejercita en cada corrida.

## 8. Handoff a E3

E3 recibe el despacho con alcance validado pre-inserción y origen nunca quemado por rechazos. Desbloqueado.
