# INFORME — Bootstrap: ciclo de módulos WFM ↔ Tasks ↔ Assurance

**Código:** SR-FULL-BOOTSTRAP  
**Versión:** 1.0  
**Fecha:** 2026-08-05  
**Agente:** AI-SR-FULL  
**Prompt:** `docs/prompts/PROMPT-SR-FULL-BOOTSTRAP-CICLO-MODULOS-v1.0.md`  
**Rama:** `feat/mod09-ciclo-vida-visita-campo`  
**ADRs:** ADR-037 · ADR-047 · ADR-069  

---

## Veredicto

**STATUS: DONE** — la API arranca, el healthcheck responde 200 en loopback, y existe una red de seguridad que falla si se reintroduce el ciclo.

---

## E0 — Reproducción y alcance

| Pregunta | Resultado |
| --- | --- |
| ¿Arranca `main`? | **Sí** (grafo sin `Assurance → Wfm`) |
| ¿Desde qué commit deja de arrancar esta rama? | **`7343e0bb556fb65d2a1d7aad7bb012c00eda652f`** — `feat(wfm): ciclo de vida de visita no realizada y remediación F6` |
| Método | Arranque fallido en HEAD; arranque exitoso al quitar temporalmente `forwardRef(() => WfmModule)` de Assurance (grafo estilo `main` / padre `59b057a5`); `git log -S` confirma que ese import nace en `7343e0bb` |

### Error reproducido (HEAD pre-fix)

```
UndefinedModuleException: Nest cannot create the WfmModule instance.
The module at index [4] of the WfmModule "imports" array is undefined.
Scope [AppModule -> HealthModule -> TasksModule -> AssuranceModule]
```

### Nota sobre WIP `forwardRef` en Wfm

Había un cambio local no validado (`forwardRef(() => TasksModule)` en `wfm.module.ts`). **No se adoptó** (Vía A). Se descartó a favor de Vía B. El stash `wip-forwardRef-eval` puede quedar en el workspace; no forma parte de la corrección.

---

## E1 — Mapa del ciclo

```
HealthModule ──► TasksModule ──► AssuranceModule ──► WfmModule
                                      │                   │
                                      │  forwardRef sí    │  (antes) TasksModule sin forwardRef
                                      │                   ▼
                                      └──────── ciclo ────┘
```

| Arista | forwardRef (pre-fix) | Motivo |
| --- | --- | --- |
| Health → Tasks | No | Healthcheck de relay/OT |
| Tasks → Assurance | No | `ASSURANCE_EXECUTION_ORDER_NOTIFIER_PORT` |
| Assurance → Wfm | **Sí** | `FieldServiceWorkPort` (cancelar visita al cerrar ticket) — añadido en `7343e0bb` |
| Wfm → Tasks | **No** | Solo para `EXECUTION_ORDER_SCHEDULING_PORT` |

En `main` no existe Assurance → Wfm; el ciclo está abierto y la API arranca aunque Wfm → Tasks exista desde `1bbb9997`.

---

## E2 — Corrección (Vía B)

**Vía elegida: B — romper el ciclo vía puerto tipado (ADR-047).**

**Por qué no A:** el acoplamiento Wfm → Tasks no es bidireccional de dominio: WFM solo necesita el contrato `EXECUTION_ORDER_SCHEDULING_PORT`. Gestionar el ciclo con `forwardRef` simétrico taparía el síntoma y dejaría el grafo cíclico entre tres bounded contexts.

**Qué se hizo:**

1. Nuevo `ExecutionOrderSchedulingModule` — módulo fino en MOD11 que exporta `EXECUTION_ORDER_SCHEDULING_PORT` **sin** importar `AssuranceModule`.
2. `WfmModule` importa `ExecutionOrderSchedulingModule` en lugar de `TasksModule`.
3. `AssuranceModule` conserva `forwardRef(() => WfmModule)` para `FieldServiceWorkPort` (sin cambio de contrato).
4. Contrato `EXECUTION_ORDER_SCHEDULING_PORT` **sin cambios**.

### Archivos tocados

| Archivo | Cambio |
| --- | --- |
| `apps/api/src/modules/tasks/execution-order-scheduling.module.ts` | **Nuevo** — proveedor del puerto |
| `apps/api/src/modules/wfm/wfm.module.ts` | Importa módulo fino; deja de importar `TasksModule` |
| `apps/api/src/app.bootstrap.spec.ts` | **Nuevo** — red E3 |

### Grafo post-fix

```
Health → Tasks → Assurance → Wfm → ExecutionOrderSchedulingModule
                                      (sin Assurance / sin Tasks)
```

Acíclico.

---

## E3 — Prueba de bootstrap

**Ruta:** `apps/api/src/app.bootstrap.spec.ts`

- Evalúa el grafo en el orden Nest `Health → Tasks → Assurance → Wfm` y exige que ningún import de `WfmModule` sea `undefined`.
- Sonda `Test.createTestingModule` sobre `HealthModule` y falla si el error es `UndefinedModuleException` (no exige AppModule completo: TestingModule+TypeORM/Redis es la misma familia que el baseline de `clamp-page-endpoints`).

### Evidencia al revertir

Se reintrodujo temporalmente `TasksModule` en `WfmModule.imports` (sin `forwardRef`):

```
expect(received).toBeDefined()
Received: undefined
at app.bootstrap.spec.ts (imports de WfmModule)
```

Tras restaurar Vía B: **3/3 tests verdes**.

---

## E4 — Arranque, health y BIND_HOST

| Criterio | Evidencia |
| --- | --- |
| `npx nest start` | `Nest application successfully started`; `WfmModule` / `TasksModule` / `ExecutionOrderSchedulingModule` inicializados |
| Health 200 | `GET http://127.0.0.1:3001/api/v1/health` → **200** `{"status":"ok",...}` (puerto 3001 para no chocar con un listener previo en 3000) |
| Bind loopback | `Get-NetTCPConnection` → `LocalAddress 127.0.0.1`, `LocalPort 3001`, `State Listen`. Default `BIND_HOST` / non-prod = `127.0.0.1` (`main.ts`) |

---

## Suites / calidad

| Check | Resultado |
| --- | --- |
| `app.bootstrap.spec.ts` | 3 passed |
| `clamp-page-endpoints.controller.http.spec.ts` | **21 failed** (baseline sin cambio; causa TestingModule/deps, **no** el ciclo) |
| `pnpm typecheck` (`@iwana/api`) | Verde |
| `pnpm lint` (`@iwana/api`) | Verde |

Los 21 de clamp-page **no pasaron a verde**; no se cambia el alcance del baseline.

---

## Bloqueos / consultas

Ninguno. El ciclo no reveló un boundary mal trazado que exija ADR nuevo: la dependencia era de contrato (puerto) y se alineó a ADR-047.

---

## Revisor — AI-SR-QA

**VEREDICTO: GO_WITH_CONCERNS** (2026-08-05)

| # | Criterio | Resultado |
| --- | --- | --- |
| 1 | `app.bootstrap.spec.ts` pasa | PASS — 3/3 |
| 2 | E3 falla al revertir Vía B | PASS — reproducido (reintroducir `TasksModule`) |
| 3 | `nest start` sin `UndefinedModuleException` | PASS |
| 4 | Health 200 en loopback | PASS — intención OK; puerto de evidencia variable por ocupación (`:3000`/`:3001`/`:3010`) |
| 5 | typecheck + lint `@iwana/api` | PASS |
| 6 | clamp-page no empeora baseline (21) | PASS — sigue en 21 |
| 7 | Vía B respeta boundaries | PASS — módulo fino MOD11, solo puerto |
| 8 | E0 verificable (`7343e0bb`) | PASS |

**Hallazgos importantes (no bloquean P0):**

1. E3 no monta `AppModule` completo (prompt §2 ideal); usa metadata + sonda `HealthModule`. Cumple §5.4 (falla al revertir) con red más estrecha.
2. Conflicto de puerto en evidencias de health — documentar en cierre G6.
3. El bootstrap spec deja handles abiertos (Redis/BullMQ) → requiere `--forceExit` (deuda de higiene).

**Bloqueantes:** ninguno.

---

## Consolidación AI-EM-ARCH (G5)

**Modo:** Architect + Orchestrator + EM  
**Fecha:** 2026-08-05  
**Agentes:** [AI-SR-FULL](ebdefec9-eec7-4f73-ab2d-2b2cc06d5eb9) · [AI-SR-QA](2595aeb3-1d82-460f-a056-2ea510015d4e)

| Gate | Estado | Nota |
| --- | --- | --- |
| **G5** (implementación / segunda capa EM-ARCH) | **GO** | Vía B alineada a ADR-047; ciclo acíclico; contrato de puerto intacto; WIP `forwardRef` rechazado correctamente |
| **G6** (calidad) | **GO_WITH_CONCERNS** (QA) | Concerns no bloquean el P0; registrar deuda E3 estrecha + higiene Jest |
| **G6.5** | Pendiente | Requiere corrida Linux CI por SHA (ADR-069) — fuera de este encargo |
| **G7** | No aplica | Este trabajo no autoriza despliegue |

**Impacto (tenant / seguridad / escala / regulación):** sin impacto — bootstrap y wiring de módulos; multi-tenant, RBAC y auditoría intactos.

**Decisión:** el P0 del prompt queda **cerrado a nivel de implementación**. Se desbloquea la remediación P1 (S-1, S-2) y el camino a G6.5. Los concerns de QA se aceptan como **deuda media** a pagar en una higiene de tests de bootstrap (montaje más cercano a `AppModule` y cierre de handles), sin reabrir el ciclo.

**Pendiente CTO / humano:** commit de los artefactos (no solicitado en esta sesión) y corrida G6.5 cuando se mergee.

**Anti-patrón evitado:** no se adoptó `forwardRef` simétrico como reflejo; se prefirió romper el ciclo por contrato tipado.
