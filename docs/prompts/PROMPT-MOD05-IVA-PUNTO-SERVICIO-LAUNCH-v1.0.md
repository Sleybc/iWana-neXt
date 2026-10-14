# LAUNCH — MOD05/MOD06/MOD07 · IVA por punto de servicio · Ola 1

> **Superado el 2026-10-12** por [PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.1.md](PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.1.md) (Ola 2). La Ola 1 cerró. No relanzar desde este archivo.

**Plan:** `docs/plans/2026-10-12-mod05-iva-punto-servicio.md` v1.0 · **Prompt:** `docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.0.md` · **ADR:** ADR-093 (Aprobado)
**Ola que lanza:** Ola 1: motor canónico, migración 144 y spec UX · **Gates:** G1–G3 por ADR-093; G4 se firma al lanzar
**Precondición:** remediación de suscriptores B1–B13 commiteada. **Bloqueos abiertos:** ninguno para esta ola. No correr la Fase 04 de suscriptores en paralelo.

| # | Subagente | Encargo | Skills a leer antes de empezar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | prompt §3 T1 | `nestjs-expert`, `typescript-expert`, `test-driven-development`, `testing-patterns` | produce C-TAX-1 v1.0 |
| 2 | `data-eng` | prompt §3 T2 | `postgresql`, `database-migration` | produce C-DDL-2 v1.0 |
| 3 | `prod-ux` | prompt §3 T5 | `iwana-identity-ui-review`, `system-vocabulary-review`, `docs-architect` | consume C-API-3 v1.0 |

**Paralelo:** los tres; la propiedad de archivos es disjunta (prompt §3).
**Cierre de ola:** T1 con la tabla de verdad al 100 % y `turbo --force` en verde; T2 con `up/down/up` contra Postgres real y reporte de backfill; T5 con la spec entregada para ratificación. Después, Ola 2: T3 ∥ T4 ∥ T6.

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, `docs/adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md`, el plan v1.0 y tu encargo `docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.0.md` §3 bloque `{T#}`.
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Contratos del prompt §2 v1.0: no los modifiques; si necesitas cambiarlos, emite `[BLOQUEO]` y para. Trabaja solo dentro de tu propiedad exclusiva.
> Fuera de alcance: Billing, `tax_regime`, Habeas Data, placeholders y los puntos ⚠ del ADR-093 §6.
> Reporta en `docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-{T#}-v1.0.md` con ruta, conteo real y deuda nueva por severidad.
