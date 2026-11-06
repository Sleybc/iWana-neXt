# LAUNCH — MOD14 · Facturación Fase 01 · Corrección de la Ola 3, paso 5

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` (§6) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.1.md` (RS-19 y RS-20) · **Encargo:** `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md`, §BR-4
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.9 (entregado el 2026-11-05; G3 sigue en NO-GO).
**Gates:** G2 ✅ · **RS-19 y RS-20 ✅ CTO 2026-11-05** · **Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §BR-4 | Ahora |

**Después (G3):** AI-EM-ARCH verifica BR-4 y entrega `gate-verifier` y las pruebas de concurrencia de `sr-qa`. Cierre: CA-FAC-03 a 10, 12 y 13.
**Reglas:** la entrega lista sus archivos, y AI-EM-ARCH los comprueba en disco. Los agentes no editan el plan ni registran gates. `main`, sin commit, cero PII, nunca `tenant_iwana`. Pega el informe del agente al volver.

```text
===== 1 · sr-backend, BR-4 (ahora) =====
Actúa como sr-backend. Lee AGENTS.md y §BR-4 de docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md, con sus skills de la matriz. Contrato: HLD v1.1 §4, §5, §6.1, §8.1, RS-18, RS-19 y RS-20; ADR-103 D4. Si falta un dato, [BLOQUEO]. Lo no hecho se declara no hecho.
Son 11 puntos, cada uno con su prueba en rojo primero. Solo las rutas de §BR-4; sin commit; no edites el plan ni registres gates.
Cierras con @iwana/api unitaria completa, integración completa y @iwana/db, en un postgres:18-alpine propio, secuencia del job ci y DB_NAME=test. Das conteo real, estado de cada punto y lista de archivos. Elimina tu contenedor al terminar.
```
