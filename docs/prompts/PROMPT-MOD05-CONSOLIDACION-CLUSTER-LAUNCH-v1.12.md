# LAUNCH — MOD05 · Consolidación · Ola 5 H (H5 → H4)

**Plan:** `docs/plans/2026-10-31-mod05-consolidacion-cluster.md` · **Encargo:** `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md` §H5 y §H4 · Sustituye a [v1.11](PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.11.md) · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**Gates verificados:**

- H2: las 55 suites de integración en una base nueva; 51 PASS, 4 omitidas declaradas, 0 FAIL, B5 17/17.
- H3: runners fijados en `ubuntu-24.04`.
- H1: AI-EM-ARCH lo reclasificó. Dos fixtures E2E no envían el ciclo de facturación (D) y el de privacidad queda sin confirmar.

**H4 autorizado:** el dictamen AI-EM-ARCH clasifica las fallas locales adicionales de H5 como diferencias de entorno; el CTO confirmó cumplida la condición y ordenó el push el 2026-11-02. G6.5 sigue pendiente hasta verificar todos los workflows del nuevo SHA.

| #   | Subagente              | Encargo                                      | Skills a leer antes de actuar                                     | Contrato                          |
| --- | ---------------------- | -------------------------------------------- | ----------------------------------------------------------------- | --------------------------------- |
| 1   | `sr-qa`                | §H5                                          | `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence` | ADR-102; `Subscriber360Response`  |
| 2   | `test-change-reviewer` | Revisión de H2 y H5, **después de 1**        | —                                                                 | Diffs de pruebas                  |
| 3   | `plat-ops`             | §H4, **después de 2 y con la orden del CTO** | `iwana-checkpoint-commit`, `verification-before-completion`       | G6.5: todos los workflows del SHA |

**Estado real al arrancar:** `main` = `origin/main` = `9e3956d7`, con el CI rojo. Están sin commitear los diffs de H2, H3 y H5. Índice vacío.
**Cierre de ola:** todos los workflows del nuevo SHA en `success`.

---

### Bloque copiar-pegar

===== 1 · sr-qa (H5) =====
Actúa como `sr-qa`. Lee `AGENTS.md` y §H5 de `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`. Lee `e2e-testing-patterns`, `playwright-skill` e `iwana-test-evidence`. (1) En `portal-mod05-deuda-fiscal-live` y `portal-network-provisioning-live` la activación envía un `billingCycleDay` del catálogo activo, sin otro cambio. (2) Corre `portal-privacy.spec.ts` local con `--trace on`; si es el mock de 360°, alinéalo a `Subscriber360Response` de `@iwana/shared`; si es un selector cambiado por U, ajústalo citando el producto; si el producto rompe la suplantación, [BLOQUEO]. (3) Corre con conteo real los 5 specs que activan contratos (`ciclo-facturacion-live`, `mod05-deuda-fiscal-live`, `network-provisioning-live`, `privacy-fase-1b-live`, `privacy-live`) y `portal-privacy.spec.ts`, en tenant de pruebas. Escribe §H5. Sin stash ni commit.

===== 2 · test-change-reviewer (después de 1) =====
Actúa como `test-change-reviewer`. Lee `AGENTS.md` y §H2/§H5 del mismo prompt. Solo lectura: revisa los diffs de pruebas de H2 y H5 contra su regla (ADR-102, contrato 360° publicado, hermeticidad). Escribe la revisión en el informe. Un hallazgo C bloquea H4.

===== 3 · plat-ops (H4; el CTO ordenó el push el 2026-11-02, condicionado a que H5 y su revisión estén en verde sin hallazgos C) =====
Actúa como `plat-ops`. Lee `AGENTS.md`, §H4 del mismo prompt e `iwana-checkpoint-commit`. Commits por archivo completo: pruebas de H2 y H5 (uno), `ci.yml` de H3 (otro), informe/prompt/plan/lanzadores v1.11–v1.12 (otro). Push sin `--force`. G6.5: `gh run list --commit <sha>` con TODOS los workflows en `success`, citando id y conclusión de cada uno. Si alguno falla, [BLOQUEO] con el log. Escribe §H4 y corrige §F3. Sin stash ni staging parcial.
