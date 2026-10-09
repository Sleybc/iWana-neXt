# LAUNCH — MOD11 ↔ MOD12 · Inventario de OT · Ola 2b (I2-R + T-FIX)

**Plan:** `docs/plans/2026-10-06-mod11-mod12-consumo-inventario-ot.md` v1.1 §5 · **Spec:** v1.1 (Aprobado, 2026-10-06)
**Gates:** G1 cerrado · G4 emitido · ola 1 en GO · ola 2 auditada: I1-R e I3 en GO, **I2 en GO condicionado**
**Contrato:** v1.6 congelado. I2-R solo aclara la **semántica** de `technicianCustodyId`: es el `responsibleRefId` del técnico. La forma no cambia.
**Cerrado, no re-despachar:** P1, I1, I1-R, I3 y lo ya hecho de I2 (se corrige, no se rehace).

| # | Subagente | Encargo (`PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md`) | Skills a leer antes de codificar |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §I2-R: MOD12 resuelve la ubicación móvil desde el responsable; guarda en el `down` de la 139 | `nestjs-expert`, `postgresql`, `database-migration`, `testing-patterns` |
| 2 | `fe-platform` | §T-FIX: tests de `operations/` que caducan con la fecha | `testing-patterns`, `frontend-dev-guidelines` |

**Paralelo:** sí. Los archivos son disjuntos: `inventory` y la migración 139 por un lado, los specs del portal por el otro.
**Antes de la ola 3:** arranca Docker Desktop (Postgres y Redis locales). I4 debe acreditar contra Postgres real la 139 y la carrera que I2 no pudo.
**Cierre:** dos informes en GO. Después, la ola 3 (S2 e I4).

---

### Bloque copiar-pegar — `sr-backend` (I2-R)

> Actúa como `sr-backend`. Lee `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` §I2-R y el plan §5. Lee los `SKILL.md` de `nestjs-expert`, `postgresql`, `database-migration` y `testing-patterns`.
> MOD11 emite `technicianCustodyId` como **id del técnico** y el ledger lo usa como **id de ubicación**; en real, todo consumo se rechazaría. Antes del ledger, resuelve la `StockLocation` móvil activa por `responsibleRefId` (mismo índice que `executor-custody`). Sin custodia activa → `CUSTODY_INSUFFICIENT`. Usa la ubicación resuelta en las validaciones y en las líneas del movimiento. Aclara solo el docstring del campo en el contrato v1.6.
> Pon guarda en el `down` de la 139, como la 137. Tests con una `StockLocation` cuyo `id` sea distinto del `responsibleRefId`. Jest de `inventory` con `Cached: 0`. Entrega el informe I2-R. Sin commit.

### Bloque copiar-pegar — `fe-platform` (T-FIX)

> Actúa como `fe-platform`. Lee `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` §T-FIX. Lee los `SKILL.md` de `testing-patterns` y `frontend-dev-guidelines`.
> Los 4 fallos de `use-execution-order-console.spec.ts` son una bomba de tiempo: un `expiresAt` fijo del 2026-10-06 a las 12:00 UTC. Pasa a fechas relativas o a reloj falso todos los specs de `operations/` que comparan contra la hora actual. Deja como están las fechas fijas que no dependen de ella.
> `operations/` completo sin fallos con `Cached: 0`, y una segunda corrida con el reloj adelantado 30 días. Entrega el informe T-FIX. Sin commit.
