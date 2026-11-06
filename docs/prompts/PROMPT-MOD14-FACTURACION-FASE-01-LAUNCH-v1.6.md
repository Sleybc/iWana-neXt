# LAUNCH — MOD14 · Facturación Fase 01 · Corrección de la Ola 3

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` (§6) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.1.md` (RS-13 a RS-16) · **Encargo:** `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md`, «Corrección de la Ola 3»
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.5 (G3 NO-GO el 2026-11-05).
**Gates:** G2 ✅ · **RS-13 a RS-16 ✅ CTO 2026-11-05** · **Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §B4p-R | Ahora |
| 2 | `data-eng` | §D1-R16 | Ahora |
| 3 | `sr-backend` | §B1b-R3 | Ahora |
| 4 | `sr-backend` | §B2-R | Tras 1, 2, 3 y la revisión de AI-EM-ARCH |
| 5 | `sr-backend` | §B3-R | Con 4 |

**Paralelo:** 1 ∥ 2 ∥ 3; 4 ∥ 5. Skills: matriz del plan. **Parada:** tras 1, 2 y 3, AI-EM-ARCH corre la suite completa y cierra G6 de H-2 antes de abrir 4 y 5.
**Cierre (G3):** CA-FAC-03 a 10, 12 y 13, con integración real y concurrencia. Revisores y `gate-verifier` se lanzan después, con el mismo Postgres.
**Reglas:** cada entrega lista sus archivos, y AI-EM-ARCH los comprueba en disco. Sin PostgreSQL no hay cierre. `main`, sin commit, cero PII, nunca `tenant_iwana`.

```text
===== 1 · sr-backend, B4p-R (ahora) =====
Actúa como sr-backend. Lee AGENTS.md y §«Corrección de la Ola 3» y §B4p-R de docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md, con sus skills de la matriz. Contrato: HLD v1.1 §8.1 y RS-15.
Registra el participante fiscal en módulo y CLI, añade subscriberIds a standing y la integración de deber fiscal. Cambiar una aserción existente es [BLOQUEO]. Sin commit.
Cierras con la integración completa de @iwana/api en un postgres:18-alpine propio, secuencia del job ci y DB_NAME=test, con conteo real y lista de archivos.

===== 2 · data-eng, D1-R16 (ahora) =====
Actúa como data-eng. Lee AGENTS.md y §D1-R16 del prompt v1.1, con sus skills de la matriz. Contrato: HLD v1.1 §3.1 y RS-16. Solo la 173, su integración y billing-payment.entity.ts; sin commit.
Cierras con la integración completa de @iwana/db en un postgres:18-alpine propio con DB_NAME=test, conteo real y lista de archivos.

===== 3 · sr-backend, B1b-R3 (ahora) =====
Actúa como sr-backend. Lee AGENTS.md y §B1b-R3 del prompt v1.1, con sus skills de la matriz. Contrato: HLD v1.1 §4, §5, RS-13 y RS-14. Solo sus rutas; no toques crm/privacy-adapters; sin commit.
Cierras con la integración del adaptador en un postgres:18-alpine propio con DB_NAME=test, conteo real y lista de archivos.

===== 4 · sr-backend, B2-R (solo cuando AI-EM-ARCH lo abra) =====
Actúa como sr-backend. Lee AGENTS.md y §B2-R y §B2 del prompt v1.1, con sus skills de la matriz. Contrato: HLD v1.1 §6.1, §6.2, §6.5, §6.6 y RS-9 a RS-14; si falta un dato, [BLOQUEO]. Lo no hecho se declara no hecho.
Solo tus rutas; sin commit. Cierras con integraciones reales con DB_NAME=test, conteo real y lista de archivos.

===== 5 · sr-backend, B3-R (con 4) =====
Actúa como sr-backend. Lee AGENTS.md y §B3-R y §B3 del prompt v1.1, con sus skills de la matriz. Contrato: HLD v1.1 §6.3, RS-14 y RS-16; si falta un dato, [BLOQUEO]. Lo no hecho se declara no hecho.
Solo tus rutas; sin commit. Cierras con integraciones reales con DB_NAME=test, conteo real y lista de archivos.
```
