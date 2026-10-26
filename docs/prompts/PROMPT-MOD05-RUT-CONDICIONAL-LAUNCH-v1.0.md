# LAUNCH — MOD05 · Responsabilidades del RUT condicionales · Ola 1 (B1 ∥ F1) → Ola 2 (V1 ∥ V2)

**Plan:** `docs/plans/2026-10-26-mod05-rut-condicional.md` v1.0 · **Decisión:** ADR-100 (Aprobado, 2026-10-26)
**Gates:** G0 ✅ · G3 · G4 · G5 · G6 · G7
**Estado al arrancar:** el API, el esquema, el SQL y el portal exigen el RUT a todos. Los 3 suscriptores de `tenant_iwana` son persona natural no responsable sin RUT, y por eso el G7 de MOD13 está detenido.

| # | Subagente | Encargo (`PROMPT-MOD05-RUT-CONDICIONAL-v1.0.md`) | Skills a leer antes de codificar | Cierra |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §Regla común y §B1 | `nestjs-expert`, `test-driven-development`, `testing-patterns`, `iwana-test-evidence`, `postgresql` | CA-01 a CA-06 (G3) |
| 2 | `fe-platform` | §Regla común y §F1 | `frontend-dev-guidelines`, `system-vocabulary-review`, `testing-patterns` | CA-07 a CA-09 (G4) |
| 3 | `contract-drift-reviewer` | §V1 | `architect-review` | G5 |
| 4 | `gate-verifier` | §V2 | `iwana-test-evidence`, `turborepo-caching`, `verification-before-completion` | G6 |

**Secuencia:** (1 ∥ 2) → (3 ∥ 4). Archivos disjuntos: 1 toca `packages/shared` y `apps/api`; 2 toca `apps/portal`. Nadie commitea.

---

### Bloque copiar-pegar

===== 1 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-26-mod05-rut-condicional.md`, ADR-100 y tu encargo `docs/prompts/PROMPT-MOD05-RUT-CONDICIONAL-v1.0.md` §Regla común y §B1. Antes de codificar, lee `nestjs-expert`, `test-driven-development`, `testing-patterns`, `iwana-test-evidence` y `postgresql`. Empieza en rojo con la tabla de 8 casos. Crea `isRutResponsibilitiesRequired` en `@iwana/shared` y úsala en los esquemas, en `evaluateSubscriberFiscalCompleteness`, en `FISCAL_INCOMPLETE_SQL` y en la edición. Prueba la activación y la paridad SQL contra Postgres real en el tenant de pruebas, nunca `tenant_iwana`. Sin migraciones; no toques `apps/portal` ni `network/**`. No commitees. Cierras con el conteo real (más de 0 tests de integración ejecutados).

===== 2 · fe-platform =====
Actúa como `fe-platform`. Lee `AGENTS.md`, el plan, ADR-100 y tu encargo §Regla común y §F1 del mismo prompt. Antes de codificar, lee `frontend-dev-guidelines`, `system-vocabulary-review` y `testing-patterns`. En `SubscriberForm.tsx` y `SubscriberSections.tsx`, haz que el campo RUT sea obligatorio solo para jurídicas o responsables de IVA, usando `isRutResponsibilitiesRequired` de `@iwana/shared` con la firma del encargo. Rotúlalo como opcional con la ayuda indicada y ajusta `VatTreatmentBanner.tsx`. Pruebas de componente CA-07 a CA-09. Solo `apps/portal`. No commitees.

===== 3 · contract-drift-reviewer =====
Actúa como `contract-drift-reviewer`. Lee `AGENTS.md`, ADR-100 y el encargo §V1. Lee `architect-review`. Cuando terminen 1 y 2, compara la función y los esquemas de `@iwana/shared` con los DTO, el OpenAPI y `FISCAL_INCOMPLETE_SQL` del API y con los formularios del portal. Busca consumidores que sigan asumiendo `.min(1)`. Solo lectura. Hallazgos con `archivo:línea`.

===== 4 · gate-verifier =====
Actúa como `gate-verifier`. Lee `AGENTS.md` y el encargo §V2. Lee `iwana-test-evidence`, `turborepo-caching` y `verification-before-completion`. Cuando terminen 1 y 2, ejecuta sin caché de turbo lint, typecheck y las suites de `@iwana/shared`, `@iwana/api` y `@iwana/portal`, más la integración de `crm/subscribers` contra Postgres real. Entrega comandos, conteos reales y la cobertura de las líneas nuevas. No corrijas código.
