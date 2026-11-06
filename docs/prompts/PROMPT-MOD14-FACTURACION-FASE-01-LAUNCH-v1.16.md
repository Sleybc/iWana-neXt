# LAUNCH — MOD14 · Facturación Fase 01 · Validación

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` (§6, G4 a G6) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.1.md` · **UX:** `docs/specs/2026-10-31-mod14-facturacion-ux.md` · **Encargo:** `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md`, §Validación
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.15 (F2 y BR-7 verificados el 2026-11-05).
**Gates:** G2 ✅ · G3 ✅ · **Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `sr-qa` | V1 | Ahora |
| 2 | `sec-eng` | V2 | Ahora, solo lectura |
| 3 | `boundary-reviewer` + `contract-drift-reviewer` | V3 | Ahora, solo lectura |
| 4 | `ds-owner` + `prod-ux` | V4 | Ahora, solo lectura |
| 5 | `gate-verifier` | V5 | Tras 1 a 4 y sus correcciones |

**Paralelo:** 1 ∥ 2 ∥ 3 ∥ 4; después 5. **Cierre:** G4, G5 y G6, que decide AI-EM-ARCH.
**Reglas:** cada entrega lista sus archivos. Los agentes no corrigen producción, no editan el plan ni registran gates. `main`, sin commit, cero PII, nunca `tenant_iwana`. Pega los informes al volver.

```text
===== 1 · sr-qa, V1 (ahora) =====
Actúa como sr-qa. Lee AGENTS.md y §Validación, V1, de docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md, con sus skills de la matriz. Contrato: HLD v1.1 §10 y spec UX §3 a §7. Solo pruebas; un rojo de producción es hallazgo; sin commit.
Cierras con Playwright contra la API real, pruebas de componente y @iwana/portal sin caché, con conteo real, matriz CA-FAC y CA-UX contra prueba, y lista de archivos.

===== 2 · sec-eng, V2 (ahora) =====
Actúa como sec-eng. Lee AGENTS.md y §Validación, V2, del prompt v1.1. Revisa billing/, billing-contract-read.adapter.ts y components/billing/ contra HLD v1.1 §6.5, §8.1, RS-9, RS-14, RS-21 y RS-22. Solo lectura: hallazgos P0 a P3 con archivo:línea.

===== 3 · boundary-reviewer + contract-drift-reviewer, V3 (ahora) =====
Actúa como boundary-reviewer y luego como contract-drift-reviewer. Lee §Validación, V3, del prompt v1.1. Revisa Billing, sus puertos y @iwana/shared contra la API y el portal, RS-9 a RS-22. Solo lectura: hallazgos con archivo:línea.

===== 4 · ds-owner + prod-ux, V4 (ahora) =====
Actúa como ds-owner y luego como prod-ux. Lee §Validación, V4, del prompt v1.1. Corre audit-ui.mjs sobre las pantallas nuevas y revísalas contra la spec UX, con CA-UX-FAC-01 a 17 y el vocabulario. Solo lectura: hallazgos con archivo:línea.

===== 5 · gate-verifier, V5 (tras 1 a 4) =====
Actúa como gate-verifier. Lee §Validación, V5, del prompt v1.1. Ejecuta los Gates Before Merge sobre @iwana/shared, @iwana/db, @iwana/api, @iwana/worker y @iwana/portal, sin caché de turbo, con integraciones en un postgres:18-alpine propio y DB_NAME=test. Mide la cobertura de billing unitaria y sumada con integración, por separado. Evidencia con comandos y conteos reales; no corrijas nada.
```
