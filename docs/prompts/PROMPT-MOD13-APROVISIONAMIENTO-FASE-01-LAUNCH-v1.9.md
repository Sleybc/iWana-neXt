# LAUNCH — MOD13 · Aprovisionamiento Fase 01 · Ola 9 (con entorno: R-pg ∥ F1-v ∥ V1 ∥ V4-bis)

**Plan:** `docs/plans/2026-10-22-mod13-aprovisionamiento.md` v1.9 · **Contrato:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md` v1.1
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) v1.1
**Gates:** G0–G3 ✅ · G5 ✅ en código (Ola 8) · G4 ⏳ esta ola · V5 y G7 después
**No lanzar hasta que el CTO cumpla las 5 precondiciones del prompt §Ola 9:**
1. Docker con Postgres (5433, `dbiw`) y Redis.
2. API en `127.0.0.1:3000`.
3. Credenciales E2E en variables de entorno.
4. `.next` sin bloqueos.
5. Tenant de pruebas migrado hasta la 163.

| # | Subagente | Encargo (`PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md`) | Skills a leer | Cierra |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §R-pg | `iwana-test-evidence`, `test-driven-development` | Reversión de auditoría en runtime (SEC-IMPL-01) |
| 2 | `fe-platform` | §F1-v | `playwright-skill`, `iwana-test-evidence` | F1 contra el API vivo |
| 3 | `sr-qa` | §V1 | `testing-patterns`, `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence`, `verification-before-completion` | CA-NET-04 a 14 en E2E |
| 4 | `ds-owner` | §V4-bis | `iwana-identity-ui-review`, `wcag-audit-patterns` | Evidencia visual |

**Paralelo:** 1 ∥ 2 ∥ 3 ∥ 4. Ninguno corrige código de producto; `sr-qa` solo escribe tests y fixtures. **Cierre (G4):** los cuatro en verde con conteo real. Después, V5 (`gate-verifier`). Nadie commitea.

---

### Bloque copiar-pegar

===== 1 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md`, el plan y tu encargo `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §Ola 9 y §R-pg. Lee `iwana-test-evidence` y `test-driven-development`. Comprueba las precondiciones 1 y 5; si falta alguna, emite `[BLOQUEO]` y para. Ejecuta las `*.postgres.integration.spec.ts` de `network`, empezando por la de auditoría. No modifiques código de producto ni migres tenants `ACTIVE`; no imprimas secretos. Cierras con el conteo real.

===== 2 · fe-platform =====
Actúa como `fe-platform`. Lee `AGENTS.md`, el plan y tu encargo §F1-v del mismo prompt. Lee `playwright-skill` e `iwana-test-evidence`. Comprueba las precondiciones 2 y 3; si falta alguna, emite `[BLOQUEO]` y para. Ejecuta las pruebas de routers y redes IPv4 contra el API real. No corrijas código; no imprimas secretos. Cierras con el conteo real.

===== 3 · sr-qa =====
Actúa como `sr-qa`. Lee `AGENTS.md`, el plan y tu encargo §V1 del mismo prompt. Lee `testing-patterns`, `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence` y `verification-before-completion`. Escribes tests y fixtures, nunca código de producto. Comprueba las precondiciones 1, 2, 3 y 5 y las de dominio del §V1; si falta alguna, emite `[BLOQUEO]` y para. Entrega la matriz CA-NET → test con conteo real.

===== 4 · ds-owner =====
Actúa como `ds-owner`. Lee `AGENTS.md`, el plan y tu encargo §V4-bis del mismo prompt. Lee `iwana-identity-ui-review` y `wcag-audit-patterns`. Con el portal corriendo, captura 375, 768 y 1280 px en claro y oscuro de las pantallas de MOD13 y añade «V4-bis» a `docs/informes/INFORME-MOD13-REVISION-UI-v1.0.md`. No corrijas código.
