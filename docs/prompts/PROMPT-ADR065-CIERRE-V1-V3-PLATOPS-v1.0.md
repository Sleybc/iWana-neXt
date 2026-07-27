# PROMPT — Cierre ADR-065 · V-1 (integración `089` real) + V-3 (barrido de estados ADR)

**Emisor:** AI-EM-ARCH · **Destinatario:** AI-PLAT-OPS
**Fecha:** 2026-07-27
**Plan que lo gobierna:** [docs/plans/2026-07-27-adr065-cierre-programa.md](../../docs/plans/2026-07-27-adr065-cierre-programa.md) — fases 1 y 2
**Entradas obligatorias:** [INFORME-ADR065-DISPOSICION-EJECUTADA-v1.0](../../docs/informes/INFORME-ADR065-DISPOSICION-EJECUTADA-v1.0.md) §«Lo que NO pude verificar» y §Decisiones del CTO

> **Orden de ejecución:** entrega V-1 **completo y reportado** antes de empezar V-3. La ola anterior de agentes murió a mitad y dejó trabajo a medio escribir que hubo que auditar archivo por archivo; si te quedas sin margen, que sea con V-1 cerrado y no con dos mitades.

---

## V-1 · Ejecutar la suite de integración de `089` contra PostgreSQL real — PRIORIDAD

### Qué existe ya
`packages/database/src/migrations/tenant/089_pagination_ordering_indexes.integration.spec.ts` — 13 tests que ejecutan `up()` real, verifican los 17 índices con `verifyPaginationIndexes`, prueban `down()`, la idempotencia de `up()`, la whitelist de `dropInvalidIndexIfExists` y —lo que de verdad cierra D-1— que un índice `idx_pag_*` creado en un **segundo schema** no es visible desde el primero.

### El problema
**Nunca se han ejecutado contra una base real.** Verificado por AI-EM-ARCH el 2026-07-27: sin Docker levantado, `pnpm --filter @iwana/db test:integration` devuelve `Tests: 13 skipped, 13 total` y **exit 0**, con el centinela `SUITE OMITIDA` que emite el `globalSetup` (`packages/database/test/integration-db-probe.js`).

Mientras eso siga así, la afirmación «BL-1 y D-1 ya no pueden volver» está sostenida **por construcción y no por ejecución** — que es la deuda de evidencia que este programa arrastra desde el primer gate.

### Pasos
1. Levanta la infraestructura Docker del repo. Consulta `scripts/dev.mjs` y el `docker-compose` para ver qué servicios hay: **necesitas PostgreSQL, no el stack de aplicaciones completo**. No arranques web/portal/api si puedes evitarlo.
2. Deja la base en el estado que la suite necesita. **Comprueba** qué variables leen el probe y el spec (`DB_HOST`, `DB_PORT`, `DB_NAME`, credenciales de migrador…) — no las asumas. La suite crea y destruye sus propios schemas efímeros.
3. Ejecuta `pnpm --filter @iwana/db test:integration` y captura la **salida literal completa**.
4. Si algún test falla, **no lo arregles tocando el test**. La migración `089` es código de producción de AI-SR-FULL: un fallo aquí es un hallazgo real y se reporta con su salida. Es el escenario más valioso de todos — significaría que la migración tenía un defecto que ningún mock veía, que es exactamente la tesis del hallazgo A-2.
5. Deja el entorno como lo encontraste, o di explícitamente qué queda levantado.

### Stop/go
`Tests: 13 passed, 13 total` con la salida pegada. **Un skip no es un pase.** Si no consigues levantar PostgreSQL, emite `[BLOQUEO]` con el error literal.

---

## V-3 · Barrido de estados de ADR independiente de las citas

### El hueco
`scripts/audit-adr-citations.mjs` valida el estado de un ADR **solo cuando alguien lo cita** — la comprobación vive dentro del bucle de citas (reglas `adr-no-status` y `adr-status-invalid`). Consecuencia: un ADR con el estado fuera del vocabulario canónico es invisible hasta que se le cita, y entonces aparece de golpe.

No es hipotético. `ADR-064` declaraba su estado como `Aprobado — superado parcialmente por [ADR-065]…` y generó **60 defectos bloqueantes** el día que este programa empezó a citarlo, dejando el job `adr-citations` de CI **rojo en `main`** sin que ningún informe de gate lo mencionara (hallazgo A-5).

### El encargo
Añade un barrido que recorra **todos** los ADR de `docs/adrs/` y reporte los que no declaren estado o lo declaren fuera del vocabulario canónico (`Aprobado` · `En revisión` · `Propuesto` · `Superado`), con independencia de que estén citados.

### Restricción de severidad — no negociable
Los ADR **no citados** se reportan como **AVISO**, no como BLOQUEANTE. Razón: resolver el estado de un ADR puede requerir una decisión del CTO, y un job de CI no puede quedarse bloqueado esperando una firma humana. Los ADR **citados** conservan exactamente la severidad que tienen hoy.

### Detalle que ahorra un falso positivo
`parseState` acepta **dos** formatos: `**Estado:** X` y frontmatter YAML `status: "X"`. Cinco ADR (028, 029, 030, 031, 036) usan el segundo. **Reutiliza `parseState`**; si reimplementas la lógica los reportarás como rotos sin estarlo. (Le pasó a AI-EM-ARCH al hacer el barrido manual: cinco falsos positivos.)

### Estado de partida verificado
Los **52** ADR del repo tienen estado canónico a 2026-07-27. Tu cambio debe entrar en verde; su valor es **preventivo**: convierte un defecto que aparece de golpe y tarde en uno que aparece el día que se escribe.

### Stop/go
1. `node scripts/audit-adr-citations.mjs` sigue en `BLOQUEANTE: 0` y exit 0.
2. **Prueba de mutación:** rompe temporalmente el estado de un ADR **no citado**, comprueba que el barrido lo reporta como AVISO, y restáuralo. Sin esa evidencia la regla no se acepta — es la regla que gobierna todo este programa: ningún control se acepta sin demostrar que reacciona al defecto para el que existe.

---

## Restricciones comunes

- El árbol tiene ~485 archivos modificados de trabajo previo: **no hagas `git add`, `git commit`, `git stash` ni `git checkout`.**
- **No cambies el vocabulario canónico.** El CTO ratificó el 2026-07-27 que queda cerrado; admitir sinónimos está expresamente descartado.
- **No toques ADRs para «arreglar» su estado:** es autoridad del CTO.
- Comenta el porqué junto al cambio, como ya se hizo en `ci.yml` y `apps/api/jest.config.js`.

## Entregables

1. Salida literal de la suite de integración de `089` contra base real.
2. El barrido nuevo con su prueba de mutación y su salida.
3. Si V-1 destapa un defecto de la migración: el hallazgo con la evidencia, **sin arreglarlo tú**.
