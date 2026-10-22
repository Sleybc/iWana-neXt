# LAUNCH — MOD13 · Aprovisionamiento Fase 01 · Ola 5 (F2 ∥ F1-v)

**Plan:** `docs/plans/2026-10-22-mod13-aprovisionamiento.md` v1.5 · **Contrato:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md` v1.1
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) v1.1
**Ola que lanza:** Ola 5 · **Gates:** G0 ✅ · G1 ✅ · G2 ✅ · G3 ✅ (B2 + B3) · G4 ⏳ (F1 y F2 contra el API vivo)
**Bloqueo abierto:** la parte en vivo de F1-v y de F2 necesita el API en `127.0.0.1:3000` y las variables `E2E_TENANT_ADMIN_EMAIL` y `E2E_TENANT_ADMIN_PASSWORD` de un tenant de pruebas no `ACTIVE`. Las prepara el CTO; nunca van en el chat.

| # | Subagente | Encargo (`PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md`) | Skills a leer antes de codificar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `fe-platform` | §F2 | `core-components`, `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `iwana-identity-ui-review`, `tailwind-patterns`, `system-vocabulary-review`, `frontend-security-coder`; apoyo: `i18n-localization` | HLD v1.1 §4.4, §6.2, §6.5, §9; spec UX completa |
| 2 | `fe-platform` | §F1-v | `playwright-skill`, `iwana-test-evidence` | HLD v1.1 §4.4; spec UX §3–4 |

**Paralelo:** 1 ∥ 2. F1-v solo ejecuta pruebas. F2 es dueño de `network/provisioning`, `network/settings`, los componentes de la OT y la sección del suscriptor.
**Cierre de ola (G4):**
- F1 y F2 en verde contra el API vivo;
- la vista del técnico limitada a cinco campos;
- lint, typecheck y build del portal;
- conteo real.

Nadie commitea. Después siguen las verificaciones V1 a V5 y G7.

---

### Bloque copiar-pegar

===== 1 · fe-platform (F2) =====
Actúa como `fe-platform`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-22-mod13-aprovisionamiento.md` y tu encargo `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §F2, con las reglas comunes 1 a 9. Antes de escribir código, lee los `SKILL.md` de `core-components`, `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `iwana-identity-ui-review`, `tailwind-patterns`, `system-vocabulary-review`, `frontend-security-coder` e `i18n-localization`. Construye el panel de la OT, la bandeja, la ficha del suscriptor y los ajustes de red según la spec UX y HLD v1.1, sin modificar el contrato. Sin primitivas nuevas sin `ds-owner`; no formatees `docs/` con Prettier; sin cachés de jest en el repo. No commitees. Cierras con lint, typecheck, build y pruebas con conteo real; la parte en vivo, solo si se cumple la precondición.

===== 2 · fe-platform (F1-v) =====
Actúa como `fe-platform`. Lee `AGENTS.md`, el plan y tu encargo §F1-v del mismo prompt. Lee `playwright-skill` e `iwana-test-evidence`. Comprueba primero la precondición: API en `127.0.0.1:3000` y credenciales E2E en variables de entorno; si falta algo, emite `[BLOQUEO]` y para. Ejecuta las pruebas de routers y redes IPv4 contra el API real. No corrijas código de producto; reporta los fallos. No imprimas secretos en la salida. Cierras con el conteo real.
