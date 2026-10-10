# LAUNCH — MOD11 ↔ MOD12 · Reverso de consumo · Cierre: revisiones retroactivas (DS + PLAT)

**Plan:** `docs/plans/2026-10-09-mod11-mod12-reverso-consumo-ot.md` · **Estado:** G6 y G6.5 en GO, **cerrado en construcción** (ADR-080 §5)
**Origen:** dos cambios entraron en `ca1c116f` sin el revisor que les toca. Se auditan después del hecho; no bloquean el cierre en construcción. G7 está diferido por el CTO.

| # | Subagente | Encargo | Skills a leer antes de escribir |
| --- | --- | --- | --- |
| 1 | `ds-owner` | Veredicto del carril rápido sobre el autoalojamiento de fuentes (G2 retroactivo) | `core-components`, `iwana-identity-ui-review`, `tailwind-patterns` |
| 2 | `plat-ops` | Validar el healthcheck del worker (B4) en Compose | `docker-expert` |

**Paralelo:** sí. Son dictámenes de solo lectura sobre archivos disjuntos.
**Siguiente:** nada más. **G7 está diferido por el CTO** (2026-10-10): no se diseñan alertas ni staging.

---

### Bloque copiar-pegar — `ds-owner` (fuentes)

> Actúa como `ds-owner`. Lee `AGENTS.md` y el informe `INFORME-MOD11-MOD12-REVERSO-G65-CI-v1.0.md`, y revisa con `git show ca1c116f` estos archivos: `packages/ui/src/styles/globals.css`, `packages/ui/src/tokens/typography.ts`, `packages/ui/src/styles/fonts/*` y los dos `layout.tsx`. Lee los `SKILL.md` de la tabla.
> Dictamina sobre:
> (a) `--font-sans`, `--font-display` y `--font-mono` movidos a `@theme inline` con `var(--font-exo-2)`;
> (b) la pérdida de las cursivas de Exo 2: antes se cargaban 100 y 400 en cursiva; la woff2 local es solo recta y la cursiva se usa en `SubscriberDetailClient`, `TaxProfileBlock`, `VisitRequestRecommendationPanel`, `AuditExpandedDetails`, `AuditSummary` y `TenantCreateSummary`;
> (c) los pesos `100 800` frente al manual de identidad.
> Comprueba visualmente una pantalla del portal y otra de web con cursiva. Entrega `INFORME-DS-OWNER-FUENTES-LOCALES-v1.0.md` con veredicto y, si hace falta, la corrección para `fe-platform`. Sin commit.

### Bloque copiar-pegar — `plat-ops` (heartbeat B4)

> Actúa como `plat-ops`. Lee `PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md` (eres su consulta sobre la forma del healthcheck en Compose), los informes de heartbeat v1.0 y v1.1, y la adenda B4 de `INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md`. Lee el `SKILL.md` de `docker-expert`.
> Valida `apps/worker/src/worker-healthcheck.ts`, el probe y el `init: true` de `docker-compose.prod.yml` y de `docker-compose.e2e.yml`, y la relación entre el TTL y el intervalo. **No diseñes alertas ni staging: G7 está diferido por el CTO.** Entrega `INFORME-PLAT-OPS-HEARTBEAT-B4-v1.0.md`. Sin commit.
