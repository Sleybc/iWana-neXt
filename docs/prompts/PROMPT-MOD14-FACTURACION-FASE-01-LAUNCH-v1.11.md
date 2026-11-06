# LAUNCH — MOD14 · Facturación Fase 01 · Cierre de G3

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` (§6, G3) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.1.md` · **Encargo:** `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md`, §G3-QA
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.10 (BR-4 entregado y verificado el 2026-11-05).
**Gates:** G2 ✅ · G3 pendiente de esta entrega · **Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `sr-qa` | §G3-QA | Ahora |
| 2 | `test-change-reviewer` | Aserciones cambiadas en BR-4 | Ahora, solo lectura |
| 3 | `boundary-reviewer` | Exports y dependencias nuevas de BR-4 | Ahora, solo lectura |
| 4 | `gate-verifier` | Gates de los paquetes tocados | Tras 1 a 3 |

**Paralelo:** 1 ∥ 2 ∥ 3; después 4. **Cierre:** AI-EM-ARCH decide G3 con estas evidencias.
**Reglas:** cada entrega lista sus archivos. Los agentes no corrigen producción, no editan el plan ni registran gates. `main`, sin commit, cero PII, nunca `tenant_iwana`. Pega los informes al volver.

```text
===== 1 · sr-qa, G3-QA (ahora) =====
Actúa como sr-qa. Lee AGENTS.md y §G3-QA de docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md, con sus skills de la matriz. Contrato: HLD v1.1 §6.2, §6.3 y RS-17. Solo tu spec; sin commit; no corrijas producción.
Cierras con ese spec y la integración completa de @iwana/api en un postgres:18-alpine propio, secuencia del job ci y DB_NAME=test, conteo real y lista de archivos. Elimina tu contenedor al terminar.

===== 2 · test-change-reviewer (ahora) =====
Actúa como test-change-reviewer. Revisa billing-contract-read.adapter.spec.ts, billing-policy.service.spec.ts y las expectativas cambiadas por BR-4 en los specs de billing, junto con el cambio de producción que las motivó, incluida la lectura de [filas, conteo] en updatePolicy. Solo lectura: hallazgos con archivo:línea.

===== 3 · boundary-reviewer (ahora) =====
Actúa como boundary-reviewer. Revisa billing.module.ts, billing-account-read.module.ts, billing-contract-read.module.ts y el sexto parámetro de BillingPaymentsService contra HLD v1.1 §8.1(c): qué ve CRM de Billing y si hay ciclos. Solo lectura: hallazgos con archivo:línea.

===== 4 · gate-verifier (tras 1 a 3) =====
Actúa como gate-verifier. Ejecuta los Gates Before Merge sobre @iwana/shared, @iwana/db, @iwana/api, @iwana/worker y @iwana/portal, sin caché de turbo: build, typecheck, lint, tests, migraciones de ida y vuelta, OpenAPI, pnpm audit:adr-citations y pnpm audit:doc-locations. Incluye la integración del worker y los tests del portal, que BR-4 no corrió. Integraciones en un postgres:18-alpine propio con DB_NAME=test. Evidencia con comandos y conteos reales; no corrijas nada.
```
