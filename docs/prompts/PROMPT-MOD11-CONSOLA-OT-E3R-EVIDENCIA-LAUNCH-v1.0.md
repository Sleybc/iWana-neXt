# LAUNCH — MOD11 · Remediación E3 + hotfix de evidencia (antesala de la Ola 2b)

**Planes:** `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.2 · `docs/plans/2026-09-14-mod11-origen-ot.md` v1.1
**Gates:** G2 cerrado · **G3 cerrado (GO, 2026-10-05)** · E3 GO **condicionado a la remediación** · G4 emitido para los dos bloques
**Cerrado, no re-despachar:** Ola 1, hotfix de ventana nula, R0, R1, dictamen G3, E3 (`6ca86c30`; solo se remedian dos métodos), origen E1/E2, corrección T0/T2.

| # | Subagente | Encargo | Skills a leer | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E3-REMEDIACION-v1.0.md` | `nestjs-expert`, `testing-patterns` | `execution-orders.ts` v1.4 |
| 2 | `fe-platform` | `docs/prompts/PROMPT-MOD11-CONSOLA-OT-HOTFIX-EVIDENCIA-ANALISIS-v1.0.md` | `frontend-dev-guidelines`, `testing-patterns` | `execution-orders.ts` v1.4 |

**Paralelo:** sí. El bloque 1 es backend de `tasks`/`wfm` y el 2 es el hook del portal.
**Secuencia:** corrección T1 espera al bloque 1. El seam B0 de la Ola 2b espera al bloque 2, porque comparten `use-execution-order-console.ts`.
**Cierre:** ambos en GO. Después, AI-EM-ARCH emite la Ola 2b: B0 seam → {R2, R3, R4, E4-portal} en paralelo → R5, según el corte del dictamen G3 §3.

---

### Bloque copiar-pegar — `sr-backend`

> Actúa como `sr-backend`. Lee `AGENTS.md` y tu encargo `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E3-REMEDIACION-v1.0.md` completo. Antes de codificar lee los `SKILL.md` de `nestjs-expert` y `testing-patterns`.
> E3 propaga la ventana de agenda a OT ya iniciadas (`IN_PROGRESS`, `BLOCKED`) en silencio, y eso viola ADR-090 §D4. Añade la guarda en `rescheduleFromSchedulingWithManager` y en `linkFromSchedulingWithManager` (solo pre-inicio), con el código `EXECUTION_ORDER_IN_EXECUTION`. El rollback debe dejar el evento sin mover.
> Pruébalo por negación, en unitarios y contra Postgres. CA-09, CA-10 y CA-11 siguen verdes; `tasks` ≥ 706 y `wfm` ≥ 242 con `Cached: 0`.
> Entrega el informe E3 v1.1, que declara el cambio de comportamiento para las OT nacidas por agenda y qué queda de T1.

### Bloque copiar-pegar — `fe-platform`

> Actúa como `fe-platform`. Lee `AGENTS.md` y tu encargo `docs/prompts/PROMPT-MOD11-CONSOLA-OT-HOTFIX-EVIDENCIA-ANALISIS-v1.0.md` completo. Antes de codificar lee los `SKILL.md` de `frontend-dev-guidelines` y `testing-patterns`.
> El uploader registra la evidencia sin esperar a que el asset pase de `PENDING_ANALYSIS` a `AVAILABLE`, y el backend la rechaza. Primero reprodúcelo con un test.
> Si se confirma, consulta el estado del asset con espera acotada antes de registrar, añade el wrapper tipado del `GET` y muestra el estado «Analizando archivo» y el error terminal. Sin rediseño y sin selector por requisito.
> Cierras con el §4 del encargo: typecheck, `operations/` ≥ 366 con `Cached: 0` y `audit-ui.mjs` limpio.
