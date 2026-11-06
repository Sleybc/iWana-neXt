# LAUNCH — MOD14 · Facturación Fase 01 · BR-7 y F2

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` (§6) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.1.md` · **UX:** `docs/specs/2026-10-31-mod14-facturacion-ux.md` · **Encargo:** `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md`, §BR-7 y §F2
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.14 (BR-6 verificado el 2026-11-05).
**Gates:** G2 ✅ · G3 ✅ · **Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `fe-platform` | §F2 | Ahora |
| 2 | `sr-backend` | §BR-7 | Ahora |

**Paralelo:** 1 ∥ 2, rutas disjuntas. **Después:** V1 a V5 y G4.
**Reglas:** cada entrega lista sus archivos, y AI-EM-ARCH los comprueba en disco. Los agentes no editan el plan ni registran gates. `main`, sin commit, cero PII, nunca `tenant_iwana`. Pega los informes al volver.

```text
===== 1 · fe-platform, F2 (ahora) =====
Actúa como fe-platform. Lee AGENTS.md, §F2 del prompt v1.1 y docs/specs/2026-10-31-mod14-facturacion-ux.md, con sus skills de la matriz. Contrato: HLD v1.1 §9, §6.5, RS-21 y RS-22, con tipos de @iwana/shared; si falta un dato, [BLOQUEO]. Lo no hecho se declara no hecho.
Solo apps/portal; cambio mínimo en SubscriberDetailClient.tsx y CutoffAgendaClient.tsx; sin orden seleccionable en las tablas; sin commit; no edites el plan ni registres gates.
Cierras con lint, typecheck y tests de @iwana/portal sin caché, conteo real y lista de archivos.

===== 2 · sr-backend, BR-7 (ahora) =====
Actúa como sr-backend. Lee AGENTS.md y §BR-7 del prompt v1.1, con sus skills de la matriz. Solo billing-payments.service.ts y su integración; prueba en rojo primero; sin commit; no edites el plan ni registres gates.
Cierras con @iwana/api unitaria e integración completas, en un postgres:18-alpine propio, secuencia del job ci y DB_NAME=test, conteo real y lista de archivos. Elimina tu contenedor al terminar.
```
