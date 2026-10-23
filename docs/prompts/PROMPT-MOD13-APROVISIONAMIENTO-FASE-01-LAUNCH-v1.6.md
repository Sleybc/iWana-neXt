# LAUNCH — MOD13 · Aprovisionamiento Fase 01 · Ola 6 (V2 ∥ V3 ∥ V4, solo lectura)

**Plan:** `docs/plans/2026-10-22-mod13-aprovisionamiento.md` v1.6 · **Contrato:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md` v1.1
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) v1.1
**Ola que lanza:** Ola 6 · **Gates:** G0–G3 ✅ · G4 ⏳ (F1-v y F2 en vivo) · G5 en esta ola
**Bloqueos abiertos (los resuelve el CTO; no detienen esta ola):** API en `127.0.0.1:3000` con `E2E_TENANT_ADMIN_EMAIL` y `E2E_TENANT_ADMIN_PASSWORD`; build del portal sin `EPERM` en `.next`. V1, V4-bis y V5 esperan a ambos.

| # | Subagente | Encargo (`PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md`) | Skills a leer | Entregable |
| --- | --- | --- | --- | --- |
| 1 | `sec-eng` | §V2 | `security-auditor`, `backend-security-coder`, `frontend-security-coder` | `INFORME-MOD13-REVISION-SEGURIDAD-IMPLEMENTACION-v1.0.md` |
| 2 | `boundary-reviewer` | §V3, frontera | `architect-review` | `INFORME-MOD13-REVISION-FRONTERA-CONTRATOS-v1.0.md` §Frontera |
| 3 | `contract-drift-reviewer` | §V3, contratos | `architect-review` | ídem §Contratos |
| 4 | `ds-owner` | §V4 | `iwana-identity-ui-review` (con `audit-ui.mjs`), `core-components` | `INFORME-MOD13-REVISION-UI-v1.0.md` |

**Paralelo:** 1 ∥ 2 ∥ 3 ∥ 4. Las cuatro revisiones son de solo lectura y no corrigen código. 2 y 3 escriben en secciones distintas del mismo informe.
**Cierre de ola (G5 parcial):** los cuatro informes con hallazgos P0–P3 y `archivo:línea`. G5 cierra si no queda ningún P0 ni P1 abierto. Los hallazgos los corrige `sr-backend` o `fe-platform` en la ola siguiente. Nadie commitea.

---

### Bloque copiar-pegar

===== 1 · sec-eng =====
Actúa como `sec-eng`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-22-mod13-aprovisionamiento.md` y tu encargo `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §V2. Lee `security-auditor`, `backend-security-coder` y `frontend-security-coder`. Revisa en solo lectura el código de MOD13 contra HLD v1.1 y tu informe de diseño; cierra con evidencia el P2 del pipeline. No corrijas código ni imprimas secretos. Entrega `docs/informes/INFORME-MOD13-REVISION-SEGURIDAD-IMPLEMENTACION-v1.0.md`.

===== 2 · boundary-reviewer =====
Actúa como `boundary-reviewer`. Lee `AGENTS.md`, el plan y tu encargo §V3 (frontera) del mismo prompt. Lee `architect-review`. Revisa en solo lectura las importaciones entre `network`, `tasks`, `crm`, `inventory` y `apps/worker` contra HLD v1.1 §8, incluido el P3 de `CrmModule` → `NetworkModule`. Escribe la sección §Frontera de `docs/informes/INFORME-MOD13-REVISION-FRONTERA-CONTRATOS-v1.0.md`.

===== 3 · contract-drift-reviewer =====
Actúa como `contract-drift-reviewer`. Lee `AGENTS.md`, el plan y tu encargo §V3 (contratos) del mismo prompt. Lee `architect-review`. Compara en solo lectura `packages/shared/src/contracts/network/` y el requisito `PROVISIONING` con sus productores y consumidores. Escribe la sección §Contratos del mismo informe, sin tocar la §Frontera.

===== 4 · ds-owner =====
Actúa como `ds-owner`. Lee `AGENTS.md`, el plan y tu encargo §V4 del mismo prompt. Lee `iwana-identity-ui-review` y `core-components`. Ejecuta `audit-ui.mjs` sobre las rutas `network/*` y los componentes nuevos o tocados, y revisa el uso de `@iwana/ui` y de los tokens contra la spec UX. La evidencia visual queda para V4-bis. Entrega `docs/informes/INFORME-MOD13-REVISION-UI-v1.0.md`.
