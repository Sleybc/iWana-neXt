# LAUNCH — MOD05/MOD03 · Soporte de estrato en PDF (D-PDF) · Ola 1

> **Superado el 2026-10-13** por [PROMPT-MOD05-IVA-PDF-LAUNCH-v1.1.md](PROMPT-MOD05-IVA-PDF-LAUNCH-v1.1.md) (Ola 2, P2). La Ola 1 cerró sin commit. No relanzar desde este archivo.

**Plan:** `docs/plans/2026-10-12-mod05-iva-soporte-pdf.md` v1.0 · **Prompt:** `docs/prompts/PROMPT-MOD05-IVA-PDF-v1.0.md`
**Ola que lanza:** Ola 1 — migraciones y portal · **Gates:** fase aprobada por el CTO (2026-10-12); G4 se firma al lanzar
**Bloqueos abiertos:** ninguno para esta ola. **Secuencia:** corre en paralelo con T11 de la fase IVA (`PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.5.md`); P2 no se lanza hasta que T11 cierre.

| # | Subagente | Encargo | Skills a leer antes de empezar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `data-eng` | prompt §2 P1 | `postgresql`, `database-migration` | produce C-DDL-3 v1.0 y el enum de C-MEDIA-1 |
| 2 | `fe-platform` | prompt §2 P3 | `frontend-dev-guidelines`, `frontend-security-coder`, `testing-patterns`, `system-vocabulary-review` | consume C-API-4 v1.0 |

**Paralelo:** los dos, sin archivos compartidos entre sí ni con T11 (P1 no toca `crm/contracts/**`).
**Cierre de ola:** P1 con `up/down/up` de 026 y 145 contra Postgres real; P3 con turbo portal `--force` y `audit-ui.mjs` limpio. Después, Ola 2: P2 `sr-backend`, cuando T11 cierre.

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, ADR-093 (D5), el plan `docs/plans/2026-10-12-mod05-iva-soporte-pdf.md` y tu encargo `docs/prompts/PROMPT-MOD05-IVA-PDF-v1.0.md` §1–§2 bloque `{P#}`.
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques contratos; si necesitas cambiarlos, emite `[BLOQUEO]` y para. Trabaja solo dentro de tu propiedad exclusiva; no toques `crm/contracts/**` ni `media/**`. El árbol tiene cambios sin commitear de la fase IVA: no los reviertas.
> Fuera de alcance: Billing, Habeas Data, placeholders y la redacción histórica de `audit_logs`.
> Reporta en `docs/informes/INFORME-MOD05-IVA-PDF-{P#}-v1.0.md` con ruta, conteo real y deuda nueva por severidad.
