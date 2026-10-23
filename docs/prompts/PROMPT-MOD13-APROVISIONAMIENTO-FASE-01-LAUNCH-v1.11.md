# LAUNCH — MOD13 · Aprovisionamiento Fase 01 · Ola 10 (desbloqueo de G4: T-login ∥ FX-v1 ∥ FX-nav)

**Plan:** `docs/plans/2026-10-22-mod13-aprovisionamiento.md` v1.11 · **Contrato:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md` v1.1
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) v1.1
**Gates:** G0–G3 ✅ · G5 ✅ (y la reversión en runtime, confirmada por R-pg) · G4 ⏳
**Estado al arrancar:** R-pg cerrado (4 suites con 23 tests). F1 aprueba contra el API (7/7) pero falla en el navegador por el login. V1 está bloqueado por la guarda apagada y la falta de sesiones. V4-bis lleva 24 de 42 combinaciones. API en 3000 y portal en 3002; tenant de pruebas `srqa-mod11-r5-20261006`.

| # | Subagente | Encargo (`PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md`) | Skills a leer | Entregable |
| --- | --- | --- | --- | --- |
| 1 | `e2e-triage` | §T-login | `playwright-skill`, `systematic-debugging` | `INFORME-MOD13-TRIAGE-LOGIN-PORTAL-v1.0.md` |
| 2 | `sr-qa` | §FX-v1 | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence` | Sección «Fixtures» en `INFORME-MOD13-PRUEBAS-V1-v1.0.md` |
| 3 | `fe-platform` | §FX-nav | `core-components`, `frontend-dev-guidelines`, `wcag-audit-patterns` | `Sidebar.tsx` con coincidencia exacta para Inicio, más su prueba |

**Paralelo:** 1 ∥ 2 ∥ 3. T-login no edita archivos. FX-v1 solo actúa por el API sobre el tenant de pruebas. FX-nav solo toca el sidebar.
**Cierre:** causa del login identificada y con dueño; fixtures y sesiones listas, con la guarda encendida solo en el tenant de pruebas; sidebar corregido con su prueba. Después, la Ola 11 relanza F1-v (navegador), V1 y lo que falta de V4-bis. Nadie commitea.

---

### Bloque copiar-pegar

===== 1 · e2e-triage =====
Actúa como `e2e-triage`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-22-mod13-aprovisionamiento.md`, tu encargo `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §T-login y `docs/informes/INFORME-MOD13-PRUEBAS-F1-V-v1.0.md`. Lee `playwright-skill` y `systematic-debugging`. Diagnostica por qué el login del portal vuelve a `/auth/login`, contrastando las hipótesis del encargo. No edites archivos ni imprimas secretos. Entrega `docs/informes/INFORME-MOD13-TRIAGE-LOGIN-PORTAL-v1.0.md`.

===== 2 · sr-qa =====
Actúa como `sr-qa`. Lee `AGENTS.md`, el plan y tu encargo §FX-v1 del mismo prompt. Lee `testing-patterns`, `e2e-testing-patterns` e `iwana-test-evidence`. Escribes fixtures y tests, nunca código de producto. Prepara, solo por el API y solo en `srqa-mod11-r5-20261006`, la guarda encendida, las sesiones NOC, técnico y solo lectura, y los datos de dominio de §V1. Las credenciales van únicamente a `.env.development.local`. Nunca toques `tenant_iwana`. Entrega la sección «Fixtures» del informe V1.

===== 3 · fe-platform =====
Actúa como `fe-platform`. Lee `AGENTS.md`, el plan, tu encargo §FX-nav del mismo prompt y el hallazgo DS-MOD13-VIS-P2-01 de `INFORME-MOD13-REVISION-UI-v1.0.md`. Lee `core-components`, `frontend-dev-guidelines` y `wcag-audit-patterns`. Corrige solo la coincidencia del enlace Inicio en `Sidebar.tsx` y añade su prueba. No commitees. Cierras con lint, typecheck y las pruebas del sidebar, con conteo real.
