# LAUNCH — MOD14 · Facturación Fase 01 · Corrección de Ola 2 y cierre de G2

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` (§6) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.1.md` (RS-10 a RS-12) · **Encargo:** `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md` §B1b-R y §D1-R12
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.2 (Ola 2, entregada con G2 NO-GO el 2026-11-03).
**Ola que lanza:** B1b-R ∥ D1-R12 y, al terminar, las revisiones de G2 · **Gates:** G1 ✅ 2026-11-03 · **Enmiendas RS-10 a RS-12 ✅ CTO 2026-11-04** · **Bloqueos abiertos:** ninguno; D-BIL-6 quedó resuelta con (a).

| # | Subagente | Encargo | Skills a leer antes | Cuándo |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §B1b-R | `nestjs-expert`, `backend-security-coder`, `openapi-spec-generation`, `test-driven-development`, `iwana-test-evidence` | Ahora |
| 2 | `data-eng` | §D1-R12 | `database-migration`, `postgresql`, `iwana-tenant-migration`, `test-driven-development` | Ahora |
| 3 | `boundary-reviewer` | Adaptador, puerto y `BillingModule` | `architect-review` | Tras 1 y 2 |
| 4 | `contract-drift-reviewer` | `contracts/billing` contra API y OpenAPI | `architect-review` | Tras 1 y 2 |
| 5 | `test-change-reviewer` | Specs ajustadas, incluida `subscriber-lifecycle` | — | Tras 1 y 2 |
| 6 | `gate-verifier` | Evidencia de G2 | `iwana-test-evidence`, `verification-before-completion` | Tras 3, 4 y 5 |

**Paralelo:** 1 ∥ 2, rutas disjuntas; 3 ∥ 4 ∥ 5; 6 al final.
**Cierre de ola (G2):** CA-FAC-01 y 02; vista previa real, sin 503; último periodo `VENCIDO` cubierto contra PG; `unbilledAdditionalCount` de punta a punta; **integración completa de `@iwana/api` en verde**; revisores sin hallazgos P0/P1. Nadie commitea.

```text
===== 1 · sr-backend (ahora) =====
Actúa como sr-backend. Lee AGENTS.md, el plan y tu encargo §B1b-R de docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md, y los SKILL.md de nestjs-expert, backend-security-coder, openapi-spec-generation, test-driven-development e iwana-test-evidence. Contrato: HLD v1.1 §4, §5, §6.5 y RS-10 a RS-12 de §12; si falta un dato, [BLOQUEO].
Implementa los cinco puntos: POST /billing/policy/preview por ciclos con política sin guardar; resolveGenerationTarget y la ventana de 62 días; unbilledAdditionalCount en lugar de additionalItems; CASCADE en el TRUNCATE de subscriber-lifecycle. No toques packages/database.
Sin commit. Cierras con las suites unitaria e integración completas de @iwana/api, sin caché, con conteo y cada omisión explicada. La integración exige CI=true, una base iwana_it_* y las claves de prueba en el entorno.

===== 2 · data-eng (ahora) =====
Actúa como data-eng. Lee AGENTS.md, el plan y tu encargo §D1-R12 del prompt v1.1, y database-migration, postgresql, iwana-tenant-migration y test-driven-development. Contrato: HLD v1.1 §3.1 y RS-12.
Añade unbilled_additional_count a billing_documents en la 173, con CHECK nombrado, y a la entidad; la integración prueba el valor por defecto y el rechazo de un negativo. Solo esos tres archivos; sin commit. Cierras con las integraciones 173–175 sin omisiones (CI=true) y @iwana/db sin caché, con conteo real.

===== 3 · boundary-reviewer (tras 1 y 2) =====
Actúa como boundary-reviewer. Revisa en solo lectura el diff de apps/api/src/modules/billing y crm/contracts/billing-contract-read.*: fronteras del Modulith, tenancy, sin forwardRef nuevos y sin PII en logs. Hallazgos con archivo:línea.

===== 4 · contract-drift-reviewer (tras 1 y 2) =====
Actúa como contract-drift-reviewer. Compara en solo lectura packages/shared/src/contracts/billing con su productor y la OpenAPI, y con el HLD v1.1 §4 y §5 (RS-10 a RS-12). Hallazgos con archivo:línea.

===== 5 · test-change-reviewer (tras 1 y 2) =====
Actúa como test-change-reviewer. Clasifica cada spec existente cuyo fixture o expectativa cambió, incluida subscriber-lifecycle.service.postgres.integration.spec.ts, junto con el cambio de producción que lo motivó.

===== 6 · gate-verifier (tras 3, 4 y 5) =====
Actúa como gate-verifier. Lee iwana-test-evidence y verification-before-completion. Ejecuta sin caché typecheck, lint y las suites unitaria e integración completas de @iwana/api y @iwana/db, en una base iwana_it_* con el entorno del job de CI. Entrega comandos, conteos reales y la causa de cada suite omitida. No apruebas G2: entregas evidencia a AI-EM-ARCH.
```
