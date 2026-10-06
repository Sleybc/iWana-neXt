# LAUNCH — MOD11 ↔ MOD12 · Inventario de OT · Ola 1 (P1 + I1)

**Plan:** `docs/plans/2026-10-06-mod11-mod12-consumo-inventario-ot.md` v1.1 · **Spec:** `docs/specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md` v1.1 (**Aprobado por el CTO, 2026-10-06**)
**Gates:** G1 cerrado, con las tres ratificaciones · G4 emitido (`PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md`)
**Bloqueos abiertos:** ninguno · **Contrato:** spec §3, que I1 materializa como `execution-orders.ts` v1.6 en su paso 1

| # | Subagente | Encargo | Skills a leer antes de codificar |
| --- | --- | --- | --- |
| 1 | `plat-ops` | `PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` §P1 | `docker-expert` |
| 2 | `sr-backend` | mismo encargo, §I1 | `nestjs-expert`, `bullmq-specialist`, `database-migration`, `postgresql`, `testing-patterns`; de apoyo, `backend-security-coder` |

**Paralelo:** sí. P1 toca plantillas y arranque; I1 toca `shared`, `tasks`, `database` y `worker`. Si I1 necesita la clave en pruebas, usa la de las plantillas de P1 o un valor de test local.
**Siguiente:** cuando I1 tenga el contrato v1.6 en verde (paso 1), se lanza la ola 2 (I2 e I3). La ola 3 (S2 e I4) se lanza con I2 en GO.

---

### Bloque copiar-pegar — `plat-ops`

> Actúa como `plat-ops`. Lee `AGENTS.md`, la spec v1.1 (D8) y `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` §P1. Lee el `SKILL.md` de `docker-expert`.
> Añade `INTERNAL_QUEUE_SIGNING_KEY` a `.env.example` y a los Compose para api y worker, sin valor real. Haz que el arranque en producción falle si la clave falta o es corta, y documenta la rotación.
> Entrega el informe P1. Sin commit.

### Bloque copiar-pegar — `sr-backend` (I1)

> Actúa como `sr-backend`. Lee `AGENTS.md`, la spec v1.1 completa (D1-D12 no se re-litigan) y `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-IMPL-v1.0.md` §I1. Lee los `SKILL.md` de `nestjs-expert`, `bullmq-specialist`, `database-migration`, `postgresql` y `testing-patterns`.
> **Primero, el contrato v1.6 y el esquema Zod en `@iwana/shared`, y avisa en cuanto estén verdes.** Después: emisión V2 sin `CREW`, migración 138, reencolado firmado, respuestas fuera de la guarda `aggregateVersion` con transición única (D10), DLQ sin payload (D11) y scanner D7.
> Gates: typecheck, `tasks` ≥ 717 y worker ≥ 117 con `Cached: 0`, y la 138 con `down` ejercitado contra Postgres. Entrega el informe I1. Sin commit.
