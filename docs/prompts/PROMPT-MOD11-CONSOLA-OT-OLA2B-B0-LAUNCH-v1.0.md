# LAUNCH — MOD11 · Ola 2b, tramo 1: B0 seam + E4 datos

**Planes:** `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.2 · `docs/plans/2026-09-14-mod11-origen-ot.md` v1.1
**Gates:** G2 y G3 cerrados · E3 GO (v1.1, `c5675620`) · hotfix de evidencia GO (`f1348c64`) · G4 emitido para B0 y E4-datos
**Cerrado, no re-despachar:** Ola 1, hotfixes de ventana nula y de evidencia, R0, R1, G3, origen E1, E2 y E3, corrección T0 y T2.

| # | Subagente | Encargo | Skills a leer | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `fe-platform` | `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2B-B0-FE-PLATFORM-v1.0.md` | `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `core-components`, `wcag-audit-patterns`, `testing-patterns` | UX v1.1 · componente v1.0 · `execution-orders.ts` v1.4 |
| 2 | `sr-backend` | `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E4-DATOS-v1.0.md` | `nestjs-expert`, `postgresql`, `bullmq-specialist`, `testing-patterns` | `execution-orders.ts` v1.4 |

**Paralelo:** sí. El bloque 1 es portal y el 2 es api/worker.
**Secuencia:**
- R2, R3, R4 y E4-portal solo se lanzan con B0 en GO, y entonces corren en paralelo, uno por slot.
- T1 de corrección se lanza solo con E4-datos en GO, porque ambos tocan el worker.
- R5 va al final.

**Cierre:** B0 y E4-datos en GO. Después, AI-EM-ARCH emite el tramo 2 de la Ola 2b.

---

### Bloque copiar-pegar — `fe-platform` (B0)

> Actúa como `fe-platform`. Lee `AGENTS.md`, el plan v1.2, el dictamen G3 §3 y §8, y tu encargo `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2B-B0-FE-PLATFORM-v1.0.md` completo.
> Antes de codificar lee los `SKILL.md` de `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `core-components`, `wcag-audit-patterns` y `testing-patterns`.
> Eres el único dueño del shell. Extrae `RequirementChecklist`, `RequirementActionSheet` y `ExecutionOrderMomentContainer`, monta por momento según UX §4 (CA-10: sin captura antes del inicio) y completa la acción `ACTIVITY`.
> Deja slots con adaptador provisional para evidencia y consumo, y la fachada del hook delegando, para que R2, R3 y R4 no toquen tus archivos. Consolida los mapas de copy duplicados.
> No pierdas funcionalidad. Las suites OLA1, Commitment y Experience siguen en verde. Cierras con el §5 del encargo, con evidencia en navegador.

### Bloque copiar-pegar — `sr-backend` (E4-datos)

> Actúa como `sr-backend`. Lee `AGENTS.md`, el plan de origen v1.1 y tu encargo `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E4-DATOS-v1.0.md` completo.
> Antes de codificar lee los `SKILL.md` de `nestjs-expert`, `postgresql`, `bullmq-specialist` y `testing-patterns`.
> Haz explícito el orden `planned_window_start_at DESC NULLS FIRST, id DESC` en `list()` y demuestra con `EXPLAIN` real que lo sirve el índice de la migración 130. Si no lo sirve, `[BLOQUEO]` sin DDL.
> Inventaría a todos los lectores de `schedule_event_id` (worker, relay, `tasks.service`, ramas del servicio de OT): cada uno declara y prueba su comportamiento ante el nulo (CA-13). Añade un test de paginación estable con OT mezcladas.
> Fuera de alcance: T1, portal y deuda P2/P3. Cierras con el §3 del encargo con `Cached: 0`.
