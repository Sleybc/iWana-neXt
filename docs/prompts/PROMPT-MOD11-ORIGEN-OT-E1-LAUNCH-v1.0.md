# LAUNCH — MOD11 · Origen de la OT · E1

**Plan:** `docs/plans/2026-09-14-mod11-origen-ot.md` v1.0 · **Spec:** `docs/specs/2026-09-14-mod11-origen-ot-design.md` v1.0 (Aprobada)
**Ola que lanza:** E1 — el esquema deja de exigir una cita · **Gates:** G1 cerrado 2026-09-14 (ADR-091 aprobado + dictamen de `sec-eng` aceptado) · G4 emitido
**Bloqueos abiertos:** ninguno. **T0 cerrado en GO y auditado el 2026-09-15** (643/643 en `tasks`, CA-01/CA-02 contra Postgres real): el archivo queda libre. **E2 espera el cierre de E1.**

| # | Subagente | Encargo (prompt · sección) | Skills a leer antes de codificar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E1-v1.0.md` §2 y §4 | `database-migration`, `postgresql`, `nestjs-expert`, `typescript-expert`, `testing-patterns` | identidad: `(tenant_id, origin_context, origin_ref, work_type)` — no se toca `@iwana/shared` |

**Paralelo:** ninguno, un único bloque.
**Cierre de ola:** CA-01 a CA-04 de la spec §5, migración contra Postgres real ida y vuelta; suite de `tasks` no baja de 617.

---

### Bloque copiar-pegar

> Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-09-14-mod11-origen-ot.md` y tu encargo `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E1-v1.0.md`.
> Antes de escribir código lee los `SKILL.md` de: `database-migration`, `postgresql`, `nestjs-expert`, `typescript-expert`, `testing-patterns` (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Hoy la OT no puede existir sin cita: `schedule_event_id` y `planned_window_*` son `NOT NULL`, y el índice único por evento es la clave de idempotencia de la creación. E1 relaja esa nulabilidad y **muda la identidad al eje que ADR-076 (Aprobado) ya fijó**: `(tenant_id, origin_context, origin_ref, work_type)`.
> Una sola guarda de unicidad para **los dos caminos de nacimiento** —agenda y despacho—, replicando el patrón de `createVisitRequest`: `pg_advisory_xact_lock` sobre la tupla de origen y `origin_ref` normalizado con `trim`. `origin_ref IS NULL` sigue fuera de deduplicación: no amplíes esa excepción.
> El `down` debe **declarar su límite** ante OT sin evento —contar y fallar con mensaje accionable, como la migración 098—, no romper a ciegas ni borrar en silencio.
> Alcance: **solo esquema e identidad**. Fuera de alcance: la puerta de despacho (E2), el control de acceso —`sec-eng` ya dictaminó que `CREATED` queda fuera del pool y la regla vive en cinco sitios—, la consola (E4) y el DTO de agenda de MOD09.
> CA-03 se prueba **concurrente, no secuencial**: un test secuencial pasa aunque el advisory lock no exista. La migración se verifica **contra Postgres real, ida y vuelta**: con mocks de `queryRunner.query` solo compruebas que la cadena SQL contiene un texto.
> Cierras cuando CA-01 a CA-04 pasen con conteo real y `tasks` no baje de 617. Reporta rutas, evidencia, la justificación del índice único y deuda por severidad.
