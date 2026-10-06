# Plan de orquestación — MOD11: el origen de la OT

**Versión:** 1.1
**Estado:** Vigente. G1 cerrado el 2026-09-14. **E1 y E2 cerrados en GO el 2026-09-15** (`INFORME-MOD11-ORIGEN-OT-E2-v1.0.md`). **E3 es despachable.**
**Fecha:** 2026-10-05
**Cambio v1.0 → v1.1 (2026-10-05):** E4 se divide por superficie. La **UX de E4** se fusiona con R0 del plan de consola (`docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.2), y su **implementación de portal** viaja en la misma pasada de `fe-platform` que R2-R4. La **parte de datos de E4** (CA-13) sigue en este plan, con `sr-backend` después de E3. Motivo: E4 y R2-R4 intervienen el mismo drawer, el mismo resumen y la misma bandeja; diseñarlas por separado obliga a rediseñar la consola dos veces. Alcance, criterios y RACI de E4 sin cambio.
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
| **E4** | Consola que distingue sin ventana de con ventana; handlers y reconciliador ante `NULL`. **Desde la v1.1 se ejecuta en tres partes:** UX → R0 del plan de consola · portal → pasada R2-R4 de `fe-platform` · datos (CA-13) → `sr-backend` aquí, después de E3 | CA-12, CA-13 |

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

**Actualización 2026-10-05 (v1.1).** E2 cerrado en GO. La UX de E4 se lanza con `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2A-LAUNCH-v1.0.md`, junto con R0 y R1 de la consola. E3 sigue sin launcher propio y es el siguiente tramo backend de este plan. La implementación de portal de E4 **no se lanza antes de que E3 cierre en GO**. **Precisión de la auditoría G2 (2026-10-05):** la parte de datos de E4 incluye hacer explícito el orden por defecto `planned_window_start_at DESC NULLS FIRST, id DESC` en `list()`. Lo cubre el índice de la migración 130, así que no necesita DDL (encargo R0, adenda A2 punto 2). **E3 queda emitido (2026-10-05):** encargo `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E3-v1.0.md` y launcher `docs/prompts/PROMPT-MOD11-CONSOLA-OT-G3-E3-LAUNCH-v1.0.md`, compartido con el dictamen G3 de la consola. T1 de corrección se lanza después de E3. **Auditoría de E3 (2026-10-05), GO condicionado:** `6ca86c30` propaga la ventana de agenda a las OT iniciadas, lo que viola ADR-090 §D4. La causa fue el §5 del encargo, que afirmaba una propagación que no existía. La remediación se lanza con `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E3-REMEDIACION-v1.0.md`. **T1 de corrección debe re-acotarse al emitir su prompt:** la propagación de la ventana antes del inicio ya existe, por puerto síncrono con precedente en `cancelFromSchedulingWithManager`. Siguen pendientes sitio, recurso, handlers no-op del worker, `VisitWindowChangedV1` y el reconciliador. Deuda de E3: P2 prueba de carrera, P3 índice único de `schedule_events.execution_order_id`. **E3 cerrado en GO tras la remediación** (`c5675620`, `INFORME-MOD11-ORIGEN-OT-E3-v1.1.md`). **E4-datos emitido:** `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E4-DATOS-v1.0.md`, con el orden `NULLS FIRST` y CA-13. T1 de corrección espera a E4-datos, porque ambos tocan el worker.
