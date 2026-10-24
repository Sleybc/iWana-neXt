# LAUNCH — MOD13 · Aprovisionamiento Fase 01 · Ola 18 (CI de main en verde: CI-B ∥ CI-V)

**Plan:** `docs/plans/2026-10-22-mod13-aprovisionamiento.md` v1.20 · **Contrato:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md` v1.1
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) v1.1
**Gates:** G0–G6 ✅ · G7 ⏳ (push hecho; CI de `main` en rojo)
**Estado al arrancar:** run `40096899059` sobre `9ae4cc8f`:
- en rojo: integración del API (`network.wiring` depende de un API vivo y un tenant local; `report-subscriber-phone-readiness` falla al azar), y E2E portal y E2E R4.1 con 8 capturas de ajustes desfasadas por el sidebar de MOD13;
- en verde: E2E Web Admin Smoke, el build de imágenes y la integración de MOD11.

| # | Subagente | Encargo (`PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md`) | Skills a leer | Cierra |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §Ola 18 y §CI-B | `nestjs-expert`, `test-driven-development`, `iwana-test-evidence` | `network.wiring` dentro del proceso; consumidor ejecutado en CI; regex de teléfonos determinista |
| 2 | `ds-owner` | §Ola 18 y §CI-V | `iwana-identity-ui-review`, `playwright-skill` | 8 líneas base de Linux regeneradas tras confirmar que la diferencia es solo el sidebar |

**Paralelo:** 1 ∥ 2. Archivos disjuntos: specs del API frente a capturas de `e2e/tests/*-snapshots`.
**Cierre:** los pasos de integración y unitarias del job de lint pasan en local sin caché, y las 8 capturas, regeneradas en Linux, quedan revisadas. Después, AI-EM-ARCH commitea, empuja con el visto bueno del CTO y revisa el CI. Nadie hace push.

---

### Bloque copiar-pegar

===== 1 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-22-mod13-aprovisionamiento.md`, tu encargo `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §Ola 18 y §CI-B, y el paso «Integration tests — API (PostgreSQL real)» de `.github/workflows/ci.yml`. Lee `nestjs-expert`, `test-driven-development` e `iwana-test-evidence`. Reescribe `network.wiring` dentro del proceso, sin API vivo ni tenant fijo; asegura que el consumidor corre en CI; haz determinista la regex de `report-subscriber-phone-readiness`. Sin cambios de producto, sin cachés en el repo, sin secretos, sin commit ni push. Cierras con el conteo real.

===== 2 · ds-owner =====
Actúa como `ds-owner`. Lee `AGENTS.md`, el plan y tu encargo §Ola 18 y §CI-V del mismo prompt. Lee `iwana-identity-ui-review` y `playwright-skill`. Confirma que los 175 px son solo el sidebar de MOD13 y regenera en un contenedor Linux de Playwright las 8 líneas base de tablet y escritorio de `portal-settings-access-ui` y `portal-settings-organization-ui`, revisándolas una a una. No toques las de móvil ni el código. Sin commit ni push.
