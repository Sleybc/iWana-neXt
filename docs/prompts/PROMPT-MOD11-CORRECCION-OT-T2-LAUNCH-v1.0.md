# LAUNCH — MOD11 · Corrección de OT · T2

**Plan:** `docs/plans/2026-09-14-mod11-correccion-ot.md` · **Spec:** `docs/specs/2026-09-14-mod11-correccion-ot-design.md` (Aprobada)
**Ola que lanza:** T2 — anulación por error y los cuatro huecos de la cancelación · **Gates:** G1 cerrado (ADR-090 aprobado por el CTO el 2026-09-15)
**Bloqueos abiertos:** ninguno. **T2 se adelantó a T1**: cierra la OT despachada irreversible que abrió E2.

| # | Subagente | Encargo (prompt · sección) | Skills a leer antes de codificar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | `docs/prompts/PROMPT-MOD11-CORRECCION-OT-T2-v1.0.md` §3 a §5 | `nestjs-expert`, `typescript-expert`, `postgresql`, `testing-patterns`, `database-migration` | anulación: dato + API. Migración propia solo si el mecanismo la exige |
| 2 | `prod-ux` | mismo prompt §4 punto 6 (CA-14) | `system-vocabulary-review` | copy y motivos; **sin pantalla** |

**Paralelo:** sí — `prod-ux` entrega copy y catálogo de motivos mientras `sr-backend` trabaja el dato. No comparten archivo.
**Cierre de ola:** §8 del encargo; `tasks` no baja de 682 y la suite completa sigue terminando sola.

---

### Bloque copiar-pegar — `sr-backend`

> Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-09-14-mod11-correccion-ot.md` y tu encargo `docs/prompts/PROMPT-MOD11-CORRECCION-OT-T2-v1.0.md`.
> Antes de escribir código lee los `SKILL.md` de: `nestjs-expert`, `typescript-expert`, `postgresql`, `testing-patterns`, `database-migration` (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> E2 abrió la puerta de despacho y con ella una OT que **nadie puede cancelar**: sin evento de agenda no hay vía, `CREATED` está fuera del pool, y `close` exige asignación previa. Para deshacer un error de captura hoy hay que fingir una visita de campo. T2 abre la **anulación por error** de ADR-090 (Aprobado) §D3, con motivo y rol de supervisión, **alcanzando también a la OT despachada**.
> **Lee §2 del encargo antes de elegir mecanismo.** Los estados terminales están enumerados a mano en muchos sitios. Si resuelves con un estado nuevo y no entra en el índice `uq_execution_orders_active_origin_unique` (migración 135), **la OT anulada sigue bloqueando su origen y no habrás arreglado nada**. Y si no entra en `TERMINAL_STATUSES_SQL` de la migración 134, **su línea de tiempo no se anonimiza nunca** — que es exactamente la garantía que ADR-090 invocó para descartar el borrado físico.
> Elige el mecanismo y **justifícalo**. Las invariantes son: la anulada libera su origen, entra en la purga de retención, es distinguible de la cancelada y se excluye del cálculo, y no destruye rastro.
> Cierra además los cuatro huecos de la spec §4.5: `close` con `result=CANCELLED` deja de cancelar; cancelar una OT terminal se rechaza; la cancelación emite evento de dominio; y la vía de UI deja de cancelar disfrazada de reclasificar (el copy es de `prod-ux`, tú entregas dato y API).
> **No** toques la propagación desde agenda (T1), **no** retires la vía de cancelación desde agenda —se hace honesta, no se elimina—, **no** implementes el reverso de inventario (deuda MOD12). Si al cerrar la puerta trasera de `close` aparecen llamadores legítimos que dependían de ella, emite `[CONSULTA]`.
> Verifica **contra base real** que tras anular una OT despachada el origen queda libre, y que la anulada es alcanzada por la purga de la 134.
> Cierras cuando §8 se cumpla, `tasks` ≥ 682 con conteo real y la suite completa termine sola. Reporta el mecanismo, **qué sitios de terminalidad alcanza y cuáles no**, y deuda por severidad.

### Bloque copiar-pegar — `prod-ux`

> Actúa como `prod-ux`. Lee `AGENTS.md`, la spec `docs/specs/2026-09-14-mod11-correccion-ot-design.md` §4.4 y §4.5, y el encargo `docs/prompts/PROMPT-MOD11-CORRECCION-OT-T2-v1.0.md` §4 punto 6.
> Antes de escribir lee el `SKILL.md` de `system-vocabulary-review`.
> Hoy la única vía de cancelación alcanzable desde el portal es **engañosa**: el usuario reclasifica la causa de una visita no realizada y el efecto lateral es cancelar la OT, con una razón literal fija. Nadie debería cancelar una orden creyendo que reclasifica un motivo.
> Entrega el **copy** y el **catálogo de motivos** que distinguen dos actos distintos: **anular por error** —la OT no debió existir— y **cancelar** —el trabajo comprometido se deshace—. Español, sentence case, sin enums crudos a la vista.
> **No diseñes pantalla**: la superficie llega después. Tampoco decidas la semántica del dato, que es de `sr-backend` en el mismo tramo.
> Entrega en `docs/specs/` o `docs/informes/` según corresponda, y señala cualquier término del vocabulario del sistema que tu propuesta obligue a revisar.
