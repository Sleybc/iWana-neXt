# LAUNCH — MOD14 · Facturación Fase 01 · V1-R

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` (§6, G4) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.1.md` §10 · **UX:** `docs/specs/2026-10-31-mod14-facturacion-ux.md` · **Encargo:** `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md`, §V1-R
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.16 (V1 entregado sin el flujo E2E). Los bloques 2 a 5 de v1.16 siguen vigentes.
**Gates:** G2 ✅ · G3 ✅ · G4 pendiente · **Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Cuándo |
| --- | --- | --- | --- |
| 1 | `sr-qa` | §V1-R | Ahora |

**Reglas:** la entrega lista sus archivos, y AI-EM-ARCH los comprueba en disco. No corrige producción, no edita el plan ni registra gates. `main`, sin commit, cero PII, nunca `tenant_iwana`.

```text
===== 1 · sr-qa, V1-R (ahora) =====
Actúa como sr-qa. Lee AGENTS.md y §V1-R de docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md, con sus skills de la matriz. Contrato: HLD v1.1 §10, PRD §7 y spec UX §3 a §7. Solo pruebas y siembra de E2E; un rojo de producción es hallazgo; sin commit; no edites el plan ni registres gates. Si el entorno no se puede levantar, [BLOQUEO] con la causa.
Cierras con Playwright en navegador contra portal y API reales en tenant efímero, 0 omisiones en el flujo, conteo real, matriz por CA del PRD y lista de archivos. Limpia tenant y contenedores al terminar.
```
