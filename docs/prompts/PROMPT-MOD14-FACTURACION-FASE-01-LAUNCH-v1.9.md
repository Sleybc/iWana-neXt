# LAUNCH — MOD14 · Facturación Fase 01 · Corrección de la Ola 3, paso 4

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` (§6) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.1.md` · **Encargo:** `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md`, §BR-3
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.8 (entregado el 2026-11-05; G3 sigue en NO-GO).
**Gates:** G2 ✅ · **Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §BR-3 | Ahora |
| 2 | `boundary-reviewer` | Fronteras y tenancy de `billing/` | Ahora, solo lectura |
| 3 | `contract-drift-reviewer` | Contratos de Billing contra productores y consumidores | Ahora, solo lectura |
| 4 | `test-change-reviewer` | Specs existentes ajustados | Ahora, solo lectura |

**Paralelo:** 1 ∥ 2 ∥ 3 ∥ 4. Los revisores no tocan el árbol. **Después:** con BR-3 y los hallazgos resueltos, AI-EM-ARCH verifica y entrega `gate-verifier`, y decide G3.
**Reglas:** cada entrega lista sus archivos, y AI-EM-ARCH los comprueba en disco. Los agentes no editan el plan ni registran gates. `main`, sin commit, cero PII, nunca `tenant_iwana`.

```text
===== 1 · sr-backend, BR-3 (ahora) =====
Actúa como sr-backend. Lee AGENTS.md y §BR-3 de docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md, con sus skills de la matriz. Contrato: HLD v1.1 §6.1 y RS-18; RF-FAC-13. Si falta un dato, [BLOQUEO]. Lo no hecho se declara no hecho.
Son 3 puntos, cada uno con su prueba en rojo primero. Solo tus rutas; sin commit; no edites el plan ni registres gates.
Cierras con @iwana/api unitaria completa, integración completa y @iwana/db, en un postgres:18-alpine propio, secuencia del job ci y DB_NAME=test, conteo real y lista de archivos. Elimina tu contenedor al terminar.

===== 2 · boundary-reviewer (ahora) =====
Actúa como boundary-reviewer. Revisa apps/api/src/modules/billing/, crm/contracts/billing-contract-read.adapter.ts y crm/privacy-adapters contra AGENTS.md y HLD v1.1 §5 y §8: imports entre módulos, tenancy y consultas sin tenant_id. Solo lectura: hallazgos con archivo:línea.

===== 3 · contract-drift-reviewer (ahora) =====
Actúa como contract-drift-reviewer. Compara packages/shared/src/contracts/billing/ con apps/api/src/modules/billing/, BillingAccountReadPort, la agenda de corte y la 173, según HLD v1.1 §3.1, §4 y §6.5, RS-9 a RS-18. Solo lectura: hallazgos con archivo:línea.

===== 4 · test-change-reviewer (ahora) =====
Actúa como test-change-reviewer. Revisa los specs existentes que cambiaron fixture o expectativa por MOD14: invariantes de permisos y de recifrado, crm-contract-standing-read.adapter.spec.ts, privacy.module.spec.ts y contracts.service.spec.ts. Clasifica cada ajuste. Solo lectura: hallazgos con archivo:línea.
```
