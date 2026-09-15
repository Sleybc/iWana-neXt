# Plan de orquestación — MOD11: el origen de la OT

**Versión:** 1.0
**Estado:** Vigente. G1 cerrado el 2026-09-14. **E1 cerrado en GO el 2026-09-15 y auditado. E2 es despachable.**
**Fecha:** 2026-09-14
**Emitido por:** AI-EM-ARCH

**Spec que ejecuta:** `docs/specs/2026-09-14-mod11-origen-ot-design.md` v1.0
**ADR que lo sostiene:** ADR-091 (Aprobado)

---

## 1. Qué se está resolviendo

El CTO objetó que la OT nazca de la agenda. La exploración le dio la razón y encontró que **la gobernanza aprobada ya decía lo mismo**: ADR-047 (Aprobado) afirma que la OT es «owner de ejecución de campo, no subproducto de agenda», y el código hace lo contrario —con `schedule_event_id NOT NULL` y el evento de agenda como clave de idempotencia de la creación—.

El trabajo es **separar el acto de despachar del acto de agendar** sin debilitar el control de capacidad ni reabrir la duplicación que ADR-076 (Aprobado) cerró.

## 2. Contratos

**E1 congela el contrato de identidad**: la unicidad activa pasa a `(tenant_id, origin_context, origin_ref, work_type)` para ambos caminos de nacimiento. **E2 abre contrato de API nuevo** (creación por despacho) y toca `@iwana/shared`: se congela al cerrar E1.

## 3. Tramos

```
   [G1] CERRADO 2026-09-14 — ADR-091 aprobado, spec aprobada, dictamen aceptado
        │
   E1  CERRADO GO 2026-09-15 — migración 135 + guarda de origen
        │
   E2  puerta de despacho           sr-backend   (C: sec-eng — §3.6 es condición de cierre)
        │
   E3  agendar después + vínculo    sr-backend
        │
   E4  consola y proyecciones       fe-platform + prod-ux + sr-backend
```

**Camino crítico:** G1 → E1 → E2 → E3 → E4. E1 a E3 tocan `execution-orders.service.ts`: **no se paralelizan**. E4 puede solaparse con E3 solo en su parte de UX (copy y estados), no en la de datos.

| Tramo | Alcance | Stop/go |
| --- | --- | --- |
| **E1** | Nulabilidad de `schedule_event_id` y `planned_window_*`; migración del índice único al eje de origen; guarda de unicidad para ambos caminos | CA-01 a CA-04 |
| **E2** | Creación por despacho con **sitio y `originContext` obligatorios**; `CREATED` alcanzable y **fuera del pool reclamable**; la regla coherente en los cinco sitios; decide `PROVISIONING` y el salto que pierde el origen real (spec §3.8) | CA-05 a CA-08c |
| **E3** | Agendar una OT existente: vínculo, chequeo de conflicto sin excepción, propagación intacta | CA-09 a CA-11 |
| **E4** | Consola que distingue sin ventana de con ventana; handlers y reconciliador ante `NULL` | CA-12, CA-13 |

## 4. Matriz de dispatch (agente × skill)

Verificadas contra disco con `ls .agents/skills/<nombre>/SKILL.md` (perfil §10.12).

| Tramo | Subagente | Skills obligatorias | Apoyo (condición) | Descartadas y por qué | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| **E1** | `sr-backend` | `database-migration`, `postgresql`, `nestjs-expert`, `typescript-expert`, `testing-patterns` | `architect-review` (si el eje de identidad obliga a reinterpretar ADR-076 (Aprobado) más allá de aplicarlo) | `ui-ux-pro-max` — sin superficie; `bullmq-specialist` — E1 no toca colas | Migración aplicada contra Postgres real, ida y vuelta · jest con `Cached: 0` |
| **E2** | `sr-backend` | `nestjs-expert`, `typescript-expert`, `postgresql`, `testing-patterns` | `architect-review` (contrato de API nuevo en `@iwana/shared`) | `database-migration` — el DDL se agotó en E1 | `pnpm typecheck` · conteo real · **dictamen de `sec-eng` sobre §3.6** |
| **E3** | `sr-backend` | `nestjs-expert`, `bullmq-specialist`, `typescript-expert`, `testing-patterns` | `postgresql` (si el vínculo exige proyección nueva) | `system-vocabulary-review` — E3 no entrega copy | jest directo, conteo real, verificación de extremo a extremo |
| **E4** | `fe-platform` + `prod-ux` + `sr-backend` | FE: `ui-ux-pro-max`, `iwana-identity-ui-review` · UX: `system-vocabulary-review` · BE: `nestjs-expert`, `testing-patterns` | `observability-engineer` (si el comportamiento ante `NULL` se instrumenta) | `playwright-skill` — sin flujo E2E nuevo en este alcance | `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` · texto en español, sentence case, sin enums crudos |

**`sec-eng` ya emitió su dictamen** (`docs/informes/INFORME-MOD11-ORIGEN-OT-SEC-ENG-DICTAMEN-v1.0.md`, 2026-09-14): se mantiene la exclusión de `CREATED` y la sede pasa a ser obligatoria al despachar. E2 ejecuta ese veredicto; no vuelve a abrirlo. `sec-eng` conserva la C en el RACI de E2 para verificar que los cinco sitios de la spec §3.6.2 quedaron coherentes.

## 5. RACI

| Tramo | R | A | C | I |
| --- | --- | --- | --- | --- |
| E1 | AI-SR-FULL | AI-EM-ARCH | AI-DATA-ENG | AI-PLAT-OPS |
| E2 | AI-SR-FULL | AI-EM-ARCH | **AI-SEC-ENG** | AI-FE-PLATFORM |
| E3 | AI-SR-FULL | AI-EM-ARCH | AI-DATA-ENG | AI-SR-QA |
| E4 | AI-FE-PLATFORM / AI-PROD-UX / AI-SR-FULL | AI-EM-ARCH | AI-DS-OWNER | AI-SR-QA |

## 6. Verificación

- **CA-03** — la unicidad se prueba **concurrente**, no secuencial: dos creaciones simultáneas para el mismo origen. El test secuencial pasaría sin el advisory lock y no probaría nada.
- **CA-06** — que la OT sin cita no consuma capacidad se verifica **desde la agenda**: el técnico sigue pudiendo recibir un evento en ese rango.
- **CA-08** — se verifica por negación: **quien no debe verla, no la ve**. Comprobar solo que el coordinador la ve deja el hallazgo abierto.
- **CA-09** — el chequeo de conflicto debe correr; un test que solo verifique que el vínculo se creó no detecta que se saltó la guarda.
- **Transversal** — conteo real por suite; `tasks` no baja de 617; `audit:adr-citations` y `audit:doc-locations` en `BLOQUEANTE: 0`.

## 7. Riesgos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| R1 | El despacho directo se vuelve la vía para saltarse la agenda | CA-06 y CA-09; la guarda de conflicto corre cuando llega la ventana |
| R2 | Se duplica trabajo de campo entre ambos caminos de nacimiento | CA-02 y CA-03; una sola guarda para los dos |
| R3 | Una OT en `CREATED` queda visible para quien no debe | **Dictaminado**: se mantiene la exclusión (spec §3.6). CA-08 lo verifica por negación |
| R3b | La regla se cambia en un sitio y no en los otros cuatro | CA-08; §3.6.2 los enumera. La divergencia produce filas que listan y dan 404 |
| R3c | Se despacha sin sede y la OT nace muerta: visible y no asignable | CA-05 rechaza el despacho sin sitio (spec §3.6.1) |
| R4 | Un handler falla en silencio ante `schedule_event_id IS NULL` | CA-13; cada handler declara su comportamiento |
| R5 | La migración se aplica y el `down` no puede revertir | CA-04: el `down` declara su límite en vez de fallar |
| R6 | E4 se pospone y la consola muestra filas que parecen rotas | ADR-091 (Aprobado) §D5: la distinción es condición de entrega |
| R7 | Se abre una segunda bandeja y la operación empeora | §7.1 de la spec: `[CONSULTA]` al CTO antes de E4 |

## 8. Bloqueos abiertos

**Ninguno para E1.** G1 cerró el 2026-09-14 con ADR-091 (Aprobado), la spec aprobada y las tres condiciones del dictamen resueltas: bandeja solo de supervisión, paridad del contratista declarada, sede obligatoria al despachar.

- **Dependencia externa:** CA-07 se apoya en T0 de `docs/plans/2026-09-14-mod11-correccion-ot.md` —`assign()` no persiste el técnico—, que es despachable ya y debe cerrar antes que E2.
- **Fuera de alcance, registrado:** H6 del dictamen —`CONTRACTOR` bloquea y no desbloquea— es defecto vivo independiente de este plan y pide prompt propio.

## 9. Lanzamiento

**El orden de ejecución completo vive en `docs/prompts/PROMPT-MOD11-ORQUESTACION-ORIGEN-OT-LAUNCH-v1.0.md`**, que cubre este plan y el de corrección.

**E1 cerrado en GO y auditado el 2026-09-15** (651/651 en `tasks`; migración 135 y guarda de origen verificadas contra Postgres real, ida y vuelta). T0 y H6 también cerrados.

**Se lanza E2**: `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E2-LAUNCH-v1.0.md` es la fuente y prevalece si un espejo diverge.

E2 se lanza al cerrar E1 **y T0 de la spec hermana**. E3 y E4 con archivo propio en su turno.
