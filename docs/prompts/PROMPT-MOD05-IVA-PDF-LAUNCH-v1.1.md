# LAUNCH — MOD05/MOD03 · Soporte de estrato en PDF (D-PDF) · Ola 2 (P2)

> **Superado el 2026-10-13** por [PROMPT-MOD05-IVA-PDF-LAUNCH-v1.2.md](PROMPT-MOD05-IVA-PDF-LAUNCH-v1.2.md): P2 cerró. No relanzar desde este archivo.

**Plan:** `docs/plans/2026-10-12-mod05-iva-soporte-pdf.md` v1.1 · **Prompt:** `docs/prompts/PROMPT-MOD05-IVA-PDF-v1.0.md` §1–§2 P2
**Ola que lanza:** Ola 2 — Media y verificación en contratos · **Gates:** G4 vigente
**Cerrado, no re-despachar:** P1, P3 y toda la fase IVA, T11 incluido (sin commitear). **Precondición:** ninguna sesión de T11 activa; P1 en el árbol.
**Bloqueo que levanta:** `tsc` de `@iwana/api` en rojo por TS2741 (`STRATUM_EVIDENCE` sin entrada en `MEDIA_CONSTRAINTS`).

| # | Subagente | Encargo | Skills a leer antes de empezar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | prompt §2 P2 | `nestjs-expert`, `backend-security-coder`, `test-driven-development`, `postgresql`; apoyo: `auth-implementation-patterns` | produce C-MEDIA-1 y C-API-4 v1.0; consume C-DDL-3 v1.0 |

**Cierre de ola:** `tsc` en verde en `@iwana/api`; turbo API `--force` con conteo real; integración del stop/go P2 en `dbiw` con `E2E_TENANT_SLUG=iwana`. Después: `gate-verifier` ∥ `sec-eng` ∥ `sr-qa` sobre el árbol consolidado, y el commit.

---

### Bloque copiar-pegar

> Actúa como `sr-backend`. Lee `AGENTS.md`, el plan v1.1 (§Estado y §Secuencia) y tu encargo `docs/prompts/PROMPT-MOD05-IVA-PDF-v1.0.md` §1–§2 bloque P2.
> Antes de escribir código lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Propiedad exclusiva: `apps/api/src/modules/media/**` y `apps/api/src/modules/crm/contracts/**`. No toques migraciones, `@iwana/shared` ni el portal. No crees bases nuevas: la integración usa `dbiw` con `E2E_TENANT_SLUG=iwana`.
> El árbol tiene unas 146 rutas sin commitear de las fases IVA y D-PDF: no reviertas ni reformatees nada ajeno. Comprueba que la ruta de tu informe está libre antes de escribirlo.
> Reporta en `docs/informes/INFORME-MOD05-IVA-PDF-P2-v1.0.md` con ruta, conteo real y deuda nueva por severidad.
