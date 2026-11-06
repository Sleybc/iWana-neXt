# LAUNCH — MOD14 · Facturación Fase 01 · BR-9, F3 y V5

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` (§6, G4 a G6) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.1.md` · **UX:** `docs/specs/2026-10-31-mod14-facturacion-ux.md` · **Encargo:** `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md`, §BR-9, §F3 y §Validación
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.19 (BR-8 verificado; V3 y V4 recibidos el 2026-11-06).
**Gates:** G2 ✅ · G3 ✅ · G4 a G6 pendientes · **Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §BR-9 | Ahora |
| 2 | `fe-platform` | §F3 | Ahora |
| 3 | `gate-verifier` | V5 | Tras verificar 1 y 2 |

**Paralelo:** 1 ∥ 2, rutas disjuntas. **Después:** V5 y G4 a G6, que decide AI-EM-ARCH.
**Reglas:** cada entrega lista sus archivos. `main`, sin commit, cero PII, nunca `tenant_iwana`. No editan el plan ni registran gates.

```text
===== 1 · sr-backend, BR-9 (ahora) =====
Actúa como sr-backend. Lee AGENTS.md y §BR-9 de docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md, con sus skills de la matriz. Solo billing/** y crm/contracts/billing-contract-read.adapter.ts, con sus pruebas; prueba en rojo primero; sin commit; no edites el plan ni registres gates.
Cierras con @iwana/api unitaria e integración completas, en un postgres:18-alpine propio, secuencia del job ci y DB_NAME=test, conteo real y lista de archivos. Elimina tu contenedor al terminar.

===== 2 · fe-platform, F3 (ahora) =====
Actúa como fe-platform. Lee AGENTS.md y §F3 del prompt v1.1, con sus skills de la matriz. Solo apps/portal/src/components/billing/** y packages/ui/src/skeleton.tsx, con sus pruebas; sin commit; no edites el plan ni registres gates.
Cierras con lint, typecheck y tests de @iwana/portal y @iwana/ui sin caché, conteo real y lista de archivos.

===== 3 · gate-verifier, V5 (solo cuando AI-EM-ARCH verifique 1 y 2) =====
Actúa como gate-verifier. Lee §Validación, V5, del prompt v1.1. Ejecuta los Gates Before Merge sobre @iwana/shared, @iwana/db, @iwana/api, @iwana/worker, @iwana/ui y @iwana/portal, sin caché de turbo, con integraciones en un postgres:18-alpine propio y DB_NAME=test. Mide la cobertura de billing unitaria y sumada con integración, por separado. Evidencia con comandos y conteos reales; no corrijas nada.
```
