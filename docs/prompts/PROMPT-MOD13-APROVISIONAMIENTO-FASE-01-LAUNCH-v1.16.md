# LAUNCH — MOD13 · Aprovisionamiento Fase 01 · Ola 15 (V1-ci ∥ V5, y después V4-plan)

**Plan:** `docs/plans/2026-10-22-mod13-aprovisionamiento.md` v1.16 · **Contrato:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md` v1.1
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) v1.1
**Gates:** G0–G3 ✅ · G5 ✅ · G4 ⏳ (flujo demostrado; falta el spec reproducible) · G6 en esta ola (V5)
**Estado al arrancar:**
- V1-r cerró el flujo en varias invocaciones: servicio, suscriptor y comodato en `ACTIVE`.
- V4-bis-r tiene las 18 combinaciones y la bandeja con datos; «ajustes con planes» está vacío porque el tenant de pruebas no tiene planes.
- API, worker y portal en marcha.

| # | Subagente | Encargo (`PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md`) | Skills a leer | Cierra |
| --- | --- | --- | --- | --- |
| 1 | `sr-qa` | §Ola 15 y §V1-ci | `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence`, `verification-before-completion` | Spec autocontenido, dos corridas en verde (G4) |
| 2 | `gate-verifier` | §V5 | `iwana-test-evidence`, `turborepo-caching`, `verification-before-completion` | Gates Before Merge y cobertura ≥80 % (G6) |
| 3 | `ds-owner` | §V4-plan, **después de 1** | `iwana-identity-ui-review`, `wcag-audit-patterns` | «Ajustes con planes» |

**Paralelo:** 1 ∥ 2; el bloque 3 va después del 1. Nadie corrige código de producto. **Cierre:** G4 y G6 con conteo real; después viene G7. Nadie commitea.

---

### Bloque copiar-pegar

===== 1 · sr-qa =====
Actúa como `sr-qa`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-22-mod13-aprovisionamiento.md`, tu encargo `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §Ola 15 y §V1-ci, y `docs/informes/INFORME-MOD13-PRUEBAS-V1-v1.0.md`. Lee `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence` y `verification-before-completion`. Escribes tests y fixtures, nunca código de producto. Haz el spec autocontenido, con fixtures propios por corrida y estados estrictos, y pásalo dos veces seguidas en verde. Deja un plan con perfil PCQ para V4-plan. Solo en el tenant de pruebas; no imprimas secretos.

===== 2 · gate-verifier =====
Actúa como `gate-verifier`. Lee `AGENTS.md`, el plan y tu encargo §V5 del mismo prompt. Lee `iwana-test-evidence`, `turborepo-caching` y `verification-before-completion`. Ejecuta los Gates Before Merge de MOD13 sin caché de turbo, con la cobertura de `network` y de los puertos tocados. No corrijas código ni escribas tests. Entrega `docs/informes/INFORME-MOD13-GATES-V5-v1.0.md` con conteo real.

===== 3 · ds-owner (después de sr-qa) =====
Actúa como `ds-owner`. Lee `AGENTS.md`, el plan y tu encargo §V4-plan del mismo prompt. Lee `iwana-identity-ui-review` y `wcag-audit-patterns`. Captura «ajustes con planes» a 375, 768 y 1280 px, en claro y oscuro, con el plan de V1-ci. Enmascara los datos personales. No corrijas código. Añade el resultado a `INFORME-MOD13-REVISION-UI-v1.0.md`.
