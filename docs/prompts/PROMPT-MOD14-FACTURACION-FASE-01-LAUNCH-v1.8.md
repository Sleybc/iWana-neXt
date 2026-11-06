# LAUNCH — MOD14 · Facturación Fase 01 · Corrección de la Ola 3, paso 3

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` (§6) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.1.md` (RS-17 y RS-18) · **Encargo:** `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md`, §D1-R17 y §BR-2
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.7 (entregado el 2026-11-05; G3 sigue en NO-GO).
**Gates:** G2 ✅ · **RS-17 y RS-18 ✅ CTO 2026-11-05** · **Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `data-eng` | §D1-R17 | Ahora |
| 2 | `sr-backend` | §BR-2 | Ahora; el punto 14 espera a 1 |

**Paralelo:** 1 ∥ 2, rutas disjuntas. Skills: matriz del plan. **Cierre (G3):** CA-FAC-03 a 10, 12 y 13, con unitaria e integración completas; después, revisores y `gate-verifier`.
**Reglas:** cada entrega lista sus archivos, y AI-EM-ARCH los comprueba en disco. Sin PostgreSQL no hay cierre. `main`, sin commit, cero PII, nunca `tenant_iwana`. Al terminar, cada agente elimina su contenedor.

```text
===== 1 · data-eng, D1-R17 (ahora) =====
Actúa como data-eng. Lee AGENTS.md y §D1-R17 de docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md, con sus skills de la matriz. Contrato: HLD v1.1 §3.1 y RS-17. Solo la 173, su integración y billing-payment-allocation.entity.ts; sin commit.
Cierras con la integración completa de @iwana/db en un postgres:18-alpine propio con DB_NAME=test, conteo real y lista de archivos. Elimina tu contenedor al terminar.

===== 2 · sr-backend, BR-2 (ahora; punto 14 tras D1-R17) =====
Actúa como sr-backend. Lee AGENTS.md y §BR-2 del prompt v1.1, con sus skills de la matriz. Contrato: HLD v1.1 §6, §10, RS-17 y RS-18; si falta un dato, [BLOQUEO]. Lo no hecho se declara no hecho.
Son 15 puntos: cada uno con su prueba en rojo primero, sobre la migración 173 real y sin copiar DDL. Solo tus rutas; sin commit.
Cierras con @iwana/api unitaria completa, integración completa y @iwana/db, en un postgres:18-alpine propio, secuencia del job ci y DB_NAME=test. Das conteo real, cobertura de billing, estado de cada punto y lista de archivos. Elimina tu contenedor al terminar.
```
