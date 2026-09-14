# LAUNCH — MOD11 · Observabilidad de la purga de retención

**Encargo:** `docs/prompts/PROMPT-MOD11-OBSERVABILIDAD-PURGA-v1.0.md` · **Spec del tramo:** `docs/specs/2026-09-14-mod11-retencion-linea-tiempo-design.md` v1.0
**Ola que lanza:** única — corrección acotada · **Gates:** G1 n/a (corrección sobre tramo aprobado) · G4 emitido
**Bloqueos abiertos:** ninguno. Cierra el hallazgo de la consolidación del tramo de retención.

| # | Subagente | Encargo (prompt · sección) | Skills a leer antes de codificar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | `docs/prompts/PROMPT-MOD11-OBSERVABILIDAD-PURGA-v1.0.md` §2 y §4 | `nestjs-expert`, `observability-engineer`, `testing-patterns`, `verification-before-completion` | ninguno — no se toca `@iwana/shared` ni la función SQL |

**Paralelo:** ninguno, es un único bloque.
**Cierre de ola:** los cuatro criterios de §6, con jest directo y `Cached: 0`; los cinco casos existentes del procesador intactos.

---

### Bloque copiar-pegar

> Actúa como `sr-backend`. Lee `AGENTS.md` y tu encargo `docs/prompts/PROMPT-MOD11-OBSERVABILIDAD-PURGA-v1.0.md`.
> Antes de escribir código lee los `SKILL.md` de: `nestjs-expert`, `observability-engineer`, `testing-patterns`, `verification-before-completion` (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> El procesador de tombstone ejecuta la purga y **descarta el resultado**: la función devuelve seis conteos y nadie los mira. Desde la migración 134 uno de ellos es cumplimiento de retención de dato personal, así que la corrida tiene que dejar rastro.
> Captura el resultado por tenant y emite un resumen por corrida, con el detalle por tenant en `debug`. Patrón a replicar: `refresh-token-purge.processor.ts`.
> **La línea se emite siempre, incluso con todos los conteos en cero**: sin eso, «no purgó nada» y «no corrió» son indistinguibles, y la segunda es el fallo que esto quiere hacer visible.
> **No toques** la función SQL, la migración 134, el cron, el `jobId`, el tamaño de lote ni la transacción. Sin métricas ni alertas: es trabajo distinto.
> Logs sin PII (dictamen B3 §3.4): identificadores operativos y conteos, nunca `reason` ni `changed_by`.
> Los cinco casos del spec del procesador se extienden, no se reescriben.
> Cierras cuando los cuatro criterios de §6 pasen con conteo real. Reporta rutas, evidencia y deuda por severidad.
