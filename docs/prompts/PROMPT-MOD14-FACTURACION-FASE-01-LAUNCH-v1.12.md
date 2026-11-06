# LAUNCH — MOD14 · Facturación Fase 01 · BR-5 y Ola 4

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` (§6) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.1.md` · **UX:** `docs/specs/2026-10-31-mod14-facturacion-ux.md` · **Encargo:** `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md`, §BR-5 y §F2
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.11 (entregado el 2026-11-05).
**Gates:** G2 ✅ · **G3 ✅ AI-EM-ARCH 2026-11-05** · **Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §BR-5 | Ahora |
| 2 | `fe-platform` | §F2 | Tras 1 y la revisión de AI-EM-ARCH |

**Secuencia:** 1 → revisión → 2. F2 consume los contratos que fija BR-5. **Después:** V1 a V5 y G4.
**Reglas:** cada entrega lista sus archivos, y AI-EM-ARCH los comprueba en disco. Los agentes no editan el plan ni registran gates. `main`, sin commit, cero PII, nunca `tenant_iwana`. Pega los informes al volver.

```text
===== 1 · sr-backend, BR-5 (ahora) =====
Actúa como sr-backend. Lee AGENTS.md y §BR-5 de docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md, con sus skills de la matriz. Contrato: HLD v1.1 §4 y §6.5; ADR-065. Si falta un dato, [BLOQUEO]. Lo no hecho se declara no hecho.
Son 4 puntos. Solo las rutas de §BR-5; sin commit; no edites el plan ni registres gates.
Cierras con pnpm lint, @iwana/api unitaria e integración completas y @iwana/shared, en un postgres:18-alpine propio, secuencia del job ci y DB_NAME=test, conteo real y lista de archivos. Elimina tu contenedor al terminar.

===== 2 · fe-platform, F2 (solo cuando AI-EM-ARCH lo abra) =====
Actúa como fe-platform. Lee AGENTS.md, §F2 del prompt v1.1 y docs/specs/2026-10-31-mod14-facturacion-ux.md, con sus skills de la matriz. Contrato: HLD v1.1 §9 y §6.5, con tipos de @iwana/shared; si falta un dato, [BLOQUEO]. Lo no hecho se declara no hecho.
Solo apps/portal; cambio mínimo en SubscriberDetailClient.tsx y CutoffAgendaClient.tsx; sin commit; no edites el plan ni registres gates.
Cierras con lint, typecheck y tests de @iwana/portal sin caché, conteo real y lista de archivos.
```
