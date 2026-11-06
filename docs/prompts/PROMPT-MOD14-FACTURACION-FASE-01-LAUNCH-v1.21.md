# LAUNCH — MOD14 · Facturación Fase 01 · BR-10 y revisiones de G6

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` (§6, G6) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.1.md` · **Encargo:** `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md`, §BR-10
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.20 (V5 con NO-GO por cuatro puntos, 2026-11-06).
**Gates:** G2 a G5 ✅ · G6 pendiente · **Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `sr-qa` | §BR-10 | Ahora |
| 2 | `boundary-reviewer` | BR-8, BR-9 y F3 | Ahora, solo lectura |
| 3 | `test-change-reviewer` | Specs modificados de MOD14 | Ahora, solo lectura |

**Paralelo:** 1 ∥ 2 ∥ 3. **Después:** AI-EM-ARCH mide de nuevo y decide G6.
**Reglas:** cada entrega lista sus archivos. `main`, sin commit, cero PII, nunca `tenant_iwana`. No editan el plan ni registran gates.

```text
===== 1 · sr-qa, BR-10 (ahora) =====
Actúa como sr-qa. Lee AGENTS.md y §BR-10 de docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md, con sus skills de la matriz. Solo pruebas; un rojo de producción es hallazgo; sin commit; no edites el plan ni registres gates.
Cierras con @iwana/api unitaria e integración completas, en un postgres:18-alpine propio, secuencia del job ci y DB_NAME=test; ramas de billing sumadas y de privacy/** unitaria, con conteo real y lista de archivos. Elimina tu contenedor al terminar.

===== 2 · boundary-reviewer (ahora) =====
Actúa como boundary-reviewer. Revisa los cambios de BR-8, BR-9 y F3: contracts.service.ts, billing-documents.service.ts, billing-payments.service.ts, billing-contract-read.port.ts, billing-contract-read.adapter.ts y packages/ui/src/skeleton.tsx. Solo lectura: hallazgos con archivo:línea.

===== 3 · test-change-reviewer (ahora) =====
Actúa como test-change-reviewer. Revisa los specs existentes modificados por MOD14, con el cambio de producción que motivó cada uno: crm/contracts, crm/privacy-adapters, privacy/requests, privacy.module.spec.ts, configuration, access-control, audit y CutoffAgendaClient. Marca como fuera de alcance los de H-2 y el barrido. Solo lectura: clasifica cada ajuste con archivo:línea.
```
