# LAUNCH — MOD13 · Aprovisionamiento Fase 01 · Ola 11 (cierre de G4: F1-v2 ∥ V1-r ∥ V4-bis-r)

**Plan:** `docs/plans/2026-10-22-mod13-aprovisionamiento.md` v1.12 · **Contrato:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md` v1.1
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) v1.1
**Gates:** G0–G3 ✅ · G5 ✅ (código y runtime) · G4 ⏳ esta ola · V5 y G7 después
**Estado al arrancar:**
- login diagnosticado: el harness hacía clic antes de la hidratación;
- fixtures y sesiones listos en `srqa-mod11-r5-20261006`, con la guarda encendida solo ahí;
- sidebar corregido;
- API en 3000 y portal en 3002. El API ya se cayó una vez sin causa determinada.

| # | Subagente | Encargo (`PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md`) | Skills a leer | Cierra |
| --- | --- | --- | --- | --- |
| 1 | `fe-platform` | §Ola 11 y §F1-v2 | `playwright-skill`, `iwana-test-evidence` | F1 en el navegador, incluida la sesión de solo lectura |
| 2 | `sr-qa` | §Ola 11 y §V1-r (con §V1) | `testing-patterns`, `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence`, `verification-before-completion` | CA-NET-04 a 14 en E2E |
| 3 | `ds-owner` | §Ola 11 y §V4-bis-r | `iwana-identity-ui-review`, `wcag-audit-patterns` | Las 18 combinaciones visuales pendientes |

**Paralelo:** 1 ∥ 2 ∥ 3, todos con los fixtures de FX-v1. Ninguno corrige código de producto; `sr-qa` escribe tests y fixtures.
**Cierre (G4):**
- F1 y V1 en verde en el navegador, con conteo real;
- las 42 combinaciones visuales cubiertas;
- si el API se cae, su causa queda registrada.

Nadie commitea.

---

### Bloque copiar-pegar

===== 1 · fe-platform =====
Actúa como `fe-platform`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-22-mod13-aprovisionamiento.md`, tu encargo `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §Ola 11 y §F1-v2, y `docs/informes/INFORME-MOD13-TRIAGE-LOGIN-PORTAL-v1.0.md`. Lee `playwright-skill` e `iwana-test-evidence`. Comprueba el health en 200 y espera a la interactividad antes de cada clic. Repite F1 en el navegador, incluida la sesión de solo lectura. No corrijas código ni imprimas secretos. Cierras con el conteo real.

===== 2 · sr-qa =====
Actúa como `sr-qa`. Lee `AGENTS.md`, el plan, tu encargo §Ola 11, §V1-r y §V1 del mismo prompt, y el informe de triaje. Lee `testing-patterns`, `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence` y `verification-before-completion`. Escribes tests y fixtures, nunca código de producto. Ejecuta V1 completo con los fixtures de FX-v1 y espera a la interactividad. Si el API se cae, guarda su log saneado antes de reiniciarlo. Cierras la matriz CA-NET → test con conteo real.

===== 3 · ds-owner =====
Actúa como `ds-owner`. Lee `AGENTS.md`, el plan y tu encargo §Ola 11 y §V4-bis-r del mismo prompt. Lee `iwana-identity-ui-review` y `wcag-audit-patterns`. Captura las 18 combinaciones pendientes con las sesiones y los datos de FX-v1, y vuelve a verificar el sidebar. No corrijas código ni captures datos personales sin máscara. Añade el resultado a `INFORME-MOD13-REVISION-UI-v1.0.md`.
