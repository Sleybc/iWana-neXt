# LAUNCH — MOD14 · Facturación Fase 01 · Corrección de la Ola 3, paso 2

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` (§6) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.1.md` · **Encargo:** `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md`, «Corrección de la Ola 3»
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.6 (paso 1 entregado el 2026-11-05).
**Gates:** G2 ✅ · D1-R16 y B1b-R3 ✅ · **Bloqueos abiertos:** ninguno. El `[BLOQUEO]` de B4p-R queda resuelto en §B4p-R2.

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §B4p-R2 | Ahora |
| 2 | `sr-backend` | §B2-R | Ahora |
| 3 | `sr-backend` | §B3-R | Ahora |

**Paralelo:** 1 ∥ 2 ∥ 3, rutas disjuntas. Skills: matriz del plan. **Cierre (G3):** CA-FAC-03 a 10, 12 y 13, con integración real y concurrencia; después, revisores y `gate-verifier`.
**Reglas:** cada entrega lista sus archivos, y AI-EM-ARCH los comprueba en disco. Sin PostgreSQL no hay cierre. `main`, sin commit, cero PII, nunca `tenant_iwana`.

```text
===== 1 · sr-backend, B4p-R2 (ahora) =====
Actúa como sr-backend. Lee AGENTS.md y §B4p-R2 de docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md, y test-driven-development.
Ajusta solo crm-contract-standing-read.adapter.spec.ts y privacy.module.spec.ts, como manda §B4p-R2. Sin tocar producción; otro ajuste es [BLOQUEO]; sin commit.
Cierras con esas dos suites sin caché, conteo real y lista de archivos.

===== 2 · sr-backend, B2-R (ahora) =====
Actúa como sr-backend. Lee AGENTS.md y §B2-R y §B2 del prompt v1.1, con sus skills de la matriz. Contrato: HLD v1.1 §6.1, §6.2, §6.5, §6.6 y RS-9 a RS-14; si falta un dato, [BLOQUEO]. Lo no hecho se declara no hecho.
Solo tus rutas; sin commit. Cierras con integraciones reales en un postgres:18-alpine propio, secuencia del job ci y DB_NAME=test, conteo real y lista de archivos.

===== 3 · sr-backend, B3-R (ahora) =====
Actúa como sr-backend. Lee AGENTS.md y §B3-R y §B3 del prompt v1.1, con sus skills de la matriz. Contrato: HLD v1.1 §6.3, RS-14 y RS-16; si falta un dato, [BLOQUEO]. Lo no hecho se declara no hecho.
Solo tus rutas; sin commit. Cierras con integraciones reales en un postgres:18-alpine propio, secuencia del job ci y DB_NAME=test, conteo real y lista de archivos.
```
