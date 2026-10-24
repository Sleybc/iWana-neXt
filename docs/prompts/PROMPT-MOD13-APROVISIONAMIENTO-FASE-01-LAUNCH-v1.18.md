# LAUNCH — MOD13 · Aprovisionamiento Fase 01 · Ola 17 (E2E-CI: el spec en vivo en el job bloqueante)

**Plan:** `docs/plans/2026-10-22-mod13-aprovisionamiento.md` v1.19 · **Contrato:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md` v1.1
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) v1.1
**Gates:** G0–G6 ✅ · G7 en curso (falta el push, bloqueado por esta ola)
**Estado al arrancar:**
- `main` va 11 commits por delante de origin, sin push: los de MOD13 hasta `594861d0` y `509237fb` de MOD11.
- El último CI de `main` está en verde (`01a3e91b`).
- El spec `portal-network-provisioning-live.spec.ts` entraría en el job «E2E portal» y fallaría: pide `E2E_MOD13_SITE_ID`, que el CI no publica.

| # | Subagente | Encargo (`PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md`) | Skills a leer | Cierra |
| --- | --- | --- | --- | --- |
| 1 | `sr-qa` | §Ola 17 y §E2E-CI | `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence`, `verification-before-completion` | El spec corre con lo que siembra el provisioner del CI; la suite portal completa pasa en local por el mismo camino que el CI |

**Paralelo:** ninguno. Al cerrar, AI-EM-ARCH hace el push (con el visto bueno del CTO) y revisa el run de CI de `main`.
**Cierre:**
- `node scripts/e2e-provision-operational.mjs` termina con `E2E_SETUP=OK`, código 0, 0 fallos y 0 cuarentenas;
- conteo real;
- sin cambios en `.github/workflows/ci.yml` (si hicieran falta, es `[BLOQUEO]` para `plat-ops`).

Nadie commitea.

---

### Bloque copiar-pegar

===== 1 · sr-qa =====
Actúa como `sr-qa`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-22-mod13-aprovisionamiento.md`, tu encargo `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §Ola 17 y §E2E-CI, `scripts/e2e-provision-operational.mjs` y el job «E2E portal» de `.github/workflows/ci.yml`. Lee `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence` y `verification-before-completion`. Escribes tests e infraestructura de pruebas, nunca código de producto. Haz que el spec use solo lo que publica el provisioner (`E2E_OPERATIONAL_SITE_ID`) y reproduce en local el camino del CI con la suite portal completa. No toques `ci.yml` ni `tenant_iwana`, no imprimas secretos ni dejes cachés en el repo. No commitees. Cierras con el conteo real.
