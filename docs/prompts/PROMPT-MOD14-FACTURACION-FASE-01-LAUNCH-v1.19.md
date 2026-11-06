# LAUNCH — MOD14 · Facturación Fase 01 · BR-8 y V3, V4

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` (§6, G4 y G5) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.1.md` · **Encargo:** `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md`, §BR-8 y §Validación
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.18 (V1 cerrado) y a los bloques 3 y 4 de v1.16. V5 sigue en el bloque 5 de v1.16.
**Gates:** G2 ✅ · G3 ✅ · G4 pendiente · **Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §BR-8 | Ahora |
| 2 | `boundary-reviewer` + `contract-drift-reviewer` | V3 | Ahora, solo lectura |
| 3 | `ds-owner` + `prod-ux` | V4 | Ahora, solo lectura |

**Paralelo:** 1 ∥ 2 ∥ 3. **Después:** V5 y G4 a G6.
**Reglas:** cada entrega lista sus archivos. `main`, sin commit, cero PII, nunca `tenant_iwana`. No editan el plan ni registran gates.

```text
===== 1 · sr-backend, BR-8 (ahora) =====
Actúa como sr-backend. Lee AGENTS.md y §BR-8 de docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md, con sus skills de la matriz. Solo contracts.service.ts, billing-documents.service.ts y sus pruebas; prueba en rojo primero; sin commit; no edites el plan ni registres gates.
Cierras con @iwana/api unitaria e integración completas, en un postgres:18-alpine propio, secuencia del job ci y DB_NAME=test, conteo real y lista de archivos. Elimina tu contenedor al terminar.

===== 2 · boundary-reviewer + contract-drift-reviewer, V3 (ahora) =====
Actúa como boundary-reviewer y luego como contract-drift-reviewer. Lee §Validación, V3, del prompt v1.1. Revisa Billing, sus puertos y @iwana/shared contra la API y el portal, RS-9 a RS-22. Solo lectura: hallazgos con archivo:línea.

===== 3 · ds-owner + prod-ux, V4 (ahora) =====
Actúa como ds-owner y luego como prod-ux. Lee §Validación, V4, del prompt v1.1. Corre audit-ui.mjs sobre las pantallas nuevas y revísalas contra la spec UX, con CA-UX-FAC-01 a 17 y el vocabulario. Solo lectura: hallazgos con archivo:línea.
```
